#![allow(non_snake_case)]

use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use libs::field_structures::{from_r1cs_to_evaled_qap_mixture, Tau};
use libs::group_structures::{PartialSigma1, SigmaPreprocess};
use libs::iotools::read_global_wire_list_as_boxed_boxed_numbers;
use libs::iotools::{SetupParams, SubcircuitInfo, SubcircuitR1CS};
use libs::utils::{
    init_ntt_domain, setup_shape, trusted_setup_ntt_domain_size, validate_public_wire_size,
    validate_setup_shape,
};
use libs::vector_operations::gen_evaled_lagrange_bases;
use mpc_setup::conversions::{icicle_g1_generator, icicle_g2_generator};
use mpc_setup::sigma::{save_contributor_info, SigmaV2, HASH_BYTES_LEN};
use mpc_setup::utils::load_gpu_if_possible;
use mpc_setup::{compute_lagrange_kl, ensure_testing_mode, QAP_COMPILER_PATH_PREFIX};
use std::time::Instant;
use std::{env, vec};

//cargo run --release --bin phase2_testing_prepare
fn main() {
    ensure_testing_mode("phase2_testing_prepare");

    let base_path = env::current_dir().unwrap();
    let qap_path = base_path.join(QAP_COMPILER_PATH_PREFIX);

    let use_gpu: bool = env::var("USE_GPU")
        .ok()
        .and_then(|v| v.parse::<bool>().ok())
        .unwrap_or(false); // default to false
    if use_gpu {
        let _ = load_gpu_if_possible();
    }
    let start = Instant::now();

    // Generate random affine points on the elliptic curve (G1 and G2)
    let g1_gen = icicle_g1_generator(); //CurveCfg::generate_random_affine_points(1)[0];
    let g2_gen = icicle_g2_generator().0; // G2CurveCfg::generate_random_affine_points(1)[0];

    // Generate a random secret parameter tau (x and y only, no z as per the paper)
    let mut tau = Tau::gen();
    tau.x = ScalarField::from_u32(3);
    tau.y = ScalarField::from_u32(5);
    tau.alpha = ScalarField::from_u32(7);
    tau.delta = ScalarField::from_u32(1);
    tau.gamma = ScalarField::from_u32(1);
    tau.eta = ScalarField::from_u32(1);

    // Load setup parameters from JSON file
    let setup_file_name = "setupParams.json";
    let setup_params = SetupParams::read_from_json(qap_path.join(setup_file_name)).unwrap();
    let shape = setup_shape(&setup_params);
    validate_setup_shape(&shape);
    validate_public_wire_size(shape.l_free);
    let ntt_domain_size = trusted_setup_ntt_domain_size(&shape);
    init_ntt_domain(ntt_domain_size);

    // Extract key parameters from setup_params
    let m_d = setup_params.m_D; // Total number of wires
    let s_d = setup_params.s_D; // Number of subcircuits
    let n = setup_params.n; // Number of constraints per subcircuit
    let s_max = setup_params.s_max; // The maximum number of placements.
                                    // Additional wire-related parameters
    let l = setup_params.l; // Number of public I/O wires
    let l_free = setup_params.l_free;
    let l_d = setup_params.l_D; // Number of interface wires
                                // The last wire-related parameter
    let m_i = l_d - l;
    println!(
        "Testing setup: n={}, s_max={}, l={}, l_free={}, m_i={}, m_d={}",
        n, s_max, l, l_free, m_i, m_d
    );

    // Load subcircuit information
    let subcircuit_file_name = "subcircuitInfo.json";
    let subcircuit_infos =
        SubcircuitInfo::read_box_from_json(qap_path.join(subcircuit_file_name)).unwrap();

    // Load global wire list
    let global_wire_file_name = "globalWireList.json";
    let global_wire_list =
        read_global_wire_list_as_boxed_boxed_numbers(qap_path.join(global_wire_file_name)).unwrap();

    // ------------------- Generate Polynomial Evaluations -------------------

    // Compute k_evaled_vec: Lagrange polynomial evaluations at τ.x of size m_I
    let mut k_evaled_vec = vec![ScalarField::zero(); m_i].into_boxed_slice();
    gen_evaled_lagrange_bases(&tau.x, m_i, &mut k_evaled_vec);

    // Compute l_evaled_vec: Lagrange polynomial evaluations at τ.y of size s_max
    let mut l_evaled_vec = vec![ScalarField::zero(); s_max].into_boxed_slice();
    gen_evaled_lagrange_bases(&tau.y, s_max, &mut l_evaled_vec);

    // Compute m_evaled_vec: Lagrange polynomial evaluations at τ.x of size l_free
    let mut m_evaled_vec = vec![ScalarField::zero(); l_free].into_boxed_slice();
    if l_free > 0 {
        gen_evaled_lagrange_bases(&tau.x, l_free, &mut m_evaled_vec);
    }

    // Compute o_evaled_vec: Wire polynomial evaluations
    let mut o_evaled_vec = vec![ScalarField::zero(); m_d].into_boxed_slice();

    {
        // Generate cached powers of τ.x for more efficient computation
        let mut x_evaled_lagrange_vec = vec![ScalarField::zero(); n].into_boxed_slice();
        gen_evaled_lagrange_bases(&tau.x, n, &mut x_evaled_lagrange_vec);
        // Process each subcircuit
        for i in 0..s_d {
            if i % 4 == 0 || i + 1 == s_d {
                println!("Evaluating subcircuits: {}/{}", i + 1, s_d);
            }
            let r1cs_path: String = format!("json/subcircuit{i}.json");

            // Evaluate QAP for the current subcircuit
            let compact_r1cs = SubcircuitR1CS::from_path(
                qap_path.join(r1cs_path),
                &setup_params,
                &subcircuit_infos[i],
            )
            .unwrap();
            let o_evaled = from_r1cs_to_evaled_qap_mixture(
                &compact_r1cs,
                &setup_params,
                &subcircuit_infos[i],
                &tau,
                &x_evaled_lagrange_vec,
            );

            // Map local wire indices to global wire indices
            let flatten_map = &subcircuit_infos[i].flattenMap;

            // Store evaluations in o_evaled_vec using global wire indices
            for local_idx in 0..subcircuit_infos[i].Nwires {
                let global_idx = flatten_map[local_idx];

                // Verify global wire list consistency with flatten map
                if (global_wire_list[global_idx][0] != subcircuit_infos[i].id)
                    || (global_wire_list[global_idx][1] != local_idx)
                {
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

    let duration = start.elapsed();
    println!(
        "Polynomial evaluations completed in {:.2} seconds",
        duration.as_secs_f64()
    );

    // Generate sigma components using the computed polynomial evaluations
    let sigma = SigmaV2::gen(
        &setup_params,
        &tau,
        &o_evaled_vec,
        &l_evaled_vec,
        &k_evaled_vec,
        &m_evaled_vec,
        &g1_gen.0,
        &g2_gen,
    );

    let lagrange_kl = compute_lagrange_kl(
        &SigmaPreprocess {
            sigma_1: PartialSigma1 {
                xy_powers: sigma.sigma.sigma_1.xy_powers.clone(),
                gamma_inv_o_inst: sigma.sigma.sigma_1.gamma_inv_o_inst.clone(),
            },
        },
        &setup_params,
    );

    assert_eq!(sigma.sigma.lagrange_KL, lagrange_kl);

    // Writing the sigma into JSON
    println!("Writing testing sigma...");
    sigma
        .write_into_json("setup/mpc-setup/output/phase2_acc_0.json")
        .unwrap();
    //  sigma
    //     .write_into_json_for_verify(base_path.join("setup/mpc-setup/output/sigma_verify.json"))
    //     .unwrap();
    // sigma
    //     .write_into_json_for_preprocess(
    //         base_path.join("setup/mpc-setup/output/sigma_preprocess.json"),
    //     )
    //    .unwrap();
    let lap = start.elapsed();
    println!("Testing sigma written in {:.2} seconds", lap.as_secs_f64());

    save_contributor_info(
        &sigma,
        start.elapsed(),
        "Phase2 Trusted Prepare",
        "UK",
        format!("{}/phase2_contributor_0.txt", "setup/mpc-setup/output"),
        hex::encode([0u8; HASH_BYTES_LEN]),
        hex::encode([0u8; HASH_BYTES_LEN]),
        hex::encode([0u8; HASH_BYTES_LEN]),
    )
    .expect("cannot write contributor info");
    println!(
        "Testing prepare completed in {:.2} seconds",
        start.elapsed().as_secs_f64()
    );
}
