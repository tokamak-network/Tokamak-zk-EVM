use ark_bls12_381::{Fr, G1Affine, G2Affine};
use ark_ec::AffineRepr;
use ark_ff::{BigInteger, PrimeField};
use backend_interface::{PreprocessBytes, ProofBytes};
use icicle_bls12_381::curve::{BaseField, G1Affine as IcicleG1, G2Affine as IcicleG2};
use icicle_core::traits::FieldImpl;

fn g1_bytes(p: G1Affine) -> Vec<u8> {
    if p.is_zero() {
        return vec![0; 96];
    }
    [
        p.x.into_bigint().to_bytes_le(),
        p.y.into_bigint().to_bytes_le(),
    ]
    .concat()
}
fn g2_bytes(p: G2Affine) -> Vec<u8> {
    if p.is_zero() {
        return vec![0; 192];
    }
    [p.x.c0, p.x.c1, p.y.c0, p.y.c1]
        .iter()
        .flat_map(|f| f.into_bigint().to_bytes_le())
        .collect()
}

#[test]
fn arithmetic_libraries_encode_the_same_canonical_affine_bytes() {
    assert_eq!(
        g1_bytes(G1Affine::identity()),
        [
            IcicleG1::zero().x.to_bytes_le(),
            IcicleG1::zero().y.to_bytes_le()
        ]
        .concat()
    );
    assert_eq!(
        g2_bytes(G2Affine::identity()),
        [
            IcicleG2::zero().x.to_bytes_le(),
            IcicleG2::zero().y.to_bytes_le()
        ]
        .concat()
    );
    for n in [0u64, 1, 7] {
        let scalar = Fr::from(n);
        let p: G1Affine = (G1Affine::generator() * scalar).into();
        let q: G2Affine = (G2Affine::generator() * scalar).into();
        let pb = g1_bytes(p);
        let qb = g2_bytes(q);
        let ip = IcicleG1::from_limbs(
            BaseField::from_bytes_le(&pb[..48]).into(),
            BaseField::from_bytes_le(&pb[48..]).into(),
        );
        let iq = IcicleG2::from_limbs(
            icicle_bls12_381::curve::G2BaseField::from_bytes_le(&qb[..96]).into(),
            icicle_bls12_381::curve::G2BaseField::from_bytes_le(&qb[96..]).into(),
        );
        assert_eq!(
            g1_bytes(p),
            [ip.x.to_bytes_le(), ip.y.to_bytes_le()].concat()
        );
        assert_eq!(
            g2_bytes(q),
            [iq.x.to_bytes_le(), iq.y.to_bytes_le()].concat()
        );
        let mut bytes = Vec::new();
        for _ in 0..10 {
            bytes.extend(g1_bytes(p));
        }
        for _ in 0..7 {
            bytes.extend(scalar.into_bigint().to_bytes_le());
        }
        assert_eq!(ProofBytes::decode(&bytes).unwrap().encode().unwrap(), bytes);
        let bytes = [g1_bytes(p), g1_bytes(p), g2_bytes(q)].concat();
        assert_eq!(
            PreprocessBytes::decode(&bytes).unwrap().encode().unwrap(),
            bytes
        );
    }
}

#[test]
fn shared_transcript_vector_and_modulus_boundaries() {
    let vector: serde_json::Value = serde_json::from_str(include_str!(
        "../../../common/contracts/fixtures/univariate-fiat-shamir.json"
    ))
    .unwrap();
    let point = hex::decode(vector["messages"][0][0].as_str().unwrap()).unwrap();
    let expected = point
        .chunks_exact(48)
        .flat_map(|c| c.iter().rev().copied())
        .collect::<Vec<_>>();
    assert_eq!(g1_bytes(G1Affine::generator()), expected);
    let mut bytes = vec![0; 1184];
    bytes[..96].copy_from_slice(&expected);
    bytes[960] = 1;
    assert_eq!(ProofBytes::decode(&bytes).unwrap().encode().unwrap(), bytes);
    let contract: serde_json::Value = serde_json::from_str(include_str!(
        "../../../common/contracts/univariate-artifact-contract.json"
    ))
    .unwrap();
    for (offset, key) in [
        (0, "baseFieldModulus"),
        (48, "baseFieldModulus"),
        (960, "scalarModulus"),
    ] {
        let mut invalid = bytes.clone();
        let mut modulus = hex::decode(contract["encoding"][key].as_str().unwrap()).unwrap();
        modulus.reverse();
        invalid[offset..offset + modulus.len()].copy_from_slice(&modulus);
        assert!(ProofBytes::decode(&invalid).is_err());
    }
}

#[test]
fn generated_crs_role_preserves_pre_migration_archive_bytes() {
    use backend_univariate_crs_interface::{archive, VerifierKeysRkyv};
    // Produced by the accepted trusted setup before the common codec migration.
    let hex = include_str!("../../../common/contracts/fixtures/pre-codec-verifier-keys.hex");
    let bytes = hex::decode(hex.split_whitespace().collect::<String>()).unwrap();
    let keys = archive::from_bytes::<VerifierKeysRkyv, archive::rancor::Error>(&bytes).unwrap();
    let encoded = archive::to_bytes::<archive::rancor::Error>(&keys).unwrap();
    assert_eq!(encoded.as_slice(), bytes);
}
