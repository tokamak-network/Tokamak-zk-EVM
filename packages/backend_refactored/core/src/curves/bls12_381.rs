use super::curve_config::CurveConfig;
use icicle_bls12_381::curve::*;
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};

#[derive(Clone, Debug, PartialEq)]
pub struct Bls12_381Config;

impl CurveConfig for Bls12_381Config {
    type ScalarField = ScalarField;
    type ScalarCfg = ScalarCfg;
    type G1Affine = G1Affine;
    type G1Projective = G1Projective;
    type G2Affine = G2Affine;
    type BaseField = BaseField;
    type G2BaseField = G2BaseField;

    fn zero() -> Self::ScalarField {
        ScalarField::zero()
    }

    fn one() -> Self::ScalarField {
        ScalarField::one()
    }

    fn generate_random(count: usize) -> Vec<Self::ScalarField> {
        ScalarCfg::generate_random(count).to_vec()
    }

    fn from_bytes_le(bytes: &[u8]) -> Self::ScalarField {
        ScalarField::from_bytes_le(bytes)
    }

    fn is_zero(field: &Self::ScalarField) -> bool {
        *field == Self::zero()
    }

    fn inverse(field: Self::ScalarField) -> Self::ScalarField {
        field.inv()
    }

    fn negate(field: Self::ScalarField) -> Self::ScalarField {
        Self::zero() - field
    }
}
