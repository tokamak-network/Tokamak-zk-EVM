use libs::tools::{Tau, SetupParams, SubcircuitInfo, MixedSubcircuitQAPEvaled};
use libs::tools::{read_json_as_boxed_boxed_numbers, gen_cached_pows};
use libs::group_structures::{SigmaB, SigmaV, SigmaAC, Sigma};
use icicle_bls12_381::curve::{ScalarField as Field, CurveCfg, G2CurveCfg};
use icicle_core::traits::{Arithmetic, FieldImpl};
use icicle_core::ntt;
use icicle_core::curve::Curve;

use std::vec;
use std::time::Instant;
use libs::s_max;
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
    let setup_path = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/setupParams.json";
    let setup_params = SetupParams::from_path(setup_path).unwrap();

    // Extract key parameters from setup_params
    let m_d = setup_params.m_D; // Total number of wires
    let s_d = setup_params.s_D; // Number of subcircuits
    let n = setup_params.n;     // Number of constraints per subcircuit
    
    // Verify n is a power of two
    if !n.is_power_of_two() {
        panic!("n is not a power of two.");
    }
    
    // Additional wire-related parameters
    let l = setup_params.l;     // Number of public I/O wires
    let l_d = setup_params.l_D; // Number of interface wires
    
    if l % 2 == 1 {
        panic!("l is not even.");
    }
    let l_in = l / 2;  // Number of input wires

    // Verify s_max is a power of two
    if !s_max.is_power_of_two() {
        panic!("s_max is not a power of two.");
    }
    
    // Calculate z domain length
    let z_dom_length = l_d - l;
    
    // Verify z domain length is a power of two
    if !z_dom_length.is_power_of_two() {
        panic!("l_D - l is not a power of two.");
    }

    // Load subcircuit information
    println!("Loading subcircuit information...");
    let subcircuit_path = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(subcircuit_path).unwrap();

    // Load global wire list
    println!("Loading global wire list...");
    let global_wire_path = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/globalWireList.json";
    let global_wire_list = read_json_as_boxed_boxed_numbers(global_wire_path).unwrap();
    
    // ------------------- Generate Polynomial Evaluations -------------------
    let start = Instant::now();
    println!("Generating polynomial evaluations...");

    // 1. Compute o_evaled_vec: Wire polynomial evaluations
    println!("Computing wire polynomial evaluations (o_evaled_vec)...");
    let mut o_evaled_vec = vec![Field::zero(); m_d].into_boxed_slice();
    let mut nonzero_wires = Vec::<usize>::new();

    {
        // Generate cached powers of τ.x for more efficient computation
        let mut cached_x_pows_vec = vec![Field::zero(); n].into_boxed_slice();
        gen_cached_pows(&tau.x, n, &mut cached_x_pows_vec);

        // Process each subcircuit
        for i in 0..s_d {
            println!("Processing subcircuit id {}", i);
            let r1cs_path = format!("/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/json/subcircuit{i}.json");

            // Evaluate QAP for the current subcircuit
            let evaled_qap = MixedSubcircuitQAPEvaled::from_r1cs_to_evaled_qap(
                &r1cs_path,
                &setup_params,
                &subcircuit_infos[i],
                &tau,
                &cached_x_pows_vec,
            );
            
            // Map local wire indices to global wire indices
            let flatten_map = &subcircuit_infos[i].flattenMap;

            // Store evaluations in o_evaled_vec using global wire indices
            for (j, local_idx) in evaled_qap.active_wires.iter().enumerate() {
                let global_idx = flatten_map[*local_idx];

                // Verify global wire list consistency with flatten map
                if (global_wire_list[global_idx][0] != subcircuit_infos[i].id) || 
                   (global_wire_list[global_idx][1] != *local_idx) {
                    panic!("GlobalWireList is not the inverse of flattenMap.");
                }

                let wire_val = evaled_qap.o_evals[j];

                // Record non-zero wire evaluations
                if !wire_val.eq(&Field::zero()) {
                    nonzero_wires.push(global_idx);
                    o_evaled_vec[global_idx] = wire_val;
                }
            }
        }
    }

    println!("Number of nonzero wires: {} out of {} total wires", nonzero_wires.len(), m_d);
    
    // 2. Compute l_evaled_vec: Lagrange polynomial evaluations at τ.y
    println!("Computing Lagrange polynomial evaluations (l_evaled_vec)...");
    let mut l_evaled_vec = vec![Field::zero(); s_max].into_boxed_slice();
    gen_cached_pows(&tau.y, s_max, &mut l_evaled_vec);
    
    // Based on the updated paper, we don't use tau.z anymore
    // Instead, we compute the k_evaled_vec and m_evaled_vec differently
    
    // 3. Compute k_evaled_vec for interpolation polynomials
    println!("Computing interpolation polynomial evaluations (k_evaled_vec)...");
    let mut k_evaled_vec = vec![Field::zero(); z_dom_length].into_boxed_slice();
    
    // Use an NTT root of unity approach for the interpolation
    let omega = ntt::get_root_of_unity::<Field>(z_dom_length as u64);
    let mut omega_pows = vec![Field::one(); z_dom_length];
    for i in 1..z_dom_length {
        omega_pows[i] = omega_pows[i-1] * omega;
    }
    
    // Evaluate interpolation polynomials at points defined by the setup parameters
    for i in 0..z_dom_length {
        // Initialize with identity element
        k_evaled_vec[i] = Field::one();
        
        // Compute product form of the interpolation polynomial
        for j in 0..z_dom_length {
            if i != j {
                let denominator = omega_pows[i] - omega_pows[j];
                let factor = denominator.inv();
                k_evaled_vec[i] = k_evaled_vec[i] * factor;
            }
        }
    }
    
    // 4. Compute m_evaled_vec for the M_i(x) polynomials
    println!("Computing M_i(x) polynomials (m_evaled_vec)...");
    let mut m_evaled_vec = vec![Field::zero(); z_dom_length].into_boxed_slice();
    
    // Precompute powers of omega up to l_d
    let mut omega_pows_vec = vec![Field::zero(); l_d];
    omega_pows_vec[0] = Field::one();
    for i in 1..l_d { 
        omega_pows_vec[i] = omega_pows_vec[i-1] * omega;
    }
    
    // Compute each M_i(x) evaluation according to the paper's definition
    for i in 0..z_dom_length {
        let j = i + l; // Shifted index
        let mut m_eval = Field::zero();

        for k in l..l_d {
            if j != k {
                // Calculate the contribution of each term to M_i(x)
                let wire_value = o_evaled_vec[k]; 
                let scale_factor = Field::from_u32((l_d - l) as u32).inv();
                
                // Compute barycentric weights and factors
                let numer = k_evaled_vec[j - l] * omega_pows_vec[k];
                let denom = omega_pows_vec[j] - omega_pows_vec[k];
                
                let denom_inv = denom.inv();
                
                // Add contribution to M_i(x)
                m_eval = m_eval + (wire_value * scale_factor * numer * denom_inv);
            }
        }
    }
    
    let duration = start.elapsed();
    println!("Polynomial evaluation computation time: {:.6} seconds", duration.as_secs_f64());

    // Generate sigma components using the computed polynomial evaluations
    println!("Generating sigma_kzg...");
    let start = Instant::now();

    // Generate SigmaB using the computed polynomial evaluations
    let sigma_b = SigmaB::gen(
        &setup_params,
        &tau,
        &o_evaled_vec,
        &l_evaled_vec,
        &k_evaled_vec,
        &m_evaled_vec,
        &g1_gen,
    );

    let lap = start.elapsed();
    println!("SigmaB generation time: {:.6} seconds", lap.as_secs_f64());

    println!("Generating sigma_ac...");
    let start = Instant::now();

    // Generate SigmaAC using setup parameters and tau
    let sigma_ac = SigmaAC::gen(
        &setup_params,
        &tau,
        &g1_gen,
    );

    let lap = start.elapsed();
    println!("SigmaAC generation time: {:.6} seconds", lap.as_secs_f64());

    println!("Generating sigam_v...");
    let start = Instant::now();

    // Generate SigmaTau (renamed from SigmaV in the code to match paper terminology)
    let sigma_v = SigmaV::gen(
        &tau,
        &g2_gen,
    );

    let lap = start.elapsed();
    println!("SigmaTau generation time: {:.6} seconds", lap.as_secs_f64());
    
    // Serialize the generated sigma components to JSON
    println!("Serializing combined sigma to compressed JSON...");
    
    let sigma = Sigma {
        sigma_ac,
        sigma_b,
        sigma_v,
    };
    
    let json_data = sigma.serialize();
    
    let output_path = "combined_sigma.json";
    let mut file = File::create(output_path)
        .expect("Failed to create output file");
    
    let json_string = serde_json::to_string_pretty(&json_data)
        .expect("Failed to serialize JSON");
    
    file.write_all(json_string.as_bytes())
        .expect("Failed to write to output file");
    
    println!("Combined sigma saved to {}", output_path);
    
    let total_duration = start1.elapsed();
    println!("Total setup time: {:.6} seconds", total_duration.as_secs_f64());
    
    // ------------------- read JSON file -------------------
    println!("\n----- Testing JSON deserialization -----");
    let read_start = Instant::now();
    
    println!("Reading from {}", output_path);
    
    match Sigma::from_file(output_path) {
        Ok(loaded_sigma) => {
            let read_duration = read_start.elapsed();
            println!("Successfully loaded sigma from file in {:.6} seconds", read_duration.as_secs_f64());
            
            println!("\nLoaded Sigma components summary:");
            println!("  - SigmaAC: {} xy_powers elements", loaded_sigma.sigma_ac.xy_powers.len());
            println!("  - SigmaB:");
            println!("      * gamma_inv_l_oj_mj: {} elements", loaded_sigma.sigma_b.gamma_inv_l_oj_mj.len());
            println!("      * eta_inv_li_ojl_ak_kj: {}x{} matrix", 
                    loaded_sigma.sigma_b.eta_inv_li_ojl_ak_kj.len(),
                    if loaded_sigma.sigma_b.eta_inv_li_ojl_ak_kj.len() > 0 { loaded_sigma.sigma_b.eta_inv_li_ojl_ak_kj[0].len() } else { 0 });
            println!("      * delta_inv_li_oj_prv: {}x{} matrix", 
                    loaded_sigma.sigma_b.delta_inv_li_oj_prv.len(),
                    if loaded_sigma.sigma_b.delta_inv_li_oj_prv.len() > 0 { loaded_sigma.sigma_b.delta_inv_li_oj_prv[0].len() } else { 0 });
            println!("      * delta_inv_ak_xh_tn: {} elements", loaded_sigma.sigma_b.delta_inv_ak_xh_tn.len());
            println!("      * delta_inv_ak_xi_tm: {} elements", loaded_sigma.sigma_b.delta_inv_ak_xi_tm.len());
            println!("      * delta_inv_ak_yi_ts: {} elements", loaded_sigma.sigma_b.delta_inv_ak_yi_ts.len());
            
            // Check first few elements of each component to verify they are valid
            if loaded_sigma.sigma_ac.xy_powers.len() > 0 {
                println!("\nSample values from SigmaAC:");
                println!("  First xy_power x: {}", loaded_sigma.sigma_ac.xy_powers[0].x);
                println!("  First xy_power y: {}", loaded_sigma.sigma_ac.xy_powers[0].y);
            }
            
            println!("\nSample values from SigmaB:");
            println!("  delta x: {}", loaded_sigma.sigma_b.delta.x);
            println!("  delta y: {}", loaded_sigma.sigma_b.delta.y);
            println!("  eta x: {}", loaded_sigma.sigma_b.eta.x);
            println!("  eta y: {}", loaded_sigma.sigma_b.eta.y);
            
            println!("\nSample values from SigmaV:");
            println!("  alpha x: {}", loaded_sigma.sigma_v.alpha.x);
            println!("  alpha y: {}", loaded_sigma.sigma_v.alpha.y);
            println!("  gamma x: {}", loaded_sigma.sigma_v.gamma.x);
            println!("  gamma y: {}", loaded_sigma.sigma_v.gamma.y);
            
            println!("\nJSON deserialization test completed successfully!");
        },
        Err(e) => {
            println!("Error loading sigma from file: {}", e);
        }
    }
    
    if let Ok(metadata) = std::fs::metadata(output_path) {
        let file_size = metadata.len();
        println!("\nJSON file size: {} bytes ({:.2} MB)", file_size, file_size as f64 / (1024.0 * 1024.0));
    }
}