use std::time::{Duration, Instant};
use prove::{Prover, Proof, TranscriptManager, Challenge, ChallengeSerde};

fn main() {
    let prove_start = Instant::now();
    
    let mut timer: Instant;
    let mut lap: Duration;
    
    println!("Prover initialization...");
    timer = Instant::now();
    let (mut prover, binding) = Prover::init();
    lap = timer.elapsed();
    println!("Prover init time: {:.6} seconds", lap.as_secs_f64());

    // Get preprocessed commitments (s0 and s1)
    let (s0_commitment, s1_commitment) = prover.get_preprocessed_commitments();
    
    // Get public inputs from instance.json
    let public_inputs = prover.get_public_inputs_from_instance();
    
    // Get smax from setup parameters
    let smax = prover.setup_params.s_max as u64;

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

    // Use the manager to get kappa1 and kappa2
    let kappa1 = proof3.verify3_with_manager(&mut manager);
    let kappa2 = manager.get_kappa2();
    
    println!("Running prove4...");
    timer = Instant::now();
    let (proof4, proof4_test) = prover.prove4(&proof3, &thetas, kappa0, chi, zeta, kappa1);
    lap = timer.elapsed();
    println!("prove4 running time: {:.6} seconds", lap.as_secs_f64());

    // Create the challenge struct
    let challenge = Challenge {
        thetas: thetas.into_boxed_slice(),
        chi,
        zeta,
        kappa0,
        kappa1,
        kappa2,
    };

    // Convert to serializable version
    let challenge_serde = ChallengeSerde::from(challenge);
    
    let proof = Proof {
        binding, 
        proof0, 
        proof1, 
        proof2, 
        proof3, 
        proof4,
        challenge: challenge_serde,
    };
    
    println!("Writing the proof into JSON (old format)...");
    let output_path = "prove/output/proof.json";
    proof.write_into_json(output_path).unwrap();
    
    println!("Writing the proof into JSON (new serialized format)...");
    let serialized_output_path = "prove/output/verifier_input.json";
    proof.write_serialized_json(serialized_output_path, &s0_commitment, &s1_commitment, &public_inputs, smax).unwrap();

    println!("Total proving time: {:.6} seconds", prove_start.elapsed().as_secs_f64());
}