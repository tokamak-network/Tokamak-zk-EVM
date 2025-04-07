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


fn g1_affine_to_compressed_json(point: &G1Affine) -> Value {
    // if point.is_infinity() {
    //     return json!("infinity");
    // }

    let x_str = point.x.to_string();

    let is_y_positive = is_y_coordinate_positive(point);
    
    json!({
        "x": x_str,
        "is_y_positive": is_y_positive
    })
}

fn g2_affine_to_compressed_json(point: &G2Affine) -> Value {
    // if point.is_infinity() {
    //     return json!("infinity");
    // }
    
    let x = point.x.to_string();
    
    let is_y_positive = is_g2_y_coordinate_positive(point);
    
    json!({
        "x": x,
        "is_y_positive": is_y_positive
    })
}

fn is_y_coordinate_positive(point: &G1Affine) -> bool {
    let y_bytes = point.y.to_bytes_le();
    (y_bytes[0] & 1) == 0 
}

fn is_g2_y_coordinate_positive(point: &G2Affine) -> bool {
    let y = point.y.to_bytes_le();
    
    (y[0] & 1) == 0
}

fn g1_affine_array_to_compressed_json(array: &Box<[G1Affine]>) -> Value {
    let mut json_array = Vec::new();
    for point in array.iter() {
        json_array.push(g1_affine_to_compressed_json(point));
    }
    Value::Array(json_array)
}

fn g2_affine_array_to_compressed_json(array: &Box<[G2Affine]>) -> Value {
    let mut json_array = Vec::new();
    for point in array.iter() {
        json_array.push(g2_affine_to_compressed_json(point));
    }
    Value::Array(json_array)
}

fn g1_affine_2d_array_to_compressed_json(array: &Box<[Box<[G1Affine]>]>) -> Value {
    let mut json_array = Vec::new();
    for row in array.iter() {
        json_array.push(g1_affine_array_to_compressed_json(row));
    }
    Value::Array(json_array)
}

fn g2_affine_2d_array_to_compressed_json(array: &Box<[Box<[G2Affine]>]>) -> Value {
    let mut json_array = Vec::new();
    for row in array.iter() {
        json_array.push(g2_affine_array_to_compressed_json(row));
    }
    Value::Array(json_array)
}

// SigmaArithAndIP 구조체를 압축 형태의 JSON으로 변환
fn serialize_sigma_ai_compressed(sigma: &SigmaArithAndIP) -> Value {
    json!({
        "alpha": g1_affine_to_compressed_json(&sigma.alpha),
        "xy_hi": g1_affine_array_to_compressed_json(&sigma.xy_hi),
        "gamma_l_o_pub_j": g1_affine_array_to_compressed_json(&sigma.gamma_l_o_pub_j),
        "eta1_l_o_inter_ij": g1_affine_2d_array_to_compressed_json(&sigma.eta1_l_o_inter_ij),
        "delta_l_o_prv_ij": g1_affine_2d_array_to_compressed_json(&sigma.delta_l_o_prv_ij),
        "eta0_l_o_ip_first_ij": g1_affine_2d_array_to_compressed_json(&sigma.eta0_l_o_ip_first_ij),
        "eta0_l_m_tz_ip_second_ij": g1_affine_2d_array_to_compressed_json(&sigma.eta0_l_m_tz_ip_second_ij),
        "delta_xy_tx_hi": g1_affine_array_to_compressed_json(&sigma.delta_xy_tx_hi),
        "delta_xy_ty_hi": g1_affine_array_to_compressed_json(&sigma.delta_xy_ty_hi)
    })
}

// SigmaCopy 구조체를 압축 형태의 JSON으로 변환
fn serialize_sigma_c_compressed(sigma: &SigmaCopy) -> Value {
    json!({
        "mu_l_k_ij": g1_affine_array_to_compressed_json(&sigma.mu_l_k_ij),
        "nu_yz_ty_ij": g1_affine_array_to_compressed_json(&sigma.nu_yz_ty_ij),
        "nu_yz_tz_ij": g1_affine_array_to_compressed_json(&sigma.nu_yz_tz_ij),
        "psi0_kappa_0_yz_ij": g1_affine_array_to_compressed_json(&sigma.psi0_kappa_0_yz_ij),
        "psi0_kappa_1_yz_ij": g1_affine_array_to_compressed_json(&sigma.psi0_kappa_1_yz_ij),
        "psi1_z_j": g1_affine_array_to_compressed_json(&sigma.psi1_z_j),
        "psi2_kappa_2_yz_ij": g1_affine_array_to_compressed_json(&sigma.psi2_kappa_2_yz_ij),
        "psi3_kappa_1_z_j": g1_affine_array_to_compressed_json(&sigma.psi3_kappa_1_z_j),
        "psi3_kappa_2_z_j": g1_affine_array_to_compressed_json(&sigma.psi3_kappa_2_z_j)
    })
}

// SigmaVerify 구조체를 압축 형태의 JSON으로 변환
fn serialize_sigma_v_compressed(sigma: &SigmaVerify) -> Value {
    json!({
        "beta": g2_affine_to_compressed_json(&sigma.beta),
        "gamma": g2_affine_to_compressed_json(&sigma.gamma),
        "delta": g2_affine_to_compressed_json(&sigma.delta),
        "eta1": g2_affine_to_compressed_json(&sigma.eta1),
        "mu_eta0": g2_affine_to_compressed_json(&sigma.mu_eta0),
        "mu_eta1": g2_affine_to_compressed_json(&sigma.mu_eta1),
        "xy_hi": g2_affine_array_to_compressed_json(&sigma.xy_hi),
        "mu_comb_o_inter": g2_affine_to_compressed_json(&sigma.mu_comb_o_inter),
        "mu_3_nu": g2_affine_to_compressed_json(&sigma.mu_3_nu),
        "mu_4_kappa_i": g2_affine_array_to_compressed_json(&sigma.mu_4_kappa_i),
        "mu_3_psi0_yz_ij": g2_affine_2d_array_to_compressed_json(&sigma.mu_3_psi0_yz_ij),
        "mu_3_psi1_yz_ij": g2_affine_2d_array_to_compressed_json(&sigma.mu_3_psi1_yz_ij),
        "mu_3_psi2_yz_ij": g2_affine_2d_array_to_compressed_json(&sigma.mu_3_psi2_yz_ij),
        "mu_3_psi3_yz_ij": g2_affine_2d_array_to_compressed_json(&sigma.mu_3_psi3_yz_ij)
    })
}

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
    
    // 세 시그마 객체를 압축된 JSON으로 변환
    println!("Serializing combined sigma to compressed JSON...");
    
    let json_data = json!({
        "sigma_ai": serialize_sigma_ai_compressed(&sigma_ai),
        "sigma_c": serialize_sigma_c_compressed(&sigma_c),
        "sigma_v": serialize_sigma_v_compressed(&sigma_v)
    });
    
    // 파일에 저장
    let output_path = "combined_sigma_compressed.json";
    let mut file = File::create(output_path)
        .expect("Failed to create output file");
    
    let json_string = serde_json::to_string_pretty(&json_data)
        .expect("Failed to serialize JSON");
    
    file.write_all(json_string.as_bytes())
        .expect("Failed to write to output file");
    
    println!("Combined sigma saved to {}", output_path);
    
    let duration1 = start1.elapsed();
    println!("Total time: {:.6} seconds", duration1.as_secs_f64());
}