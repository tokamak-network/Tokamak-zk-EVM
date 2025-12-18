use criterion::{criterion_group, criterion_main, Criterion};
use libs::utils::check_device;
use prove::{ProveInputPaths, Prover};
use std::time::Duration;

mod utils;
use utils::prove0_batch::{prove0_with_batch_msm, prove0_with_grouped_batch_msm};

#[cfg(not(target_env = "msvc"))]
use tikv_jemallocator::Jemalloc;

#[cfg(not(target_env = "msvc"))]
#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

fn bench_prove0_simple(c: &mut Criterion) {
    check_device();
    // Setup paths
    let tevm_root = std::env::var("TEVM").unwrap_or_else(|_| ".".to_string());
    println!("Using TEVM root: {}", tevm_root);

    let qap_path = format!("{}/dist/linux22/resource/qap-compiler/library", tevm_root);
    let synthesizer_path = format!("{}/dist/linux22/resource/synthesizer/outputs", tevm_root);
    let setup_path = format!("{}/dist/linux22/resource/setup/output", tevm_root);
    let output_path = format!("{}/dist/linux22/resource/prove/output", tevm_root);

    // Create output dir
    std::fs::create_dir_all(&output_path).ok();

    // Initialize paths once
    let paths = ProveInputPaths {
        qap_path: &qap_path,
        synthesizer_path: &synthesizer_path,
        setup_path: &setup_path,
        output_path: &output_path,
    };

    // Now benchmark
    let mut group = c.benchmark_group("prove0_simple");
    group.measurement_time(Duration::from_secs(20));
    group.sample_size(10);

    // Benchmark optimized grouped batch MSM version
    {
        println!("\nInitializing prover for prove0_grouped_batch_msm...");
        let (mut prover, _binding) = Prover::init(&paths);
        group.bench_function("prove0_grouped_batch_msm", |b| {
            b.iter(|| prove0_with_grouped_batch_msm(&mut prover))
        });
    }

    // Benchmark original version
    {
        println!("\nInitializing prover for prove0_original...");
        let (mut prover, _binding) = Prover::init(&paths);
        group.bench_function("prove0_original", |b| {
            b.iter(|| Prover::prove0(&mut prover))
        });
    }

    // Benchmark batch MSM version
    {
        println!("\nInitializing prover for prove0_batch_msm...");
        let (mut prover, _binding) = Prover::init(&paths);
        group.bench_function("prove0_batch_msm", |b| {
            b.iter(|| prove0_with_batch_msm(&mut prover))
        });
    }
    group.finish();
}

criterion_group!(benches, bench_prove0_simple);
criterion_main!(benches);
