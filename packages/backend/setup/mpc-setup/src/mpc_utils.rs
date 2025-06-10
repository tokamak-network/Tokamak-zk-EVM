use icicle_bls12_381::curve::{CurveCfg, ScalarField};
use icicle_core::curve::Curve;
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::HostSlice;
use lazy_static::lazy_static;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::field_structures::Tau;
use libs::group_structures::G1serde;
use libs::iotools::from_coef_vec_to_g1serde_vec;
use libs::vector_operations::gen_evaled_lagrange_bases;
use rayon::prelude::*;
use std::ops::{Add, Mul};
use std::sync::Mutex;
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_core::ntt;
use icicle_core::polynomials::UnivariatePolynomial;

lazy_static! {
    static ref FFT_MUTEX: Mutex<()> = Mutex::new(());
        static ref POLY_MUTEX: Mutex<()> = Mutex::new(());

}

#[test]
fn test_eval_lagrange_bases() {
    let g1_gen = CurveCfg::generate_random_affine_points(1)[0];
    let tau = Tau::gen();

    const S_MAX: usize = 64;

    let prev_x = [G1serde(g1_gen); S_MAX];
    let x_powers = compute_powers(tau.x, S_MAX);
    let cur_x: Vec<G1serde> = prev_x
        .iter()
        .zip(x_powers.iter())
        .map(|(x, scalar)| x.mul(*scalar))
        .collect();

    let mut result = vec![G1serde::zero(); S_MAX];
    eval_langrange_bases(&cur_x, &mut result);

    let mut x_evaled_vec = vec![ScalarField::zero(); S_MAX].into_boxed_slice();
    gen_evaled_lagrange_bases(&tau.x, S_MAX, &mut x_evaled_vec);

    let mut x_evaledCommit = vec![G1serde::zero(); S_MAX].into_boxed_slice();
    from_coef_vec_to_g1serde_vec(&x_evaled_vec, &g1_gen, &mut x_evaledCommit);

    assert_eq!(result.into_boxed_slice(), x_evaledCommit);
}
pub fn compute_langrange_i_poly(i: usize, max_x: usize, max_y: usize) -> DensePolynomialExt {
    let mut lag_coeffs = vec![ScalarField::zero(); max_x * max_y];
    compute_langrange_i_coeffs(i, max_x, max_y, &mut lag_coeffs);
    // Mutex guard dropped here
    DensePolynomialExt::from_coeffs(HostSlice::from_slice(&lag_coeffs), max_x, max_y)
}
pub fn poly_mult(poly1: &DensePolynomialExt, poly2: &DensePolynomialExt, multpxy_coeffs: &mut Vec<ScalarField>) {
    let multpxy = poly1.mul(poly2);
    let cached_val_pows = HostSlice::from_mut_slice(multpxy_coeffs);
    multpxy.copy_coeffs(0, cached_val_pows);
    // Mutex guard dropped here
}

// given x_g1 = [x^i*G1, x^i*G1, ..., x_max^i*G1]
// it evaluates the lagrange bases foreach i = 0, ..., s_max-1
// return x_evaled_vec = [x_0^i, x_1^i, ..., x_s_max^i]
pub fn eval_langrange_bases(x_g1: &Vec<G1serde>, x_evaled_vec: &mut Vec<G1serde>) {
    let s_max = x_g1.len();
    assert_eq!(x_evaled_vec.len(), s_max);

    x_evaled_vec
        .iter_mut()
        .enumerate()
        .for_each(|(i, out)| {
            let mut lag_coeffs = vec![ScalarField::zero(); s_max];

            compute_langrange_i_coeffs(i, s_max, 1, &mut lag_coeffs);
            // evaluate lagrange base for i
            let result = x_g1
                .iter()
                .zip(lag_coeffs.iter())
                .fold(G1serde::zero(), |acc, (x_g1, coeff_i)| {
                    acc.add(x_g1.mul(*coeff_i))
                });

            *out = result;
        });
}
// TODO update to accumulator [x^0,X^1,...x^len_x-1]
fn compute_powers(x_r: ScalarField, len_x: usize) -> Vec<ScalarField> {
    let mut x_powers: Vec<ScalarField> = Vec::with_capacity(len_x);
    let mut current_power = ScalarField::one();
    for i in 0..len_x {
        x_powers.push(current_power);
        current_power = current_power.mul(x_r);
    }
    x_powers
}
pub fn initialize_domain(size: usize){
    ntt::initialize_domain::<ScalarField>(
        ntt::get_root_of_unity::<ScalarField>(
            size.try_into()
                .unwrap(),
        ),
        &ntt::NTTInitDomainConfig::default(),
    )
        .unwrap();
}

pub fn compute_langrange_i_coeffs(i: usize, max_x: usize, max_y: usize, res: &mut [ScalarField]) {
    let mut l_evals = vec![ScalarField::zero(); max_x * max_y];
    l_evals[i] = ScalarField::one();
    let lagrange_L_XY = DensePolynomialExt::from_rou_evals(
        HostSlice::from_slice(&l_evals),
        max_x,
        max_y,
        None,
        None,
    );
    let cached_val_pows = HostSlice::from_mut_slice(res);
    lagrange_L_XY.copy_coeffs(0, cached_val_pows);
}

