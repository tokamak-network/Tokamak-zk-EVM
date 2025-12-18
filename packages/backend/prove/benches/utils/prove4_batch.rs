use crate::poly_comb;
use icicle_bls12_381::curve::{G1Affine, G1Projective, ScalarField};
use icicle_core::msm::{self, MSMConfig};
use icicle_core::ntt;
use icicle_core::traits::{Arithmetic, FieldImpl};
use icicle_runtime::memory::{DeviceVec, HostSlice};
use icicle_runtime::stream::IcicleStream;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::group_structures::{G1serde, Sigma1};
use libs::iotools::SetupParams;
use libs::vector_operations::resize;
use prove::{Proof3, Proof4, Proof4Test, Prover};

fn prepare_encode_poly(
    poly: &mut DensePolynomialExt,
    sigma1: &Sigma1,
    params: &SetupParams,
) -> (Vec<ScalarField>, Vec<G1Affine>) {
    crate::utils::prove_init_batch::prepare_encode_poly(poly, sigma1, params)
}

/// Prepare polynomial coefficients only (without points) for batched MSM with shared points
fn prepare_poly_coeffs_for_batch(
    poly: &mut DensePolynomialExt,
    max_x_size: usize,
    max_y_size: usize,
) -> Vec<ScalarField> {
    poly.optimize_size();
    let target_x_size = (poly.x_degree + 1) as usize;
    let target_y_size = (poly.y_degree + 1) as usize;

    if target_x_size * target_y_size == 0 {
        return vec![ScalarField::zero(); max_x_size * max_y_size];
    }

    // Get polynomial coefficients
    let mut poly_coeffs = vec![ScalarField::zero(); poly.x_size * poly.y_size];
    poly.copy_coeffs(0, HostSlice::from_mut_slice(&mut poly_coeffs));

    // Resize directly to max dimensions (combines target resize + padding)
    resize(
        &poly_coeffs,
        poly.x_size,
        poly.y_size,
        max_x_size,
        max_y_size,
        ScalarField::zero(),
    )
}

