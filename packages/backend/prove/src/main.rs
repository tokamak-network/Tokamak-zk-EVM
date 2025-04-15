use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::iotools::{Permutation, PlacementVariables, SetupParams, SubcircuitInfo, SubcircuitR1CS};
use libs::field_structures::{Tau};
use libs::iotools::{read_global_wire_list_as_boxed_boxed_numbers};
use libs::vector_operations::{gen_evaled_lagrange_bases, point_mul_two_vecs};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use libs::group_structures::{Sigma1, Sigma};
use libs::polynomial_structures::{gen_aX, gen_bXY, gen_uXY, gen_vXY, gen_wXY};
use icicle_bls12_381::curve::{ScalarField, ScalarCfg, CurveCfg, G2CurveCfg};
use icicle_core::traits::{Arithmetic, FieldImpl, FieldConfig, GenerateRandom};
use icicle_core::ntt;
use icicle_core::curve::Curve;

use std::{vec, cmp};
use std::time::Instant;
use std::fs::File;
use std::io::Write;

use icicle_core::ntt::{
    get_root_of_unity, initialize_domain, release_domain, NTTDomain, NTTInitDomainConfig,
    CUDA_NTT_FAST_TWIDDLES_MODE,
};



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
    // Parsing the variables
    println!("Parsing the input variables...");
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
    let p_0 = &( &uXY * &vXY ) - &wXY;
    let (q_0, q_1) = p_0.div_by_vanishing(n as i64, s_max as i64);
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

        let mut t_n_coeffs = vec![ScalarField::zero(); 2*n];
        t_n_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_n_coeffs[n] = ScalarField::one();
        let t_n = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_n_coeffs), 2*n, 1);

        let mut t_smax_coeffs = vec![ScalarField::zero(); 2*s_max];
        t_smax_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_smax_coeffs[s_max] = ScalarField::one();
        let t_smax = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_smax_coeffs), 1, 2*s_max);

        let mut t_mi_coeffs = vec![ScalarField::zero(); 2*m_i];
        t_mi_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_mi_coeffs[m_i] = ScalarField::one();
        let t_mi = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_mi_coeffs), 2*m_i, 1);

        let x_e = ScalarCfg::generate_random(1)[0];
        let y_e = ScalarCfg::generate_random(1)[0];
        let p_0_eval = p_0.eval(&x_e, &y_e);
        let q_0_eval = q_0.eval(&x_e, &y_e);
        let q_1_eval = q_1.eval(&x_e, &y_e);
        let t_n_eval = t_n.eval(&x_e, &y_e);
        let t_smax_eval = t_smax.eval(&x_e, &y_e);
        assert!( p_0_eval.eq( &(q_0_eval * t_n_eval + q_1_eval * t_smax_eval) ) );
        println!("Checked: u(X,Y), v(X,Y), and w(X,Y) satisfy the arithmetic constraints.")
    }
    
    // Generating permutation polynomials
    println!("Converting the permutation matrices into polynomials s^0 and s^1...");
    let (s0XY, s1XY) = Permutation::to_poly(&permutation_raw, m_i, s_max);

    // TODO: CHALLENGE
    let thetas = ScalarCfg::generate_random(3);
    let fXY = &( &(&bXY + &(&thetas[0] * &s0XY)) + &(&thetas[1] * &s1XY)) + &thetas[2];

    let mut X_mono_coef = vec![ScalarField::zero(); m_i];
    X_mono_coef[1] = ScalarField::one();
    let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), m_i, 1);
    drop(X_mono_coef);

    let mut Y_mono_coef = vec![ScalarField::zero(); s_max];
    Y_mono_coef[1] = ScalarField::one();
    let Y_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, s_max);
    drop(Y_mono_coef);

    let gXY = &( &(&bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono)) + &thetas[2];

    let mut fXY_evals = vec![ScalarField::zero(); m_i*s_max];
    fXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut fXY_evals));
    let mut gXY_evals = vec![ScalarField::zero(); m_i*s_max];
    gXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut gXY_evals));

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
        let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
        let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
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

    // Load Sigma (reference string)
    println!("Loading the reference string...");
    let sigma_path = "setup/trusted-setup/output/combined_sigma.json";
    let sigma = Sigma::read_from_json(&sigma_path).unwrap();

}