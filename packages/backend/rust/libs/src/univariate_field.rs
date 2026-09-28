//! The scalar operations shared by the two concrete native proving engines.
//! Values stay in their engine's field representation; this is not a wrapper.
use ark_bls12_381::Fr;
use ark_ff::{BigInteger, Field, PrimeField};
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::{Arithmetic, FieldImpl};
use std::ops::{Add, Mul, Sub};

/// Byte-level admission shared by both engines, without modular reduction.
pub fn canonical_scalar(bytes: &[u8]) -> bool {
    bytes.len() == 32
        && bytes
            .iter()
            .rev()
            .cmp(Fr::MODULUS.to_bytes_le().iter().rev())
            .is_lt()
}

/// Preserve the existing CRS domain ordering without initializing an ICICLE
/// device or selecting a library's different default primitive root.
pub fn canonical_root(n: usize) -> Option<Fr> {
    use std::sync::OnceLock;
    static ROOT: OnceLock<(Fr, u64)> = OnceLock::new();
    let (max_root, size) = ROOT.get_or_init(|| {
        let contract: serde_json::Value = serde_json::from_str(include_str!(
            "../../../common/contracts/univariate-domain-contract.v1.json"
        ))
        .expect("checked domain contract");
        let root = &contract["scalarRootOfUnity"];
        let bytes = hex::decode(root["maxRootCanonicalHex"].as_str().unwrap()).unwrap();
        (
            Fr::from_be_bytes_mod_order(&bytes),
            1u64 << root["twoAdicity"].as_u64().unwrap(),
        )
    });
    if !n.is_power_of_two() || n as u64 > *size {
        return None;
    }
    Some(Field::pow(max_root, [size / (n as u64)]))
}

pub trait ProtocolField:
    Copy
    + PartialEq
    + std::fmt::Debug
    + Send
    + Sync
    + Add<Output = Self>
    + Sub<Output = Self>
    + Mul<Output = Self>
{
    fn zero() -> Self;
    fn one() -> Self;
    fn pow(self, exponent: usize) -> Self;
    fn inv(self) -> Self;
    fn from_le(bytes: &[u8]) -> Self;
    fn canonical_le(self) -> [u8; 32];
    fn from_usize(value: usize) -> Self {
        Self::from_le(&value.to_le_bytes())
    }
}
impl ProtocolField for Fr {
    fn zero() -> Self {
        <Self as ark_ff::Zero>::zero()
    }
    fn one() -> Self {
        <Self as ark_ff::One>::one()
    }
    fn pow(self, exponent: usize) -> Self {
        Field::pow(&self, [exponent as u64])
    }
    fn inv(self) -> Self {
        self.inverse().expect("nonzero protocol denominator")
    }
    fn from_le(bytes: &[u8]) -> Self {
        Self::from_le_bytes_mod_order(bytes)
    }
    fn canonical_le(self) -> [u8; 32] {
        self.into_bigint().to_bytes_le().try_into().unwrap()
    }
}
impl ProtocolField for ScalarField {
    fn zero() -> Self {
        <Self as FieldImpl>::zero()
    }
    fn one() -> Self {
        <Self as FieldImpl>::one()
    }
    fn pow(self, exponent: usize) -> Self {
        Arithmetic::pow(self, exponent)
    }
    fn inv(self) -> Self {
        Arithmetic::inv(self)
    }
    fn from_le(bytes: &[u8]) -> Self {
        Self::from_bytes_le(bytes)
    }
    fn canonical_le(self) -> [u8; 32] {
        self.to_bytes_le().try_into().unwrap()
    }
}
