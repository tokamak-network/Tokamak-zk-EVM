#![allow(non_snake_case)]
use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::iotools::{Permutation, PlacementVariables, SetupParams, SubcircuitInfo, SubcircuitR1CS};
use libs::field_structures::{Tau};
use libs::iotools::{read_global_wire_list_as_boxed_boxed_numbers};
use libs::vector_operations::{gen_evaled_lagrange_bases, point_div_two_vecs, point_mul_two_vecs, resize, transpose_inplace};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use libs::group_structures::{Sigma, Sigma1, Sigma2};
use libs::polynomial_structures::{gen_aX, gen_bXY, gen_uXY, gen_vXY, gen_wXY};
use icicle_bls12_381::curve::{self, BaseField, CurveCfg, G1Affine, G2Affine, G2BaseField, G2CurveCfg, ScalarCfg, ScalarField, G1Projective};
use icicle_core::traits::{Arithmetic, FieldImpl, FieldConfig, GenerateRandom};
use icicle_core::ntt;
use icicle_core::msm::{self, MSMConfig};
use libs::iotools::{G1serde, G2serde};

use std::{vec, cmp};
use std::time::Instant;
use std::fs::File;
use std::io::Write;

use icicle_core::ntt::{
    get_root_of_unity, initialize_domain, release_domain, NTTDomain, NTTInitDomainConfig,
    CUDA_NTT_FAST_TWIDDLES_MODE,
};

// include!("../../setup/trusted-setup/output/combined_sigma.rs");

macro_rules! poly_comb {
    ($a:expr) => { $a };
    ($a:expr, $($rest:expr),+) => {
        &$a + &poly_comb!($($rest),+)
    };
}


