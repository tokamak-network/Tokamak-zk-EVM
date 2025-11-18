/// Simple benchmark focused on prove0 MSM performance
/// Initializes once, then benchmarks only the prove0 operations
use criterion::{criterion_group, criterion_main, Criterion};
use icicle_bls12_381::curve::{G1Affine, G1Projective, ScalarField};
use icicle_core::msm::{self, MSMConfig};
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::{DeviceVec, HostSlice};
use icicle_runtime::stream::IcicleStream;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::group_structures::G1serde;
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

fn bench_prove0_simple(c: &mut Criterion) {
    // Setup paths
    let tevm_root = std::env::var("TEVM").unwrap_or_else(|_| ".".to_string());
    println!("Using TEVM root: {}", tevm_root);

    let qap_path = format!("{}/dist/linux22/resource/qap-compiler/library", tevm_root);
    let synthesizer_path = format!("{}/dist/linux22/resource/synthesizer/outputs", tevm_root);
    let setup_path = format!("{}/dist/linux22/resource/setup/output", tevm_root);
    let output_path = format!("{}/dist/linux22/resource/prove/output", tevm_root);

    // Create output dir
    std::fs::create_dir_all(&output_path).ok();

    println!("Initializing prover (one-time setup, please wait)...");

    // Initialize once outside the benchmark
    let paths = ProveInputPaths {
        qap_path: &qap_path,
        synthesizer_path: &synthesizer_path,
        setup_path: &setup_path,
        output_path: &output_path,
    };

    let (mut prover, _binding) = Prover::init(&paths);

    println!("Initialization complete. Starting benchmarks...\n");

    // Warm up with a few runs
    println!("Warming up...");
    for _ in 0..3 {
        let _ = prover.prove0();
    }

    // Now benchmark
    let mut group = c.benchmark_group("prove0_simple");
    group.measurement_time(Duration::from_secs(30));
    group.sample_size(15);

    // group.bench_function("prove0_msm_original", |b| b.iter(|| prover.prove0()));

    // // Benchmark batch MSM version
    // group.bench_function("prove0_batch_msm", |b| {
    //     b.iter(|| prove0_with_batch_msm(&mut prover))
    // });

    // check correctness
    let expected = prover.prove0();
    let actual = prove0_with_batch_msm(&mut prover);
    // Proof0 {
    //     U: results[0],
    //     V: results[1],
    //     W: results[2],
    //     Q_AX: results[3],
    //     Q_AY: results[4],
    //     B: results[5],
    // }
    assert_eq!(expected.U, actual.U);
    assert_eq!(expected.V, actual.V);
    assert_eq!(expected.W, actual.W);
    assert_eq!(expected.Q_AX, actual.Q_AX);
    assert_eq!(expected.Q_AY, actual.Q_AY);
    assert_eq!(expected.B, actual.B);
    group.finish();
}

/// Implement prove0 with batch MSM operations
/// This batches all the encode_poly operations (U, V, W, Q_AX, Q_AY, B)
fn prove0_with_batch_msm(prover: &mut Prover) -> Proof0 {
    // First compute the quotients for arithmetic constraints (needed for Q_AX, Q_AY)
    let (q0XY, q1XY) = {
        let mut p0XY = &(&prover.witness.uXY * &prover.witness.vXY) - &prover.witness.wXY;
        p0XY.div_by_vanishing(
            prover.setup_params.n as i64,
            prover.setup_params.s_max as i64,
        )
    };
    prover.quotients.q0XY = q0XY;
    prover.quotients.q1XY = q1XY;

    // Prepare rW polynomials (needed for W, Q_AX, Q_AY)
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

    // Prepare B polynomials (for B encoding)
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

    // Prepare all 6 polynomials for batch MSM
    let mut polynomials = Vec::with_capacity(6);

    // 1. U polynomial
    let mut UXY = poly_comb!(
        (ScalarField::one(), prover.witness.uXY),
        (prover.mixer.rU_X, prover.instance.t_n),
        (prover.mixer.rU_Y, prover.instance.t_smax)
    );
    polynomials.push(UXY.clone());

    // 2. V polynomial
    let mut VXY = poly_comb!(
        (ScalarField::one(), prover.witness.vXY),
        (prover.mixer.rV_X, prover.instance.t_n),
        (prover.mixer.rV_Y, prover.instance.t_smax)
    );
    polynomials.push(VXY.clone());

    // 3. W polynomial
    let mut WXY = poly_comb!(
        (ScalarField::one(), prover.witness.wXY),
        (rW_X, prover.instance.t_n),
        (rW_Y, prover.instance.t_smax)
    );
    polynomials.push(WXY.clone());

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
    polynomials.push(Q_AX_XY.clone());

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
    polynomials.push(Q_AY_XY.clone());

    // 6. B polynomial
    let term_B_zk = &(&rB_X * &prover.instance.t_mi) + &(&rB_Y * &prover.instance.t_smax);
    let mut BXY = &prover.witness.bXY + &term_B_zk;
    polynomials.push(BXY.clone());

    // Now perform batch MSM for all 6 polynomials
    let results =
        batch_encode_polynomials(&polynomials, &prover.sigma.sigma_1, &prover.setup_params);

    // Extract results
    Proof0 {
        U: results[0],
        V: results[1],
        W: results[2],
        Q_AX: results[3],
        Q_AY: results[4],
        B: results[5],
    }
}

