use icicle_bls12_381::curve::{ScalarField as Field, ScalarCfg, G1Affine as G1, G2Affine as G2, CurveCfg};
use icicle_bls12_381::vec_ops;
use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};
use icicle_core::polynomials::UnivariatePolynomial;
use icicle_core::{ntt, ntt::NTTInitDomainConfig};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice, DeviceSlice, DeviceVec};
use icicle_runtime::Device;
use std::ops::Deref;
use std::{
    clone, cmp,
    ops::{Add, AddAssign, Div, Mul, Rem, Sub, Neg},
    ptr, slice,
};

macro_rules! impl_tau_struct {
    ($name:ident { $($field:ident),* }) => {
        struct $name {
            $(pub $field: Field),*
        }

        impl $name {
            fn gen() -> Self {
                Self {
                    $($field: ScalarCfg::generate_random(1)[0]),*
                }
            }
        }
    };
}

fn main() {
    impl_tau_struct!(Tau {x, y, z, alpha, beta, gamma, delta, eta0, eta1, mu, nu, psi0, psi1, psi2, psi3, kappa});
    let tau = Tau::gen();
    
}