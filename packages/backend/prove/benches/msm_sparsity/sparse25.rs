/// Benchmark MSM with 25% sparse data (25% zeros)
mod common;

use common::{
    generate_sparse_data, print_zero_stats, run_batch_msm, run_sequential_msm, BATCH_CNT, MSM_SIZE,
};
use criterion::{criterion_group, criterion_main, Criterion};
use icicle_bls12_381::curve::{CurveCfg, G1Affine};
use icicle_core::curve::Curve;
use libs::utils::check_device;
use std::time::Duration;

fn bench_sparse25(c: &mut Criterion) {
    check_device();

    println!("\n========================================");
    println!("MSM Benchmark: Sparse 25% zeros");
    println!("MSM size: {} x {} batches", MSM_SIZE, BATCH_CNT);
    println!("========================================\n");

    let mut group = c.benchmark_group("msm_sparse25");
    group.measurement_time(Duration::from_secs(30));
    group.sample_size(20);
    group.warm_up_time(Duration::from_secs(5));

    println!("Generating points...");
    let points: Vec<G1Affine> = CurveCfg::generate_random_affine_points(MSM_SIZE);

    println!("Generating sparse25 data...");
    let scalars = generate_sparse_data(BATCH_CNT, MSM_SIZE, 0.25);
    print_zero_stats("Sparse25", &scalars);

    group.bench_function("seq", |b| {
        b.iter(|| run_sequential_msm(&scalars, &points))
    });
    group.bench_function("batch", |b| {
        b.iter(|| run_batch_msm(&scalars, &points, BATCH_CNT))
    });

    group.finish();
}

criterion_group!(benches, bench_sparse25);
criterion_main!(benches);