/// Batch encode multiple polynomials using a single MSM operation
fn batch_encode_polynomials(
    polynomials: &[DensePolynomialExt],
    sigma1: &libs::group_structures::Sigma1,
    params: &libs::iotools::SetupParams,
) -> Vec<G1serde> {
    let rs_x_size = std::cmp::max(2 * params.n, 2 * (params.l_D - params.l));
    let rs_y_size = params.s_max * 2;
    let batch_size = polynomials.len();

    // Prepare all polynomial coefficients
    let mut all_scalars = Vec::new();
    let mut poly_sizes = Vec::new();
    let mut max_size = 0;

    for poly in polynomials {
        let mut poly_clone = poly.clone();
        poly_clone.optimize_size();

        let target_x_size = (poly_clone.x_degree + 1) as usize;
        let target_y_size = (poly_clone.y_degree + 1) as usize;

        if target_x_size > rs_x_size || target_y_size > rs_y_size {
            panic!("Polynomial size exceeds reference string size");
        }

        let size = target_x_size * target_y_size;
        poly_sizes.push(size);
        max_size = max_size.max(size);

        // Get polynomial coefficients
        let mut poly_coeffs = vec![ScalarField::zero(); poly_clone.x_size * poly_clone.y_size];
        poly_clone.copy_coeffs(0, HostSlice::from_mut_slice(&mut poly_coeffs));

        // Resize to target size
        let poly_coeffs_compact = resize(
            &poly_coeffs,
            poly_clone.x_size,
            poly_clone.y_size,
            target_x_size,
            target_y_size,
            ScalarField::zero(),
        );

        all_scalars.push(poly_coeffs_compact);
    }

    // Prepare reference string points (shared for all polynomials)
    let rs_resized = resize(
        &sigma1.xy_powers,
        rs_x_size,
        rs_y_size,
        max_size,
        1,
        G1serde::zero(),
    );
    let rs_points: Vec<G1Affine> = rs_resized.iter().map(|x| x.0).collect();

    // Flatten scalars (pad each to max_size for batch processing)
    let mut flat_scalars = Vec::new();
    for mut coeffs in all_scalars {
        coeffs.resize(max_size, ScalarField::zero());
        flat_scalars.extend(coeffs);
    }

    // Create ICICLE stream for GPU operations
    let mut stream = IcicleStream::create().unwrap();

    // Allocate device memory
    let mut d_scalars = DeviceVec::device_malloc_async(flat_scalars.len(), &stream).unwrap();
    let mut d_points = DeviceVec::device_malloc_async(rs_points.len(), &stream).unwrap();
    let mut d_results = DeviceVec::device_malloc_async(batch_size, &stream).unwrap();

    // Copy to device
    d_scalars
        .copy_from_host_async(HostSlice::from_slice(&flat_scalars), &stream)
        .unwrap();
    d_points
        .copy_from_host_async(HostSlice::from_slice(&rs_points), &stream)
        .unwrap();

    // Configure batch MSM
    let mut config = MSMConfig::default();
    config.batch_size = batch_size as i32;
    config.are_points_shared_in_batch = true;
    config.is_async = true;
    config.stream_handle = *stream;

    // Perform batch MSM
    msm::msm(&d_scalars[..], &d_points[..], &config, &mut d_results[..]).unwrap();

    // Synchronize and copy results back
    stream.synchronize().unwrap();
    let mut results = vec![G1Projective::zero(); batch_size];
    d_results
        .copy_to_host(HostSlice::from_mut_slice(&mut results))
        .unwrap();

    // Clean up
    stream.destroy().unwrap();

    // Convert to G1serde
    results
        .iter()
        .map(|p| G1serde(G1Affine::from(*p)))
        .collect()
}

criterion_group!(benches, bench_prove0_simple);
criterion_main!(benches);
