use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_core::traits::{FieldImpl, GenerateRandom};

// TODO: this function is not used anywhere in the codebase, perhaps consider deleting this
// pub fn hashing(seed: &Vec<u8>) -> ScalarField {
//     let keccak_hasher = Keccak256::new(0 /* default input size */).unwrap();
//     let mut res_bytes = vec![0u8; 32]; // 32-byte output buffer
//     keccak_hasher
//         .hash(
//             HostSlice::from_slice(seed),               // Input data
//             &HashConfig::default(),                    // Default configuration
//             HostSlice::from_mut_slice(&mut res_bytes), // Output buffer
//         )
//         .unwrap();
//     res_bytes[31] &= 0b0011_1111;
//     return ScalarField::from_bytes_le(&res_bytes);
// }

macro_rules! impl_Tau_struct {
    ( $($ScalarField:ident),* ) => {
        pub struct Tau {
            $(pub $ScalarField: ScalarField),*
        }

        impl Tau {
            pub fn gen() -> Self {
                Self {
                    $($ScalarField: ScalarCfg::generate_random(1)[0]),*
                }
            }
        }
    };
}
impl_Tau_struct!(x, y, alpha, gamma, delta, eta);

impl Tau {
    pub fn gen_fixed() -> Self {
        Self {
            x: ScalarField::from_hex(
                "0x7234cd9b97845e0125e84ae3ae81354e004558d8c82a83425652bc7b9ed49f7d",
            ),
            y: ScalarField::from_hex(
                "0x6ed0eea55cbeeebdc7a41033ebd196ffecc1806fdbc13a8d41b8f1aa273a4037",
            ),
            alpha: ScalarField::from_hex(
                "0x7234cd9b97845e0125e84ae3ae81354e004558d8c82a83425652bc7b9ed49f7d",
            ),
            gamma: ScalarField::from_hex(
                "0x088dfe3d1b76775ec267d6d0e27b753ec904c76e0bc32ca8223dc2ae1a0ac6b4",
            ),
            delta: ScalarField::from_hex(
                "0x04b8ce26374c547d8722ac51f5ed1e0f9cb891c332c69c865d96af150189a818",
            ),
            eta: ScalarField::from_hex(
                "0x52eb2aeb35b72b94a19ea232e984850f2cda5542fdc10368955d8ac6274f8579",
            ),
        }
    }
}
