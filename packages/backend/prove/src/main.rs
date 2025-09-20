use std::path::PathBuf;
use std::time::{Duration, Instant};
use std::fs::File;
use std::io::Write;
use std::{env, process};
use prove::{Proof, ProveInputPaths, Prover, TranscriptManager};
use libs::utils::check_device;

fn main() {
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
    
    let prove_start = Instant::now();

    check_device();

    let mut timer: Instant;
    let mut lap: Duration;
    
    println!("Prover initialization...");
    timer = Instant::now();
    let (mut prover, binding) = Prover::init(&paths);
    lap = timer.elapsed();
    println!("Prover init time: {:.6} seconds", lap.as_secs_f64());

    // Initialize the transcript manager
    let mut manager = TranscriptManager::new();

    println!("Running prove0...");
    timer = Instant::now();
    let proof0 = prover.prove0();
    lap = timer.elapsed();
    println!("prove0 running time: {:.6} seconds", lap.as_secs_f64());

    // Use the manager to get thetas
    let thetas = proof0.verify0_with_manager(&mut manager);
        
    println!("Running prove1...");
    timer = Instant::now();
    let proof1 = prover.prove1(&thetas);
    lap = timer.elapsed();
    println!("prove1 running time: {:.6} seconds", lap.as_secs_f64());
    
    // Use the manager to get kappa0
    let kappa0 = proof1.verify1_with_manager(&mut manager);
    
    println!("Running prove2...");
    timer = Instant::now();
    let proof2 = prover.prove2(&thetas, kappa0);
    lap = timer.elapsed();
    println!("prove2 running time: {:.6} seconds", lap.as_secs_f64());

    // Use the manager to get chi and zeta
    let (chi, zeta) = proof2.verify2_with_manager(&mut manager);
    
    println!("Running prove3...");
    timer = Instant::now();
    let proof3 = prover.prove3(chi, zeta);
    lap = timer.elapsed();
    println!("prove3 running time: {:.6} seconds", lap.as_secs_f64());

    let kappa1 = proof3.verify3_with_manager(&mut manager);
    
    println!("Running prove4...");
    timer = Instant::now();
    let (proof4, proof4_test) = prover.prove4(&proof3, &thetas, kappa0, chi, zeta, kappa1);
    lap = timer.elapsed();
    println!("prove4 running time: {:.6} seconds", lap.as_secs_f64());

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

    println!("Total proving time: {:.6} seconds", prove_start.elapsed().as_secs_f64());
}