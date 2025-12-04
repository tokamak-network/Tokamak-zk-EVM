/// Benchmark comparing Sequential vs Batch MSM with two data types:
/// 1. Sparse data (~50% zeros) - mimics real prove0 coefficients
/// 2. Random data (fully random scalars)
///
/// 4 combinations:
/// - Sequential + Sparse
/// - Sequential + Random
/// - Batch + Sparse
/// - Batch + Random
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use icicle_bls12_381::curve::{CurveCfg, G1Affine, G1Projective, ScalarCfg, ScalarField};
use icicle_core::curve::Curve;
use icicle_core::msm::{self, MSMConfig};
use icicle_core::traits::{FieldImpl, GenerateRandom};
use icicle_runtime::memory::HostSlice;
use libs::utils::check_device;
use rand::Rng;
use std::time::Duration;

// Configuration matching prove0 scenario
const BATCH_CNT: usize = 3; // Like U, V, W in prove0
const MSM_SIZE: usize = 1025 * 129; // 132,225 elements

/// Data type for benchmarking
#[derive(Clone, Copy)]
enum DataType {
    Sparse, // ~50% zeros (like real prove0 data)
    Random, // Fully random scalars
}

impl std::fmt::Display for DataType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DataType::Sparse => write!(f, "sparse_50pct_zeros"),
            DataType::Random => write!(f, "random"),
        }
    }
}

/// Generate test data based on data type
fn generate_data(
    num_batches: usize,
    size: usize,
    data_type: DataType,
) -> (Vec<Vec<ScalarField>>, Vec<G1Affine>) {
    let mut rng = rand::thread_rng();

    // Shared points (like sigma.sigma_1.xy_powers)
    let points: Vec<G1Affine> = CurveCfg::generate_random_affine_points(size);

    // Generate scalar sets based on data type
    let mut scalar_sets = Vec::with_capacity(num_batches);
    for _ in 0..num_batches {
        let scalars = match data_type {
            DataType::Sparse => {
                // ~50% zeros randomly distributed (mimics real coefficients)
                let mut s = Vec::with_capacity(size);
                for _ in 0..size {
                    if rng.gen_bool(0.50) {
                        s.push(ScalarField::zero());
                    } else {
                        s.push(ScalarCfg::generate_random(1)[0]);
                    }
                }
                s
            }
            DataType::Random => {
                // Fully random scalars (no zeros)
                ScalarCfg::generate_random(size)
            }
        };
        scalar_sets.push(scalars);
    }

    (scalar_sets, points)
}

/// Sequential MSM: run MSM one at a time
fn run_sequential_msm(scalar_sets: &[Vec<ScalarField>], points: &[G1Affine]) -> Vec<G1Projective> {
    let mut results = Vec::with_capacity(scalar_sets.len());
    for scalars in scalar_sets {
        let mut msm_res = vec![G1Projective::zero(); 1];
        msm::msm(
            HostSlice::from_slice(scalars),
            HostSlice::from_slice(points),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut msm_res),
        )
        .unwrap();
        results.push(msm_res[0]);
    }
    results
}

/// Batch MSM: single call with shared points
fn run_batch_msm(
    scalar_sets: &[Vec<ScalarField>],
    points: &[G1Affine],
    batch_cnt: usize,
) -> Vec<G1Projective> {
    // Flatten scalars for batch processing
    let all_scalars: Vec<ScalarField> = scalar_sets.iter().flatten().cloned().collect();

    let mut config = MSMConfig::default();
    config.batch_size = batch_cnt as i32;
    config.are_points_shared_in_batch = true;

    let mut msm_results = vec![G1Projective::zero(); batch_cnt];
    msm::msm(
        HostSlice::from_slice(&all_scalars),
        HostSlice::from_slice(points),
        &config,
        HostSlice::from_mut_slice(&mut msm_results),
    )
    .unwrap();
    msm_results
}

/// Benchmark all 4 combinations
fn bench_msm_comparison(c: &mut Criterion) {
    check_device();

    println!("\n========================================");
    println!("MSM Benchmark: Sequential vs Batch");
    println!("Data types: Sparse (50% zeros) vs Random");
    println!("MSM size: {} x {} batches", MSM_SIZE, BATCH_CNT);
    println!("========================================\n");

    let mut group = c.benchmark_group("msm_seq_vs_batch");
    group.measurement_time(Duration::from_secs(30));
    group.sample_size(20);
    group.warm_up_time(Duration::from_secs(5));

    // ===== SPARSE DATA (50% zeros) =====
    println!("Generating SPARSE data (50% zeros)...");
    let (sparse_scalars, sparse_points) = generate_data(BATCH_CNT, MSM_SIZE, DataType::Sparse);

    // Count actual zeros for verification
    let total_scalars: usize = sparse_scalars.iter().map(|s| s.len()).sum();
    let zero_count: usize = sparse_scalars
        .iter()
        .flat_map(|s| s.iter())
        .filter(|s| **s == ScalarField::zero())
        .count();
    println!(
        "  Sparse data: {}/{} zeros ({:.1}%)",
        zero_count,
        total_scalars,
        100.0 * zero_count as f64 / total_scalars as f64
    );

    // 1. Sequential + Sparse
    group.bench_function("1_seq_sparse", |b| {
        b.iter(|| run_sequential_msm(&sparse_scalars, &sparse_points))
    });

    // 3. Batch + Sparse
    group.bench_function("3_batch_sparse", |b| {
        b.iter(|| run_batch_msm(&sparse_scalars, &sparse_points, BATCH_CNT))
    });

    // Cool down
    println!("\nCooling down for 3 seconds...");
    std::thread::sleep(Duration::from_secs(3));

    // ===== RANDOM DATA (no zeros) =====
    println!("\nGenerating RANDOM data (no zeros)...");
    let (random_scalars, random_points) = generate_data(BATCH_CNT, MSM_SIZE, DataType::Random);

    let total_scalars_r: usize = random_scalars.iter().map(|s| s.len()).sum();
    let zero_count_r: usize = random_scalars
        .iter()
        .flat_map(|s| s.iter())
        .filter(|s| **s == ScalarField::zero())
        .count();
    println!(
        "  Random data: {}/{} zeros ({:.1}%)",
        zero_count_r,
        total_scalars_r,
        100.0 * zero_count_r as f64 / total_scalars_r as f64
    );

    // 2. Sequential + Random
    group.bench_function("2_seq_random", |b| {
        b.iter(|| run_sequential_msm(&random_scalars, &random_points))
    });

    // 4. Batch + Random
    group.bench_function("4_batch_random", |b| {
        b.iter(|| run_batch_msm(&random_scalars, &random_points, BATCH_CNT))
    });

    group.finish();

    // Print summary
    println!("\n========================================");
    println!("SUMMARY: Check criterion output above");
    println!("Compare:");
    println!("  - seq_sparse vs batch_sparse (sparse data speedup)");
    println!("  - seq_random vs batch_random (random data speedup)");
    println!("  - sparse vs random (zero-skipping benefit)");
    println!("========================================\n");
}

criterion_group!(benches, bench_msm_comparison);
criterion_main!(benches);
