use libs::tools::{Tau, SetupParams, SubcircuitInfo, MixedSubcircuitQAPEvaled};
use libs::tools::{read_json_as_boxed_boxed_numbers, gen_cached_pows};
use libs::group_structures::{SigmaArithAndIP, SigmaCopy, SigmaVerify, Sigma};
use icicle_bls12_381::curve::{ScalarField as Field, CurveCfg, G2CurveCfg, G1Affine, G2Affine};
use icicle_core::traits::{Arithmetic, FieldImpl};
use icicle_core::ntt;
use icicle_core::curve::Curve;

use std::vec;
use std::time::Instant;
use libs::s_max;
use std::fs::File;
use std::io::Write;
use serde_json::{Value, json, Map};

fn main() {
    let start1 = Instant::now();
    // Generate random affine points on the elliptic curve (G1 and G2).
    let g1_gen = CurveCfg::generate_random_affine_points(1)[0];
    let g2_gen = G2CurveCfg::generate_random_affine_points(1)[0];
    
    // Generate a random secret parameter tau.
    let tau = Tau::gen();
    
    // Load setup parameters from a JSON file.
    let mut path: &str = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/setupParams.json";
    let setup_params = SetupParams::from_path(path).unwrap();

    // Extract key parameters from setup_params:
    let m_d = setup_params.m_D; 
    let s_d = setup_params.s_D; 
    let n   = setup_params.n;   

    if !n.is_power_of_two() {
        panic!("n is not a power of two.");
    }
    
    // Additional wire-related parameters from setup:
    let l   = setup_params.l;   
    let l_d = setup_params.l_D; 

    if l % 2 == 1 {
        panic!("l is not even.");
    }
    let _l_in = l / 2;  // 변수명 앞에 _ 추가하여 경고 제거

    // Ensure s_max (maximum allowed value for something, e.g., max subcircuits or opcodes) is a power of two.
    if !s_max.is_power_of_two() {
        panic!("s_max is not a power of two.");
    }
    
    let z_dom_length = l_d - l;
    // Ensure that the difference (l_D - l) is also a power of two.
    if !z_dom_length.is_power_of_two() {
        panic!("l_D - l is not a power of two.");
    }

    path = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(path).unwrap();

    path = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/globalWireList.json";
    let globalWireList = read_json_as_boxed_boxed_numbers(path).unwrap();
    
    let start = Instant::now();

    // Build polynomial evaluations for each wire in the circuit.
    let mut o_evaled_vec = vec![Field::zero(); m_d].into_boxed_slice();
    let mut nonzero_wires = Vec::<usize>::new();

    {
        let mut cached_x_pows_vec = vec![Field::zero(); n].into_boxed_slice();
        gen_cached_pows(&tau.x, n, &mut cached_x_pows_vec);

        for i in 0..s_d {
            println!("Processing subcircuit id {:?}", i);
            let _path = format!("/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/json/subcircuit{i}.json");

            let evaled_qap = MixedSubcircuitQAPEvaled::from_r1cs_to_evaled_qap(
                &_path,
                &setup_params,
                &subcircuit_infos[i],
                &tau,
                &cached_x_pows_vec,
            );
            
            let flatten_map = &subcircuit_infos[i].flattenMap;

            for (j, local_idx) in evaled_qap.active_wires.iter().enumerate() {
                let global_idx = flatten_map[*local_idx];

                if (globalWireList[global_idx][0] != subcircuit_infos[i].id) || (globalWireList[global_idx][1] != *local_idx) {
                    panic!("GlobalWireList is not the inverse of flattenMap.");
                }

                let wire_val = evaled_qap.o_evals[j];

                if !wire_val.eq(&Field::zero()) {
                    nonzero_wires.push(global_idx);
                    o_evaled_vec[global_idx] = wire_val;
                }
            }
        }
    }

    println!("Number of nonzero wires: {:?} out of {:?} total wires", nonzero_wires.len(), m_d);
    
    // Allocate memory for Lagrange polynomial evaluations
    let mut l_evaled_vec = vec![Field::zero(); s_max].into_boxed_slice();
    // Compute and store Lagrange basis polynomial evaluations at τ.y
    gen_cached_pows(&tau.y, s_max, &mut l_evaled_vec);

    // Allocate memory for interpolation polynomial evaluations
    let mut k_evaled_vec = vec![Field::zero(); z_dom_length].into_boxed_slice();
    // Compute and store interpolation polynomial evaluations at τ.z
    gen_cached_pows(&tau.z, z_dom_length, &mut k_evaled_vec);
    
    // Build the M_i(x, z) polynomials for i in [l .. l_D]
    let mut m_evaled_vec = vec![Field::zero(); z_dom_length].into_boxed_slice();
    {
        // Get the NTT (Number-Theoretic Transform) root of unity for z-domain length.
        let omega = ntt::get_root_of_unity::<Field>(z_dom_length as u64);
        
        // Precompute powers of omega up to l_d
        let mut omega_pows_vec = vec![Field::zero(); l_d];
        for i in 1..l_d { 
            omega_pows_vec[i] = omega_pows_vec[i-1] * omega;
        }

        // Compute each M_i(x, z) evaluation
        for i in 0..z_dom_length {
            let j = i + l; // Shifted index
            let mut m_eval = Field::zero();

            for k in l .. l_d {
                if j != k {
                    // Compute factor1 = (o_evaled_vec[k] / (l_D - l))
                    let factor1 = o_evaled_vec[k] * Field::from_u32((l_d - l) as u32).inv();

                    // Compute factor2 using precomputed ω and K_i(z)
                    let factor2_term1 = omega_pows_vec[k] * k_evaled_vec[j - l];
                    let factor2_term2 = omega_pows_vec[j] * k_evaled_vec[i];
                    let factor2 = (factor2_term1 + factor2_term2) * (omega_pows_vec[j] - omega_pows_vec[k]).inv();

                    // Accumulate the computed term
                    m_eval = m_eval + factor1 * factor2;
                }
            }
            // Store the computed M_i(x, z) evaluation
            m_evaled_vec[i] = m_eval;
        }
    }
    
    let duration = start.elapsed();
    println!("Loading and eval time: {:.6} seconds", duration.as_secs_f64());

    println!("Generating sigma_A,I...");
    let start = Instant::now();

    // Generate the Sigma proof for Arithmetic & Inner Product arguments
    let sigma_ai = SigmaArithAndIP::gen(
        &setup_params, // Circuit setup parameters
        &tau,          // Secret randomness τ
        &o_evaled_vec, // Evaluated output polynomials
        &m_evaled_vec, // Evaluated M polynomials
        &l_evaled_vec, // Evaluated Lagrange polynomials
        &k_evaled_vec, // Evaluated interpolation polynomials
        &g1_gen,       // Generator point in G1
    );
    
    let lap = start.elapsed();
    println!("Done! Elapsed time: {:.6} seconds", lap.as_secs_f64());

    println!("Generating sigma_C...");
    let start = Instant::now();
    
    let sigma_c = SigmaCopy::gen(
        &setup_params, // Circuit setup parameters
        &tau,          // Secret randomness τ
        &l_evaled_vec, // Evaluated Lagrange polynomials
        &k_evaled_vec, // Evaluated interpolation polynomials
        &g1_gen,       // Generator point in G1
    );

    let lap = start.elapsed();
    println!("Done! Elapsed time: {:.6} seconds", lap.as_secs_f64());

    println!("Generating sigma_V...");
    let start = Instant::now();

    let sigma_v = SigmaVerify::gen(
        &setup_params, // Circuit setup parameters
        &tau,          // Secret randomness τ
        &o_evaled_vec, // Evaluated output polynomials
        &k_evaled_vec, // Evaluated interpolation polynomials
        &g2_gen,       // Generator point in G2
    );

    let lap = start.elapsed();
    println!("Done! Elapsed time: {:.6} seconds", lap.as_secs_f64());
    
    println!("Generating json file...");
    let start = Instant::now();
    let json_data = json!({
        "sigma_ai": SigmaArithAndIP::serialize_sigma_ai(&sigma_ai),
        "sigma_c": SigmaCopy::serialize_sigma_c(&sigma_c),
        "sigma_v": SigmaVerify::serialize_sigma_v(&sigma_v)
    });
    
    let _sigma = Sigma {
        sigma_ai: sigma_ai,
        sigma_c: sigma_c,
        sigma_v: sigma_v,
    };
    
    println!("Serializing combined sigma to JSON...");
    
    let output_path = "combined_sigma.json";
    let mut file = File::create(output_path)
        .expect("Failed to create output file");
    
    let json_string = serde_json::to_string_pretty(&json_data)
        .expect("Failed to serialize JSON");
    
    file.write_all(json_string.as_bytes())
        .expect("Failed to write to output file");
    
    println!("Combined sigma saved to {}", output_path);
    let lap = start.elapsed();
    println!("Done! Elapsed time: {:.6} seconds", lap.as_secs_f64());
    
    let duration1 = start1.elapsed();
    println!("Total time: {:.6} seconds", duration1.as_secs_f64());
}