/// Benchmark MSM with fully random data (no zeros)
mod common;

use common::{
    generate_random_data, print_zero_stats, run_batch_msm, run_sequential_msm, BATCH_CNT, MSM_SIZE,
};
use criterion::{criterion_group, criterion_main, Criterion};
use icicle_bls12_381::curve::{CurveCfg, G1Affine};
use icicle_core::curve::Curve;
use libs::utils::check_device;
use std::time::Duration;

fn bench_random(c: &mut Criterion) {
    check_device();

    println!("\n========================================");
    println!("MSM Benchmark: Random data (0% zeros)");
    println!("MSM size: {} x {} batches", MSM_SIZE, BATCH_CNT);
    println!("========================================\n");

    let mut group = c.benchmark_group("msm_random");
    group.measurement_time(Duration::from_secs(30));
    group.sample_size(20);
    group.warm_up_time(Duration::from_secs(5));

    println!("Generating points...");
    let points: Vec<G1Affine> = CurveCfg::generate_random_affine_points(MSM_SIZE);

    println!("Generating random data...");
    let scalars = generate_random_data(BATCH_CNT, MSM_SIZE);
    print_zero_stats("Random", &scalars);

    group.bench_function("seq", |b| {
        b.iter(|| run_sequential_msm(&scalars, &points))
    });
    group.bench_function("batch", |b| {
        b.iter(|| run_batch_msm(&scalars, &points, BATCH_CNT))
    });

    group.finish();
}

criterion_group!(benches, bench_random);
criterion_main!(benches);
