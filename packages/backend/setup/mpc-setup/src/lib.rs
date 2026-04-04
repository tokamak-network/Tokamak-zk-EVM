#![allow(unused_imports)]

use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::group_structures::{G1serde, SigmaPreprocess};
use libs::iotools::SetupParams;

pub const QAP_COMPILER_PATH_PREFIX: &str = "../frontend/qap-compiler/subcircuits/library";
pub const SYNTHESIZER_PATH_PREFIX: &str = "../frontend/synthesizer/examples/outputs";

pub mod conversions;
pub mod utils;

pub mod accumulator;
pub mod contributor;
pub mod mpc_utils;

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

pub fn compute_lagrange_kl(sigma: &SigmaPreprocess, setup_params: &SetupParams) -> G1serde {
    let m_i = setup_params.l_D - setup_params.l;
    let s_max = setup_params.s_max;
    // Generating permutation polynomials
    println!("Converting the permutation matrices into polynomials s^0 and s^1...");
    let mut lagrange_KL_XY = {
        let mut k_evals = vec![ScalarField::zero(); m_i];
        k_evals[m_i - 1] = ScalarField::one();
        let lagrange_K_XY =
            DensePolynomialExt::from_rou_evals(HostSlice::from_slice(&k_evals), m_i, 1, None, None);
        let mut l_evals = vec![ScalarField::zero(); s_max];
        l_evals[s_max - 1] = ScalarField::one();
        let lagrange_L_XY = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&l_evals),
            1,
            s_max,
            None,
            None,
        );
        &lagrange_K_XY * &lagrange_L_XY
    };
    let lagrange_KL = sigma
        .sigma_1
        .encode_poly(&mut lagrange_KL_XY, &setup_params);
    lagrange_KL
}