pub fn prove4_sequential(
    prover: &Prover,
    proof3: &Proof3,
    thetas: &Vec<ScalarField>,
    kappa0: ScalarField,
    chi: ScalarField,
    zeta: ScalarField,
    kappa1: ScalarField,
) -> (Proof4, Proof4Test) {
    let (Pi_AX, Pi_AY) = {
        let (mut Pi_AX_XY, mut Pi_AY_XY, _rem) = {
            let t_n_eval = prover.instance.t_n.eval(&chi, &ScalarField::one());
            let t_smax_eval = prover.instance.t_smax.eval(&ScalarField::one(), &zeta);
            let small_v_eval = prover.witness.vXY.eval(&chi, &zeta);

            let rW_X = DensePolynomialExt::from_coeffs(
                HostSlice::from_slice(&prover.mixer.rW_X),
                prover.mixer.rW_X.len(),
                1,
            );
            let rW_Y = DensePolynomialExt::from_coeffs(
                HostSlice::from_slice(&prover.mixer.rW_Y),
                1,
                prover.mixer.rW_Y.len(),
            );

            let VXY = poly_comb!(
                (ScalarField::one(), prover.witness.vXY),
                (prover.mixer.rV_X, prover.instance.t_n),
                (prover.mixer.rV_Y, prover.instance.t_smax)
            );

            let pA_XY = poly_comb!(
                // for KZG of V
                (kappa1, &VXY - &proof3.V_eval.0),
                // for Arithmetic constraints
                (small_v_eval, prover.witness.uXY),
                (ScalarField::zero() - ScalarField::one(), prover.witness.wXY),
                (
                    (ScalarField::zero() - ScalarField::one()) * t_n_eval,
                    prover.quotients.q0XY
                ),
                (
                    (ScalarField::zero() - ScalarField::one()) * t_smax_eval,
                    prover.quotients.q1XY
                ),
                // for zero-knowledge
                (small_v_eval * prover.mixer.rU_X, prover.instance.t_n),
                (small_v_eval * prover.mixer.rU_Y, prover.instance.t_smax),
                (
                    ScalarField::zero()
                        - ((prover.mixer.rU_X * t_n_eval) + (prover.mixer.rU_Y * t_smax_eval)),
                    prover.witness.vXY
                ),
                (rW_X, &t_n_eval - &prover.instance.t_n),
                (rW_Y, &t_smax_eval - &prover.instance.t_smax)
            );
            pA_XY.div_by_ruffini(&chi, &zeta)
        };

        (
            prover
                .sigma
                .sigma_1
                .encode_poly(&mut Pi_AX_XY, &prover.setup_params),
            prover
                .sigma
                .sigma_1
                .encode_poly(&mut Pi_AY_XY, &prover.setup_params),
        )
    };

    let m_i = prover.setup_params.l_D - prover.setup_params.l;
    let s_max = prover.setup_params.s_max;
    let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
    let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
    let RXY = &prover.witness.rXY
        + &(&(&prover.mixer.rR_X * &prover.instance.t_mi)
            + &(&prover.mixer.rR_Y * &prover.instance.t_smax));

    let (M_X, M_Y) = {
        let (mut M_X_XY, mut M_Y_XY, _rem2) =
            (&RXY - &proof3.R_omegaX_eval.0).div_by_ruffini(&(omega_m_i.inv() * chi), &zeta);

        (
            prover
                .sigma
                .sigma_1
                .encode_poly(&mut M_X_XY, &prover.setup_params),
            prover
                .sigma
                .sigma_1
                .encode_poly(&mut M_Y_XY, &prover.setup_params),
        )
    };

    let (N_X, N_Y) = {
        let (mut N_X_XY, mut N_Y_XY, _rem3) = (&RXY - &proof3.R_omegaX_omegaY_eval.0)
            .div_by_ruffini(&(omega_m_i.inv() * chi), &(omega_s_max.inv() * zeta));

        (
            prover
                .sigma
                .sigma_1
                .encode_poly(&mut N_X_XY, &prover.setup_params),
            prover
                .sigma
                .sigma_1
                .encode_poly(&mut N_Y_XY, &prover.setup_params),
        )
    };

    let (Pi_CX, Pi_CY) = {
        let LHS_for_copy = {
            let r_omegaX = prover.witness.rXY.scale_coeffs_x(&omega_m_i.inv());
            let r_omegaX_omegaY = r_omegaX.scale_coeffs_y(&omega_s_max.inv());
            let mut X_mono_coef = vec![ScalarField::zero(); 2];
            X_mono_coef[1] = ScalarField::one();
            let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), 2, 1);
            drop(X_mono_coef);
            let (fXY, gXY) = {
                let mut Y_mono_coef = vec![ScalarField::zero(); 2];
                Y_mono_coef[1] = ScalarField::one();
                let Y_mono =
                    DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, 2);
                (
                    &(&(&prover.witness.bXY + &(&thetas[0] * &prover.instance.s0XY))
                        + &(&thetas[1] * &prover.instance.s1XY))
                        + &thetas[2],
                    &(&(&prover.witness.bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono))
                        + &thetas[2],
                )
            };
            let t_mi_eval = chi.pow(m_i) - ScalarField::one();
            let t_s_max_eval = zeta.pow(s_max) - ScalarField::one();
            let lagrange_K0_XY = {
                let mut k0_evals = vec![ScalarField::zero(); m_i];
                k0_evals[0] = ScalarField::one();
                DensePolynomialExt::from_rou_evals(
                    HostSlice::from_slice(&k0_evals),
                    m_i,
                    1,
                    None,
                    None,
                )
            };
            let lagrange_K0_eval = lagrange_K0_XY.eval(&chi, &zeta);

            let pC_XY = {
                let small_r_eval = prover.witness.rXY.eval(&chi, &zeta);
                let small_r_omegaX_eval = r_omegaX.eval(&chi, &zeta);
                let small_r_omegaX_omegaY_eval = r_omegaX_omegaY.eval(&chi, &zeta);
                let lagrange_KL_XY = {
                    let mut k_evals = vec![ScalarField::zero(); m_i];
                    k_evals[m_i - 1] = ScalarField::one();
                    let lagrange_K_XY = DensePolynomialExt::from_rou_evals(
                        HostSlice::from_slice(&k_evals),
                        m_i,
                        1,
                        None,
                        None,
                    );
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
                let term5 = poly_comb!(
                    (small_r_eval, gXY),
                    (ScalarField::zero() - small_r_omegaX_eval, fXY)
                );
                let term6 = poly_comb!(
                    (small_r_eval, gXY),
                    (ScalarField::zero() - small_r_omegaX_omegaY_eval, fXY)
                );
                let term7 = poly_comb!(
                    (ScalarField::one(), prover.quotients.q2XY),
                    (kappa0, prover.quotients.q4XY),
                    (kappa0.pow(2), prover.quotients.q6XY)
                );
                let term8 = poly_comb!(
                    (ScalarField::one(), prover.quotients.q3XY),
                    (kappa0, prover.quotients.q5XY),
                    (kappa0.pow(2), prover.quotients.q7XY)
                );
                poly_comb!(
                    (small_r_eval - ScalarField::one(), lagrange_KL_XY),
                    (kappa0 * (chi - ScalarField::one()), term5),
                    (kappa0.pow(2) * lagrange_K0_eval, term6),
                    (ScalarField::zero() - t_mi_eval, term7),
                    (ScalarField::zero() - t_s_max_eval, term8)
                )
            };
            let (LHS_zk1, LHS_zk2) = {
                let r_D1 = &prover.witness.rXY - &r_omegaX;
                let r_D2 = &prover.witness.rXY - &r_omegaX_omegaY;
                let (term9, term_B_zk) = {
                    let rB_X = DensePolynomialExt::from_coeffs(
                        HostSlice::from_slice(&prover.mixer.rB_X),
                        prover.mixer.rB_X.len(),
                        1,
                    );
                    let rB_Y = DensePolynomialExt::from_coeffs(
                        HostSlice::from_slice(&prover.mixer.rB_Y),
                        1,
                        prover.mixer.rB_Y.len(),
                    );
                    (
                        &(&t_mi_eval * &rB_X) + &(&t_s_max_eval * &rB_Y),
                        &(&rB_X * &prover.instance.t_mi) + &(&rB_Y * &prover.instance.t_smax),
                    )
                };
                let term10 = &(prover.mixer.rR_X * t_mi_eval + prover.mixer.rR_Y * t_s_max_eval)
                    * &(&gXY - &fXY);
                (
                    poly_comb!(
                        (
                            (chi - ScalarField::one()) * r_D1.eval(&chi, &zeta),
                            term_B_zk
                        ),
                        (&ScalarField::one() - &X_mono, &r_D1 * &term9),
                        (term10, (&chi - &X_mono))
                    ),
                    poly_comb!(
                        (lagrange_K0_eval * r_D2.eval(&chi, &zeta), term_B_zk),
                        (&lagrange_K0_XY * &r_D2, -&term9),
                        (term10, &lagrange_K0_eval - &lagrange_K0_XY)
                    ),
                )
            };

            poly_comb!(
                (kappa1.pow(2), pC_XY),
                (kappa1.pow(2) * kappa0, LHS_zk1),
                (kappa1.pow(2) * kappa0.pow(2), LHS_zk2),
                (kappa1.pow(3), &RXY - &proof3.R_eval.0)
            )
        };

        let (mut Pi_CX_XY, mut Pi_CY_XY, _rem1) = LHS_for_copy.div_by_ruffini(&chi, &zeta);

        (
            prover
                .sigma
                .sigma_1
                .encode_poly(&mut Pi_CX_XY, &prover.setup_params),
            prover
                .sigma
                .sigma_1
                .encode_poly(&mut Pi_CY_XY, &prover.setup_params),
        )
    };

    drop(RXY);
    let Pi_B = {
        let A_eval = prover.instance.a_pub_X.eval(&chi, &zeta);
        let (mut pi_B_XY, _, _) = (&prover.instance.a_pub_X - &A_eval).div_by_ruffini(&chi, &zeta);

        prover
            .sigma
            .sigma_1
            .encode_poly(&mut pi_B_XY, &prover.setup_params)
            * kappa1.pow(4)
    };

    let Pi_X = Pi_AX + Pi_CX + Pi_B;
    let Pi_Y = Pi_AY + Pi_CY;
    (
        Proof4 {
            Pi_X,
            Pi_Y,
            M_X,
            M_Y,
            N_X,
            N_Y,
        },
        Proof4Test {
            Pi_CX,
            Pi_CY,
            Pi_AX,
            Pi_AY,
            Pi_B,
            M_X,
            M_Y,
            N_X,
            N_Y,
        },
    )
}

