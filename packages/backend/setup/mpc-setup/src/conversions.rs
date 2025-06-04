use ark_bls12_381::{
    G1Affine as ArkG1Affine, G1Projective as ArkG1Projective, G2Affine as ArkG2Affine,
    G2Projective as ArkG2Projective,
};
use ark_ec::AffineRepr;
use ark_ff::{BigInteger, Field, PrimeField};
use ark_serialize::CanonicalDeserializeWithFlags;
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize, Compress, Validate};
use bincode;
use blake2::crypto_mac::generic_array::typenum::U64;
use blake2::crypto_mac::generic_array::GenericArray;
use blake2::{Blake2b, Digest};
use icicle_bls12_381::curve::{
    G1Affine as IcicleG1Affine, G1Projective as IcicleG1Projective, G2Affine as IcicleG2Affine,
    G2Projective as IcicleG2Projective, ScalarField,
};
use icicle_core::traits::FieldImpl;
use libs::group_structures::{icicle_g1_affine_to_ark, icicle_g2_affine_to_ark, G1serde, G2serde};
use rand::Rng;
use rand_chacha::rand_core::SeedableRng;
use rand_chacha::ChaCha20Rng;
use rayon::prelude::*;
use std::io::{Cursor, Write};
use std::ops::Mul;

fn ark_to_icicle_g1_affine_points(ark_affine: &[ArkG1Affine]) -> Vec<IcicleG1Affine> {
    ark_affine
        .par_iter()
        .map(|ark| IcicleG1Affine {
            x: from_ark(&ark.x),
            y: from_ark(&ark.y),
        })
        .collect()
}
fn ark_to_icicle_g2_affine_points(ark_affine: &[ArkG2Affine]) -> Vec<IcicleG2Affine> {
    ark_affine
        .par_iter()
        .map(|ark| IcicleG2Affine {
            x: from_ark(&ark.x),
            y: from_ark(&ark.y),
        })
        .collect()
}

fn from_ark<T, I>(ark: &T) -> I
where
    T: Field,
    I: FieldImpl,
{
    let mut ark_bytes = vec![];
    for base_elem in ark.to_base_prime_field_elements() {
        ark_bytes.extend_from_slice(&base_elem.into_bigint().to_bytes_le());
    }
    I::from_bytes_le(&ark_bytes)
}

#[test]
pub fn test_conversions() {
    let ark_g1 = ArkG1Affine::generator();
    let icicle_g1 = ark_to_icicle_g1_affine_points(&[ark_g1])[0];
    let g1 = icicle_g1_generator();
    assert_eq!(g1.0, icicle_g1);

    let ark_g2 = ArkG2Affine::generator();
    let icicle_g2 = IcicleG2Affine {
        x: from_ark(&ark_g2.x),
        y: from_ark(&ark_g2.y),
    };
    //ark_to_icicle_g2_affine_points(&[ark_g2])[0];
    let g2 = icicle_g2_generator();
    assert_eq!(g2.0, icicle_g2);
}

pub fn icicle_g1_generator() -> G1serde {
    let x_limbs: [u32; 12] = [
        0xdb22c6bb, 0xfb3af00a, 0xf97a1aef, 0x6c55e83f, 0x171bac58, 0xa14e3a3f, 0x9774b905,
        0xc3688c4f, 0x4fa9ac0f, 0x2695638c, 0x3197d794, 0x17f1d3a7,
    ];
    let y_limbs: [u32; 12] = [
        1187375073, 212476713, 2726857444, 3493644100, 738505709, 14358731, 3587181302, 4243972245,
        1948093156, 2694721773, 3819610353, 146011265,
    ];
    // Build the G1Affine point from limbs
    G1serde(IcicleG1Affine::from_limbs(x_limbs, y_limbs))
}
pub fn icicle_g2_generator() -> G2serde {
    let x_limbs: [u32; 24] = [
        3240213944, 3565180616, 2818948079, 195822374, 2061750647, 3025210212, 4198513410,
        3336862420, 767889489, 638059815, 4035906193, 38445746, 1560554366, 3853286661, 328490327,
        860680466, 3699331145, 3050987963, 2569057818, 1500238032, 2284277605, 2108478368,
        1383178080, 333458272,
    ];

    let y_limbs: [u32; 24] = [
        146286593, 3784529030, 1001169545, 2453326284, 1365299500, 1833081449, 2361250727,
        2919078826, 3660461338, 2362035654, 1920822801, 216388903, 4032788926, 2863204191,
        1558977953, 1060572455, 1462671787, 645173931, 2242339759, 3409848446, 734170009,
        850186928, 782709964, 101106848,
    ];
    // Build the G1Affine point from limbs
    G2serde(IcicleG2Affine::from_limbs(x_limbs, y_limbs))
}
pub fn ark_g1_affine_to_icicle(g1: &ArkG1Affine) -> IcicleG1Affine {
    IcicleG1Affine {
        x: from_ark(&g1.x),
        y: from_ark(&g1.y),
    }
}

