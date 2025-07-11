#![allow(non_snake_case)]
use libs::iotools::{SetupParams, SubcircuitInfo, SubcircuitR1CS};
use libs::field_structures::{Tau, from_r1cs_to_evaled_qap_mixture};
use libs::iotools::{read_global_wire_list_as_boxed_boxed_numbers};
// use libs::polynomial_structures::{gen_bXY, gen_uXY, gen_vXY, gen_wXY, QAP};
use libs::utils::check_device;
use libs::vector_operations::gen_evaled_lagrange_bases;
use libs::group_structures::Sigma;
use icicle_bls12_381::curve::{ScalarField, CurveCfg, G2CurveCfg};
use icicle_core::traits::FieldImpl;
// use icicle_core::ntt;
use icicle_core::curve::Curve;

use std::{vec, cmp};
use std::time::Instant;


fn main() {
    check_device();
    let start1 = Instant::now();
    
    // Generate random affine points on the elliptic curve (G1 and G2)
    let g1_gen = CurveCfg::generate_random_affine_points(1)[0];
    let g2_gen = G2CurveCfg::generate_random_affine_points(1)[0];
    
    // Generate a random secret parameter tau (x and y only, no z as per the paper)
    let tau = Tau::gen();
    
    // Load setup parameters from JSON file
    let setup_file_name = "setupParams.json";
    let setup_params = SetupParams::from_path(setup_file_name).unwrap();

    // Extract key parameters from setup_params
    let m_d = setup_params.m_D; // Total number of wires
    let s_d = setup_params.s_D; // Number of subcircuits
    let n = setup_params.n;     // Number of constraints per subcircuit
    let s_max = setup_params.s_max; // The maximum number of placements.
    // Additional wire-related parameters
    let l = setup_params.l;     // Number of public I/O wires
    let l_pub = setup_params.l_pub_in + setup_params.l_pub_out;
    let l_prv = setup_params.l_prv_in + setup_params.l_prv_out;
    let l_d = setup_params.l_D; // Number of interface wires
    // The last wire-related parameter
    let m_i = l_d - l;
    println!("Setup parameters: \n n = {:?}, \n s_max = {:?}, \n l = {:?}, \n m_I = {:?}, \n m_D = {:?}", n, s_max, l, m_i, m_d);
    
    // Verify n is a power of two
    if !n.is_power_of_two() {
        panic!("n is not a power of two.");
    }
    
    if !(l_pub.is_power_of_two() || l_pub==0) {
        panic!("l_pub is not a power of two.");
    }

    if !(l_prv.is_power_of_two()) {
        panic!("l_prv is not a power of two.");
    }

    // Verify s_max is a power of two
    if !s_max.is_power_of_two() {
        panic!("s_max is not a power of two.");
    }
    
    // Verify m_I is a power of two
    if !m_i.is_power_of_two() {
        panic!("m_I is not a power of two.");
    }
    
    // Load subcircuit information
    let subcircuit_file_name = "subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(subcircuit_file_name).unwrap();

    // Load global wire list
    let global_wire_file_name = "globalWireList.json";
    let global_wire_list = read_global_wire_list_as_boxed_boxed_numbers(global_wire_file_name).unwrap();
    
    // ------------------- Generate Polynomial Evaluations -------------------
    let start = Instant::now();

    // Compute k_evaled_vec: Lagrange polynomial evaluations at τ.x of size m_I
    let mut k_evaled_vec = vec![ScalarField::zero(); m_i].into_boxed_slice();
    gen_evaled_lagrange_bases(&tau.x, m_i, &mut k_evaled_vec);

    // Compute l_evaled_vec: Lagrange polynomial evaluations at τ.y of size s_max
    let mut l_evaled_vec = vec![ScalarField::zero(); s_max].into_boxed_slice();
    gen_evaled_lagrange_bases(&tau.y, s_max, &mut l_evaled_vec);
    
    // Compute m_evaled_vec: Lagrange polynomial evaluations at τ.x of size l
    let mut m_evaled_vec = vec![ScalarField::zero(); l_pub].into_boxed_slice();
    if l>0 {
        gen_evaled_lagrange_bases(&tau.x, l_pub, &mut m_evaled_vec);
    }

    // Compute o_evaled_vec: Wire polynomial evaluations
    let mut o_evaled_vec = vec![ScalarField::zero(); m_d].into_boxed_slice();

    {
        // Generate cached powers of τ.x for more efficient computation
        let mut x_evaled_lagrange_vec = vec![ScalarField::zero(); n].into_boxed_slice();
        gen_evaled_lagrange_bases(&tau.x, n, &mut x_evaled_lagrange_vec);
        // Process each subcircuit
        for i in 0..s_d {
            println!("Processing subcircuit id {}", i);
            let r1cs_path: String = format!("json/subcircuit{i}.json");

            // Evaluate QAP for the current subcircuit
            let compact_r1cs = SubcircuitR1CS::from_path(&r1cs_path, &setup_params, &subcircuit_infos[i]).unwrap();
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
        for j in 0..m_d {
            let qap = QAP::gen_from_R1CS(&subcircuit_infos, &setup_params);
            let o_eval = o_evaled_vec[j];
            let u_eval = qap.u_j_X[j].eval(&tau.x, &ScalarField::one());
            let v_eval = qap.v_j_X[j].eval(&tau.x, &ScalarField::one());
            let w_eval = qap.w_j_X[j].eval(&tau.x, &ScalarField::one());
            let o_eval_est = tau.alpha * u_eval + tau.alpha.pow(2) * v_eval + tau.alpha.pow(3) * w_eval;
            assert_eq!(o_eval, o_eval_est);
        }
        println!("QAP loading");
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

    // #[cfg(feature = "testing-mode")] {
    //     let poly_coefs_opt = ScalarCfg::generate_random( (n + 10) * (s_max + 10));
    //     let poly_coefs = resize(&poly_coefs_opt, n+10, s_max+10, 2*n, 2*s_max, ScalarField::zero());
    //     let mut poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&poly_coefs), 2*n, 2*s_max);
    //     poly.optimize_size();
    //     let encoding = sigma.sigma_1.encode_poly(&mut poly, &setup_params);
    //     let poly_eval = poly.eval(&tau.x, &tau.y);
    //     let direct = G1Affine::from(g1_gen.to_projective() * poly_eval);
    //     assert_eq!(sigma.sigma_1.xy_powers[2*s_max].0.to_projective(), g1_gen.to_projective() * tau.x);
    //     assert_eq!(sigma.sigma_1.xy_powers[1].0.to_projective(), g1_gen.to_projective() * tau.y);
    //     assert_eq!(encoding.0, direct);
    //     println!("Checked: xy_powers");
    //     // let placement_variables_path = "placementVariables.json";
    //     // let placement_variables = PlacementVariables::from_path(&placement_variables_path).unwrap();
    //     let placement_variables = PlacementVariables::gen_dummy(&setup_params, &subcircuit_infos);
    //     let mut compact_library_R1CS: Vec<SubcircuitR1CS> = Vec::new();
    //     for i in 0..s_d {
    //         let r1cs_path: String = format!("json/subcircuit{i}.json");
    //         let compact_r1cs = SubcircuitR1CS::from_path(&r1cs_path, &setup_params, &subcircuit_infos[i]).unwrap();
    //         compact_library_R1CS.push(compact_r1cs);
    //     }
    //     let public_instance_path = "publicInstance.json";
    //     let public_instance = PublicInstance::from_path(&public_instance_path).unwrap();
    //     let mut aX = public_instance.gen_aX(&setup_params);
    //     let mut bXY = gen_bXY(&placement_variables, &subcircuit_infos, &setup_params);
    //     let mut uXY = gen_uXY(&placement_variables, &compact_library_R1CS, &setup_params);
    //     let mut vXY = gen_vXY(&placement_variables, &compact_library_R1CS, &setup_params);
    //     let mut wXY = gen_wXY(&placement_variables, &compact_library_R1CS, &setup_params);
    //     let a_encoding = sigma.sigma_1.encode_poly(&mut aX, &setup_params);
    //     let b_encoding = sigma.sigma_1.encode_poly(&mut bXY, &setup_params);
    //     let u_encoding = sigma.sigma_1.encode_poly(&mut uXY, &setup_params);
    //     let v_encoding = sigma.sigma_1.encode_poly(&mut vXY, &setup_params);
    //     let w_encoding = sigma.sigma_1.encode_poly(&mut wXY, &setup_params);
    //     let O_pub = sigma.sigma_1.encode_O_pub(&placement_variables, &subcircuit_infos, &setup_params);
    //     let O_mid = sigma.sigma_1.encode_O_mid_no_zk(&placement_variables, &subcircuit_infos, &setup_params);
    //     let O_prv = sigma.sigma_1.encode_O_prv_no_zk(&placement_variables, &subcircuit_infos, &setup_params);
    //     let LHS = 
    //         O_pub * tau.gamma 
    //         + O_mid * tau.eta 
    //         + O_prv * tau.delta;
    //     let RHS = 
    //         a_encoding 
    //         + u_encoding * tau.alpha
    //         + v_encoding * tau.alpha.pow(2)
    //         + w_encoding * tau.alpha.pow(3)
    //         + b_encoding * tau.alpha.pow(4);
    //     assert_eq!(LHS, RHS);
    //     println!("Checked: o_vec");
    //     let mut t: ScalarField;
    //     t = tau.x.pow(n) - ScalarField::one();
    //     for k in 1 ..4 {
    //         for h in 0..3 {
    //             let rs = sigma.sigma_1.delta_inv_alphak_xh_tx[k-1][h].0.to_projective();
    //             let val = sigma.G.0.to_projective() * (tau.delta.inv() * tau.alpha.pow(k) * tau.x.pow(h) * t);
    //             assert_eq!(rs, val);
    //         }
    //     }
    //     t = tau.x.pow(m_i) - ScalarField::one();
    //     for j in 0..2 {
    //         let rs = sigma.sigma_1.delta_inv_alpha4_xj_tx[j].0.to_projective();
    //         let val = sigma.G.0.to_projective() * (tau.delta.inv() * tau.alpha.pow(4) * tau.x.pow(j) * t);
    //         assert_eq!(rs, val);
    //     }
    //     t = tau.y.pow(s_max) - ScalarField::one();
    //     for k in 1 ..5 {
    //         for i in 0..3 {
    //             let rs = sigma.sigma_1.delta_inv_alphak_yi_ty[k-1][i].0.to_projective();
    //             let val = sigma.G.0.to_projective() * (tau.delta.inv() * tau.alpha.pow(k) * tau.y.pow(i) * t);
    //             assert_eq!(rs, val);
    //         }
    //     }
    //     println!("Checked: zk strings");

    //     let lhs1 = vec![a_encoding, b_encoding, u_encoding, v_encoding, w_encoding];
    //     let lhs2 = vec![O_pub, O_mid, O_prv];
    //     let rhs1 = vec![sigma.H, sigma.sigma_2.alpha4, sigma.sigma_2.alpha, sigma.sigma_2.alpha2, sigma.sigma_2.alpha3];
    //     let rhs2 = vec![sigma.sigma_2.gamma, sigma.sigma_2.eta, sigma.sigma_2.delta];
    //     let LHS = pairing(&lhs1, &rhs1);
    //     let RHS = pairing(&lhs2, &rhs2);
    //     assert_eq!(LHS, RHS);
    //     println!("Checked: polynomial binding");

    //     let mut t_n_coeffs = vec![ScalarField::zero(); 2*n];
    //     t_n_coeffs[0] = ScalarField::zero() - ScalarField::one();
    //     t_n_coeffs[n] = ScalarField::one();
    //     let mut t_n = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_n_coeffs), 2*n, 1);
    //     t_n.optimize_size();
    //     let mut t_mi_coeffs = vec![ScalarField::zero(); 2*m_i];
    //     t_mi_coeffs[0] = ScalarField::zero() - ScalarField::one();
    //     t_mi_coeffs[m_i] = ScalarField::one();
    //     let mut t_mi = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_mi_coeffs), 2*m_i, 1);
    //     t_mi.optimize_size();
    //     let mut t_smax_coeffs = vec![ScalarField::zero(); 2*s_max];
    //     t_smax_coeffs[0] = ScalarField::zero() - ScalarField::one();
    //     t_smax_coeffs[s_max] = ScalarField::one();
    //     let mut t_smax = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_smax_coeffs), 1, 2*s_max);
    //     t_smax.optimize_size();
    //     let rU_X = ScalarCfg::generate_random(1)[0];
    //     let rU_Y = ScalarCfg::generate_random(1)[0];
    //     let rV_X = ScalarCfg::generate_random(1)[0];
    //     let rV_Y = ScalarCfg::generate_random(1)[0];
    //     let mut rW_X_coeffs = ScalarCfg::generate_random(4);
    //     rW_X_coeffs[3] = ScalarField::zero();
    //     // let rW_X_coeffs_resized = resize(&rW_X_coeffs, 3, 1, 4, 1);
    //     let rW_X = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rW_X_coeffs), 4, 1);
    //     let mut rW_Y_coeffs = ScalarCfg::generate_random(4);
    //     rW_Y_coeffs[3] = ScalarField::zero();
    //     // let rW_Y_coeffs_resized = resize(&rW_Y_coeffs, 1, 3, 1, 4);
    //     let rW_Y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rW_Y_coeffs), 1, 4);
    //     let rB_X_coeffs = ScalarCfg::generate_random(2);
    //     let rB_X = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rB_X_coeffs), 2, 1);
    //     let rB_Y_coeffs = ScalarCfg::generate_random(2);
    //     let rB_Y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rB_Y_coeffs), 1, 2);
    //     let mut rB_X_t_x = &rB_X * &t_mi;
    //     let mut rB_Y_t_y = &rB_Y * &t_smax;
    //     let mut rW_X_t_x = &rW_X * &t_n;
    //     let mut rW_Y_t_y = &rW_Y * &t_smax;
    //     let B_zk = G1serde(G1Affine::from(
    //         sigma.sigma_1.encode_poly(&mut rB_X_t_x, &setup_params).0.to_projective()
    //         + sigma.sigma_1.encode_poly(&mut rB_Y_t_y, &setup_params).0.to_projective()
    //     ));
    //     let U_zk = G1serde(G1Affine::from(
    //         sigma.sigma_1.encode_poly(&mut (&rU_X * &t_n), &setup_params).0.to_projective()
    //         + sigma.sigma_1.encode_poly(&mut (&rU_Y * &t_smax), &setup_params).0.to_projective()
    //     ));
    //     let V_zk = G1serde(G1Affine::from(
    //         sigma.sigma_1.encode_poly(&mut (&rV_X * &t_n), &setup_params).0.to_projective()
    //         + sigma.sigma_1.encode_poly(&mut (&rV_Y * &t_smax), &setup_params).0.to_projective()
    //     ));
    //     let W_zk1 = G1serde(G1Affine::from(
    //         sigma.sigma_1.encode_poly(&mut rW_X_t_x, &setup_params).0.to_projective()
    //     ));
    //     let W_zk2 = G1serde(G1Affine::from(
    //         sigma.sigma_1.encode_poly(&mut rW_Y_t_y, &setup_params).0.to_projective()
    //     ));

    //     let B_zk_rhs = G1serde(G1Affine::from(
    //         (
    //             sigma.sigma_1.delta_inv_alpha4_xj_tx[0].0.to_projective() * rB_X_coeffs[0]
    //             + sigma.sigma_1.delta_inv_alpha4_xj_tx[1].0.to_projective() * rB_X_coeffs[1]
    //         )
    //         + (
    //             sigma.sigma_1.delta_inv_alphak_yi_ty[3][0].0.to_projective() * rB_Y_coeffs[0]
    //             + sigma.sigma_1.delta_inv_alphak_yi_ty[3][1].0.to_projective() * rB_Y_coeffs[1]
    //         )
    //     ));
    //     let U_zk_rhs = G1serde(G1Affine::from(
    //         sigma.sigma_1.delta_inv_alphak_xh_tx[0][0].0.to_projective() * rU_X
    //         + sigma.sigma_1.delta_inv_alphak_yi_ty[0][0].0.to_projective() * rU_Y
    //     ));
    //     let V_zk_rhs = G1serde(G1Affine::from(
    //         sigma.sigma_1.delta_inv_alphak_xh_tx[1][0].0.to_projective() * rV_X
    //         + sigma.sigma_1.delta_inv_alphak_yi_ty[1][0].0.to_projective() * rV_Y
    //     ));
    //     let W_zk_rhs1 = G1serde(G1Affine::from(
    //         (
    //             sigma.sigma_1.delta_inv_alphak_xh_tx[2][0].0.to_projective() * rW_X_coeffs[0]
    //             + sigma.sigma_1.delta_inv_alphak_xh_tx[2][1].0.to_projective() * rW_X_coeffs[1]
    //             + sigma.sigma_1.delta_inv_alphak_xh_tx[2][2].0.to_projective() * rW_X_coeffs[2]
    //         )
    //     ));
    //     let W_zk_rhs2 = G1serde(G1Affine::from(
    //         (
    //             sigma.sigma_1.delta_inv_alphak_yi_ty[2][0].0.to_projective() * rW_Y_coeffs[0]
    //             + sigma.sigma_1.delta_inv_alphak_yi_ty[2][1].0.to_projective() * rW_Y_coeffs[1]
    //             + sigma.sigma_1.delta_inv_alphak_yi_ty[2][2].0.to_projective() * rW_Y_coeffs[2]
    //         )
    //     ));
    //     assert_eq!(pairing(&[B_zk], &[sigma.sigma_2.alpha4]), pairing(&[B_zk_rhs], &[sigma.sigma_2.delta]));
    //     assert_eq!(pairing(&[U_zk], &[sigma.sigma_2.alpha]), pairing(&[U_zk_rhs], &[sigma.sigma_2.delta]));
    //     assert_eq!(pairing(&[V_zk], &[sigma.sigma_2.alpha2]), pairing(&[V_zk_rhs], &[sigma.sigma_2.delta]));
    //     assert_eq!(pairing(&[W_zk1], &[sigma.sigma_2.alpha3]), pairing(&[W_zk_rhs1], &[sigma.sigma_2.delta]));
    //     assert_eq!(pairing(&[W_zk2], &[sigma.sigma_2.alpha3]), pairing(&[W_zk_rhs2], &[sigma.sigma_2.delta]));  
    // }

    let start = Instant::now();
    // Writing the sigma into JSON
    let mut output_path: &str;
    println!("Writing the sigma into JSON...");
    output_path = "setup/trusted-setup/output/combined_sigma.json";
    sigma.write_into_json(output_path).unwrap();
    // // Writing the sigma into rust code
    // println!("Writing the sigma into a rust code...");
    // let output_path = "setup/trusted-setup/output/combined_sigma.rs";
    // sigma.write_into_rust_code(output_path).unwrap();

    output_path = "setup/trusted-setup/output/sigma_verify.json";
    sigma.write_into_json_for_verify(output_path).unwrap();
    output_path = "setup/trusted-setup/output/sigma_preprocess.json";
    sigma.write_into_json_for_preprocess(output_path).unwrap();
    let lap = start.elapsed();
    println!("The sigma writing time: {:.6} seconds", lap.as_secs_f64());

    let total_duration = start1.elapsed();
    println!("Total setup time: {:.6} seconds", total_duration.as_secs_f64());
    
//     // ------------------- read JSON file -------------------
//     println!("\n----- Testing reconstruction of the sigma from JSON -----");
//     let read_start = Instant::now();
    
//     match Sigma::read_from_json(output_path) {
//         Ok(loaded_sigma) => {
//             let read_duration = read_start.elapsed();
//             println!("Successfully loaded sigma from file in {:.6} seconds", read_duration.as_secs_f64());
            
//             println!("\nLoaded Sigma components summary:");
//             println!("  - Sigma1:");
//             println!("      * Sigma1: {} xy_powers elements", loaded_sigma.sigma_1.xy_powers.len());
//             println!("      * gamma_inv_l_oj_mj: {} elements", loaded_sigma.sigma_1.gamma_inv_l_oj_mj.len());
//             println!("      * eta_inv_li_ojl_ak_kj: {}x{} matrix", 
//                     loaded_sigma.sigma_b.eta_inv_li_ojl_ak_kj.len(),
//                     if loaded_sigma.sigma_b.eta_inv_li_ojl_ak_kj.len() > 0 { loaded_sigma.sigma_b.eta_inv_li_ojl_ak_kj[0].len() } else { 0 });
//             println!("      * delta_inv_li_oj_prv: {}x{} matrix", 
//                     loaded_sigma.sigma_b.delta_inv_li_oj_prv.len(),
//                     if loaded_sigma.sigma_b.delta_inv_li_oj_prv.len() > 0 { loaded_sigma.sigma_b.delta_inv_li_oj_prv[0].len() } else { 0 });
//             println!("      * delta_inv_ak_xh_tn: {} elements", loaded_sigma.sigma_b.delta_inv_ak_xh_tn.len());
//             println!("      * delta_inv_ak_xi_tm: {} elements", loaded_sigma.sigma_b.delta_inv_ak_xi_tm.len());
//             println!("      * delta_inv_ak_yi_ts: {} elements", loaded_sigma.sigma_b.delta_inv_ak_yi_ts.len());
            
//             // Check first few elements of each component to verify they are valid
//             if loaded_sigma.sigma_ac.xy_powers.len() > 0 {
//                 println!("\nSample values from SigmaAC:");
//                 println!("  First xy_power x: {}", loaded_sigma.sigma_ac.xy_powers[0].x);
//                 println!("  First xy_power y: {}", loaded_sigma.sigma_ac.xy_powers[0].y);
//             }
            
//             println!("\nSample values from SigmaB:");
//             println!("  delta x: {}", loaded_sigma.sigma_b.delta.x);
//             println!("  delta y: {}", loaded_sigma.sigma_b.delta.y);
//             println!("  eta x: {}", loaded_sigma.sigma_b.eta.x);
//             println!("  eta y: {}", loaded_sigma.sigma_b.eta.y);
            
//             println!("\nSample values from SigmaV:");
//             println!("  alpha x: {}", loaded_sigma.sigma_v.alpha.x);
//             println!("  alpha y: {}", loaded_sigma.sigma_v.alpha.y);
//             println!("  gamma x: {}", loaded_sigma.sigma_v.gamma.x);
//             println!("  gamma y: {}", loaded_sigma.sigma_v.gamma.y);
            
//             println!("\nJSON deserialization test completed successfully!");
//         },
//         Err(e) => {
//             println!("Error loading sigma from file: {}", e);
//         }
//     }
    
//     if let Ok(metadata) = std::fs::metadata(output_path) {
//         let file_size = metadata.len();
//         println!("\nJSON file size: {} bytes ({:.2} MB)", file_size, file_size as f64 / (1024.0 * 1024.0));
//     }
}