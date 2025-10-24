use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use icicle_bls12_381::curve::{CurveCfg, G1Affine, G1Projective, ScalarCfg, ScalarField};
use icicle_core::curve::Curve;
use icicle_core::traits::GenerateRandom;

/// Simulate the current G1Serde wrapper with arithmetic operations
#[derive(Clone, Copy)]
struct G1Serde(G1Affine);

impl G1Serde {
    fn new(affine: G1Affine) -> Self {
        Self(affine)
    }

    /// Current approach: Convert on every operation
    fn mul_current(&self, scalar: &ScalarField) -> Self {
        // This is what the current implementation does:
        // 1. Affine -> Projective
        // 2. Scalar multiplication
        // 3. Projective -> Affine
        G1Serde(G1Affine::from(self.0.to_projective() * *scalar))
    }

    fn add_current(&self, other: &Self) -> Self {
        // 1. Two Affine -> Projective conversions
        // 2. Point addition
        // 3. Projective -> Affine
        G1Serde(G1Affine::from(
            self.0.to_projective() + other.0.to_projective(),
        ))
    }
}

/// Benchmark: Single scalar multiplication
fn bench_single_scalar_mul(c: &mut Criterion) {
    let point_affine = CurveCfg::generate_random_affine_points(1)[0];
    let scalar = ScalarCfg::generate_random(1)[0];

    let mut group = c.benchmark_group("scalar_mul");

    // Current approach: Affine -> Projective -> Affine
    group.bench_function("with_conversions", |b| {
        let g1_serde = G1Serde::new(point_affine);
        b.iter(|| black_box(g1_serde.mul_current(black_box(&scalar))))
    });

    // Recommended approach: Stay in projective
    group.bench_function("without_conversions", |b| {
        let point_proj = point_affine.to_projective();
        b.iter(|| black_box(point_proj * black_box(scalar)))
    });

    // Just the conversion overhead
    group.bench_function("conversion_overhead", |b| {
        let point_proj = point_affine.to_projective();
        b.iter(|| black_box(G1Affine::from(black_box(point_proj))))
    });

    group.finish();
}

/// Benchmark: Single point addition
fn bench_single_addition(c: &mut Criterion) {
    let points = CurveCfg::generate_random_affine_points(2);
    let point_a_affine = points[0];
    let point_b_affine = points[1];

    let mut group = c.benchmark_group("point_addition");

    // Current approach: Multiple conversions
    group.bench_function("with_conversions", |b| {
        let g1_a = G1Serde::new(point_a_affine);
        let g1_b = G1Serde::new(point_b_affine);
        b.iter(|| black_box(g1_a.add_current(black_box(&g1_b))))
    });

    // Recommended approach: Stay in projective
    group.bench_function("without_conversions", |b| {
        let point_a = point_a_affine.to_projective();
        let point_b = point_b_affine.to_projective();
        b.iter(|| black_box(point_a + black_box(point_b)))
    });

    group.finish();
}

/// Benchmark: Chain of operations (realistic scenario)
fn bench_operation_chain(c: &mut Criterion) {
    let points = CurveCfg::generate_random_affine_points(3);
    let point_a_affine = points[0];
    let point_b_affine = points[1];
    let point_c_affine = points[2];
    let scalar = ScalarCfg::generate_random(1)[0];

    let mut group = c.benchmark_group("operation_chain");

    // Current approach: result = (a + b) * scalar + c
    // This does 3 Projective -> Affine conversions!
    group.bench_function("with_conversions", |b| {
        let g1_a = G1Serde::new(point_a_affine);
        let g1_b = G1Serde::new(point_b_affine);
        let g1_c = G1Serde::new(point_c_affine);
        b.iter(|| {
            let temp1 = g1_a.add_current(&g1_b);
            let temp2 = temp1.mul_current(&scalar);
            black_box(temp2.add_current(&g1_c))
        })
    });

    // Recommended approach: All in projective, convert once at end
    group.bench_function("without_conversions", |b| {
        let point_a = point_a_affine.to_projective();
        let point_b = point_b_affine.to_projective();
        let point_c = point_c_affine.to_projective();
        b.iter(|| {
            let temp1 = point_a + point_b;
            let temp2 = temp1 * scalar;
            black_box(temp2 + point_c)
        })
    });

    // With final conversion (realistic)
    group.bench_function("with_final_conversion", |b| {
        let point_a = point_a_affine.to_projective();
        let point_b = point_b_affine.to_projective();
        let point_c = point_c_affine.to_projective();
        b.iter(|| {
            let temp1 = point_a + point_b;
            let temp2 = temp1 * scalar;
            let result = temp2 + point_c;
            black_box(G1Affine::from(result))
        })
    });

    group.finish();
}

