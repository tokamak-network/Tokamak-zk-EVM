use criterion::{criterion_group, criterion_main, Criterion};
use libs::iotools::{PlacementVariables, SubcircuitInfo};
use libs::utils::check_device;
use prove::{ProveInputPaths, Prover};
use std::path::PathBuf;
use std::time::Duration;
use std::time::Instant;

mod utils;
use utils::prove_init_batch::{prove_init_msm_batched, prove_init_msm_sequential};

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
    let sigma = libs::group_structures::Sigma::read_from_bincode(sigma_bincode_path)
        .expect("No reference string is found.");
    prover.sigma = sigma;

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
    let batched_res = prove_init_msm_batched(&mut prover, &placement_variables, &subcircuit_infos);
    let sequential_res = prove_init_msm_sequential(&mut prover, &placement_variables, &subcircuit_infos);
    
    if batched_res != sequential_res {
        panic!("❌ Verification FAILED: Batched and Sequential results DO NOT match!");
    } else {
        println!("✅ Verification PASSED: Batched and Sequential results match.");
    }


    // running one time first
    let start = Instant::now();
    prove_init_msm_batched(&mut prover, &placement_variables, &subcircuit_infos);
    let duration = start.elapsed();
    println!("prove_init_msm_batched took {} ms", duration.as_millis());

    let start = Instant::now();
    prove_init_msm_sequential(&mut prover, &placement_variables, &subcircuit_infos);
    let duration = start.elapsed();
    println!("prove_init_msm_sequential took {} ms", duration.as_millis());
    
    let mut group = c.benchmark_group("prove_init_msm (binding computations)");
    group.measurement_time(Duration::from_secs(20));
    group.sample_size(10);

    println!("Cooling down for 5 seconds...");
    std::thread::sleep(Duration::from_secs(5));

    // Benchmark batched version
    group.bench_function("prove_init_msm_batched", |b| {
        b.iter(|| prove_init_msm_batched(&mut prover, &placement_variables, &subcircuit_infos))
    });

    // Benchmark sequential version
    group.bench_function("prove_init_msm_sequential", |b| {
        b.iter(|| prove_init_msm_sequential(&mut prover, &placement_variables, &subcircuit_infos))
    });

    group.finish();
}

criterion_group!(benches, bench_prove_init);
criterion_main!(benches);
