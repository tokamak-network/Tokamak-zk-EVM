use std::time::{Duration, Instant};
use prove::{Prover, Proof, TranscriptManager};
use icicle_runtime::{self, Device};
use libs::utils::check_device;

fn main() {
    let prove_start = Instant::now();

    check_device();

    let mut timer: Instant;
    let mut lap: Duration;
    
    println!("Prover initialization...");
    timer = Instant::now();
    let (mut prover, binding) = Prover::init();
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
    
    println!("Writing the proof into JSON...");
    let output_path = "prove/output/proof.json";
    proof.write_into_json(output_path).unwrap();

    println!("Total proving time: {:.6} seconds", prove_start.elapsed().as_secs_f64());
}