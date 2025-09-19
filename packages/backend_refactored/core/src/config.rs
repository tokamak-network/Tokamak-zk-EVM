// Default curve configuration - like Arkworks pattern
use crate::curves::{Bls12_381Config, CurveConfig};

// Default curve type - similar to Arkworks approach
pub type DefaultCurve = Bls12_381Config;

// Convenient type aliases for the default curve
pub type Fr = <DefaultCurve as CurveConfig>::ScalarField;
pub type G1 = <DefaultCurve as CurveConfig>::G1Affine;
pub type G1Projective = <DefaultCurve as CurveConfig>::G1Projective;
pub type G2 = <DefaultCurve as CurveConfig>::G2Affine;
pub type Fq = <DefaultCurve as CurveConfig>::BaseField;
pub type Fq2 = <DefaultCurve as CurveConfig>::G2BaseField;

// For backwards compatibility
pub type ScalarField = Fr;
pub type ScalarCfg = <DefaultCurve as crate::curves::CurveConfig>::ScalarCfg;
pub type G1Affine = G1;
pub type G2Affine = G2;
pub type BaseField = Fq;
pub type G2BaseField = Fq2;