/// Benchmark: Loop of operations (e.g., computing a sum)
fn bench_operation_loop(c: &mut Criterion) {
    let num_ops = 100;

    let points_affine = CurveCfg::generate_random_affine_points(num_ops);
    let scalars = ScalarCfg::generate_random(num_ops);

    let mut group = c.benchmark_group("operation_loop");

    // Current approach: Convert on every iteration
    group.bench_function("with_conversions_100ops", |b| {
        b.iter(|| {
            let mut result = G1Serde::new(G1Affine::zero());
            for i in 0..num_ops {
                let point = G1Serde::new(points_affine[i]);
                let scaled = point.mul_current(&scalars[i]);
                result = result.add_current(&scaled);
            }
            black_box(result)
        })
    });

    // Recommended approach: Convert once, compute, convert back
    group.bench_function("without_conversions_100ops", |b| {
        b.iter(|| {
            let mut result = G1Projective::zero();
            for i in 0..num_ops {
                let point = points_affine[i].to_projective();
                let scaled = point * scalars[i];
                result = result + scaled;
            }
            black_box(G1Affine::from(result))
        })
    });

    // Even better: Pre-convert all points
    group.bench_function("preconvert_100ops", |b| {
        let points_proj: Vec<G1Projective> =
            points_affine.iter().map(|p| p.to_projective()).collect();

        b.iter(|| {
            let mut result = G1Projective::zero();
            for i in 0..num_ops {
                let scaled = points_proj[i] * scalars[i];
                result = result + scaled;
            }
            black_box(G1Affine::from(result))
        })
    });

    group.finish();
}

/// Benchmark: Batch normalization comparison
fn bench_batch_normalization(c: &mut Criterion) {
    let mut group = c.benchmark_group("batch_normalization");

    for size in [10, 100, 1000].iter() {
        let points_proj: Vec<G1Projective> = CurveCfg::generate_random_affine_points(*size)
            .iter()
            .map(|p| p.to_projective())
            .collect();

        // Individual conversions
        group.bench_with_input(BenchmarkId::new("individual", size), size, |b, _| {
            b.iter(|| {
                let affines: Vec<G1Affine> =
                    points_proj.iter().map(|p| G1Affine::from(*p)).collect();
                black_box(affines)
            })
        });

        // Note: ICICLE doesn't have batch_normalize_into_affine in Rust API
        // So we'll show that individual conversions are what we currently have
        // In a real implementation, you'd use the CUDA batch normalization kernel directly
    }

    group.finish();
}

/// Benchmark: Simulated MSM (multi-scalar multiplication)
fn bench_msm_simulation(c: &mut Criterion) {
    let mut group = c.benchmark_group("msm_simulation");

    let size = 1000;

    let points_affine = CurveCfg::generate_random_affine_points(size);
    let scalars = ScalarCfg::generate_random(size);

    // Current approach: If doing naive MSM with conversions
    group.bench_function("naive_with_conversions", |b| {
        b.iter(|| {
            let mut result = G1Serde::new(G1Affine::zero());
            for i in 0..size {
                let point = G1Serde::new(points_affine[i]);
                let scaled = point.mul_current(&scalars[i]);
                result = result.add_current(&scaled);
            }
            black_box(result)
        })
    });

    // Recommended: Convert once, compute, convert back
    group.bench_function("naive_without_conversions", |b| {
        b.iter(|| {
            let mut result = G1Projective::zero();
            for i in 0..size {
                let point = points_affine[i].to_projective();
                let scaled = point * scalars[i];
                result = result + scaled;
            }
            black_box(G1Affine::from(result))
        })
    });

    // Best: Pre-convert all points
    group.bench_function("preconvert_all", |b| {
        let points_proj: Vec<G1Projective> =
            points_affine.iter().map(|p| p.to_projective()).collect();

        b.iter(|| {
            let mut result = G1Projective::zero();
            for i in 0..size {
                let scaled = points_proj[i] * scalars[i];
                result = result + scaled;
            }
            black_box(G1Affine::from(result))
        })
    });

    group.finish();
}

/// Benchmark: Conversion costs alone
fn bench_conversions(c: &mut Criterion) {
    let point_affine = CurveCfg::generate_random_affine_points(1)[0];
    let point_proj = point_affine.to_projective();

    let mut group = c.benchmark_group("conversions");

    // Affine -> Projective (cheap)
    group.bench_function("affine_to_projective", |b| {
        b.iter(|| black_box(point_affine.to_projective()))
    });

    // Projective -> Affine (expensive - field inversion!)
    group.bench_function("projective_to_affine", |b| {
        b.iter(|| black_box(G1Affine::from(point_proj)))
    });

    // Round-trip (what happens on every serde arithmetic op)
    group.bench_function("round_trip", |b| {
        b.iter(|| {
            let proj = point_affine.to_projective();
            black_box(G1Affine::from(proj))
        })
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_single_scalar_mul,
    bench_single_addition,
    bench_operation_chain,
    bench_operation_loop,
    bench_batch_normalization,
    bench_msm_simulation,
    bench_conversions,
);
criterion_main!(benches);
