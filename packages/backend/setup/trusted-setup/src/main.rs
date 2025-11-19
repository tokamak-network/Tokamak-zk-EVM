#![allow(non_snake_case)]
use libs::iotools::{SetupParams, SubcircuitInfo, SubcircuitR1CS};
use libs::field_structures::{Tau, from_r1cs_to_evaled_qap_mixture};
use libs::iotools::{read_global_wire_list_as_boxed_boxed_numbers};
// use libs::polynomial_structures::{gen_bXY, gen_uXY, gen_vXY, gen_wXY, QAP};
use libs::utils::check_device;
use libs::vector_operations::{gen_evaled_lagrange_bases};
use libs::group_structures::{Sigma};
use icicle_bls12_381::curve::{BaseField, CurveCfg, G1Affine, G2Affine, G2BaseField, G2CurveCfg, ScalarField};
use icicle_core::traits::{FieldImpl};
// use icicle_core::ntt;
use icicle_core::curve::Curve;
use trusted_setup::SetupInputPaths;

use std::path::PathBuf;
use std::{env, process, vec};
use std::time::Instant;


fn main() {
    let args: Vec<String> = env::args().collect();

    #[cfg(not(feature = "testing-mode"))] 
    if args.len() < 3 || args.len() > 4 {
        eprintln!(
            "Usage: {} <QAP_PATH> <OUT_PATH> [--fixed-tau]",
            args[0]
        );
        process::exit(1);
    }

    #[cfg(feature = "testing-mode")]
    if args.len() < 4 || args.len() > 5 {
        eprintln!(
            "Usage: {} <QAP_PATH> <OUT_PATH> [--fixed-tau]",
            args[0]
        );
        process::exit(1);
    }

    #[cfg(not(feature = "testing-mode"))] 
    let use_fixed_tau = args.len() == 4 && (args[3] == "--fixed-tau");

    #[cfg(feature = "testing-mode")]
    let use_fixed_tau = args.len() == 5 && (args[4] == "--fixed-tau");

    #[cfg(not(feature = "testing-mode"))] 
    let paths = SetupInputPaths {
        qap_path: &args[1],
        output_path: &args[2],
    };
    #[cfg(feature = "testing-mode")]
    let paths = SetupInputPaths {
        qap_path: &args[1],
        output_path: &args[2],
        synthesizer_path: &args[3],
    };

    check_device();
    let start1 = Instant::now();
    
    // Select base points for G1/G2
    let (g1_gen, g2_gen, tau) = if use_fixed_tau {
        println!("Using hardcoded G1, G2 generators and tau");
        (
            G1Affine::from_limbs(
                BaseField::from_hex("0x0b001b4cc05fa01578be7d4e821d6ff58f2a05c584fba3cb31a37942dece65eadec9a878add2282f7c2513abb8d4ab05").into(), 
                BaseField::from_hex("0x15e237775397ed22eef43dd36cdca277c9cf6fa7e4ffff0a5bb4b20a82392caacf0f63fb6cdb02bccf2f5af14970d6b9").into()
            ), 
            G2Affine::from_limbs(
                G2BaseField::from_hex("0x1116094a7c01d4fd8abcfea69c658c92c037765bee00556b8d4063c33540b316ac68a2d913d3adc3b43c7d7cc7505cfc17206c8ae661f247979b3f1daa7fb6d5f7ce9c17b5ed1d7e8b421a2508b3f09a603e6a5fab3fcde7364fd178d656ac36").into(),
                G2BaseField::from_hex("0x15bf297a4b9842fb1a3a6f2dbf6b94de06997b11b2f72436c22efbb48d2f74b0de7239ea182a2ee50c23ae3d0be6fdee09459611409874fe4b04b1a7e42cb84eb4ae01728dc55dbd1343fda8d0fe94a299fc757acc1d2602a49a005b4ff90190").into()
            ),
            Tau::gen_fixed()
        )
    } else {
        (
            CurveCfg::generate_random_affine_points(1)[0],
            G2CurveCfg::generate_random_affine_points(1)[0],
            // Generate a random secret parameter tau (x and y only, no z as per the paper)
            Tau::gen()
        )
    };
    
    // Load setup parameters from JSON file
    let setup_params_path = PathBuf::from(paths.qap_path).join("setupParams.json");
    let setup_params: SetupParams = SetupParams::read_from_json(setup_params_path).unwrap();

    // Extract key parameters from setup_params
    let m_d = setup_params.m_D; // Total number of wires
    let s_d = setup_params.s_D; // Number of subcircuits
    let n = setup_params.n;     // Number of constraints per subcircuit
    let s_max = setup_params.s_max; // The maximum number of placements.
    // Additional wire-related parameters
    let l = setup_params.l;     // Number of public I/O wires
    let l_user = setup_params.l_user;
    let l_d = setup_params.l_D; // Number of interface wires
    let m_env = l - l_user;
    // The last wire-related parameter
    let m_i = l_d - l;
    println!("Setup parameters: \n n = {:?}, \n s_max = {:?}, \n l = {:?}, \n m_I = {:?}, \n m_D = {:?}", n, s_max, l, m_i, m_d);
    
    // Verify n is a power of two
    if !n.is_power_of_two() {
        panic!("n is not a power of two.");
    }
    
    if !(l.is_power_of_two() || l==0) {
        panic!("l is not a power of two.");
    }

    // if !(l_prv.is_power_of_two()) {
    //     panic!("l_prv is not a power of two.");
    // }

    // Verify s_max is a power of two
    if !s_max.is_power_of_two() {
        panic!("s_max is not a power of two.");
    }
    
    // Verify m_I is a power of two
    if !m_i.is_power_of_two() {
        panic!("m_I is not a power of two.");
    }
    
    // Load subcircuit information
    let subcircuit_infos_path = PathBuf::from(paths.qap_path).join("subcircuitInfo.json");
    let subcircuit_infos = SubcircuitInfo::read_box_from_json(subcircuit_infos_path).unwrap();

    // Load global wire list
    let global_wire_list_path = PathBuf::from(paths.qap_path).join("globalWireList.json");
    let global_wire_list = read_global_wire_list_as_boxed_boxed_numbers(global_wire_list_path).unwrap();
    
    // ------------------- Generate Polynomial Evaluations -------------------
    let start = Instant::now();

    // Compute k_evaled_vec: Lagrange polynomial evaluations at τ.x of size m_I
    let mut k_evaled_vec = vec![ScalarField::zero(); m_i].into_boxed_slice();
    gen_evaled_lagrange_bases(&tau.x, m_i, &mut k_evaled_vec);

    // Compute l_evaled_vec: Lagrange polynomial evaluations at τ.y of size s_max
    let mut l_evaled_vec = vec![ScalarField::zero(); s_max].into_boxed_slice();
    gen_evaled_lagrange_bases(&tau.y, s_max, &mut l_evaled_vec);
    
    // Compute m_evaled_vec: Lagrange polynomial evaluations at τ.x of size l
    let mut m_evaled_vec = vec![ScalarField::zero(); l].into_boxed_slice();
    gen_evaled_lagrange_bases(&tau.x, l, &mut m_evaled_vec);

    // Compute o_evaled_vec: Wire polynomial evaluations
    let mut o_evaled_vec = vec![ScalarField::zero(); m_d].into_boxed_slice();
    {
        // Generate cached powers of τ.x for more efficient computation
        let mut x_evaled_lagrange_vec = vec![ScalarField::zero(); n].into_boxed_slice();
        gen_evaled_lagrange_bases(&tau.x, n, &mut x_evaled_lagrange_vec);
        // Process each subcircuit
        for i in 0..s_d {
            println!("Processing subcircuit id {}", i);
            let r1cs_path = PathBuf::from(paths.qap_path).join(format!("json/subcircuit{i}.json"));

            // Evaluate QAP for the current subcircuit
            let compact_r1cs = SubcircuitR1CS::from_path(r1cs_path, &setup_params, &subcircuit_infos[i]).unwrap();
            let o_evaled = from_r1cs_to_evaled_qap_mixture(
                &compact_r1cs,
                &setup_params,
                &subcircuit_infos[i],
                &tau,
                &x_evaled_lagrange_vec
            );
            
            // Map local wire indices to global wire indices
            let flatten_map = &subcircuit_infos[i].flattenMap;

            // Store evaluations in o_evaled_vec using global wire indices
            for local_idx in 0..subcircuit_infos[i].Nwires {
                let global_idx = flatten_map[local_idx];

                // Verify global wire list consistency with flatten map
                if (global_wire_list[global_idx][0] != subcircuit_infos[i].id) || 
                   (global_wire_list[global_idx][1] != local_idx) {
                    panic!("GlobalWireList is not the inverse of flattenMap.");
                }

                let wire_val = o_evaled[local_idx];

                // Record non-zero wire evaluations
                if !wire_val.eq(&ScalarField::zero()) {
                    // nonzero_wires.push(global_idx);
                    o_evaled_vec[global_idx] = wire_val;
                }
            }
        }
    }

    #[cfg(feature = "testing-mode")] {
        use libs::polynomial_structures::QAP;
        use libs::bivariate_polynomial::BivariatePolynomial;
        use icicle_core::traits::{Arithmetic, FieldImpl};
        let r1cs_path = PathBuf::from(paths.qap_path);
        println!("Entering into testing mode");
        let qap = QAP::gen_from_R1CS(&r1cs_path, &subcircuit_infos, &setup_params);
        for j in 0..m_d {
            let o_eval = o_evaled_vec[j];
            let u_eval = qap.u_j_X[j].eval(&tau.x, &ScalarField::one());
            let v_eval = qap.v_j_X[j].eval(&tau.x, &ScalarField::one());
            let w_eval = qap.w_j_X[j].eval(&tau.x, &ScalarField::one());
            let o_eval_est = tau.alpha * u_eval + tau.alpha.pow(2) * v_eval + tau.alpha.pow(3) * w_eval;
            assert_eq!(o_eval, o_eval_est);
        }
        println!("Checked: o_evaled_vec");
    }
    
    let duration = start.elapsed();
    println!("Polynomial evaluation computation time: {:.6} seconds", duration.as_secs_f64());

    // Generate sigma components using the computed polynomial evaluations
    let start = Instant::now();
    let sigma = Sigma::gen(
        &setup_params,
        &tau,
        &o_evaled_vec,
        &l_evaled_vec,
        &k_evaled_vec,
        &m_evaled_vec,
        &g1_gen,
        &g2_gen
    );

    let lap = start.elapsed();
    println!("The sigma generation time: {:.6} seconds", lap.as_secs_f64());

    #[cfg(feature = "testing-mode")] {
        use icicle_bls12_381::curve::{ScalarCfg};
        use icicle_core::traits::{GenerateRandom, Arithmetic};
        use libs::vector_operations::{resize};
        use libs::bivariate_polynomial::{DensePolynomialExt, BivariatePolynomial};
        use icicle_runtime::memory::HostSlice;
        use icicle_bls12_381::curve::{G1Affine};
        use libs::iotools::{Instance, PlacementVariables, read_R1CS_gen_uvwXY};
        use libs::polynomial_structures::{gen_bXY};
        use libs::group_structures::{G1serde, pairing};

        let poly_coefs_opt = ScalarCfg::generate_random( (n + 10) * (s_max + 10));
        let poly_coefs = resize(&poly_coefs_opt, n+10, s_max+10, 2*n, 2*s_max, ScalarField::zero());
        let mut poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&poly_coefs), 2*n, 2*s_max);
        poly.optimize_size();
        let encoding = sigma.sigma_1.encode_poly(&mut poly, &setup_params);
        let poly_eval = poly.eval(&tau.x, &tau.y);
        let direct = G1Affine::from(g1_gen.to_projective() * poly_eval);
        assert_eq!(sigma.sigma_1.xy_powers[2*s_max].0.to_projective(), g1_gen.to_projective() * tau.x);
        assert_eq!(sigma.sigma_1.xy_powers[1].0.to_projective(), g1_gen.to_projective() * tau.y);
        assert_eq!(encoding.0, direct);
        println!("Checked: xy_powers");
        let placement_variables_path = PathBuf::from(paths.synthesizer_path).join("placementVariables.json");
        let mut placement_variables = PlacementVariables::read_box_from_json(placement_variables_path).unwrap();
        // let placement_variables = PlacementVariables::gen_dummy(&setup_params, &subcircuit_infos);

        // TEMP
            // for i in 0..4 {
            //     placement_variables[i].variables = vec![ScalarField::zero().to_string(); placement_variables[i].variables.len()].into_boxed_slice();
            // }
        ////
        
        let instance_path = PathBuf::from(paths.synthesizer_path).join("instance.json");
        let mut public_instance = Instance::read_from_json(instance_path).unwrap();
        // TEMP
            // public_instance.a_pub = vec![ScalarField::zero().to_string(); setup_params.l];
        ////
        let mut a_X = public_instance.gen_a_pub_X(&setup_params);
        let mut bXY = gen_bXY(&placement_variables, &subcircuit_infos, &setup_params);
        let (mut uXY, mut vXY, mut wXY) = read_R1CS_gen_uvwXY(&paths.qap_path, &placement_variables, &subcircuit_infos, &setup_params);
        let a_encoding = sigma.sigma_1.encode_poly(&mut a_X, &setup_params);
        // TEMP
            // assert_eq!(a_encoding.0, G1Affine::zero());
        ////
        let mut b_encoding = sigma.sigma_1.encode_poly(&mut bXY, &setup_params);
        // TEMP
            // b_encoding = G1serde::zero();
            // assert_ne!(b_encoding.0, G1Affine::zero());
        ////
        let u_encoding = sigma.sigma_1.encode_poly(&mut uXY, &setup_params);
        let v_encoding = sigma.sigma_1.encode_poly(&mut vXY, &setup_params);
        let w_encoding = sigma.sigma_1.encode_poly(&mut wXY, &setup_params);
        let O_user_inst = sigma.sigma_1.encode_O_user_inst(&placement_variables, &subcircuit_infos, &setup_params);
        let O_env_inst = sigma.sigma_1.encode_O_env_inst(&placement_variables, &subcircuit_infos, &setup_params);
        // TEMP
            // assert_eq!(O_pub.0, G1Affine::zero());
        ////
        let O_mid = sigma.sigma_1.encode_O_mid_no_zk(&placement_variables, &subcircuit_infos, &setup_params);
        let O_prv = sigma.sigma_1.encode_O_prv_no_zk(&placement_variables, &subcircuit_infos, &setup_params);
        let LHS = 
            O_user_inst * tau.gamma 
            + O_env_inst * tau.gamma.pow(2)
            + O_mid * tau.eta 
            + O_prv * tau.delta;
        let RHS = 
            a_encoding
            + u_encoding * tau.alpha
            + v_encoding * tau.alpha.pow(2)
            + w_encoding * tau.alpha.pow(3)
            + b_encoding * tau.alpha.pow(4);
        assert_eq!(LHS, RHS);
        println!("Checked: o_vec");
        let mut t: ScalarField;
        t = tau.x.pow(n) - ScalarField::one();
        for k in 1 ..4 {
            for h in 0..3 {
                let rs = sigma.sigma_1.delta_inv_alphak_xh_tx[k-1][h].0.to_projective();
                let val = sigma.G.0.to_projective() * (tau.delta.inv() * tau.alpha.pow(k) * tau.x.pow(h) * t);
                assert_eq!(rs, val);
            }
        }
        t = tau.x.pow(m_i) - ScalarField::one();
        for j in 0..2 {
            let rs = sigma.sigma_1.delta_inv_alpha4_xj_tx[j].0.to_projective();
            let val = sigma.G.0.to_projective() * (tau.delta.inv() * tau.alpha.pow(4) * tau.x.pow(j) * t);
            assert_eq!(rs, val);
        }
        t = tau.y.pow(s_max) - ScalarField::one();
        for k in 1 ..5 {
            for i in 0..3 {
                let rs = sigma.sigma_1.delta_inv_alphak_yi_ty[k-1][i].0.to_projective();
                let val = sigma.G.0.to_projective() * (tau.delta.inv() * tau.alpha.pow(k) * tau.y.pow(i) * t);
                assert_eq!(rs, val);
            }
        }
        println!("Checked: zk strings");

        let lhs1 = vec![a_encoding, b_encoding, u_encoding, v_encoding, w_encoding];
        let lhs2 = vec![O_env_inst, O_user_inst, O_mid, O_prv];
        let rhs1 = vec![sigma.H, sigma.sigma_2.alpha4, sigma.sigma_2.alpha, sigma.sigma_2.alpha2, sigma.sigma_2.alpha3];
        let rhs2 = vec![sigma.sigma_2.gamma2, sigma.sigma_2.gamma, sigma.sigma_2.eta, sigma.sigma_2.delta];
        let LHS = pairing(&lhs1, &rhs1);
        let RHS = pairing(&lhs2, &rhs2);
        assert_eq!(LHS, RHS);
        println!("Checked: polynomial binding");

        let mut t_n_coeffs = vec![ScalarField::zero(); 2*n];
        t_n_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_n_coeffs[n] = ScalarField::one();
        let mut t_n = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_n_coeffs), 2*n, 1);
        t_n.optimize_size();
        let mut t_mi_coeffs = vec![ScalarField::zero(); 2*m_i];
        t_mi_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_mi_coeffs[m_i] = ScalarField::one();
        let mut t_mi = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_mi_coeffs), 2*m_i, 1);
        t_mi.optimize_size();
        let mut t_smax_coeffs = vec![ScalarField::zero(); 2*s_max];
        t_smax_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_smax_coeffs[s_max] = ScalarField::one();
        let mut t_smax = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_smax_coeffs), 1, 2*s_max);
        t_smax.optimize_size();
        let rU_X = ScalarCfg::generate_random(1)[0];
        let rU_Y = ScalarCfg::generate_random(1)[0];
        let rV_X = ScalarCfg::generate_random(1)[0];
        let rV_Y = ScalarCfg::generate_random(1)[0];
        let mut rW_X_coeffs = ScalarCfg::generate_random(4);
        rW_X_coeffs[3] = ScalarField::zero();
        // let rW_X_coeffs_resized = resize(&rW_X_coeffs, 3, 1, 4, 1);
        let rW_X = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rW_X_coeffs), 4, 1);
        let mut rW_Y_coeffs = ScalarCfg::generate_random(4);
        rW_Y_coeffs[3] = ScalarField::zero();
        // let rW_Y_coeffs_resized = resize(&rW_Y_coeffs, 1, 3, 1, 4);
        let rW_Y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rW_Y_coeffs), 1, 4);
        let rB_X_coeffs = ScalarCfg::generate_random(2);
        let rB_X = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rB_X_coeffs), 2, 1);
        let rB_Y_coeffs = ScalarCfg::generate_random(2);
        let rB_Y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rB_Y_coeffs), 1, 2);
        let mut rB_X_t_x = &rB_X * &t_mi;
        let mut rB_Y_t_y = &rB_Y * &t_smax;
        let mut rW_X_t_x = &rW_X * &t_n;
        let mut rW_Y_t_y = &rW_Y * &t_smax;
        let B_zk = G1serde(G1Affine::from(
            sigma.sigma_1.encode_poly(&mut rB_X_t_x, &setup_params).0.to_projective()
            + sigma.sigma_1.encode_poly(&mut rB_Y_t_y, &setup_params).0.to_projective()
        ));
        let U_zk = G1serde(G1Affine::from(
            sigma.sigma_1.encode_poly(&mut (&rU_X * &t_n), &setup_params).0.to_projective()
            + sigma.sigma_1.encode_poly(&mut (&rU_Y * &t_smax), &setup_params).0.to_projective()
        ));
        let V_zk = G1serde(G1Affine::from(
            sigma.sigma_1.encode_poly(&mut (&rV_X * &t_n), &setup_params).0.to_projective()
            + sigma.sigma_1.encode_poly(&mut (&rV_Y * &t_smax), &setup_params).0.to_projective()
        ));
        let W_zk1 = G1serde(G1Affine::from(
            sigma.sigma_1.encode_poly(&mut rW_X_t_x, &setup_params).0.to_projective()
        ));
        let W_zk2 = G1serde(G1Affine::from(
            sigma.sigma_1.encode_poly(&mut rW_Y_t_y, &setup_params).0.to_projective()
        ));

        let B_zk_rhs = G1serde(G1Affine::from(
            (
                sigma.sigma_1.delta_inv_alpha4_xj_tx[0].0.to_projective() * rB_X_coeffs[0]
                + sigma.sigma_1.delta_inv_alpha4_xj_tx[1].0.to_projective() * rB_X_coeffs[1]
            )
            + (
                sigma.sigma_1.delta_inv_alphak_yi_ty[3][0].0.to_projective() * rB_Y_coeffs[0]
                + sigma.sigma_1.delta_inv_alphak_yi_ty[3][1].0.to_projective() * rB_Y_coeffs[1]
            )
        ));
        let U_zk_rhs = G1serde(G1Affine::from(
            sigma.sigma_1.delta_inv_alphak_xh_tx[0][0].0.to_projective() * rU_X
            + sigma.sigma_1.delta_inv_alphak_yi_ty[0][0].0.to_projective() * rU_Y
        ));
        let V_zk_rhs = G1serde(G1Affine::from(
            sigma.sigma_1.delta_inv_alphak_xh_tx[1][0].0.to_projective() * rV_X
            + sigma.sigma_1.delta_inv_alphak_yi_ty[1][0].0.to_projective() * rV_Y
        ));
        let W_zk_rhs1 = G1serde(G1Affine::from(
            (
                sigma.sigma_1.delta_inv_alphak_xh_tx[2][0].0.to_projective() * rW_X_coeffs[0]
                + sigma.sigma_1.delta_inv_alphak_xh_tx[2][1].0.to_projective() * rW_X_coeffs[1]
                + sigma.sigma_1.delta_inv_alphak_xh_tx[2][2].0.to_projective() * rW_X_coeffs[2]
            )
        ));
        let W_zk_rhs2 = G1serde(G1Affine::from(
            (
                sigma.sigma_1.delta_inv_alphak_yi_ty[2][0].0.to_projective() * rW_Y_coeffs[0]
                + sigma.sigma_1.delta_inv_alphak_yi_ty[2][1].0.to_projective() * rW_Y_coeffs[1]
                + sigma.sigma_1.delta_inv_alphak_yi_ty[2][2].0.to_projective() * rW_Y_coeffs[2]
            )
        ));
        assert_eq!(pairing(&[B_zk], &[sigma.sigma_2.alpha4]), pairing(&[B_zk_rhs], &[sigma.sigma_2.delta]));
        assert_eq!(pairing(&[U_zk], &[sigma.sigma_2.alpha]), pairing(&[U_zk_rhs], &[sigma.sigma_2.delta]));
        assert_eq!(pairing(&[V_zk], &[sigma.sigma_2.alpha2]), pairing(&[V_zk_rhs], &[sigma.sigma_2.delta]));
        assert_eq!(pairing(&[W_zk1], &[sigma.sigma_2.alpha3]), pairing(&[W_zk_rhs1], &[sigma.sigma_2.delta]));
        assert_eq!(pairing(&[W_zk2], &[sigma.sigma_2.alpha3]), pairing(&[W_zk_rhs2], &[sigma.sigma_2.delta]));  
        println!("Checked: each proof component");
    }

    let start = Instant::now();
    
    // Write bincode version for faster loading
    let output_dir_path = PathBuf::from(paths.output_path);
    std::fs::create_dir_all(&output_dir_path).expect("Failed to create output directory");
    println!("Writing the sigma into bincode...");
    let bincode_data = bincode::serialize(&sigma).expect("Failed to serialize sigma to bincode");
    std::fs::write(output_dir_path.join("combined_sigma.bin"), bincode_data).expect("Failed to write bincode file");
    
    // // Writing the sigma into rust code
    // println!("Writing the sigma into a rust code...");
    // let output_path = "setup/trusted-setup/output/combined_sigma.rs";
    // sigma.write_into_rust_code(output_path).unwrap();

    sigma.write_into_json_for_verify(output_dir_path.join("sigma_verify.json")).unwrap();
    sigma.write_into_json_for_preprocess(output_dir_path.join("sigma_preprocess.json")).unwrap();
    let lap = start.elapsed();
    println!("The sigma writing time: {:.6} seconds", lap.as_secs_f64());

    let total_duration = start1.elapsed();
    println!("Total setup time: {:.6} seconds", total_duration.as_secs_f64());
    
}