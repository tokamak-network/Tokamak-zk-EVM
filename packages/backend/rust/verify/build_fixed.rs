//! Compile checked, producer-owned verifier keys into native constants.
#[path = "src/decode.rs"]
mod decode;
use ark_bls12_381::{Bls12_381, Fq2, Fr, G1Affine, G1Projective, G2Affine};
use ark_ec::{pairing::Pairing, scalar_mul::BatchMulPreprocessing, AffineRepr};
use ark_ff::{Field, One, PrimeField};
use backend_univariate_crs_interface::{
    archive, UnivariateG1Rkyv, UnivariateG2Rkyv, VerifierKeysRkyv,
};
use std::fmt::Write;

pub fn generate(bytes: &[u8], nc: u64, l_free: u64) -> Result<String, String> {
    let keys = archive::from_bytes::<VerifierKeysRkyv, archive::rancor::Error>(bytes)
        .map_err(|e| format!("verifier keys archive: {e}"))?;
    let contract: serde_json::Value = serde_json::from_str(include_str!(
        "../../common/contracts/univariate-domain-contract.v1.json"
    ))
    .map_err(|e| e.to_string())?;
    if keys.schema_id
        != contract["protocolSchema"]
            .as_str()
            .ok_or("missing protocol schema")?
    {
        return Err("unsupported verifier CRS schema".into());
    }
    let g1 = [&keys.one_g1, &keys.xi_g1, &keys.psi_g1].map(key_g1);
    let g1: Vec<_> = g1.into_iter().collect::<Result<_, _>>()?;
    let g2 = [&keys.one_g2, &keys.tau_g2, &keys.tau_k_g2, &keys.delta_g2].map(key_g2);
    let g2: Vec<_> = g2.into_iter().collect::<Result<_, _>>()?;
    if g1.iter().any(AffineRepr::is_zero) || g2.iter().any(AffineRepr::is_zero) {
        return Err("fixed verifier keys must be nonzero source-group points".into());
    }
    let root_contract = &contract["scalarRootOfUnity"];
    let max = Fr::from_be_bytes_mod_order(
        &hex::decode(
            root_contract["maxRootCanonicalHex"]
                .as_str()
                .ok_or("missing root")?,
        )
        .map_err(|e| e.to_string())?,
    );
    let size = 1u64
        .checked_shl(
            root_contract["twoAdicity"]
                .as_u64()
                .ok_or("missing two-adicity")?
                .try_into()
                .map_err(|_| "invalid two-adicity")?,
        )
        .ok_or("invalid two-adicity")?;
    if !nc.is_power_of_two() || !l_free.is_power_of_two() || nc > size || l_free > size {
        return Err("unsupported domain size".into());
    }
    let root = max.pow([size / l_free]);
    let inv_free = Fr::from(l_free).inverse().unwrap();
    let mut source = String::from("// Generated from validated build inputs. Do not edit.\n");
    writeln!(
        source,
        "pub const INV_TWO: ark_bls12_381::Fq = ark_ff::MontFp!(\"{}\");",
        ark_bls12_381::Fq::from(2u64).inverse().unwrap()
    )
    .unwrap();
    for (name, p) in ["ONE", "XI", "PSI"].iter().zip(g1.iter().copied()) {
        writeln!(
            source,
            "#[cfg(test)]\npub const {name}: ark_bls12_381::G1Affine = {};",
            point(p)
        )
        .unwrap();
    }
    writeln!(
        source,
        "pub const CONNECTION_ROOT: ark_bls12_381::Fr = ark_ff::MontFp!(\"{}\");",
        max.pow([size / nc])
    )
    .unwrap();
    writeln!(
        source,
        "pub const INV_N_C: ark_bls12_381::Fr = ark_ff::MontFp!(\"{}\");",
        Fr::from(nc).inverse().unwrap()
    )
    .unwrap();
    for (name, factor) in [("PUBLIC_ROOTS", Fr::one()), ("PUBLIC_WEIGHTS", inv_free)] {
        writeln!(
            source,
            "pub const {name}: [ark_bls12_381::Fr; {l_free}] = ["
        )
        .unwrap();
        let mut p = factor;
        for _ in 0..l_free {
            writeln!(source, "ark_ff::MontFp!(\"{p}\"),").unwrap();
            p *= root;
        }
        source.push_str("];\n");
    }
    // Prepared points contain owned vectors in arkworks. Runtime construction
    // copies already-computed coefficients; it performs no field arithmetic.
    source.push_str("pub fn prepared_g2() -> [<ark_bls12_381::Bls12_381 as ark_ec::pairing::Pairing>::G2Prepared; 4] { [\n");
    for p in g2 {
        let prepared: <Bls12_381 as Pairing>::G2Prepared = p.into();
        source.push_str("ark_ec::bls12::G2Prepared { infinity: false, ell_coeffs: vec![\n");
        for (a, b, c) in prepared.ell_coeffs {
            writeln!(source, "({}, {}, {}),", fq2(a), fq2(b), fq2(c)).unwrap();
        }
        source.push_str("] },\n");
    }
    source.push_str("] }\n");
    source.push_str("pub fn prepared_g1() -> [ark_ec::scalar_mul::BatchMulPreprocessing<ark_bls12_381::G1Projective>; 3] { [\n");
    for p in g1 {
        let table = BatchMulPreprocessing::new(G1Projective::from(p), 1);
        writeln!(source, "ark_ec::scalar_mul::BatchMulPreprocessing {{ window: {}, max_scalar_size: {}, table: vec![", table.window, table.max_scalar_size).unwrap();
        for window in table.table {
            source.push_str("vec![\n");
            for p in window {
                writeln!(source, "{},", point(p)).unwrap();
            }
            source.push_str("],\n");
        }
        source.push_str("] },\n");
    }
    source.push_str("] }\n");
    Ok(source)
}
fn point(p: G1Affine) -> String {
    if p.is_zero() {
        return "ark_bls12_381::G1Affine::identity()".into();
    }
    format!(
        "ark_bls12_381::G1Affine::new_unchecked(ark_ff::MontFp!(\"{}\"), ark_ff::MontFp!(\"{}\"))",
        p.x, p.y
    )
}
fn fq2(p: Fq2) -> String {
    format!(
        "ark_bls12_381::Fq2::new(ark_ff::MontFp!(\"{}\"), ark_ff::MontFp!(\"{}\"))",
        p.c0, p.c1
    )
}
fn key_g1(p: &UnivariateG1Rkyv) -> Result<G1Affine, String> {
    let mut bytes = [0; 96];
    bytes[..48].copy_from_slice(&p.x);
    bytes[48..].copy_from_slice(&p.y);
    decode::g1(&bytes)
}
fn key_g2(p: &UnivariateG2Rkyv) -> Result<G2Affine, String> {
    let mut bytes = [0; 192];
    bytes[..96].copy_from_slice(&p.x);
    bytes[96..].copy_from_slice(&p.y);
    decode::g2(&bytes)
}
