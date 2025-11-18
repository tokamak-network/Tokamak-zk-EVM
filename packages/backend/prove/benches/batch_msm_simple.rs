/// Simple benchmark for batch MSM operations
/// This version avoids thread-safety issues with ICICLE types
use criterion::{criterion_group, criterion_main, Criterion};
use icicle_bls12_381::curve::{CurveCfg, G1Affine, G1Projective, ScalarField};
use icicle_core::curve::Curve;
use icicle_core::msm::{self, MSMConfig};
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::{DeviceVec, HostSlice};
use icicle_runtime::stream::IcicleStream;
use std::time::Duration;

const BATCH_CNT: usize = 10;
const MSM_SIZE: usize = 1 << 16;

fn generate_test_data(size: usize) -> (Vec<ScalarField>, Vec<G1Affine>) {
    let mut scalars = Vec::with_capacity(size);
    let mut points = Vec::with_capacity(size);

    let g1_gen = CurveCfg::generate_random_affine_points(1)[0];

    for i in 0..size {
        // Generate scalars
        let mut scalar = ScalarField::zero();
        for _ in 0..(i % 100) {
            scalar = scalar + ScalarField::one();
        }
        scalars.push(scalar);

        // Generate points
        points.push(g1_gen);
    }

    (scalars, points)
}

fn bench_sequential_msm(c: &mut Criterion) {
    c.bench_function("sequential_msm_10x65536", |b| {
        // Pre-generate test data
        let mut all_data = Vec::new();
        for _ in 0..BATCH_CNT {
            all_data.push(generate_test_data(MSM_SIZE));
        }

        b.iter(|| {
            let mut results = Vec::new();
            for (scalars, points) in &all_data {
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
        });
    });
}

fn bench_batch_msm(c: &mut Criterion) {
    c.bench_function("batch_msm_10x65536", |b| {
        // Pre-generate and flatten test data for batch processing
        let mut all_scalars = Vec::new();
        let mut all_points = Vec::new();

        for _ in 0..BATCH_CNT {
            let (scalars, points) = generate_test_data(MSM_SIZE);
            all_scalars.extend(scalars);
            all_points.extend(points);
        }

        b.iter(|| {
            let mut config = MSMConfig::default();
            config.batch_size = BATCH_CNT as i32;
            config.are_points_shared_in_batch = false;

            let mut msm_results = vec![G1Projective::zero(); BATCH_CNT];
            msm::msm(
                HostSlice::from_slice(&all_scalars),
                HostSlice::from_slice(&all_points),
                &config,
                HostSlice::from_mut_slice(&mut msm_results),
            )
            .unwrap();
            msm_results
        });
    });
}

fn bench_batch_msm_device(c: &mut Criterion) {
    c.bench_function("batch_msm_device_10x65536", |b| {
        // Pre-generate and flatten test data for batch processing
        let mut all_scalars_host = Vec::with_capacity(BATCH_CNT * MSM_SIZE);
        let mut all_points_host = Vec::with_capacity(BATCH_CNT * MSM_SIZE);

        for _ in 0..BATCH_CNT {
            let (scalars, points) = generate_test_data(MSM_SIZE);
            all_scalars_host.extend(scalars);
            all_points_host.extend(points);
        }

        // Create stream and device vectors
        let mut stream = IcicleStream::create().unwrap();
        let mut d_scalars = DeviceVec::device_malloc_async(BATCH_CNT * MSM_SIZE, &stream).unwrap();
        let mut d_points = DeviceVec::device_malloc_async(BATCH_CNT * MSM_SIZE, &stream).unwrap();

        // Copy data to device
        d_scalars
            .copy_from_host_async(HostSlice::from_slice(&all_scalars_host), &stream)
            .unwrap();
        d_points
            .copy_from_host_async(HostSlice::from_slice(&all_points_host), &stream)
            .unwrap();

        stream.synchronize().unwrap();

        b.iter(|| {
            let mut config = MSMConfig::default();
            config.batch_size = BATCH_CNT as i32;
            config.are_points_shared_in_batch = false;
            config.is_async = true;
            config.stream_handle = *stream;

            let mut msm_results = vec![G1Projective::zero(); BATCH_CNT];

            msm::msm(
                &d_scalars[..],
                &d_points[..],
                &config,
                HostSlice::from_mut_slice(&mut msm_results),
            )
            .unwrap();

            stream.synchronize().unwrap();
            msm_results
        });

        stream.destroy().unwrap();
    });
}

fn bench_batch_msm_device_incremental(c: &mut Criterion) {
    c.bench_function("batch_msm_device_incremental_10x65536", |b| {
        // Create stream and device vectors
        let mut stream = IcicleStream::create().unwrap();
        let mut d_scalars = DeviceVec::device_malloc_async(BATCH_CNT * MSM_SIZE, &stream).unwrap();
        let mut d_points = DeviceVec::device_malloc_async(BATCH_CNT * MSM_SIZE, &stream).unwrap();

        // Generate and copy data incrementally - all copies are pipelined before sync
        for i in 0..BATCH_CNT {
            let (scalars, points) = generate_test_data(MSM_SIZE);
            let offset = i * MSM_SIZE;

            // Copy each batch's data to the corresponding slice of device memory
            // These are async, so they'll be queued and executed in order
            d_scalars[offset..offset + MSM_SIZE]
                .copy_from_host_async(HostSlice::from_slice(&scalars), &stream)
                .unwrap();
            d_points[offset..offset + MSM_SIZE]
                .copy_from_host_async(HostSlice::from_slice(&points), &stream)
                .unwrap();
        }

        // Single sync after all async copies are queued
        stream.synchronize().unwrap();

        b.iter(|| {
            let mut config = MSMConfig::default();
            config.batch_size = BATCH_CNT as i32;
            config.are_points_shared_in_batch = false;
            config.is_async = true;
            config.stream_handle = *stream;

            let mut msm_results = vec![G1Projective::zero(); BATCH_CNT];

            msm::msm(
                &d_scalars[..],
                &d_points[..],
                &config,
                HostSlice::from_mut_slice(&mut msm_results),
            )
            .unwrap();

            stream.synchronize().unwrap();
            msm_results
        });

        stream.destroy().unwrap();
    });
}
criterion_group! {
    name = benches;
    config = Criterion::default()
        .measurement_time(Duration::from_secs(30))  // Longer measurement time for slower operations
        .sample_size(30)                             // Fewer samples to reduce total benchmark time
        .warm_up_time(Duration::from_secs(5));      // Warm up GPU/caches before measuring
    targets = bench_sequential_msm, bench_batch_msm, bench_batch_msm_device, bench_batch_msm_device_incremental
}
criterion_main!(benches);