pub fn ark_g2_affine_to_icicle(g2: &ArkG2Affine) -> IcicleG2Affine {
    IcicleG2Affine {
        x: from_ark(&g2.x),
        y: from_ark(&g2.y),
    }
}

pub fn deserialize_g1serde(string: &str, compress: Compress) -> G1serde {
    let buffer = hex::decode(string).unwrap();
    let mut cursor = Cursor::new(&buffer);
    let recArk = ArkG1Affine::deserialize_with_mode(&mut cursor, compress, Validate::No).unwrap();
    G1serde(ark_g1_affine_to_icicle(&recArk))
}
pub fn serialize_g1serde(point: &G1serde, compress: Compress) -> String {
    hex::encode(serialize_g1_affine(&point.0, compress))
}
pub fn deserialize_g2serde(string: &str, compress: Compress) -> G2serde {
    let buffer = hex::decode(string).unwrap();
    let mut cursor = Cursor::new(&buffer);
    let recArk = ArkG2Affine::deserialize_with_mode(&mut cursor, compress, Validate::No).unwrap();
    G2serde(ark_g2_affine_to_icicle(&recArk))
}
pub fn serialize_g2serde(point: &G2serde, compress: Compress) -> String {
    hex::encode(serialize_g2_affine(&point.0, compress))
}

pub fn serialize_g1_affine(point: &IcicleG1Affine, compress: Compress) -> Box<[u8]> {
    let mut buf = Vec::new();

    icicle_g1_affine_to_ark(point)
        .serialize_with_mode(&mut buf, compress)
        .expect("Serialization failed");

    buf.into_boxed_slice()
}

pub fn deserialize_g1_affine(buf: &Box<[u8]>, compress: Compress) -> IcicleG1Affine {
    let mut cursor = Cursor::new(&buf);
    let recArk = ArkG1Affine::deserialize_with_mode(&mut cursor, compress, Validate::No).unwrap();
    ark_g1_affine_to_icicle(&recArk)
}
pub fn serialize_g2_affine(point: &IcicleG2Affine, compress: Compress) -> Box<[u8]> {
    let mut buf = Vec::new();

    icicle_g2_affine_to_ark(point)
        .serialize_with_mode(&mut buf, compress)
        .expect("Serialization failed");

    buf.into_boxed_slice()
}
pub fn deserialize_g2_affine(buf: &Box<[u8]>, compress: Compress) -> IcicleG2Affine {
    let mut cursor = Cursor::new(&buf);
    let recArk = ArkG2Affine::deserialize_with_mode(&mut cursor, compress, Validate::No).unwrap();
    ark_g2_affine_to_icicle(&recArk)
}
#[test]
fn test_serialize_g1_compressed() {
    let g1 = icicle_g1_generator();

    let serializedBytes = serialize_g1_affine(&g1.0, Compress::Yes);
    let recIcicle = deserialize_g1_affine(&serializedBytes, Compress::Yes);
    assert_eq!(g1.0, recIcicle);
}
#[test]
fn test_serialize_g2_compressed() {
    let g2 = icicle_g2_generator();
    let serializedBytes = serialize_g2_affine(&g2.0, Compress::Yes);

    let recIcicle = deserialize_g2_affine(&serializedBytes, Compress::Yes);
    assert_eq!(g2.0, recIcicle);
}

