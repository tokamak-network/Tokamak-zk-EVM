use libs::tools::{Tau, SetupParams, SubcircuitInfo, MixedSubcircuitQAPEvaled};
use libs::tools::{read_json_as_boxed_boxed_numbers, gen_cached_pows};
use libs::group_structures::{SigmaArithAndIP, SigmaCopy, SigmaVerify};
use icicle_bls12_381::curve::{ScalarField as Field, CurveCfg, G2CurveCfg};
use icicle_core::traits::{Arithmetic, FieldImpl};
use icicle_core::ntt;
use icicle_core::curve::Curve;

use std::vec;
use std::time::Instant;
use libs::s_max; 

fn main() {
    let start1 = Instant::now();
    // Generate random affine points on the elliptic curve (G1 and G2).
    let g1_gen = CurveCfg::generate_random_affine_points(1)[0];
    let g2_gen = G2CurveCfg::generate_random_affine_points(1)[0];
    
    // Generate a random secret parameter tau.
    let tau = Tau::gen();
    
    // Load setup parameters from a JSON file.
    // The setupParams JSON contains predefined circuit parameters (e.g., number of wires, subcircuits, domain size).
    let mut path: &str = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/setupParams.json";
    let setup_params = SetupParams::from_path(path).unwrap();

    // Extract key parameters from setup_params:
    let m_d = setup_params.m_D; // Total number of wires in the entire circuit (global wires across all subcircuits).
    let s_d = setup_params.s_D; // Number of subcircuits the circuit is divided into.
    let n   = setup_params.n;   // Number of points in the evaluation domain for polynomials (should be a power of two for FFT).

    if !n.is_power_of_two() {
        panic!("n is not a power of two.");
    }
    
    // Additional wire-related parameters from setup:
    let l   = setup_params.l;   // A parameter related to wire counts (context-specific; e.g., could be total wires per subcircuit or twice the number of input wires).
    let l_d = setup_params.l_D; // Another length parameter (perhaps an extended domain size or total wires including dummy wires for alignment).

    if l % 2 == 1 {
        panic!("l is not even.");
    }
    let l_in = l / 2;  // If l represents total wires of a certain kind, l_in could be half of them (e.g., number of input wires if outputs equal inputs).

    // Ensure s_max (maximum allowed value for something, e.g., max subcircuits or opcodes) is a power of two.
    if !s_max.is_power_of_two() {
        panic!("s_max is not a power of two.");
    }
    
    let z_dom_length = l_d - l;
    // Ensure that the difference (l_D - l) is also a power of two.
    // This could represent the size of an extended domain or padding (for example, extra zeros in polynomial evaluation domain).
    if !z_dom_length.is_power_of_two() {
        panic!("l_D - l is not a power of two.");
    }

    path = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/subcircuitInfo.json";
    // contains an array of SubcircuitInfo, each with data like subcircuit id, number of wires, and flattenMap (local-to-global wire mapping).
    let subcircuit_infos = SubcircuitInfo::from_path(path).unwrap();

    path = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/globalWireList.json";
    // It provides the inverse mapping of flattenMap, i.e., given a global wire index, you can find which subcircuit and local index it corresponds to.
    let globalWireList = read_json_as_boxed_boxed_numbers(path).unwrap();
    
    let start = Instant::now();

    // Build polynomial evaluations for each wire in the circuit.
    // We will evaluate each wire's corresponding polynomial (from the QAP) at the secret value tau.x,
    // and collect these evaluations in a global vector.
    let mut o_evaled_vec = vec![Field::zero(); m_d].into_boxed_slice();
    // o_evaled_vec will hold the evaluated polynomial value for each global wire (initialized to 0 for all m_d wires).
    let mut nonzero_wires = Vec::<usize>::new();
    // nonzero_wires will store the indices of wires that have a non-zero polynomial evaluation (for potential optimization in later steps).

    {
        let mut cached_x_pows_vec = vec![Field::zero(); n].into_boxed_slice();
        gen_cached_pows(&tau.x, n, &mut cached_x_pows_vec);
        // Precompute powers of tau.x up to x^(n-1), stored in cached_x_pows_vec.
        // After this, cached_x_pows_vec[i] == (tau.x)^i for 0 <= i < n.
        // This will be used to quickly evaluate Lagrange or monomial polynomials at tau.x without repeated exponentiation.

        for i in 0..s_d {
            println!("Processing subcircuit id {:?}", i);
            let _path = format!("/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/json/subcircuit{i}.json");

            // Evaluate the QAP (Quadratic Arithmetic Program) for the given subcircuit using its R1CS.
            let evaled_qap = MixedSubcircuitQAPEvaled::from_r1cs_to_evaled_qap(
                &_path,
                &setup_params,
                &subcircuit_infos[i],
                &tau,
                &cached_x_pows_vec,
            );
            // reads the R1CS from the JSON file,
            // then compute the QAP polynomial evaluations.
            // returns an object with evaluated QAP data, including the values of each wire's polynomial at tau.x.
            
            // flatten_map is a vector mapping local wire indices (in this subcircuit) to global wire indices (in the full circuit).
            let flatten_map = &subcircuit_infos[i].flattenMap;

            // Iterate over all active wires in this subcircuit and record their polynomial evaluations.
            for (j, local_idx) in evaled_qap.active_wires.iter().enumerate() {
                let global_idx = flatten_map[*local_idx];
                // Map the local wire index (within subcircuit i) to the global wire index in the overall circuit.

                // Ensure consistency between the global wire list and the flatten_map mapping.
                // The globalWireList at position global_idx should match this subcircuit and local index.
                if (globalWireList[global_idx][0] != subcircuit_infos[i].id) || (globalWireList[global_idx][1] != *local_idx) {
                    panic!("GlobalWireList is not the inverse of flattenMap.");
                }

                let wire_val = evaled_qap.o_evals[j];
                // wire_val is the evaluated polynomial value for this wire at tau.x (from the QAP evaluation results).
                // If the wire's polynomial is zero everywhere, this will be 0; otherwise it's the specific field element result.

                if !wire_val.eq(&Field::zero()) {
                    // If the polynomial evaluation is non-zero (the wire carries a non-zero value in the witness):
                    nonzero_wires.push(global_idx);
                    // record the global index of this wire in the list of non-zero wires,
                    o_evaled_vec[global_idx] = wire_val;
                    // and store the evaluated value in the global output vector at the corresponding index.
                }
                // If wire_val is zero, we do nothing (o_evaled_vec remains zero by default),
                // effectively skipping inactive or zero-contribution wires to save space and computation.
            }
        }
    }

    println!("Number of nonzero wires: {:?} out of {:?} total wires", nonzero_wires.len(), m_d);

    // Build Lagrange polynomials L_i(y) for i in [0..s_max-1]
    // and interpolation polynomials K_i(z) for i in [0..l_D-1].
    
    // Allocate memory for Lagrange polynomial evaluations
    let mut l_evaled_vec = vec![Field::zero(); s_max].into_boxed_slice();
    // Compute and store Lagrange basis polynomial evaluations at τ.y
    gen_cached_pows(&tau.y, s_max, &mut l_evaled_vec);
    // This computes and caches [1, τ.y, (τ.y)^2, ..., (τ.y)^(s_max-1)]
    // These values will be used for subcircuit-specific polynomial operations.

    // Allocate memory for interpolation polynomial evaluations
    let mut k_evaled_vec = vec![Field::zero(); z_dom_length].into_boxed_slice();
    // Compute and store interpolation polynomial evaluations at τ.z
    gen_cached_pows(&tau.z, z_dom_length, &mut k_evaled_vec);
    // This precomputes [1, τ.z, (τ.z)^2, ..., (τ.z)^(z_dom_length-1)]
    // Used for interpolating constraints involving the z-domain.

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
        // The omega_pows_vec[i] stores ω^i for efficient NTT-based evaluations.

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

    // Generate Sigma proofs
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
    
    // Generate the Sigma proof for Copy Constraints
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

    // Generate the Sigma proof for Verification Constraints
    let sigma_v = SigmaVerify::gen(
        &setup_params, // Circuit setup parameters
        &tau,          // Secret randomness τ
        &o_evaled_vec, // Evaluated output polynomials
        &k_evaled_vec, // Evaluated interpolation polynomials
        &g2_gen,       // Generator point in G2
    );

    let lap = start.elapsed();
    println!("Done! Elapsed time: {:.6} seconds", lap.as_secs_f64());

    let duration1 = start1.elapsed();
    println!("Total time: {:.6} seconds", duration1.as_secs_f64());
}

