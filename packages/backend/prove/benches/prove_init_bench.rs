use criterion::{criterion_group, criterion_main, BatchSize, Criterion};
use libs::group_structures::Sigma;
use libs::iotools::{PlacementVariables, SubcircuitInfo};
use libs::utils::check_device;
use prove::{ProveInputPaths, Prover};
use std::cell::RefCell;
use std::path::PathBuf;
use std::rc::Rc;
use std::time::Duration;
use std::time::Instant;

mod utils;
use utils::prove_init_batch::{prove_init_msm_batched, prove_init_msm_sequential};

#[cfg(not(target_env = "msvc"))]
use tikv_jemallocator::Jemalloc;
#[cfg(not(target_env = "msvc"))]
#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

/// Shared benchmark state to avoid reloading files for each iteration setup
struct BenchState {
    prover: Prover,
    sigma_template: Sigma,
    placement_variables: Box<[PlacementVariables]>,
    subcircuit_infos: Box<[SubcircuitInfo]>,
}

fn bench_prove_init(c: &mut Criterion) {
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

    println!("Initializing prover (loading files)...");
    let (mut prover, _binding) = Prover::init(&paths);

    // Reload Sigma because Prover::init clears some fields in sigma.sigma_1 to save memory
    println!("Reloading Sigma to restore cleared fields...");
    let sigma_bincode_path = PathBuf::from(paths.setup_path).join("combined_sigma.bin");
    let sigma = Sigma::read_from_bincode(sigma_bincode_path.clone())
        .expect("No reference string is found.");
    prover.sigma = sigma;

    // Load a second copy to use as template for resetting state
    let sigma_template = Sigma::read_from_bincode(sigma_bincode_path)
        .expect("No reference string is found.");

    // Load placement variables and subcircuit infos explicitly
    // because Prover::init consumes them and doesn't store them in Prover struct
    let subcircuit_infos_path = PathBuf::from(paths.qap_path).join("subcircuitInfo.json");
    let subcircuit_infos = SubcircuitInfo::read_box_from_json(subcircuit_infos_path).unwrap();

    let placement_variables_path =
        PathBuf::from(paths.synthesizer_path).join("placementVariables.json");
    let placement_variables =
        PlacementVariables::read_box_from_json(placement_variables_path).unwrap();

    // Verify consistency between batched and sequential implementations
    println!("Verifying that batched and sequential implementations produce identical results...");
    let start = Instant::now();
    let batched_res = prove_init_msm_batched(&mut prover, &placement_variables, &subcircuit_infos);
    let duration = start.elapsed();
    println!("prove_init_msm_batched took {} ms", duration.as_millis());

    let start = Instant::now();
    let sequential_res =
        prove_init_msm_sequential(&mut prover, &placement_variables, &subcircuit_infos);
    let duration = start.elapsed();
    println!("prove_init_msm_sequential took {} ms", duration.as_millis());

    if batched_res != sequential_res {
        panic!("❌ Verification FAILED: Batched and Sequential results DO NOT match!");
    } else {
        println!("✅ Verification PASSED: Batched and Sequential results match.");
    }

    // Warmup runs
    let start = Instant::now();
    prove_init_msm_batched(&mut prover, &placement_variables, &subcircuit_infos);
    let duration = start.elapsed();
    println!("prove_init_msm_batched warmup took {} ms", duration.as_millis());

    let start = Instant::now();
    prove_init_msm_sequential(&mut prover, &placement_variables, &subcircuit_infos);
    let duration = start.elapsed();
    println!("prove_init_msm_sequential warmup took {} ms", duration.as_millis());

    // Create shared state wrapped in RefCell for interior mutability
    let state = Rc::new(RefCell::new(BenchState {
        prover,
        sigma_template,
        placement_variables,
        subcircuit_infos,
    }));

    let mut group = c.benchmark_group("prove_init_msm (binding computations)");
    group.measurement_time(Duration::from_secs(20));
    group.sample_size(10);

    println!("Cooling down for 5 seconds...");
    std::thread::sleep(Duration::from_secs(5));

    // Benchmark batched version with iter_batched
    // This ensures GPU memory is cleanly allocated/deallocated between iterations
    let state_batched = Rc::clone(&state);
    group.bench_function("prove_init_msm_batched", |b| {
        b.iter_batched(
            || {
                // Setup: nothing needed here since we reuse shared state
                // The GPU allocations happen inside the benchmark function
                // and are automatically dropped after each iteration
            },
            |()| {
                let mut s = state_batched.borrow_mut();
                // Destructure to allow simultaneous mutable and immutable borrows
                let BenchState {
                    prover,
                    placement_variables,
                    subcircuit_infos,
                    ..
                } = &mut *s;
                prove_init_msm_batched(prover, placement_variables, subcircuit_infos)
            },
            BatchSize::LargeInput,
        )
    });

    // Benchmark sequential version with iter_batched
    let state_sequential = Rc::clone(&state);
    group.bench_function("prove_init_msm_sequential", |b| {
        b.iter_batched(
            || {
                // Setup: nothing needed - GPU state is fresh each iteration
            },
            |()| {
                let mut s = state_sequential.borrow_mut();
                // Destructure to allow simultaneous mutable and immutable borrows
                let BenchState {
                    prover,
                    placement_variables,
                    subcircuit_infos,
                    ..
                } = &mut *s;
                prove_init_msm_sequential(prover, placement_variables, subcircuit_infos)
            },
            BatchSize::LargeInput,
        )
    });

    group.finish();
}

criterion_group!(benches, bench_prove_init);
criterion_main!(benches);