fn main() {   
    // Generate a random secret parameter tau (x and y only, no z as per the paper)
    println!("Generating random tau parameter for simulation...");
    let simTau = Tau::gen();
    
    // Load setup parameters from JSON file
    println!("Loading setup parameters...");
    let setup_path = "setupParams.json";
    let setup_params = SetupParams::from_path(setup_path).unwrap();

    // Extract key parameters from setup_params
    let l = setup_params.l;     // Number of public I/O wires
    let l_d = setup_params.l_D; // Number of interface wires
    let m_d = setup_params.m_D; // Total number of wires
    let s_d = setup_params.s_D; // Number of subcircuits
    let n = setup_params.n;     // Number of constraints per subcircuit
    let s_max = setup_params.s_max; // The maximum number of placements
    
    // Assert l is a power of two
    if !l.is_power_of_two() {
        panic!("l is not a power of two.");
    }
    // Assert n is a power of two
    if !n.is_power_of_two() {
        panic!("n is not a power of two.");
    }
    // Assert s_max is a power of two
    if !s_max.is_power_of_two() {
        panic!("s_max is not a power of two.");
    }
    // The last wire-related parameter
    let m_i = l_d - l;
    // Assert m_I is a power of two
    if !m_i.is_power_of_two() {
        panic!("m_I is not a power of two.");
    }

    // Load subcircuit information
    println!("Loading subcircuit information...");
    let subcircuit_path = "subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(subcircuit_path).unwrap();

    // Load subcircuit library R1CS
    println!("Loading subcircuits...");
    let mut compact_library_R1CS: Vec<SubcircuitR1CS> = Vec::new();
    for i in 0..s_d {
        println!("Loading subcircuit id {}", i);
        let r1cs_path: String = format!("json/subcircuit{i}.json");

        // Evaluate QAP for the current subcircuit
        let compact_r1cs = SubcircuitR1CS::from_path(&r1cs_path, &setup_params, &subcircuit_infos[i]).unwrap();
        compact_library_R1CS.push(compact_r1cs);
    }

    // Load global wire list
    println!("Loading global wire list...");
    let global_wire_path = "globalWireList.json";
    let global_wire_list = read_global_wire_list_as_boxed_boxed_numbers(global_wire_path).unwrap();
    
    // Load local variables of placements (public instance + interface witness + internal witness)
    println!("Loading placement variables...");
    let placement_variables_path = "placementVariables.json";
    let placement_variables = PlacementVariables::from_path(&placement_variables_path).unwrap();

    // Load permutation (copy constraints of the variables)
    println!("Loading a permutation...");
    let permutation_path = "permutation.json";
    let permutation_raw = Permutation::from_path(&permutation_path).unwrap();

    // Parsing the inputs
    // Fixed polynomials
    println!("Generating useful fixed polynomials...");
    let mut t_n_coeffs = vec![ScalarField::zero(); 2*n];
    t_n_coeffs[0] = ScalarField::zero() - ScalarField::one();
    t_n_coeffs[n] = ScalarField::one();
    let t_n = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_n_coeffs), 2*n, 1);
    let mut t_mi_coeffs = vec![ScalarField::zero(); 2*m_i];
    t_mi_coeffs[0] = ScalarField::zero() - ScalarField::one();
    t_mi_coeffs[m_i] = ScalarField::one();
    let t_mi = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_mi_coeffs), 2*m_i, 1);
    let mut t_smax_coeffs = vec![ScalarField::zero(); 2*s_max];
    t_smax_coeffs[0] = ScalarField::zero() - ScalarField::one();
    t_smax_coeffs[s_max] = ScalarField::one();
    let t_smax = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_smax_coeffs), 1, 2*s_max);
    // Generating permutation polynomials
    println!("Converting the permutation matrices into polynomials s^0 and s^1...");
    let (s0XY, s1XY) = Permutation::to_poly(&permutation_raw, m_i, s_max);
    
    // Parsing the variables
    println!("Parsing the instance and witness...");
    println!("Generating a(X)...");
    let aX = gen_aX(&placement_variables, &subcircuit_infos, &setup_params);
    println!("Generating b(X,Y)...");
    let bXY = gen_bXY(&placement_variables, &subcircuit_infos, &setup_params);
    println!("Generating u(X,Y)...");
    let uXY = gen_uXY(&placement_variables, &compact_library_R1CS, &setup_params);
    println!("Generating v(X,Y)...");
    let vXY = gen_vXY(&placement_variables, &compact_library_R1CS, &setup_params);
    println!("Generating w(X,Y)...");
    let wXY = gen_wXY(&placement_variables, &compact_library_R1CS, &setup_params);

    // Arithmetic constraints argument polynomials
    println!("Building a polynomial p_0(X,Y) for the arithmetic constraints and quotients of it...");
    let mut p0XY = &( &uXY * &vXY ) - &wXY;
    let (q0XY, q1XY) = p0XY.div_by_vanishing(n as i64, s_max as i64);
    #[cfg(feature = "testing-mode")] {
        let mut u_evals = vec![ScalarField::zero(); n*s_max].into_boxed_slice();
        DensePolynomialExt::to_rou_evals(&uXY, None, None, HostSlice::from_mut_slice(&mut u_evals));
        let mut v_evals = vec![ScalarField::zero(); n*s_max].into_boxed_slice();
        DensePolynomialExt::to_rou_evals(&vXY, None, None, HostSlice::from_mut_slice(&mut v_evals));
        let mut w_evals = vec![ScalarField::zero(); n*s_max].into_boxed_slice();
        DensePolynomialExt::to_rou_evals(&wXY, None, None, HostSlice::from_mut_slice(&mut w_evals));
        
        let mut p_0_left_evals = vec![ScalarField::zero(); n*s_max].into_boxed_slice();
        point_mul_two_vecs(&u_evals, &v_evals, &mut p_0_left_evals);
        let mut flag = true;
        for (ind, &entry) in p_0_left_evals.iter().enumerate() {
            if !entry.eq(&w_evals[ind]) {
                flag = false;
                println!("Constraint: {:?}, Placement: {:?}, LHS: {:?}, RHS: {:?}", ind/s_max, ind%s_max, entry, &w_evals[ind]);
            }
        }
        assert!(flag);

        let x_e = ScalarCfg::generate_random(1)[0];
        let y_e = ScalarCfg::generate_random(1)[0];
        let p_0_eval = p0XY.eval(&x_e, &y_e);
        let q_0_eval = q0XY.eval(&x_e, &y_e);
        let q_1_eval = q1XY.eval(&x_e, &y_e);
        let t_n_eval = t_n.eval(&x_e, &y_e);
        let t_smax_eval = t_smax.eval(&x_e, &y_e);
        assert!( p_0_eval.eq( &(q_0_eval * t_n_eval + q_1_eval * t_smax_eval) ) );
        println!("Checked: u(X,Y), v(X,Y), and w(X,Y) satisfy the arithmetic constraints.")
    }

    // Adding zero-knowledge
    println!("Adding zero-knowledge to the arithmetic constraints witnesses...");
    let rU_X = ScalarCfg::generate_random(1)[0];
    let rU_Y = ScalarCfg::generate_random(1)[0];
    let rV_X = ScalarCfg::generate_random(1)[0];
    let rV_Y = ScalarCfg::generate_random(1)[0];
    let mut rW_X_coeffs = ScalarCfg::generate_random(3);
    resize(&rW_X_coeffs, 3, 1, 4, 1);
    let rW_X = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rW_X_coeffs), 4, 1);
    let mut rW_Y_coeffs = ScalarCfg::generate_random(3);
    resize(&rW_Y_coeffs, 1, 3, 1, 4);
    let rW_Y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rW_Y_coeffs), 1, 4);
    let U = poly_comb!(
        uXY,
        &rU_X * &t_n,
        &rU_Y * &t_smax
    );
    let V = poly_comb!(
        vXY,
        &rV_X * &t_n,
        &rV_Y * &t_smax
    );
    let W = poly_comb!(
        wXY,
        &rW_X * &t_n,
        &rW_Y * &t_smax
    );
    let Q_AX = poly_comb!(
        q0XY,
        &rU_X * &vXY,
        &rV_X * &uXY,
        -&rW_X,
        &(rU_X * rV_X) * &t_n,
        &(rU_Y * rV_X) * &t_smax
    );
    let Q_AY = poly_comb!(
        q1XY,
        &rU_Y * &vXY,
        &rV_Y * &uXY,
        -&rW_Y,
        &(rU_X * rV_Y) * &t_n,
        &(rU_Y * rV_Y) * &t_smax
    );
    // TODO: CHALLENGE
    let chi = ScalarCfg::generate_random(1)[0];
    let zeta = ScalarCfg::generate_random(1)[0];
    let kappa1 = ScalarCfg::generate_random(1)[0];
    
    let t_n_eval = t_n.eval(&chi, &ScalarField::one());
    let t_smax_eval = t_smax.eval(&ScalarField::one(), &zeta);
    let V_eval = V.eval(&chi, &zeta);
    let small_v_eval = vXY.eval(&chi, &zeta);
    let mut LHS_for_Arith = poly_comb!(
        &kappa1 * &(&V - &V_eval),

        &uXY * &small_v_eval,
        -&wXY,
        -&(&q0XY * &t_n_eval),
        -&(&q1XY * &t_smax_eval),

        &( &(small_v_eval * rU_X) * &t_n ) + &( &(small_v_eval * rU_Y) * &t_smax ),
        -&(&vXY * &( (rU_X * t_n_eval) + (rU_Y * t_smax_eval) )),
        &rW_X * &(&t_n_eval - &t_n),
        &rW_Y * &( &t_smax_eval - &t_smax )
    );

    let (mut Pi_A_X, mut Pi_A_Y, rem) = LHS_for_Arith.div_by_ruffini(&chi, &zeta);

    #[cfg(feature = "testing-mode")] {
        assert!(rem.eq(&ScalarField::zero()));

        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];

        let mut coeffs1 = vec![ScalarField::zero(); Pi_A_X.x_size * Pi_A_X.y_size];
        Pi_A_X.copy_coeffs(0, HostSlice::from_mut_slice(&mut coeffs1));
        let mut coeffs2 = vec![ScalarField::zero(); Pi_A_Y.x_size * Pi_A_Y.y_size];
        Pi_A_Y.copy_coeffs(0, HostSlice::from_mut_slice(&mut coeffs2));
        
        let LHS_test = poly_comb!(
            &V_eval * &U,
            -&W,
            &kappa1 * &(&V - &V_eval),
            -&(&t_n_eval * &Q_AX),
            -&(&t_smax_eval * &Q_AY)
        );
        assert!(LHS_test.eval(&x, &y).eq(&(Pi_A_X.eval(&x, &y) * (x-chi) + Pi_A_Y.eval(&x, &y) * (y-zeta))));
        println!("Checked: U(X,Y), V(X,Y), and W(X,Y) with zero-knowledge satisfy the arithmetic constraints.")
    }


    // TODO: CHALLENGE
    let thetas = ScalarCfg::generate_random(3);

    let mut X_mono_coef = vec![ScalarField::zero(); m_i];
    X_mono_coef[1] = ScalarField::one();
    let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), m_i, 1);
    drop(X_mono_coef);

    let mut Y_mono_coef = vec![ScalarField::zero(); s_max];
    Y_mono_coef[1] = ScalarField::one();
    let Y_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, s_max);
    drop(Y_mono_coef);

    let fXY = &( &(&bXY + &(&thetas[0] * &s0XY)) + &(&thetas[1] * &s1XY)) + &thetas[2];
    let gXY = &( &(&bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono)) + &thetas[2];

    let mut fXY_evals = vec![ScalarField::zero(); m_i*s_max].into_boxed_slice();
    fXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut fXY_evals));
    let mut gXY_evals = vec![ScalarField::zero(); m_i*s_max].into_boxed_slice();
    gXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut gXY_evals));
    let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
    let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);

    #[cfg(feature = "testing-mode")] {
        // Checking Lemma 3
        let mut bXY_evals = vec![ScalarField::zero(); m_i*s_max];
        bXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut bXY_evals));
        let mut s0XY_evals = vec![ScalarField::zero(); m_i*s_max];
        s0XY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut s0XY_evals));
        let mut s1XY_evals = vec![ScalarField::zero(); m_i*s_max];
        s1XY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut s1XY_evals));
        let mut X_mono_evals = vec![ScalarField::zero(); m_i];
        X_mono.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut X_mono_evals));
        let mut Y_mono_evals = vec![ScalarField::zero(); s_max];
        Y_mono.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut Y_mono_evals));
        for i in 0..m_i {
            for j in 0..s_max {
                assert!(X_mono_evals[i].eq(&omega_m_i.pow(i)));
                assert!(Y_mono_evals[j].eq(&omega_s_max.pow(j)));
            }
        }
        let mut flag_b = true;
        let mut flag_s0 = true;
        let mut flag_s1 = true;
        let mut flag_r = true;
        for permEntry in &permutation_raw {
            let this_wire_idx = permEntry.row;
            let this_placement_idx = permEntry.col;
            let next_wire_idx = permEntry.X as usize;
            let next_placement_idx = permEntry.Y as usize;

            let this_idx = this_wire_idx * s_max + this_placement_idx;
            let next_idx = next_wire_idx * s_max + next_placement_idx;

            if !bXY_evals[this_idx].eq(&bXY_evals[next_idx]) {
                flag_b = false;
            }
            if !s0XY_evals[this_idx].eq(&X_mono_evals[next_wire_idx]) {
                flag_s0 = false;
            }
            if !s1XY_evals[this_idx].eq(&Y_mono_evals[next_placement_idx]) {
                flag_s1 = false;
            }
            if !fXY_evals[this_idx].eq(&gXY_evals[next_idx]) {
                flag_r = false;
            }
        }
        assert!(flag_b);
        println!("Checked: b(X,Y) satisfies the copy constraints.");
        assert!(flag_s0);
        println!("Checked: s^(0)(X,Y) is well-formed.");
        assert!(flag_s1);
        println!("Checked: s^(1)(X,Y) is well-formed.");
        assert!(flag_r);
        println!("Checked: f(X,Y) and g(X,Y) are well-formed.");

        let mut LHS = vec![ScalarField::zero(); 1];
        let mut RHS = vec![ScalarField::zero(); 1];
        let vec_ops = VecOpsConfig::default();
        ScalarCfg::product(HostSlice::from_slice(&fXY_evals), HostSlice::from_mut_slice(&mut LHS), &vec_ops).unwrap();
        ScalarCfg::product(HostSlice::from_slice(&gXY_evals), HostSlice::from_mut_slice(&mut RHS), &vec_ops).unwrap();
        assert!( LHS[0].eq( &RHS[0] ) );
        println!("Checked: Lemma 3");        
    }
    drop(permutation_raw);

    // Generating the recursion polynomial r(X,Y)
    println!("Generating r(X,Y)...");
    let mut rXY_evals = vec![ScalarField::zero(); m_i * s_max];
    let mut scalers_tr = vec![ScalarField::zero(); m_i * s_max];
    point_div_two_vecs(&gXY_evals, &fXY_evals, &mut scalers_tr);
    transpose_inplace(&mut scalers_tr, m_i, s_max);
    rXY_evals[m_i * s_max - 1] = ScalarField::one();
    for idx in (0..m_i * s_max- 1).rev() {
        // println!("prev_r_eval: {:?}", rXY_evals[idx+1]);
        // println!("prev_scaler: {:?}", scalers_tr[idx+1]);
        rXY_evals[idx] = rXY_evals[idx+1] * scalers_tr[idx+1];
        // println!("next_r_eval: {:?}", rXY_evals[idx]);
    }
    transpose_inplace(&mut rXY_evals, s_max, m_i);

    #[cfg(feature = "testing-mode")] {
        let mut flag1 = true;
        for row_idx in 1..m_i - 1 {
            for col_idx in 0..s_max-1 {
                let this_idx = row_idx * s_max + col_idx;
                let ref_idx = (row_idx - 1) * s_max  + col_idx;
                if !(rXY_evals[this_idx] * gXY_evals[this_idx]).eq(&(rXY_evals[ref_idx] * fXY_evals[this_idx])) {
                    flag1 = false;
                }
            }
        }
        assert!(flag1);
        
        let mut flag2 = true;
        for col_idx in 0..s_max-1 {
            let this_idx = col_idx;
            let ref_idx = s_max * (m_i - 1) + col_idx - 1;
            if !(rXY_evals[this_idx] * gXY_evals[this_idx]).eq(&(rXY_evals[ref_idx] * fXY_evals[this_idx])) {
                flag2 = false;
            }
        }
        assert!(flag2);
    }
    let rXY = DensePolynomialExt::from_rou_evals(
        HostSlice::from_slice(&rXY_evals),
        m_i, 
        s_max, 
        None, 
        None
    );

    let r_omegaX_Y = rXY.scale_coeffs_x(&omega_m_i.inv());
    let r_omegaX_omegaY = r_omegaX_Y.scale_coeffs_y(&omega_s_max.inv());

    // #[cfg(feature = "testing-mode")] {
    //     let mut flag1 = true;

    //     for row_idx in 1..m_i - 1 {
    //         for col_idx in 0..s_max-1 {
    //             let this_x = &omega_m_i.pow(row_idx);
    //             let this_y = &omega_s_max.pow(col_idx);
    //             if !(rXY.eval(this_x, this_y) * gXY.eval(this_x, this_y)).eq(&(r_omegaX_Y.eval(this_x, this_y) * fXY.eval(this_x, this_y))) {
    //                 flag1 = false;
    //             }
    //         }
    //     }
    //     assert!(flag1);
        
    //     let mut flag2 = true;
    //     for col_idx in 0..s_max-1 {
    //         let this_x = &omega_m_i.pow(0);
    //         let this_y = &omega_s_max.pow(col_idx);
    //         if !(rXY.eval(this_x, this_y) * gXY.eval(this_x, this_y)).eq(&(r_omegaX_omegaY.eval(this_x, this_y) * fXY.eval(this_x, this_y))) {
    //             flag2 = false;
    //         }
    //     }
    //     assert!(flag2);
    // }

    // Generating the copy constraints argumet polynomials p_1(X,Y), p_2(X,Y), p_3(X,Y)
    println!("Generating p_1(X,Y), p_2(X,Y), p_3(X,Y)...");
    let mut k_evals = vec![ScalarField::zero(); m_i];
    k_evals[m_i - 1] = ScalarField::one();
    let lagrange_K_XY = DensePolynomialExt::from_rou_evals(
        HostSlice::from_slice(&k_evals),
        m_i,
        1,
        None,
        None
    );
    drop(k_evals);
    let mut k0_evals = vec![ScalarField::zero(); m_i];
    k0_evals[0] = ScalarField::one();
    let lagrange_K0_XY = DensePolynomialExt::from_rou_evals(
        HostSlice::from_slice(&k0_evals),
        m_i,
        1,
        None,
        None
    );
    drop(k0_evals);
    let mut l_evals = vec![ScalarField::zero(); s_max];
    l_evals[s_max - 1] = ScalarField::one();
    let lagrange_L_XY = DensePolynomialExt::from_rou_evals(
        HostSlice::from_slice(&l_evals),
        1,
        s_max,
        None,
        None
    );
    drop(l_evals);

    let lagrange_KL_XY = &lagrange_K_XY * &lagrange_L_XY;
    
    let mut p1XY = &(&rXY - &ScalarField::one()) * &(lagrange_KL_XY);
    let mut p2XY = &(&X_mono - &ScalarField::one()) * &(
        &(&rXY * &gXY) - &(&r_omegaX_Y * &fXY)
    );
    let mut p3XY = &lagrange_K0_XY * &(
        &(&rXY * &gXY) - &(&r_omegaX_omegaY * &fXY)
    );

    let (q2XY, q3XY) = p1XY.div_by_vanishing(m_i as i64, s_max as i64);
    let (q4XY, q5XY) = p2XY.div_by_vanishing(m_i as i64, s_max as i64);
    let (q6XY, q7XY) = p3XY.div_by_vanishing(m_i as i64, s_max as i64);

    #[cfg(feature = "testing-mode")] {
        let x_e = ScalarCfg::generate_random(1)[0];
        let y_e = ScalarCfg::generate_random(1)[0];
        let p_1_eval = p1XY.eval(&x_e, &y_e);
        let p_2_eval = p2XY.eval(&x_e, &y_e);
        let p_3_eval = p3XY.eval(&x_e, &y_e);
        let q_2_eval = q2XY.eval(&x_e, &y_e);
        let q_3_eval = q3XY.eval(&x_e, &y_e);
        let q_4_eval = q4XY.eval(&x_e, &y_e);
        let q_5_eval = q5XY.eval(&x_e, &y_e);
        let q_6_eval = q6XY.eval(&x_e, &y_e);
        let q_7_eval = q7XY.eval(&x_e, &y_e);

        let t_mi_eval = t_mi.eval(&x_e, &y_e);
        let t_smax_eval = t_smax.eval(&x_e, &y_e);
        assert!( p_1_eval.eq( &(q_2_eval * t_mi_eval + q_3_eval * t_smax_eval) ) );
        assert!( p_2_eval.eq( &(q_4_eval * t_mi_eval + q_5_eval * t_smax_eval) ) );    
        assert!( p_3_eval.eq( &(q_6_eval * t_mi_eval + q_7_eval * t_smax_eval) ) );
        println!("Checked: r(X,Y) satisfy the recursion for the copy constraints.")
    }
    
    // Adding zero-knowledge to the copy constraint argument
    println!("Adding zero-knowledge to the copy constraints witnesses...");
    let rB_X_coeffs = ScalarCfg::generate_random(2);
    let rB_X = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rB_X_coeffs), 2, 1);
    let rB_Y_coeffs = ScalarCfg::generate_random(2);
    let rB_Y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rB_Y_coeffs), 1, 2);
    let term_B_zero = &(&rB_X * &t_mi) + &(&rB_Y * &t_smax);
    let B = &bXY + &term_B_zero;

    let rR_X = ScalarCfg::generate_random(1)[0];
    let rR_Y = ScalarCfg::generate_random(1)[0];
    let R = &rXY + &(&(&rR_X * &t_mi) + &(&rR_Y * &t_smax));
    let R_omegaX_Y = R.scale_coeffs_x(&omega_m_i.inv());
    let R_omegaX_omegaY = R_omegaX_Y.scale_coeffs_y(&omega_s_max.inv());

    let r_D1 = &rXY - &r_omegaX_Y; 
    let r_D2 = &rXY - &r_omegaX_omegaY;
    let g_D = &gXY - &fXY;

    // TODO: CHALLENGE
    let kappa0 = ScalarCfg::generate_random(1)[0];

    let term1 = poly_comb!(
        &(&rB_X * &(&X_mono - &ScalarField::one())) * &r_D1,
        &(&rR_X * &(&X_mono - &ScalarField::one())) * &g_D
    );
    let term2 = poly_comb!(
        &(&rB_X * &lagrange_K0_XY) * &r_D2,
        &(&rR_X * &lagrange_K0_XY) * &g_D
    );
    let Q_CX = poly_comb!(
        q2XY,
        &kappa0 * &q4XY,
        &kappa0.pow(2) * &q6XY,
        &rR_X * &lagrange_KL_XY,
        &kappa0 * &term1,
        &kappa0.pow(2) * &term2
    );
    drop(term1);
    drop(term2);

    let term3 = poly_comb!(
        &(&rB_Y * &(&X_mono - &ScalarField::one())) * &r_D1,
        &(&rR_Y * &(&X_mono - &ScalarField::one())) * &g_D
    );
    let term4 = poly_comb!(
        &(&rB_Y * &lagrange_K0_XY) * &r_D2,
        &(&rR_Y * &lagrange_K0_XY) * &g_D
    );
    let Q_CY = poly_comb!(
        q3XY,
        &kappa0 * &q5XY,
        &kappa0.pow(2) * &q7XY,
        &rR_Y * &lagrange_KL_XY,
        &kappa0 * &term3,
        &kappa0.pow(2) * &term4
    );
    drop(term3);
    drop(term4);

    let small_r_eval = rXY.eval(&chi, &zeta);
    let small_r_omegaX_Y_eval = r_omegaX_Y.eval(&chi, &zeta);
    let small_r_omegaX_omegaY_eval = r_omegaX_omegaY.eval(&chi, &zeta);
    let R_eval = R.eval(&chi, &zeta);
    let R_omegaX_Y_eval = R_omegaX_Y.eval(&chi, &zeta);
    let R_omegaX_omegaY_eval = R_omegaX_omegaY.eval(&chi, &zeta);
    let t_mi_eval = t_mi.eval(&chi, &zeta);
    let lagrange_K0_eval = lagrange_K0_XY.eval(&chi, &zeta);
    let term5 = poly_comb!(
        &small_r_eval * &gXY,
        -&(&small_r_omegaX_Y_eval * &fXY)
    );
    let term6 = poly_comb!(
        &small_r_eval * &gXY,
        -&(&small_r_omegaX_omegaY_eval * &fXY)
    );
    let term7 = poly_comb!(
        q2XY,
        &kappa0 * &q4XY,
        &kappa0.pow(2) * &q6XY
    );
    let term8 = poly_comb!(
        q3XY,
        &kappa0 * &q5XY,
        &kappa0.pow(2) * &q7XY
    );
    let pC_XY = poly_comb!(
        &(small_r_eval - ScalarField::one()) * &lagrange_KL_XY,
        &(kappa0 * (chi - ScalarField::one()) ) * &term5,
        &(kappa0.pow(2) * lagrange_K0_eval ) * &term6,
        -&(&t_mi_eval * &term7),
        -&(&t_smax_eval * &term8)
    );
    drop(term5);
    drop(term6);
    drop(term7);
    drop(term8);

    let term9 = &(&t_mi_eval * &rB_X) + &(&t_smax_eval * &rB_Y);
    let term10 = &(rR_X * t_mi_eval + rR_Y * t_smax_eval) * &g_D;

    let LHS_zk1 = poly_comb!(
        &( (chi - ScalarField::one()) * r_D1.eval(&chi, &zeta) ) * &term_B_zero,
        -&( &( &(&X_mono - &ScalarField::one()) * &r_D1 ) * &term9 ),
        &term10 * &(&chi - &X_mono)
    );
    let LHS_zk2 = poly_comb!(
        &( lagrange_K0_eval * r_D2.eval(&chi, &zeta) ) * &term_B_zero,
        -&( &(&lagrange_K0_XY * &r_D2) * &term9 ),
        &term10 * &(&lagrange_K0_eval - &lagrange_K0_XY)
    );
    drop(term9);
    drop(term10);

    let LHS_for_copy = poly_comb!(
        &kappa1.pow(2) * &pC_XY,
        &(kappa1.pow(2) * kappa0) * &LHS_zk1,
        &(kappa1.pow(2) * kappa0.pow(2)) * &LHS_zk2,
        &kappa1.pow(3) * &(&R - &R_eval)
    );
    
    let (Pi_C_X, Pi_C_Y, rem1) = LHS_for_copy.div_by_ruffini(&chi, &zeta);
    let (M_X, M_Y, rem2) = (&R - &R_omegaX_Y_eval).div_by_ruffini(
        &(omega_m_i.inv() * chi), 
        &zeta
    );
    let (N_X, N_Y, rem3) = (&R - &R_omegaX_omegaY_eval).div_by_ruffini(
        &(omega_m_i.inv() * chi), 
        &(omega_s_max.inv() * zeta)
    );
    
    #[cfg(feature = "testing-mode")] {
        assert_eq!(rem1, ScalarField::zero());
        assert_eq!(rem2, ScalarField::zero());
        assert_eq!(rem3, ScalarField::zero());
        let kappa2 = ScalarCfg::generate_random(1)[0];
        let x_e = ScalarCfg::generate_random(1)[0];
        let y_e = ScalarCfg::generate_random(1)[0];
        let FXY = &( &(&B + &(&thetas[0] * &s0XY)) + &(&thetas[1] * &s1XY)) + &thetas[2];
        let GXY = &( &(&B + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono)) + &thetas[2];
        let F_ = FXY.eval(&x_e, &y_e);
        let G_ = GXY.eval(&x_e, &y_e);
        let lagrange_KL_ = lagrange_KL_XY.eval(&x_e, &y_e);
        let Q_CX_ = Q_CX.eval(&x_e, &y_e);
        let Q_CY_ = Q_CY.eval(&x_e, &y_e);
        let R_ = R.eval(&x_e, &y_e);
        let Pi_C_X_ = Pi_C_X.eval(&x_e, &y_e);
        let Pi_C_Y_ = Pi_C_Y.eval(&x_e, &y_e);
        let M_X_ = M_X.eval(&x_e, &y_e);
        let M_Y_ = M_Y.eval(&x_e, &y_e);
        let N_X_ = N_X.eval(&x_e, &y_e);
        let N_Y_ = N_Y.eval(&x_e, &y_e);
        let LHS_test = kappa1.pow(2) * (
            (R_eval - ScalarField::one()) * lagrange_KL_
            + kappa0 * (chi - ScalarField::one()) * (R_eval * G_ - R_omegaX_Y_eval * F_)
            + kappa0.pow(2) * lagrange_K0_eval * (R_eval * G_ - R_omegaX_omegaY_eval * F_)
            - (t_mi_eval * Q_CX_) - (t_smax_eval * Q_CY_)
        ) + kappa1.pow(3) * (
            R_ - R_eval
        ) + kappa2 * (
            R_ - R_omegaX_Y_eval
        ) + kappa2.pow(2) * (
            R_ - R_omegaX_omegaY_eval
        ) + ( //AUX
            chi * Pi_C_X_ 
            + kappa2 * omega_m_i.inv() * chi * M_X_
            + kappa2.pow(2) * omega_m_i.inv() * chi * N_X_
            + zeta * Pi_C_Y_
            + kappa2 * zeta * M_Y_
            + kappa2.pow(2) * omega_s_max.inv() * zeta * N_Y_
        );
        let RHS_test = x_e * (
            Pi_C_X_ + kappa2 * M_X_ + kappa2.pow(2) * N_X_
        ) + y_e * (
            Pi_C_Y_ + kappa2 * M_Y_ + kappa2.pow(2) * N_Y_
        );
        assert_eq!(LHS_test, RHS_test);
        println!("Checked: B(X,Y) and R(X,Y) with zero-knowledge satisfy the copy constraints.")
    }

    // Load Sigma (reference string)
    println!("Loading the reference string...");
    let sigma_path = "setup/trusted-setup/output/combined_sigma.json";
    let sigma = Sigma::read_from_json(&sigma_path)
    .expect("No reference string is found. Run the Setup first.");

    let rO_mid = ScalarCfg::generate_random(1)[0];
    let mut nVar: usize = 0;
    for i in 0..s_max {
        let subcircuit_id = placement_variables[i].subcircuitId;
        let subcircuit_info = &subcircuit_infos[subcircuit_id];
        if i == 0 {
            // Public input placement
            nVar = nVar + subcircuit_info.Out_idx[1]; // Number of output wires
        } else if i == 1 {
            // Public output placement
            nVar = nVar + subcircuit_info.In_idx[1]; // Number of input wires
        } else {
            nVar = nVar + subcircuit_info.Out_idx[1] + subcircuit_info.In_idx[1];
        }
    }

    let mut aligned_rs = vec![G1Affine::zero(); nVar];
    let mut aligned_wtns = vec![ScalarField::zero(); nVar];
    let mut cnt: usize = 0;
    for i in 0..s_max {
        let subcircuit_id = placement_variables[i].subcircuitId;
        let variables = &placement_variables[i].variables;
        let subcircuit_info = &subcircuit_infos[subcircuit_id];
        let flatten_map = &subcircuit_info.flattenMap;
        let start_idx = if i==0 {
            // Public input placement
            subcircuit_info.Out_idx[0]
        } else if i==1 {
            // Public output placement
            subcircuit_info.In_idx[0]
        } else {
            subcircuit_info.Out_idx[0]
        };
        let end_idx_exclusive = if i==0 {
            // Public input placement
            subcircuit_info.Out_idx[0] + subcircuit_info.Out_idx[1]
        } else if i==1 {
            // Public output placement
            subcircuit_info.In_idx[0] + subcircuit_info.In_idx[1]
        } else {
            subcircuit_info.Out_idx[0] + subcircuit_info.Out_idx[1] + subcircuit_info.In_idx[1]
        };

        for j in start_idx..end_idx_exclusive {
            aligned_wtns[cnt] = ScalarField::from_hex(&variables[j]);
            let global_idx = flatten_map[j] - l;
            let curve_point = sigma.sigma_1.eta_inv_li_o_inter_alpha4_kj[global_idx][i].0;
            aligned_rs[cnt] = curve_point;
            cnt += 1;
        }        
    }
    let mut res = vec![G1Projective::zero(); 1];
    msm::msm(
        HostSlice::from_slice(&aligned_wtns),
        HostSlice::from_slice(&aligned_rs),
        &MSMConfig::default(),
        HostSlice::from_mut_slice(&mut res)
    ).unwrap();
    let O_mid = G1serde(
        G1Affine::from(
        res[0] 
        + sigma.sigma_1.delta.0.to_projective() * rO_mid)
    );





    // // testing
    // let tau = Tau::gen();
    // // let lagrange_Kj_XY = Vec::new();
    // // for j in 0..m_i {
    // //     let mut zero_vec = vec![ScalarField::zero(); m_i];
    // //     zero_vec[j] = ScalarField::one();
    // //     lagrange_Kj_XY.push(
    // //         DensePolynomialExt::from_rou_evals(
    // //             HostSlice::from_slice(&zero_vec),
    // //             m_i,
    // //             1,
    // //             None,
    // //             None
    // //         )
    // //     );
    // // }
    // let O_mid = &(&tau.eta.inv() * &poly_comb!(
    //     &tau.alpha * &uXY,
    //     &tau.alpha.pow(2) * &vXY,
    //     &tau.alpha.pow(3) * &wXY,
    //     &tau.alpha.pow(4) * &bXY 
    // )) + &(rO_mid * tau.delta) ;
    // let O_prv = poly_comb!(

    // )
    #[cfg(feature = "testing-mode")] {
        
    }
    
    


    

}