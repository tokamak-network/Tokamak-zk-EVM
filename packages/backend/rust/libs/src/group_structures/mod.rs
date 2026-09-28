//! Minimal native group adapters shared by the current univariate backend.

use ark_bls12_381::{G1Affine as ArkG1Affine, G2Affine as ArkG2Affine};
use ark_ff::{Field, PrimeField};
use icicle_bls12_381::curve::{G1Affine, G2Affine};
use icicle_core::traits::FieldImpl;
use std::ops::Add;

#[derive(Clone, Debug, Copy, PartialEq)]
pub struct G1serde(pub G1Affine);

impl G1serde {
    pub fn zero() -> Self {
        Self(G1Affine::zero())
    }
}

impl Add for G1serde {
    type Output = Self;
    fn add(self, other: Self) -> Self {
        Self(G1Affine::from(
            self.0.to_projective() + other.0.to_projective(),
        ))
    }
}
pub fn icicle_g1_affine_to_ark(g: &G1Affine) -> ArkG1Affine {
    let x = ark_bls12_381::Fq::from_le_bytes_mod_order(&g.x.to_bytes_le());
    let y = ark_bls12_381::Fq::from_le_bytes_mod_order(&g.y.to_bytes_le());
    ArkG1Affine::new_unchecked(x, y)
}

pub fn icicle_g2_affine_to_ark(g: &G2Affine) -> ArkG2Affine {
    let bytes_x = g.x.to_bytes_le();
    let bytes_y = g.y.to_bytes_le();
    ArkG2Affine::new_unchecked(
        ark_bls12_381::Fq2::from_random_bytes(&bytes_x).expect("valid ICICLE G2 x coordinate"),
        ark_bls12_381::Fq2::from_random_bytes(&bytes_y).expect("valid ICICLE G2 y coordinate"),
    )
}
