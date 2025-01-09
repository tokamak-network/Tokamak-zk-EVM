
pub mod utils;

use lambdaworks_math::elliptic_curve::{
    short_weierstrass::curves::bls12_381::curve::BLS12381Curve, traits::IsEllipticCurve,
};

pub type G1Point = <BLS12381Curve as IsEllipticCurve>::PointRepresentation;
