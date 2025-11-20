/// Benchmark comparing Original Sequential MSM vs Concurrent Async MSM
///
/// The goal is to demonstrate that concurrent execution of exact-sized polynomials
/// is superior to batching (which requires padding) or sequential execution.
use criterion::{criterion_group, criterion_main, Criterion};
use icicle_bls12_381::curve::{G1Affine, G1Projective, ScalarField};
use icicle_core::msm::{self, MSMConfig};
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::{DeviceVec, HostSlice};
use icicle_runtime::stream::IcicleStream;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::group_structures::G1serde;
use libs::utils::check_device;
use libs::vector_operations::resize;
use prove::{Proof0, ProveInputPaths, Prover};
use std::time::Duration;

// Import the poly_comb macro logic
macro_rules! poly_comb {
    (($c:expr, $p:expr), $(($rest_c:expr, $rest_p:expr)),+ $(,)?) => {{
        let mut acc = &$p * &$c;
        $(
            acc += &(&$rest_p * &$rest_c);
        )+
        acc
    }};
}

fn bench_prove0_async(c: &mut Criterion) {
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

    println!("Initializing prover (one-time setup)...");

    // Initialize once outside the benchmark
    let paths = ProveInputPaths {
        qap_path: &qap_path,
        synthesizer_path: &synthesizer_path,
        setup_path: &setup_path,
        output_path: &output_path,
    };

    let (mut prover, _binding) = Prover::init(&paths);

    println!("Initialization complete. Starting benchmarks...\n");

    // Warm up
    println!("Warming up...");
    for _ in 0..2 {
        let _ = prover.prove0();
    }

    let mut group = c.benchmark_group("prove0_async_comparison");
    group.measurement_time(Duration::from_secs(20));
    group.sample_size(10);

    // 1. Baseline: Original Sequential
    group.bench_function("prove0_original", |b| b.iter(|| prover.prove0()));

    // 2. New: Concurrent Async
    group.bench_function("prove0_concurrent", |b| {
        b.iter(|| prove0_with_concurrent_msm(&mut prover))
    });

    group.finish();
}
/// Implement prove0 with CONCURRENT MSM operations
fn prove0_with_concurrent_msm(prover: &mut Prover) -> Proof0 {
    // First compute the quotients for arithmetic constraints
    let (q0XY, q1XY) = {
        let mut p0XY = &(&prover.witness.uXY * &prover.witness.vXY) - &prover.witness.wXY;
        p0XY.div_by_vanishing(
            prover.setup_params.n as i64,
            prover.setup_params.s_max as i64,
        )
    };
    prover.quotients.q0XY = q0XY;
    prover.quotients.q1XY = q1XY;

    // Prepare rW polynomials
    let rW_X = DensePolynomialExt::from_coeffs(
        HostSlice::from_slice(&prover.mixer.rW_X),
        prover.mixer.rW_X.len(),
        1,
    );
    let rW_Y = DensePolynomialExt::from_coeffs(
        HostSlice::from_slice(&prover.mixer.rW_Y),
        1,
        prover.mixer.rW_Y.len(),
    );

    // Prepare B polynomials
    let rB_X = DensePolynomialExt::from_coeffs(
        HostSlice::from_slice(&prover.mixer.rB_X),
        prover.mixer.rB_X.len(),
        1,
    );
    let rB_Y = DensePolynomialExt::from_coeffs(
        HostSlice::from_slice(&prover.mixer.rB_Y),
        1,
        prover.mixer.rB_Y.len(),
    );

    // Prepare all 6 polynomials
    let mut polynomials = Vec::with_capacity(6);

    // 1. U polynomial
    let mut UXY = poly_comb!(
        (ScalarField::one(), prover.witness.uXY),
        (prover.mixer.rU_X, prover.instance.t_n),
        (prover.mixer.rU_Y, prover.instance.t_smax)
    );
    UXY.optimize_size();
    polynomials.push(UXY);

    // 2. V polynomial
    let mut VXY = poly_comb!(
        (ScalarField::one(), prover.witness.vXY),
        (prover.mixer.rV_X, prover.instance.t_n),
        (prover.mixer.rV_Y, prover.instance.t_smax)
    );
    VXY.optimize_size();
    polynomials.push(VXY);

    // 3. W polynomial
    let mut WXY = poly_comb!(
        (ScalarField::one(), prover.witness.wXY),
        (rW_X, prover.instance.t_n),
        (rW_Y, prover.instance.t_smax)
    );
    WXY.optimize_size();
    polynomials.push(WXY);

    // 4. Q_AX polynomial
    let mut Q_AX_XY = poly_comb!(
        (ScalarField::one(), prover.quotients.q0XY),
        (prover.mixer.rU_X, prover.witness.vXY),
        (prover.mixer.rV_X, prover.witness.uXY),
        (ScalarField::zero() - ScalarField::one(), rW_X),
        (prover.mixer.rU_X * prover.mixer.rV_X, prover.instance.t_n),
        (
            prover.mixer.rU_Y * prover.mixer.rV_X,
            prover.instance.t_smax
        )
    );
    Q_AX_XY.optimize_size();
    polynomials.push(Q_AX_XY);

    // 5. Q_AY polynomial
    let mut Q_AY_XY = poly_comb!(
        (ScalarField::one(), prover.quotients.q1XY),
        (prover.mixer.rU_Y, prover.witness.vXY),
        (prover.mixer.rV_Y, prover.witness.uXY),
        (ScalarField::zero() - ScalarField::one(), rW_Y),
        (prover.mixer.rU_X * prover.mixer.rV_Y, prover.instance.t_n),
        (
            prover.mixer.rU_Y * prover.mixer.rV_Y,
            prover.instance.t_smax
        )
    );
    Q_AY_XY.optimize_size();
    polynomials.push(Q_AY_XY);

    // 6. B polynomial
    let term_B_zk = &(&rB_X * &prover.instance.t_mi) + &(&rB_Y * &prover.instance.t_smax);
    let mut BXY = &prover.witness.bXY + &term_B_zk;
    BXY.optimize_size();
    polynomials.push(BXY);

    // CRITICAL CHANGE: Call the optimized pipelined function
    let results = optimized_concurrent_encode(
        &polynomials,
        &prover.sigma.sigma_1,
        &prover.setup_params
    );

    Proof0 {
        U: results[0],
        V: results[1],
        W: results[2],
        Q_AX: results[3],
        Q_AY: results[4],
        B: results[5],
    }
}