pub fn hash_to_g2(digest: &[u8]) -> G2serde {
    assert!(digest.len() >= 32, "Digest must be at least 32 bytes");

    // Use the first 32 bytes as seed
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&digest[..32]);
    let mut rng = ChaCha20Rng::from_seed(seed);

    let g2 = icicle_g2_generator();

    let limbs: [u32; 8] = rng.gen();
    let scalar = ScalarField::from(limbs);
    G2serde(IcicleG2Affine::from(g2.0.to_projective().mul(scalar)))
}
/// Hashes to G2 and returns a compressed 96-byte representation.
pub fn hash_to_g2_compressed(digest: &[u8]) -> [u8; 96] {
    let point = hash_to_g2(digest);

    let pointArk = icicle_g2_affine_to_ark(&point.0);
    // Serialize to compressed form (96 bytes)
    let mut buf = Vec::new();
    pointArk
        .serialize_with_mode(&mut buf, Compress::Yes)
        .unwrap();

    let mut out = [0u8; 96];
    out.copy_from_slice(&buf);
    out
}

fn ark_to_icicle_g1projective_points(
    ark_projective: &[ArkG1Projective],
) -> Vec<IcicleG1Projective> {
    ark_projective
        .par_iter()
        .map(|ark| {
            let proj_x = ark.x * ark.z;
            let proj_z = ark.z * ark.z * ark.z;
            IcicleG1Projective {
                x: from_ark(&proj_x),
                y: from_ark(&ark.y),
                z: from_ark(&proj_z),
            }
        })
        .collect()
}

fn ark_to_icicle_g2projective_points(
    ark_projective: &[ArkG2Projective],
) -> Vec<IcicleG2Projective> {
    ark_projective
        .par_iter()
        .map(|ark| {
            let proj_x = ark.x * ark.z;
            let proj_z = ark.z * ark.z * ark.z;
            IcicleG2Projective {
                x: from_ark(&proj_x),
                y: from_ark(&ark.y),
                z: from_ark(&proj_z),
            }
        })
        .collect()
}

#[test]
fn test_hash_to_g2_compressed_deterministic() {
    let digest = [99u8; 64];
    let out1 = hash_to_g2_compressed(&digest);
    let out2 = hash_to_g2_compressed(&digest);
    assert_eq!(out1.len(), 96);
    assert_eq!(out2.len(), 96);
    assert_eq!(out1, out2, "Deterministic input should yield same output");
}

#[test]
fn test_hash_to_g2_compressed_unique() {
    let digest1 = [1u8; 64];
    let digest2 = [2u8; 64];
    let out1 = hash_to_g2_compressed(&digest1);
    let out2 = hash_to_g2_compressed(&digest2);
    assert_eq!(out1.len(), 96);
    assert_eq!(out2.len(), 96);
    assert_ne!(
        out1, out2,
        "Different inputs should yield different outputs"
    );
}
pub fn blank_hash() -> GenericArray<u8, U64> {
    Blake2b::new().result()
}
#[test]
fn testG2Generator() {
    let g2Ice = icicle_g2_generator();
    let res = icicle_g2_affine_to_ark(&g2Ice.0);
    let arcG2 = ArkG2Affine::generator();
    assert_eq!(res, arcG2);
}
#[test]
fn testG1Generator() {
    // Build the G1Affine point from limbs
    let g1Ice = icicle_g1_generator();
    let res = icicle_g1_affine_to_ark(&g1Ice.0);
    let arcG1 = ArkG1Affine::generator();
    assert_eq!(res, arcG1);
}

#[test]
fn test_g2serde_serialization_roundtrip() {
    // Create a sample G2serde instance (replace with actual initialization)
    let original_points: Vec<G2serde> = (0..5)
        .map(|_| G2serde(icicle_g2_generator().0)) // replace with realistic initialization if available
        .collect();

    // Serialize Vec<G2serde> to JSON
    let serialized =
        serde_json::to_string(&original_points).expect("Serialization of Vec<G2serde> failed");

    println!("Serialized Vec<G2serde>: {}", serialized);

    // Deserialize JSON back into Vec<G2serde>
    let deserialized: Vec<G2serde> =
        serde_json::from_str(&serialized).expect("Deserialization of Vec<G2serde> failed");

    // Check equality
    assert_eq!(
        original_points, deserialized,
        "Deserialized Vec<G2serde> differs from the original"
    );
}
