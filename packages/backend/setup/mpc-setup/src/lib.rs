#![allow(unused_imports)]

use crate::mpc_utils::compute_langrange_i_coeffs;
use crate::phase1_source::Phase1SrsSource;
use icicle_bls12_381::curve::{G1Affine, G1Projective, ScalarField};
use icicle_core::msm;
use icicle_core::msm::MSMConfig;
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::{DeviceVec, HostSlice};
use icicle_runtime::stream::IcicleStream;
use libs::bivariate_polynomial::BivariatePolynomial;
use libs::group_structures::{G1serde, SigmaPreprocess};
use libs::iotools::SetupParams;

pub const QAP_COMPILER_PATH_PREFIX: &str = "../frontend/qap-compiler/subcircuits/library";
pub const SYNTHESIZER_PATH_PREFIX: &str = "../frontend/synthesizer/examples/outputs";

pub const fn testing_mode_enabled() -> bool {
    cfg!(feature = "testing-mode")
}

pub fn ensure_testing_mode(context: &str) {
    assert!(
        testing_mode_enabled(),
        "{context} requires the `testing-mode` feature"
    );
}

#[macro_export]
macro_rules! testing_log {
    ($($arg:tt)*) => {{
        if $crate::testing_mode_enabled() {
            println!($($arg)*);
        }
    }};
}

pub mod conversions;
pub mod utils;

pub mod accumulator;
pub mod contributor;
pub mod mpc_utils;
pub mod phase1_source;

pub mod sigma;

#[derive(Clone, Copy, Debug)]
pub struct PublicWireSegments {
    pub user_out_end: usize,
    pub user_end: usize,
    pub free_end: usize,
    pub total_end: usize,
}

pub fn public_wire_segments(setup_params: &SetupParams) -> PublicWireSegments {
    let user_out_end = setup_params.l_user_out;
    let user_end = setup_params.l_user;
    let free_end = setup_params.l_free;
    let total_end = setup_params.l;

    assert!(user_out_end <= user_end, "l_user_out must be <= l_user");
    assert!(user_end <= free_end, "l_user must be <= l_free");
    assert!(free_end <= total_end, "l_free must be <= l");

    PublicWireSegments {
        user_out_end,
        user_end,
        free_end,
        total_end,
    }
}

const LAGRANGE_KL_MSM_CHUNK_SIZE: usize = 1 << 15;

fn msm_chunk_to_projective(scalars: &[ScalarField], bases: &[G1Affine]) -> G1Projective {
    assert_eq!(scalars.len(), bases.len());

    let mut msm_res = DeviceVec::<G1Projective>::device_malloc(1).expect("device_malloc failed");
    let mut stream = IcicleStream::create().expect("Stream creation failed");
    let mut cfg = MSMConfig::default();
    cfg.stream_handle = *stream;
    cfg.is_async = true;
    msm::msm(
        HostSlice::from_slice(scalars),
        HostSlice::from_slice(bases),
        &cfg,
        &mut msm_res[..],
    )
    .unwrap();
    stream.synchronize().unwrap();

    let mut host_res = vec![G1Projective::zero(); 1];
    msm_res
        .copy_to_host(HostSlice::from_mut_slice(&mut host_res[..]))
        .unwrap();
    stream.destroy().unwrap();
    host_res[0]
}

fn compute_last_lagrange_coeffs(size: usize, along_x: bool) -> Vec<ScalarField> {
    let mut coeffs = vec![ScalarField::zero(); size];
    if along_x {
        compute_langrange_i_coeffs(size - 1, size, 1, &mut coeffs);
    } else {
        compute_langrange_i_coeffs(size - 1, 1, size, &mut coeffs);
    }
    coeffs
}

fn compute_lagrange_kl_with_basis<F>(setup_params: &SetupParams, basis_at: F) -> G1serde
where
    F: Fn(usize, usize) -> G1Affine,
{
    let m_i = setup_params.l_D - setup_params.l;
    let s_max = setup_params.s_max;
    testing_log!("Encoding lagrange_KL with the separable MSM path");

    let k_coeffs = compute_last_lagrange_coeffs(m_i, true);
    let l_coeffs = compute_last_lagrange_coeffs(s_max, false);
    let mut scalars = Vec::with_capacity(LAGRANGE_KL_MSM_CHUNK_SIZE);
    let mut bases = Vec::with_capacity(LAGRANGE_KL_MSM_CHUNK_SIZE);
    let mut acc = G1Projective::zero();

    for (x_idx, x_coeff) in k_coeffs.iter().enumerate() {
        for (y_idx, y_coeff) in l_coeffs.iter().enumerate() {
            scalars.push(*x_coeff * *y_coeff);
            bases.push(basis_at(x_idx, y_idx));

            if scalars.len() == LAGRANGE_KL_MSM_CHUNK_SIZE {
                acc = acc + msm_chunk_to_projective(&scalars, &bases);
                scalars.clear();
                bases.clear();
            }
        }
    }

    if !scalars.is_empty() {
        acc = acc + msm_chunk_to_projective(&scalars, &bases);
    }

    G1serde(G1Affine::from(acc))
}

pub fn compute_lagrange_kl(sigma: &SigmaPreprocess, setup_params: &SetupParams) -> G1serde {
    let rs_y_size = setup_params.s_max * 2;
    compute_lagrange_kl_with_basis(setup_params, |x_idx, y_idx| {
        sigma.sigma_1.xy_powers[x_idx * rs_y_size + y_idx].0
    })
}

pub fn compute_lagrange_kl_from_source<S: Phase1SrsSource>(
    source: &S,
    setup_params: &SetupParams,
) -> G1serde {
    compute_lagrange_kl_with_basis(setup_params, |x_idx, y_idx| source.xy_g1(x_idx, y_idx).0)
}