/// Encodes polynomials using Pipelined Concurrent execution
/// This overlaps CPU preparation of the NEXT poly with GPU execution of the CURRENT poly.
fn optimized_concurrent_encode(
    polynomials: &[DensePolynomialExt],
    sigma1: &libs::group_structures::Sigma1,
    params: &libs::iotools::SetupParams,
) -> Vec<G1serde> {
    let rs_x_size = std::cmp::max(2 * params.n, 2 * (params.l_D - params.l));
    let rs_y_size = params.s_max * 2;
    let num_polys = polynomials.len();

    let mut results = vec![G1serde::zero(); num_polys];

    // Keepers: We must store the Host vectors here to ensure they live long enough
    // for the async operation to read them (or copy them).
    let mut streams = Vec::with_capacity(num_polys);
    let mut scalars_keeper = Vec::with_capacity(num_polys);
    let mut points_keeper = Vec::with_capacity(num_polys);
    let mut device_results = Vec::with_capacity(num_polys);

    for (i, poly) in polynomials.iter().enumerate() {
        // --- 1. CPU HEAVY PREPARATION ---

        let target_x = (poly.x_degree + 1) as usize;
        let target_y = (poly.y_degree + 1) as usize;

        // Prepare SRS Points (CPU Intensive)
        let mut rs_points = Vec::with_capacity(target_x * target_y);
        for y in 0..target_y {
            let row_start = y * rs_x_size;
            for x in 0..target_x {
                 if y < rs_y_size && x < rs_x_size {
                    rs_points.push(sigma1.xy_powers[row_start + x].0);
                } else {
                    rs_points.push(G1Affine::zero());
                }
            }
        }

        // Prepare Scalars (CPU Intensive)
        let mut poly_coeffs = vec![ScalarField::zero(); poly.x_size * poly.y_size];
        poly.copy_coeffs(0, HostSlice::from_mut_slice(&mut poly_coeffs));

        let final_coeffs = if poly.x_size != target_x || poly.y_size != target_y {
            resize(
                &poly_coeffs,
                poly.x_size, poly.y_size,
                target_x, target_y,
                ScalarField::zero(),
            )
        } else {
            poly_coeffs
        };

        // --- 2. STORE DATA TO PREVENT DROP ---
        // We push to external vectors so the memory remains valid for the lifetime of the loop
        points_keeper.push(rs_points);
        scalars_keeper.push(final_coeffs);

        // Create Stream and Device Buffer
        let stream = IcicleStream::create().unwrap();
        let d_res = DeviceVec::<G1Projective>::device_malloc_async(1, &stream).unwrap();
        device_results.push(d_res);

        // --- 3. IMMEDIATE LAUNCH ---
        // We launch NOW. While this kernel runs, the CPU will loop back
        // and start preparing the next polynomial.

        let mut config = MSMConfig::default();
        config.is_async = true;
        config.stream_handle = *stream;

        msm::msm(
            HostSlice::from_slice(&scalars_keeper[i]),
            HostSlice::from_slice(&points_keeper[i]),
            &config,
            &mut device_results[i][..],
        ).unwrap();

        streams.push(stream);
    }

    // --- 4. SYNCHRONIZE AND COLLECT ---
    for (i, stream) in streams.iter_mut().enumerate() {
        stream.synchronize().unwrap();

        let mut host_res = vec![G1Projective::zero(); 1];
        // Simple copy back
        device_results[i].copy_to_host(HostSlice::from_mut_slice(&mut host_res)).unwrap();
        results[i] = G1serde(G1Affine::from(host_res[0]));

        stream.destroy().unwrap();
    }

    results
}

criterion_group!(benches, bench_prove0_async);
criterion_main!(benches);
