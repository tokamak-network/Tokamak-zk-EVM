use criterion::{criterion_group, criterion_main, Criterion};
use icicle_bls12_381::curve::ScalarCfg;
use icicle_core::traits::GenerateRandom;
use libs::utils::check_device;
use prove::{ProveInputPaths, Prover};
use std::time::Duration;
use std::time::Instant;

mod utils;
use utils::prove4_batch::{prove4_batched, prove4_sequential};

#[cfg(not(target_env = "msvc"))]
use tikv_jemallocator::Jemalloc;

#[cfg(not(target_env = "msvc"))]
#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

pub fn bench_prove4(c: &mut Criterion) {
    check_device();

    // Setup paths - same as prove0_msm_batch
    let tevm_root = std::env::var("TEVM").unwrap_or_else(|_| ".".to_string());
    println!("Using TEVM root: {}", tevm_root);

    let qap_path = format!("{}/dist/linux22/resource/qap-compiler/library", tevm_root);
    let synthesizer_path = format!("{}/dist/linux22/resource/synthesizer/outputs", tevm_root);
    let setup_path = format!("{}/dist/linux22/resource/setup/output", tevm_root);
    let output_path = format!("{}/dist/linux22/resource/prove/output", tevm_root);

    // Create output dir
    std::fs::create_dir_all(&output_path).ok();

    let paths = ProveInputPaths {
        qap_path: &qap_path,
        synthesizer_path: &synthesizer_path,
        setup_path: &setup_path,
        output_path: &output_path,
    };

    println!("Initializing prover with real data...");
    let (mut prover, _binding) = Prover::init(&paths);

    // Prepare challenge scalars first (needed for prove stages)
    let scalars = ScalarCfg::generate_random(10);
    let chi = scalars[0];
    let zeta = scalars[1];
    let kappa0 = scalars[2];
    let kappa1 = scalars[3];
    let thetas = vec![scalars[4], scalars[5], scalars[6]];

    // Run earlier prove stages to compute quotients
    println!("Running prove0 to compute q0XY, q1XY...");
    let _proof0 = prover.prove0();
    println!("Running prove1...");
    let _proof1 = prover.prove1(&thetas);
    println!("Running prove2 to compute q2XY-q7XY...");
    let _proof2 = prover.prove2(&thetas, kappa0);
    println!("Running prove3...");
    let proof3 = prover.prove3(chi, zeta);
    println!("All prerequisite stages completed.");

    println!(
        "Verifying that batched and sequential prove4 implementations produce identical results..."
    );

    // Warmup / Verification
    let (seq_proof, _) = prove4_sequential(&prover, &proof3, &thetas, kappa0, chi, zeta, kappa1);
    let (batch_proof, _) = prove4_batched(&prover, &proof3, &thetas, kappa0, chi, zeta, kappa1);

    let seq_pi_x = seq_proof.Pi_X;
    let batch_pi_x = batch_proof.Pi_X;
    let seq_str = format!("{:?}", seq_pi_x);
    let batch_str = format!("{:?}", batch_pi_x);

    if seq_str != batch_str {
        panic!(
            "Verification FAILED: Batched and Sequential results DO NOT match.\nSeq: {}\nBatch: {}",
            seq_str, batch_str
        );
    } else {
        println!("✅ Verification PASSED: Batched and Sequential results match.");
    }

    // Manual Timing
    let start = Instant::now();
    prove4_batched(&prover, &proof3, &thetas, kappa0, chi, zeta, kappa1);
    println!(
        "prove4_batched (single run) took {} ms",
        start.elapsed().as_millis()
    );

    let start = Instant::now();
    prove4_sequential(&prover, &proof3, &thetas, kappa0, chi, zeta, kappa1);
    println!(
        "prove4_sequential (single run) took {} ms",
        start.elapsed().as_millis()
    );

    let mut group = c.benchmark_group("prove4 (batched vs sequential)");
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(10);

    group.bench_function("prove4_batched", |b| {
        b.iter(|| prove4_batched(&prover, &proof3, &thetas, kappa0, chi, zeta, kappa1))
    });

    group.bench_function("prove4_sequential", |b| {
        b.iter(|| prove4_sequential(&prover, &proof3, &thetas, kappa0, chi, zeta, kappa1))
    });

    group.finish();
}

criterion_group!(benches, bench_prove4);
criterion_main!(benches);
