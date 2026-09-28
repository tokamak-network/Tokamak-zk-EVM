#[path = "../build_fixed.rs"]
mod build_fixed;
use ark_bls12_381::{Fq, G1Affine, G2Affine};
use ark_ec::AffineRepr;
use ark_ff::{BigInteger, PrimeField};
use backend_univariate_crs_interface::{
    archive, UnivariateG1Rkyv, UnivariateG2Rkyv, VerifierKeysRkyv,
};

fn bytes(value: Fq) -> [u8; 48] {
    value.into_bigint().to_bytes_le().try_into().unwrap()
}
fn keys() -> VerifierKeysRkyv {
    let g1 = G1Affine::generator();
    let g2 = G2Affine::generator();
    let one = || UnivariateG1Rkyv {
        x: bytes(g1.x),
        y: bytes(g1.y),
    };
    let two = || UnivariateG2Rkyv {
        x: [bytes(g2.x.c0).as_slice(), bytes(g2.x.c1).as_slice()]
            .concat()
            .try_into()
            .unwrap(),
        y: [bytes(g2.y.c0).as_slice(), bytes(g2.y.c1).as_slice()]
            .concat()
            .try_into()
            .unwrap(),
    };
    VerifierKeysRkyv {
        schema_id: "tokamak-zk-evm-univariate".into(),
        one_g1: one(),
        xi_g1: one(),
        psi_g1: one(),
        one_g2: two(),
        tau_g2: two(),
        tau_k_g2: two(),
        delta_g2: two(),
    }
}
fn generate(keys: &VerifierKeysRkyv) -> Result<String, String> {
    build_fixed::generate(
        &archive::to_bytes::<archive::rancor::Error>(keys).unwrap(),
        256,
        8,
    )
}

#[test]
fn emits_checked_points_roots_and_prepared_lines_not_runtime_parsing() {
    let source = generate(&keys()).unwrap();
    for symbol in [
        "ONE",
        "XI",
        "PSI",
        "CONNECTION_ROOT",
        "INV_N_C",
        "PUBLIC_ROOTS",
        "PUBLIC_WEIGHTS",
        "INV_TWO",
    ] {
        assert!(source.contains(&format!("pub const {symbol}:")));
    }
    assert_eq!(source.matches("infinity: false, ell_coeffs:").count(), 4);
    for forbidden in [
        "inverse()",
        "from_bytes",
        "from_str",
        "pow(",
        "G2Prepared::from",
    ] {
        assert!(!source.contains(forbidden));
    }
    let mut changed = keys();
    changed.xi_g1.y = bytes(-G1Affine::generator().y);
    assert_ne!(generate(&changed).unwrap(), source);
    let mut changed = keys();
    std::mem::swap(&mut changed.one_g1.x, &mut changed.one_g1.y);
    assert!(generate(&changed).is_err());
}

#[test]
fn rejects_missing_truncated_wrong_schema_and_invalid_fixed_points() {
    assert!(build_fixed::generate(&[], 256, 8).is_err());
    let valid = archive::to_bytes::<archive::rancor::Error>(&keys()).unwrap();
    assert!(build_fixed::generate(&valid[..valid.len() - 1], 256, 8).is_err());
    let mut invalid = keys();
    invalid.schema_id = "retired".into();
    assert!(generate(&invalid).is_err());
    invalid = keys();
    invalid.one_g1.x = [0; 48];
    invalid.one_g1.y = [0; 48];
    assert!(generate(&invalid).is_err());
    invalid.one_g1.y[0] = 2;
    assert!(generate(&invalid).is_err());
    invalid = keys();
    invalid.one_g1.x.copy_from_slice(&Fq::MODULUS.to_bytes_le());
    assert!(generate(&invalid).is_err());
    invalid = keys();
    invalid.tau_g2.x = [0; 96];
    invalid.tau_g2.y = [0; 96];
    assert!(generate(&invalid).is_err());
}
