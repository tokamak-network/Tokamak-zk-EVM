#![allow(non_snake_case)]
use prove::{*};
use verify::{*};
use std::time::{Instant, Duration};

// include!("../../setup/trusted-setup/output/combined_sigma.rs");

fn main() {
    let prove_start = Instant::now();
    
    let mut timer: Instant;
    let mut lap: Duration;

    println!("Prover initialization...");
    timer = Instant::now();
    let (mut prover, binding) = Prover::init();
    lap = timer.elapsed();
    println!("Prover init time: {:.6} seconds", lap.as_secs_f64());

    println!("Running prove0...");
    timer = Instant::now();
    let proof0: Proof0 = prover.prove0();
    lap = timer.elapsed();
    println!("prove0 running time: {:.6} seconds", lap.as_secs_f64());

    let thetas = proof0.verify0();
    
    println!("Running prove1...");
    timer = Instant::now();
    let proof1 = prover.prove1(&thetas);
    lap = timer.elapsed();
    println!("prove1 running time: {:.6} seconds", lap.as_secs_f64());

    let kappa0 = proof1.verify1();
    
    println!("Running prove2...");
    timer = Instant::now();
    let proof2 = prover.prove2(&thetas, kappa0);
    lap = timer.elapsed();
    println!("prove2 running time: {:.6} seconds", lap.as_secs_f64());

    let (chi, zeta) = proof2.verify2();
    
    println!("Running prove3...");
    timer = Instant::now();
    let proof3 = prover.prove3(chi, zeta);
    lap = timer.elapsed();
    println!("prove3 running time: {:.6} seconds", lap.as_secs_f64());

    let kappa1 = proof3.verify3();
    
    println!("Running prove4...");
    timer = Instant::now();
    let (proof4, proof4_test) = prover.prove4(&proof3, &thetas, kappa0, chi, zeta, kappa1);
    lap = timer.elapsed();
    println!("prove4 running time: {:.6} seconds", lap.as_secs_f64());

    println!("Total proving time: {:.6} seconds", prove_start.elapsed().as_secs_f64());

    println!("Verifier initialization...");
    timer = Instant::now();
    let verifier = Verifier::init();
    lap = timer.elapsed();
    println!("Verifier init time: {:.6} seconds", lap.as_secs_f64());

    #[cfg(feature = "testing-mode")]
    {
        
        let res_arith = verifier.verify_arith(&binding, &proof0, &proof1, &proof2, &proof3, &proof4_test);
        println!("Verification_arith: {:?}", res_arith);
        let res_copy = verifier.verify_copy(&binding, &proof0, &proof1, &proof2, &proof3, &proof4_test);
        println!("Verification_copy: {:?}", res_copy);
        let res_binding = verifier.verify_binding(&binding, &proof0, &proof1, &proof2, &proof3, &proof4_test);
        println!("Verification_binding: {:?}", res_binding);
    }

    #[cfg(not(feature = "testing-mode"))]
    {
        println!("Verifying the proof...");
        timer = Instant::now();
        let res = verifier.verify_all(&binding, &proof0, &proof1, &proof2, &proof3, &proof4);
        lap = timer.elapsed();
        println!("Verification time: {:.6} seconds", lap.as_secs_f64());
        println!("Verification: {:?}", res);
    }
    
}