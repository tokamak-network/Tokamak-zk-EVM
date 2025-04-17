#![allow(non_snake_case)]
use icicle_runtime::stream::IcicleStream;
use libs::iotools::{SetupParams, SubcircuitInfo, SubcircuitR1CS};
use libs::field_structures::{Tau, from_r1cs_to_evaled_qap_mixture};
use libs::iotools::{read_global_wire_list_as_boxed_boxed_numbers};
use libs::vector_operations::gen_evaled_lagrange_bases;
use libs::group_structures::{Sigma1, Sigma};
use icicle_bls12_381::curve::{ScalarField as Field, CurveCfg, G2CurveCfg};
use icicle_core::traits::{Arithmetic, FieldImpl};
use icicle_core::ntt;
use icicle_core::curve::Curve;

use std::{vec, cmp};
use std::time::Instant;
use std::fs::File;
use std::io::Write;

fn main() {
    let start1 = Instant::now();
    
    // Generate random affine points on the elliptic curve (G1 and G2)
    println!("Generating random generator points...");
    let g1_gen = CurveCfg::generate_random_affine_points(1)[0];
    let g2_gen = G2CurveCfg::generate_random_affine_points(1)[0];
    
    // Generate a random secret parameter tau (x and y only, no z as per the paper)
    println!("Generating random tau parameter...");
    let tau = Tau::gen();
    
    // Load setup parameters from JSON file
    println!("Loading setup parameters...");
    let setup_file_name = "setupParams.json";
    let setup_params = SetupParams::from_path(setup_file_name).unwrap();

    // Extract key parameters from setup_params
    let m_d = setup_params.m_D; // Total number of wires
    let s_d = setup_params.s_D; // Number of subcircuits
    let n = setup_params.n;     // Number of constraints per subcircuit
    let s_max = setup_params.s_max; // The maximum number of placements.
    
    // Verify n is a power of two
    if !n.is_power_of_two() {
        panic!("n is not a power of two.");
    }
    
    // Additional wire-related parameters
    let l = setup_params.l;     // Number of public I/O wires
    let l_d = setup_params.l_D; // Number of interface wires
    
    if !(l.is_power_of_two() || l==0) {
        panic!("l is not a power of two.");
    }
    // let l_in = l / 2;  // Number of input wires

    // Verify s_max is a power of two
    if !s_max.is_power_of_two() {
        panic!("s_max is not a power of two.");
    }
    
    // The last wire-related parameter
    let m_i = l_d - l;
    
    // Verify m_I is a power of two
    if !m_i.is_power_of_two() {
        panic!("m_I is not a power of two.");
    }
    
    // Load subcircuit information
    println!("Loading subcircuit information...");
    let subcircuit_file_name = "subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(subcircuit_file_name).unwrap();

    // Load global wire list
    println!("Loading global wire list...");
    let global_wire_file_name = "globalWireList.json";
    let global_wire_list = read_global_wire_list_as_boxed_boxed_numbers(global_wire_file_name).unwrap();
    
    // ------------------- Generate Polynomial Evaluations -------------------
    let start = Instant::now();
    println!("Generating polynomial evaluations...");

    // Compute k_evaled_vec: Lagrange polynomial evaluations at τ.x of size m_I
    println!("Computing Lagrange polynomial evaluations (k_evaled_vec)...");
    let mut k_evaled_vec = vec![Field::zero(); m_i].into_boxed_slice();
    gen_evaled_lagrange_bases(&tau.x, m_i, &mut k_evaled_vec);

    // Compute l_evaled_vec: Lagrange polynomial evaluations at τ.y of size s_max
    println!("Computing Lagrange polynomial evaluations (l_evaled_vec)...");
    let mut l_evaled_vec = vec![Field::zero(); s_max].into_boxed_slice();
    gen_evaled_lagrange_bases(&tau.y, s_max, &mut l_evaled_vec);
    
    // Compute m_evaled_vec: Lagrange polynomial evaluations at τ.x of size l
    println!("Computing Lagrange polynomial evaluations (m_evaled_vec)...");
    let mut m_evaled_vec = vec![Field::zero(); l].into_boxed_slice();
    if l>0 {
        gen_evaled_lagrange_bases(&tau.x, l, &mut m_evaled_vec);
    }

    // Compute o_evaled_vec: Wire polynomial evaluations
    println!("Computing wire polynomial evaluations (o_evaled_vec)...");
    let mut o_evaled_vec = vec![Field::zero(); m_d].into_boxed_slice();

    {
        // Generate cached powers of τ.x for more efficient computation
        let mut x_evaled_lagrange_vec = vec![Field::zero(); n].into_boxed_slice();
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
                if !wire_val.eq(&Field::zero()) {
                    // nonzero_wires.push(global_idx);
                    o_evaled_vec[global_idx] = wire_val;
                }
            }
        }
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

    // Writing the sigma into JSON
    let start = Instant::now();
    println!("Writing the sigma into JSON...");
    let output_path = "setup/trusted-setup/output/combined_sigma.json";
    sigma.write_into_json(output_path).unwrap();
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