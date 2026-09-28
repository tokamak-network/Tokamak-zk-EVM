//! Scalar wrappers retained by the current binary proof/transcript boundary.

use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;

/// Fixed development trapdoors used by trusted setup.
pub struct Tau {
    pub x: ScalarField,
    pub alpha: ScalarField,
    pub delta: ScalarField,
}

impl Tau {
    pub fn gen_fixed() -> Self {
        Self {
            x: ScalarField::from_hex(
                "0x7234cd9b97845e0125e84ae3ae81354e004558d8c82a83425652bc7b9ed49f7d",
            ),
            alpha: ScalarField::from_hex(
                "0x7234cd9b97845e0125e84ae3ae81354e004558d8c82a83425652bc7b9ed49f7d",
            ),
            delta: ScalarField::from_hex(
                "0x04b8ce26374c547d8722ac51f5ed1e0f9cb891c332c69c865d96af150189a818",
            ),
        }
    }
}

#[derive(Clone, Debug, Copy, PartialEq)]
pub struct FieldSerde(pub ScalarField);