pub fn prove4_batched(
    prover: &Prover,
    proof3: &Proof3,
    thetas: &Vec<ScalarField>,
    kappa0: ScalarField,
    chi: ScalarField,
    zeta: ScalarField,
    kappa1: ScalarField,
) -> (Proof4, Proof4Test) {
    let (mut Pi_AX_XY, mut Pi_AY_XY) = {
        let t_n_eval = prover.instance.t_n.eval(&chi, &ScalarField::one());
        let t_smax_eval = prover.instance.t_smax.eval(&ScalarField::one(), &zeta);
        let small_v_eval = prover.witness.vXY.eval(&chi, &zeta);

        let rW_X = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&prover.mixer.rW_X),
            prover.mixer.rW_X.len(),
            1,
        );
        let rW_Y = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&prover.mixer.rW_Y),
            1,
            prover.mixer.rW_Y.len(),
        );

        let VXY = poly_comb!(
            (ScalarField::one(), prover.witness.vXY),
            (prover.mixer.rV_X, prover.instance.t_n),
            (prover.mixer.rV_Y, prover.instance.t_smax)
        );

        let pA_XY = poly_comb!(
            // for KZG of V
            (kappa1, &VXY - &proof3.V_eval.0),
            // for Arithmetic constraints
            (small_v_eval, prover.witness.uXY),
            (ScalarField::zero() - ScalarField::one(), prover.witness.wXY),
            (
                (ScalarField::zero() - ScalarField::one()) * t_n_eval,
                prover.quotients.q0XY
            ),
            (
                (ScalarField::zero() - ScalarField::one()) * t_smax_eval,
                prover.quotients.q1XY
            ),
            // for zero-knowledge
            (small_v_eval * prover.mixer.rU_X, prover.instance.t_n),
            (small_v_eval * prover.mixer.rU_Y, prover.instance.t_smax),
            (
                ScalarField::zero()
                    - ((prover.mixer.rU_X * t_n_eval) + (prover.mixer.rU_Y * t_smax_eval)),
                prover.witness.vXY
            ),
            (rW_X, &t_n_eval - &prover.instance.t_n),
            (rW_Y, &t_smax_eval - &prover.instance.t_smax)
        );
        let (pA_X, pA_Y, _) = pA_XY.div_by_ruffini(&chi, &zeta);
        (pA_X, pA_Y)
    };

    let m_i = prover.setup_params.l_D - prover.setup_params.l;
    let s_max = prover.setup_params.s_max;
    let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
    let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
    let RXY = &prover.witness.rXY
        + &(&(&prover.mixer.rR_X * &prover.instance.t_mi)
            + &(&prover.mixer.rR_Y * &prover.instance.t_smax));

    let (mut M_X_XY, mut M_Y_XY) = {
        let (M_X, M_Y, _rem2) =
            (&RXY - &proof3.R_omegaX_eval.0).div_by_ruffini(&(omega_m_i.inv() * chi), &zeta);
        (M_X, M_Y)
    };

    let (mut N_X_XY, mut N_Y_XY) = {
        let (N_X, N_Y, _rem3) = (&RXY - &proof3.R_omegaX_omegaY_eval.0)
            .div_by_ruffini(&(omega_m_i.inv() * chi), &(omega_s_max.inv() * zeta));
        (N_X, N_Y)
    };

    let (mut Pi_CX_XY, mut Pi_CY_XY) = {
        let LHS_for_copy = {
            let r_omegaX = prover.witness.rXY.scale_coeffs_x(&omega_m_i.inv());
            let r_omegaX_omegaY = r_omegaX.scale_coeffs_y(&omega_s_max.inv());
            let mut X_mono_coef = vec![ScalarField::zero(); 2];
            X_mono_coef[1] = ScalarField::one();
            let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), 2, 1);
            drop(X_mono_coef);
            let (fXY, gXY) = {
                let mut Y_mono_coef = vec![ScalarField::zero(); 2];
                Y_mono_coef[1] = ScalarField::one();
                let Y_mono =
                    DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, 2);
                (
                    &(&(&prover.witness.bXY + &(&thetas[0] * &prover.instance.s0XY))
                        + &(&thetas[1] * &prover.instance.s1XY))
                        + &thetas[2],
                    &(&(&prover.witness.bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono))
                        + &thetas[2],
                )
            };
            let t_mi_eval = chi.pow(m_i) - ScalarField::one();
            let t_s_max_eval = zeta.pow(s_max) - ScalarField::one();
            let lagrange_K0_XY = {
                let mut k0_evals = vec![ScalarField::zero(); m_i];
                k0_evals[0] = ScalarField::one();
                DensePolynomialExt::from_rou_evals(
                    HostSlice::from_slice(&k0_evals),
                    m_i,
                    1,
                    None,
                    None,
                )
            };
            let lagrange_K0_eval = lagrange_K0_XY.eval(&chi, &zeta);

            let pC_XY = {
                let small_r_eval = prover.witness.rXY.eval(&chi, &zeta);
                let small_r_omegaX_eval = r_omegaX.eval(&chi, &zeta);
                let small_r_omegaX_omegaY_eval = r_omegaX_omegaY.eval(&chi, &zeta);
                let lagrange_KL_XY = {
                    let mut k_evals = vec![ScalarField::zero(); m_i];
                    k_evals[m_i - 1] = ScalarField::one();
                    let lagrange_K_XY = DensePolynomialExt::from_rou_evals(
                        HostSlice::from_slice(&k_evals),
                        m_i,
                        1,
                        None,
                        None,
                    );
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
                let term5 = poly_comb!(
                    (small_r_eval, gXY),
                    (ScalarField::zero() - small_r_omegaX_eval, fXY)
                );
                let term6 = poly_comb!(
                    (small_r_eval, gXY),
                    (ScalarField::zero() - small_r_omegaX_omegaY_eval, fXY)
                );
                let term7 = poly_comb!(
                    (ScalarField::one(), prover.quotients.q2XY),
                    (kappa0, prover.quotients.q4XY),
                    (kappa0.pow(2), prover.quotients.q6XY)
                );
                let term8 = poly_comb!(
                    (ScalarField::one(), prover.quotients.q3XY),
                    (kappa0, prover.quotients.q5XY),
                    (kappa0.pow(2), prover.quotients.q7XY)
                );
                poly_comb!(
                    (small_r_eval - ScalarField::one(), lagrange_KL_XY),
                    (kappa0 * (chi - ScalarField::one()), term5),
                    (kappa0.pow(2) * lagrange_K0_eval, term6),
                    (ScalarField::zero() - t_mi_eval, term7),
                    (ScalarField::zero() - t_s_max_eval, term8)
                )
            };
            let (LHS_zk1, LHS_zk2) = {
                let r_D1 = &prover.witness.rXY - &r_omegaX;
                let r_D2 = &prover.witness.rXY - &r_omegaX_omegaY;
                let (term9, term_B_zk) = {
                    let rB_X = DensePolynomialExt::from_coeffs(
                        HostSlice::from_slice(&prover.mixer.rB_X),
                        prover.mixer.rB_X.len(),
                        1,
                    );
                    let rB_Y = DensePolynomialExt::from_coeffs(
                        HostSlice::from_slice(&prover.mixer.rB_Y),
                        1,
                        prover.mixer.rB_Y.len(),
                    );
                    (
                        &(&t_mi_eval * &rB_X) + &(&t_s_max_eval * &rB_Y),
                        &(&rB_X * &prover.instance.t_mi) + &(&rB_Y * &prover.instance.t_smax),
                    )
                };
                let term10 = &(prover.mixer.rR_X * t_mi_eval + prover.mixer.rR_Y * t_s_max_eval)
                    * &(&gXY - &fXY);
                (
                    poly_comb!(
                        (
                            (chi - ScalarField::one()) * r_D1.eval(&chi, &zeta),
                            term_B_zk
                        ),
                        (&ScalarField::one() - &X_mono, &r_D1 * &term9),
                        (term10, (&chi - &X_mono))
                    ),
                    poly_comb!(
                        (lagrange_K0_eval * r_D2.eval(&chi, &zeta), term_B_zk),
                        (&lagrange_K0_XY * &r_D2, -&term9),
                        (term10, &lagrange_K0_eval - &lagrange_K0_XY)
                    ),
                )
            };

            poly_comb!(
                (kappa1.pow(2), pC_XY),
                (kappa1.pow(2) * kappa0, LHS_zk1),
                (kappa1.pow(2) * kappa0.pow(2), LHS_zk2),
                (kappa1.pow(3), &RXY - &proof3.R_eval.0)
            )
        };

        let (pi_CX_XY, pi_CY_XY, _rem1) = LHS_for_copy.div_by_ruffini(&chi, &zeta);
        (pi_CX_XY, pi_CY_XY)
    };

    drop(RXY);
    let mut pi_B_XY = {
        let A_eval = prover.instance.a_pub_X.eval(&chi, &zeta);
        let (pi_B_XY, _, _) = (&prover.instance.a_pub_X - &A_eval).div_by_ruffini(&chi, &zeta);
        pi_B_XY
    };

    // ==========================================================================
    // GROUPED BATCH MSM STRATEGY
    // Based on actual polynomial dimensions:
    //   Pi_CX: 4095x511 = 2,092,545 (largest, individual)
    //   Pi_AX: 2050x511 = 1,047,550 (large, individual)
    //   M_X, N_X: 2048x256 = 524,288 each (SAME - batch together!)
    //   Pi_AY, Pi_CY: 1x510 = 510 each (similar - batch together)
    //   M_Y, N_Y: 1x256 = 256 each (SAME - batch together!)
    //   pi_B: 511x1 = 511 (tiny, individual)
    // ==========================================================================

    let rs_x_size = std::cmp::max(
        2 * prover.setup_params.n,
        2 * (prover.setup_params.l_D - prover.setup_params.l),
    );
    let rs_y_size = prover.setup_params.s_max * 2;

    let mut stream = IcicleStream::create().unwrap();

    // Helper to get poly coefficients
    let get_coeffs = |poly: &DensePolynomialExt, x_dim: usize, y_dim: usize| -> Vec<ScalarField> {
        let mut coeffs = vec![ScalarField::zero(); poly.x_size * poly.y_size];
        poly.copy_coeffs(0, HostSlice::from_mut_slice(&mut coeffs));
        resize(&coeffs, poly.x_size, poly.y_size, x_dim, y_dim, ScalarField::zero())
    };

    // Helper to get resized points
    let get_points = |x_dim: usize, y_dim: usize| -> Vec<G1Affine> {
        let rs_resized = resize(
            &prover.sigma.sigma_1.xy_powers,
            rs_x_size,
            rs_y_size,
            x_dim,
            y_dim,
            G1serde::zero(),
        );
        rs_resized.iter().map(|x| x.0).collect()
    };

    // ---------- BATCH 1: M_X + N_X (both 2048x256 = 524,288) ----------
    let (M_X, N_X) = {
        M_X_XY.optimize_size();
        N_X_XY.optimize_size();
        let x_dim = (M_X_XY.x_degree + 1) as usize;
        let y_dim = (M_X_XY.y_degree + 1) as usize;
        let msm_size = x_dim * y_dim;

        // Prepare shared points (same for both)
        let points = get_points(x_dim, y_dim);

        // Prepare scalars for both polynomials
        let scalars_m = get_coeffs(&M_X_XY, x_dim, y_dim);
        let scalars_n = get_coeffs(&N_X_XY, x_dim, y_dim);
        let mut flat_scalars = Vec::with_capacity(2 * msm_size);
        flat_scalars.extend(scalars_m);
        flat_scalars.extend(scalars_n);

        // Allocate and copy
        let mut d_scalars = DeviceVec::device_malloc_async(flat_scalars.len(), &stream).unwrap();
        let mut d_points = DeviceVec::device_malloc_async(points.len(), &stream).unwrap();
        let mut d_results = DeviceVec::device_malloc_async(2, &stream).unwrap();

        d_scalars.copy_from_host_async(HostSlice::from_slice(&flat_scalars), &stream).unwrap();
        d_points.copy_from_host_async(HostSlice::from_slice(&points), &stream).unwrap();

        // Batch MSM with shared points
        let mut config = MSMConfig::default();
        config.batch_size = 2;
        config.are_points_shared_in_batch = true;
        config.is_async = true;
        config.stream_handle = *stream;

        msm::msm(&d_scalars[..], &d_points[..], &config, &mut d_results[..]).unwrap();

        let mut results = vec![G1Projective::zero(); 2];
        d_results.copy_to_host_async(HostSlice::from_mut_slice(&mut results), &stream).unwrap();
        stream.synchronize().unwrap();

        (G1serde(G1Affine::from(results[0])), G1serde(G1Affine::from(results[1])))
    };

    // ---------- BATCH 2: M_Y + N_Y (both 1x256 = 256) ----------
    let (M_Y, N_Y) = {
        M_Y_XY.optimize_size();
        N_Y_XY.optimize_size();
        let x_dim = (M_Y_XY.x_degree + 1) as usize;
        let y_dim = (M_Y_XY.y_degree + 1) as usize;
        let msm_size = x_dim * y_dim;

        let points = get_points(x_dim, y_dim);
        let scalars_m = get_coeffs(&M_Y_XY, x_dim, y_dim);
        let scalars_n = get_coeffs(&N_Y_XY, x_dim, y_dim);
        let mut flat_scalars = Vec::with_capacity(2 * msm_size);
        flat_scalars.extend(scalars_m);
        flat_scalars.extend(scalars_n);

        let mut d_scalars = DeviceVec::device_malloc_async(flat_scalars.len(), &stream).unwrap();
        let mut d_points = DeviceVec::device_malloc_async(points.len(), &stream).unwrap();
        let mut d_results = DeviceVec::device_malloc_async(2, &stream).unwrap();

        d_scalars.copy_from_host_async(HostSlice::from_slice(&flat_scalars), &stream).unwrap();
        d_points.copy_from_host_async(HostSlice::from_slice(&points), &stream).unwrap();

        let mut config = MSMConfig::default();
        config.batch_size = 2;
        config.are_points_shared_in_batch = true;
        config.is_async = true;
        config.stream_handle = *stream;

        msm::msm(&d_scalars[..], &d_points[..], &config, &mut d_results[..]).unwrap();

        let mut results = vec![G1Projective::zero(); 2];
        d_results.copy_to_host_async(HostSlice::from_mut_slice(&mut results), &stream).unwrap();
        stream.synchronize().unwrap();

        (G1serde(G1Affine::from(results[0])), G1serde(G1Affine::from(results[1])))
    };

    // ---------- BATCH 3: Pi_AY + Pi_CY (both 1x510 = 510) ----------
    let (Pi_AY, Pi_CY) = {
        Pi_AY_XY.optimize_size();
        Pi_CY_XY.optimize_size();
        let x_dim = (Pi_AY_XY.x_degree + 1) as usize;
        let y_dim = (Pi_AY_XY.y_degree + 1) as usize;
        let msm_size = x_dim * y_dim;

        let points = get_points(x_dim, y_dim);
        let scalars_a = get_coeffs(&Pi_AY_XY, x_dim, y_dim);
        let scalars_c = get_coeffs(&Pi_CY_XY, x_dim, y_dim);
        let mut flat_scalars = Vec::with_capacity(2 * msm_size);
        flat_scalars.extend(scalars_a);
        flat_scalars.extend(scalars_c);

        let mut d_scalars = DeviceVec::device_malloc_async(flat_scalars.len(), &stream).unwrap();
        let mut d_points = DeviceVec::device_malloc_async(points.len(), &stream).unwrap();
        let mut d_results = DeviceVec::device_malloc_async(2, &stream).unwrap();

        d_scalars.copy_from_host_async(HostSlice::from_slice(&flat_scalars), &stream).unwrap();
        d_points.copy_from_host_async(HostSlice::from_slice(&points), &stream).unwrap();

        let mut config = MSMConfig::default();
        config.batch_size = 2;
        config.are_points_shared_in_batch = true;
        config.is_async = true;
        config.stream_handle = *stream;

        msm::msm(&d_scalars[..], &d_points[..], &config, &mut d_results[..]).unwrap();

        let mut results = vec![G1Projective::zero(); 2];
        d_results.copy_to_host_async(HostSlice::from_mut_slice(&mut results), &stream).unwrap();
        stream.synchronize().unwrap();

        (G1serde(G1Affine::from(results[0])), G1serde(G1Affine::from(results[1])))
    };

    // ---------- INDIVIDUAL: Pi_CX (4095x511 = 2,092,545) ----------
    let Pi_CX = {
        Pi_CX_XY.optimize_size();
        let x_dim = (Pi_CX_XY.x_degree + 1) as usize;
        let y_dim = (Pi_CX_XY.y_degree + 1) as usize;

        let scalars = get_coeffs(&Pi_CX_XY, x_dim, y_dim);
        let points = get_points(x_dim, y_dim);

        let mut d_scalars = DeviceVec::device_malloc_async(scalars.len(), &stream).unwrap();
        let mut d_points = DeviceVec::device_malloc_async(points.len(), &stream).unwrap();
        let mut d_result = DeviceVec::device_malloc_async(1, &stream).unwrap();

        d_scalars.copy_from_host_async(HostSlice::from_slice(&scalars), &stream).unwrap();
        d_points.copy_from_host_async(HostSlice::from_slice(&points), &stream).unwrap();

        let mut config = MSMConfig::default();
        config.is_async = true;
        config.stream_handle = *stream;

        msm::msm(&d_scalars[..], &d_points[..], &config, &mut d_result[..]).unwrap();

        let mut result = vec![G1Projective::zero(); 1];
        d_result.copy_to_host_async(HostSlice::from_mut_slice(&mut result), &stream).unwrap();
        stream.synchronize().unwrap();

        G1serde(G1Affine::from(result[0]))
    };

    // ---------- INDIVIDUAL: Pi_AX (2050x511 = 1,047,550) ----------
    let Pi_AX = {
        Pi_AX_XY.optimize_size();
        let x_dim = (Pi_AX_XY.x_degree + 1) as usize;
        let y_dim = (Pi_AX_XY.y_degree + 1) as usize;

        let scalars = get_coeffs(&Pi_AX_XY, x_dim, y_dim);
        let points = get_points(x_dim, y_dim);

        let mut d_scalars = DeviceVec::device_malloc_async(scalars.len(), &stream).unwrap();
        let mut d_points = DeviceVec::device_malloc_async(points.len(), &stream).unwrap();
        let mut d_result = DeviceVec::device_malloc_async(1, &stream).unwrap();

        d_scalars.copy_from_host_async(HostSlice::from_slice(&scalars), &stream).unwrap();
        d_points.copy_from_host_async(HostSlice::from_slice(&points), &stream).unwrap();

        let mut config = MSMConfig::default();
        config.is_async = true;
        config.stream_handle = *stream;

        msm::msm(&d_scalars[..], &d_points[..], &config, &mut d_result[..]).unwrap();

        let mut result = vec![G1Projective::zero(); 1];
        d_result.copy_to_host_async(HostSlice::from_mut_slice(&mut result), &stream).unwrap();
        stream.synchronize().unwrap();

        G1serde(G1Affine::from(result[0]))
    };

    // ---------- INDIVIDUAL: pi_B (511x1 = 511) ----------
    let Pi_B = {
        pi_B_XY.optimize_size();
        let x_dim = (pi_B_XY.x_degree + 1) as usize;
        let y_dim = (pi_B_XY.y_degree + 1) as usize;

        let scalars = get_coeffs(&pi_B_XY, x_dim, y_dim);
        let points = get_points(x_dim, y_dim);

        let mut d_scalars = DeviceVec::device_malloc_async(scalars.len(), &stream).unwrap();
        let mut d_points = DeviceVec::device_malloc_async(points.len(), &stream).unwrap();
        let mut d_result = DeviceVec::device_malloc_async(1, &stream).unwrap();

        d_scalars.copy_from_host_async(HostSlice::from_slice(&scalars), &stream).unwrap();
        d_points.copy_from_host_async(HostSlice::from_slice(&points), &stream).unwrap();

        let mut config = MSMConfig::default();
        config.is_async = true;
        config.stream_handle = *stream;

        msm::msm(&d_scalars[..], &d_points[..], &config, &mut d_result[..]).unwrap();

        let mut result = vec![G1Projective::zero(); 1];
        d_result.copy_to_host_async(HostSlice::from_mut_slice(&mut result), &stream).unwrap();
        stream.synchronize().unwrap();

        G1serde(G1Affine::from(result[0])) * kappa1.pow(4)
    };

    stream.destroy().unwrap();

    let Pi_X = Pi_AX + Pi_CX + Pi_B;
    let Pi_Y = Pi_AY + Pi_CY;

    (
        Proof4 {
            Pi_X,
            Pi_Y,
            M_X,
            M_Y,
            N_X,
            N_Y,
        },
        Proof4Test {
            Pi_CX,
            Pi_CY,
            Pi_AX,
            Pi_AY,
            Pi_B,
            M_X,
            M_Y,
            N_X,
            N_Y,
        },
    )
}
