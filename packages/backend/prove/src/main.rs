use std::path::PathBuf;
use std::{env, process};
use std::time::Instant;
use prove::{Proof, ProveInputPaths, Prover, TranscriptManager};
use libs::utils::check_device;

fn main() {
    let total_start = Instant::now();
    let args: Vec<String> = env::args().collect();

    if args.len() != 5 {
        eprintln!(
            "Usage: {} <QAP_PATH> <SYNTHESIZER_PATH> <SETUP_PATH> <OUT_PATH> ",
            args[0]
        );
        process::exit(1);
    }

    let paths = ProveInputPaths {
        qap_path: &args[1],
        synthesizer_path: &args[2],
        setup_path: &args[3],
        output_path: &args[4],
    };
    
    check_device();
    
    println!("Prover initialization...");
    let (mut prover, binding) = Prover::init(&paths);

    // Initialize the transcript manager
    let mut manager = TranscriptManager::new();

    println!("Running prove0...");
    let proof0 = prover.prove0();

    // Use the manager to get thetas
    let thetas = proof0.verify0_with_manager(&mut manager);
        
    println!("Running prove1...");
    let proof1 = prover.prove1(&thetas);
    
    // Use the manager to get kappa0
    let kappa0 = proof1.verify1_with_manager(&mut manager);
    
    println!("Running prove2...");
    let proof2 = prover.prove2(&thetas, kappa0);

    // Use the manager to get chi and zeta
    let (chi, zeta) = proof2.verify2_with_manager(&mut manager);
    
    println!("Running prove3...");
    let proof3 = prover.prove3(chi, zeta);

    let kappa1 = proof3.verify3_with_manager(&mut manager);
    
    println!("Running prove4...");
    let (proof4, proof4_test) = prover.prove4(&proof3, &thetas, kappa0, chi, zeta, kappa1);
    #[cfg(not(feature = "testing-mode"))]
    let _ = &proof4_test;

    // // Create the challenge struct
    // let challenge = Challenge {
    //     thetas: thetas.into_boxed_slice(),
    //     chi,
    //     zeta,
    //     kappa0,
    //     kappa1,
    // };

    // // Convert to serializable version
    // let challenge_serde = ChallengeSerde::from(challenge);
    
    let proof = Proof {
        binding, 
        proof0, 
        proof1, 
        proof2, 
        proof3, 
        proof4,
        // challenge: challenge_serde,
    };
    
    // println!("Writing the proof into JSON (old format)...");
    // let output_path = "prove/output/proof.json";
    // proof.write_into_json(output_path).unwrap();

    println!("Writing the proof into JSON (formatted for Solidity verifier)...");
    let formatted_proof = proof.convert_format_for_solidity_verifier();
    let output_path = PathBuf::from(paths.output_path).join("proof.json");
    formatted_proof.write_into_json(output_path).unwrap();

    #[cfg(feature = "testing-mode")] {
        let test_output_path = PathBuf::from(paths.output_path).join("proof4_test.json");
        proof4_test.write_into_json(test_output_path).unwrap();

        println!("kappa1: {}", kappa1.to_string());
        println!("chi: {}", chi.to_string());
    }

    let total_elapsed_secs = total_start.elapsed().as_secs_f64();
    println!(
        "Prove completed. Total elapsed time: {:.3}s ({:.0} ms)",
        total_elapsed_secs,
        total_elapsed_secs * 1000.0
    );
}
