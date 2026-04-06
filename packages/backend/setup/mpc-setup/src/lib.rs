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

pub struct MsmWorkspace {
    stream: IcicleStream,
    output: DeviceVec<G1Projective>,
    host: Vec<G1Projective>,
    capacity: usize,
}

impl MsmWorkspace {
    pub fn new(capacity: usize) -> Self {
        let capacity = capacity.max(1);
        Self {
            stream: IcicleStream::create().expect("Stream creation failed"),
            output: DeviceVec::<G1Projective>::device_malloc(capacity)
                .expect("device_malloc failed"),
            host: vec![G1Projective::zero(); capacity],
            capacity,
        }
    }

    fn ensure_capacity(&mut self, capacity: usize) {
        if capacity <= self.capacity {
            return;
        }
        let new_capacity = capacity.next_power_of_two();
        self.output =
            DeviceVec::<G1Projective>::device_malloc(new_capacity).expect("device_malloc failed");
        self.host.resize(new_capacity, G1Projective::zero());
        self.capacity = new_capacity;
    }

    pub fn msm(&mut self, scalars: &[ScalarField], bases: &[G1Affine]) -> G1serde {
        assert_eq!(scalars.len(), bases.len());
        self.ensure_capacity(1);

        let mut cfg = MSMConfig::default();
        cfg.stream_handle = *self.stream;
        cfg.is_async = true;
        msm::msm(
            HostSlice::from_slice(scalars),
            HostSlice::from_slice(bases),
            &cfg,
            &mut self.output[..1],
        )
        .unwrap();
        self.stream.synchronize().unwrap();
        self.output[..1]
            .copy_to_host(HostSlice::from_mut_slice(&mut self.host[..1]))
            .unwrap();
        G1serde(G1Affine::from(self.host[0]))
    }

    pub fn shared_bases_msm(
        &mut self,
        bases: &[G1Affine],
        batched_scalars: &[ScalarField],
        output_size: usize,
    ) -> &[G1Projective] {
        assert!(output_size > 0);
        assert_eq!(batched_scalars.len(), bases.len() * output_size);
        self.ensure_capacity(output_size);

        let mut cfg = MSMConfig::default();
        cfg.stream_handle = *self.stream;
        cfg.is_async = true;
        cfg.batch_size = bases.len() as i32;
        cfg.are_points_shared_in_batch = true;
        msm::msm(
            HostSlice::from_slice(batched_scalars),
            HostSlice::from_slice(bases),
            &cfg,
            &mut self.output[..output_size],
        )
        .unwrap();
        self.stream.synchronize().unwrap();
        self.output[..output_size]
            .copy_to_host(HostSlice::from_mut_slice(&mut self.host[..output_size]))
            .unwrap();
        &self.host[..output_size]
    }
}

impl Drop for MsmWorkspace {
    fn drop(&mut self) {
        let _ = self.stream.destroy();
    }
}

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
    let mut msm_workspace = MsmWorkspace::new(1);

    for (x_idx, x_coeff) in k_coeffs.iter().enumerate() {
        for (y_idx, y_coeff) in l_coeffs.iter().enumerate() {
            scalars.push(*x_coeff * *y_coeff);
            bases.push(basis_at(x_idx, y_idx));

            if scalars.len() == LAGRANGE_KL_MSM_CHUNK_SIZE {
                acc = acc + msm_workspace.msm(&scalars, &bases).0.to_projective();
                scalars.clear();
                bases.clear();
            }
        }
    }

    if !scalars.is_empty() {
        acc = acc + msm_workspace.msm(&scalars, &bases).0.to_projective();
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
