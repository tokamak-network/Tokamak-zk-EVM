use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use std::fmt::{Debug, Display};
use std::ops::{Add, Mul, Sub};

pub trait CurveConfig: 'static + Send + Sync + Clone + Debug {
    type ScalarField: FieldImpl
        + Arithmetic
        + Copy
        + Clone
        + Debug
        + PartialEq
        + Add<Output = Self::ScalarField>
        + Sub<Output = Self::ScalarField>
        + Mul<Output = Self::ScalarField>
        + Display;

    type ScalarCfg: GenerateRandom<Self::ScalarField>;
    type G1Affine: Copy + Clone + Debug;
    type G1Projective: Copy + Clone + Debug;
    type G2Affine: Copy + Clone + Debug;
    type BaseField: Copy + Clone + Debug;
    type G2BaseField: Copy + Clone + Debug;

    fn zero() -> Self::ScalarField;
    fn one() -> Self::ScalarField;
    fn generate_random(count: usize) -> Vec<Self::ScalarField>;
    fn from_bytes_le(bytes: &[u8]) -> Self::ScalarField;
}
