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
use libs::utils::check_device;
use libs::vector_operations::resize;
use prove::{Proof0, ProveInputPaths, Prover};
use std::time::{Duration, Instant};

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
    group.measurement_time(Duration::from_secs(20));
    group.sample_size(10);

    group.bench_function("prove0_msm_original", |b| b.iter(|| prover.prove0()));

    // Benchmark batch MSM version
    group.bench_function("prove0_batch_msm", |b| {
        b.iter(|| prove0_with_batch_msm(&mut prover))
    });

    // Benchmark optimized grouped batch MSM version
    group.bench_function("prove0_grouped_batch_msm", |b| {
        b.iter(|| prove0_with_grouped_batch_msm(&mut prover))
    });



    // Detailed timing analysis - run once with timing breakdown
    // println!("\n=== Detailed Timing Analysis ===\n");
    // println!("Running prove0_batch_msm with timing...");
    // prove0_batch_msm_timed(&mut prover);

    // println!("\nRunning prove0_direct_rs with timing...");
    // prove0_direct_rs_timed(&mut prover);

    // check correctness
    // let expected = prover.prove0();
    // let actual = prove0_with_batch_msm(&mut prover);
    // let grouped_actual = prove0_with_grouped_batch_msm(&mut prover);

    // assert_eq!(expected.U, actual.U, "U mismatch!");
    // assert_eq!(expected.V, actual.V, "V mismatch!");
    // assert_eq!(expected.W, actual.W, "W mismatch!");
    // assert_eq!(expected.Q_AX, actual.Q_AX, "Q_AX mismatch!");
    // assert_eq!(expected.Q_AY, actual.Q_AY, "Q_AY mismatch!");
    // assert_eq!(expected.B, actual.B, "B mismatch!");
    // println!("✓ Batch MSM correctness check passed!");

    // assert_eq!(expected.U, grouped_actual.U, "Grouped U mismatch!");
    // assert_eq!(expected.V, grouped_actual.V, "Grouped V mismatch!");
    // assert_eq!(expected.W, grouped_actual.W, "Grouped W mismatch!");
    // assert_eq!(expected.Q_AX, grouped_actual.Q_AX, "Grouped Q_AX mismatch!");
    // assert_eq!(expected.Q_AY, grouped_actual.Q_AY, "Grouped Q_AY mismatch!");
    // assert_eq!(expected.B, grouped_actual.B, "Grouped B mismatch!");
    // println!("✓ Grouped Batch MSM correctness check passed!");
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

    // Find maximum X and Y dimensions across all polynomials
    let mut max_x_size = 0;
    let mut max_y_size = 0;
    let mut poly_infos = Vec::new();

    for poly in polynomials {
        // After optimize_size(), use x_size and y_size
        let target_x_size = (poly.x_degree + 1) as usize;
        let target_y_size = (poly.y_degree + 1) as usize;

        if target_x_size > rs_x_size || target_y_size > rs_y_size {
            panic!("Polynomial size exceeds reference string size");
        }

        max_x_size = max_x_size.max(target_x_size);
        max_y_size = max_y_size.max(target_y_size);

        poly_infos.push((poly, target_x_size, target_y_size));
    }

    // Log padding waste to understand the inefficiency
    let total_coeffs_actual: usize = poly_infos.iter().map(|(_, x, y)| x * y).sum();
    let total_coeffs_padded = batch_size * max_x_size * max_y_size;

    if total_coeffs_actual > 0 {
        let padding_factor = total_coeffs_padded as f64 / total_coeffs_actual as f64;
        println!(
            "\nBatch MSM Padding Analysis:\n  Actual coefficients: {}\n  Padded coefficients: {}\n  Padding factor: {:.2}x waste\n  Individual dimensions:",
            total_coeffs_actual, total_coeffs_padded, padding_factor
        );
        for (i, (_, x, y)) in poly_infos.iter().enumerate() {
            println!("    Poly {}: {}×{} (area: {})", i, x, y, x * y);
        }
        println!(
            "  Padded to: {}×{} (area: {})\n",
            max_x_size,
            max_y_size,
            max_x_size * max_y_size
        );
    }

    // Resize reference string ONCE to the maximum 2D dimensions
    let rs_shared = resize(
        &sigma1.xy_powers,
        rs_x_size,
        rs_y_size,
        max_x_size,
        max_y_size,
        G1serde::zero(),
    );
    let rs_points: Vec<G1Affine> = rs_shared.iter().map(|x| x.0).collect();

    // Prepare all polynomial coefficients, resized directly to uniform 2D size
    let mut flat_scalars = Vec::new();

    for (poly, target_x, target_y) in poly_infos {
        // Get polynomial coefficients
        // println!("size: {:?}, {:?}", poly.x_size, poly.y_size);
        let mut poly_coeffs = vec![ScalarField::zero(); poly.x_size * poly.y_size];
        poly.copy_coeffs(0, HostSlice::from_mut_slice(&mut poly_coeffs));

        // Single resize operation directly to max dimensions
        // This combines both resizing to target and padding to max in one operation
        let poly_coeffs_padded = resize(
            &poly_coeffs,
            poly.x_size,
            poly.y_size,
            max_x_size,
            max_y_size,
            ScalarField::zero(),
        );

        flat_scalars.extend(poly_coeffs_padded);
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

    // Configure batch MSM - now points ARE shared with uniform 2D structure
    let mut config = MSMConfig::default();
    config.batch_size = batch_size as i32;
    config.are_points_shared_in_batch = true; // Shared points for better performance!
    config.is_async = true;
    config.stream_handle = *stream;

    // Perform batch MSM
    // let t_msm_start = Instant::now();
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

/// Implement prove0 with grouped batch MSM operations
/// Groups polynomials by dimensions to minimize padding overhead
fn prove0_with_grouped_batch_msm(prover: &mut Prover) -> Proof0 {
    use std::collections::HashMap;

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

    // Prepare all 6 polynomials with names for tracking
    let mut named_polynomials = Vec::with_capacity(6);

    // 1. U polynomial
    let mut UXY = poly_comb!(
        (ScalarField::one(), prover.witness.uXY),
        (prover.mixer.rU_X, prover.instance.t_n),
        (prover.mixer.rU_Y, prover.instance.t_smax)
    );
    UXY.optimize_size();
    named_polynomials.push(("U", UXY));

    // 2. V polynomial
    let mut VXY = poly_comb!(
        (ScalarField::one(), prover.witness.vXY),
        (prover.mixer.rV_X, prover.instance.t_n),
        (prover.mixer.rV_Y, prover.instance.t_smax)
    );
    VXY.optimize_size();
    named_polynomials.push(("V", VXY));

    // 3. W polynomial
    let mut WXY = poly_comb!(
        (ScalarField::one(), prover.witness.wXY),
        (rW_X, prover.instance.t_n),
        (rW_Y, prover.instance.t_smax)
    );
    WXY.optimize_size();
    named_polynomials.push(("W", WXY));

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
    named_polynomials.push(("Q_AX", Q_AX_XY));

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
    named_polynomials.push(("Q_AY", Q_AY_XY));

    // 6. B polynomial
    let term_B_zk = &(&rB_X * &prover.instance.t_mi) + &(&rB_Y * &prover.instance.t_smax);
    let mut BXY = &prover.witness.bXY + &term_B_zk;
    BXY.optimize_size();
    named_polynomials.push(("B", BXY));

    // Group polynomials by dimensions
    let mut dimension_groups: HashMap<(usize, usize), Vec<(usize, &str, &DensePolynomialExt)>> =
        HashMap::new();

    for (idx, (name, poly)) in named_polynomials.iter().enumerate() {
        let target_x = (poly.x_degree + 1) as usize;
        let target_y = (poly.y_degree + 1) as usize;
        dimension_groups
            .entry((target_x, target_y))
            .or_default()
            .push((idx, name, poly));
    }

    println!("\nGrouped Batch MSM - {} groups:", dimension_groups.len());
    for ((x, y), group) in &dimension_groups {
        let poly_names: Vec<&str> = group.iter().map(|(_, name, _)| *name).collect();
        println!("  Group {}×{}: {:?}", x, y, poly_names);
    }

    // Process each group separately
    let mut all_results = vec![G1serde::zero(); 6];

    for ((target_x, target_y), group) in dimension_groups {
        let group_polynomials: Vec<&DensePolynomialExt> =
            group.iter().map(|(_, _, p)| *p).collect();
        let group_indices: Vec<usize> = group.iter().map(|(idx, _, _)| *idx).collect();

        // Encode this group with its exact dimensions (no padding between group members)
        let group_results = batch_encode_polynomials_exact_size(
            &group_polynomials,
            target_x,
            target_y,
            &prover.sigma.sigma_1,
            &prover.setup_params,
        );

        // Place results in correct positions
        for (group_pos, original_idx) in group_indices.iter().enumerate() {
            all_results[*original_idx] = group_results[group_pos];
        }
    }

    // Extract results in correct order
    Proof0 {
        U: all_results[0],
        V: all_results[1],
        W: all_results[2],
        Q_AX: all_results[3],
        Q_AY: all_results[4],
        B: all_results[5],
    }
}

/// Batch encode polynomials with exact dimensions (no padding between them)
fn batch_encode_polynomials_exact_size(
    polynomials: &[&DensePolynomialExt],
    target_x: usize,
    target_y: usize,
    sigma1: &libs::group_structures::Sigma1,
    params: &libs::iotools::SetupParams,
) -> Vec<G1serde> {
    // use std::time::Instant;
    // let total_start = Instant::now();

    let rs_x_size = std::cmp::max(2 * params.n, 2 * (params.l_D - params.l));
    let rs_y_size = params.s_max * 2;
    let batch_size = polynomials.len();

    if target_x > rs_x_size || target_y > rs_y_size {
        panic!("Polynomial size exceeds reference string size");
    }

    if target_x * target_y == 0 || batch_size == 0 {
        return vec![G1serde::zero(); batch_size];
    }

    // Resize reference string to exact dimensions needed
    let t_rs_start = Instant::now();
    let rs_shared = resize(
        &sigma1.xy_powers,
        rs_x_size,
        rs_y_size,
        target_x,
        target_y,
        G1serde::zero(),
    );
    let rs_points: Vec<G1Affine> = rs_shared.iter().map(|x| x.0).collect();
    // let t_rs = t_rs_start.elapsed();

    // Prepare polynomial coefficients - all have same dimensions, minimal padding
    // let t_poly_prep_start = Instant::now();
    let mut flat_scalars = Vec::with_capacity(batch_size * target_x * target_y);

    for poly in polynomials {
        let mut poly_coeffs = vec![ScalarField::zero(); poly.x_size * poly.y_size];
        poly.copy_coeffs(0, HostSlice::from_mut_slice(&mut poly_coeffs));

        // Resize to exact target dimensions
        let poly_coeffs_resized = resize(
            &poly_coeffs,
            poly.x_size,
            poly.y_size,
            target_x,
            target_y,
            ScalarField::zero(),
        );

        flat_scalars.extend(poly_coeffs_resized);
    }
    // let t_poly_prep = t_poly_prep_start.elapsed();

    use std::time::Instant;
    use std::sync::atomic::{AtomicBool, Ordering};
    static PRINTED: AtomicBool = AtomicBool::new(false);
    let should_print = !PRINTED.swap(true, Ordering::Relaxed);

    let t_start = Instant::now();

    // Create HostSlices for direct execution (letting library handle device memory)
    let scalars_slice = HostSlice::from_slice(&flat_scalars);
    let points_slice = HostSlice::from_slice(&rs_points);
    let mut results = vec![G1Projective::zero(); batch_size];
    let results_slice = HostSlice::from_mut_slice(&mut results);

    let t_prep = t_start.elapsed();

    // Configure batch MSM with shared points
    let mut config = MSMConfig::default();
    config.batch_size = batch_size as i32;
    config.are_points_shared_in_batch = true;
    config.is_async = false; // Synchronous execution
    
    let t_msm_start = Instant::now();
    // Perform batch MSM
    msm::msm(scalars_slice, points_slice, &config, results_slice).unwrap();
    let t_msm = t_msm_start.elapsed();

    if should_print {
        println!("\n[Batch MSM Timing Breakdown]");
        println!("  Preparation (HostSlice creation): {:?}", t_prep);
        println!("  MSM Execution: {:?}", t_msm);
        println!("  Total Batch Encode Time: {:?}", t_start.elapsed());
    }

    // let total_time = total_start.elapsed();

    // // Print timing breakdown (once per benchmark run)
    // static mut PRINT_COUNT: u32 = 0;
    // unsafe {
    //     if PRINT_COUNT < 2 {
    //         // Print for first couple of groups
    //         println!(
    //             "\n  Timing breakdown for group {}×{} ({} polys):",
    //             target_x, target_y, batch_size
    //         );
    //         println!("    RS resize: {:?}", t_rs);
    //         println!("    Poly prep & resize: {:?}", t_poly_prep);
    //         println!("    MSM operation: {:?}", t_msm);
    //         println!("    Total: {:?}", total_time);
    //         println!(
    //             "    Overhead: {:?}\n",
    //             total_time - (t_rs + t_poly_prep + t_msm)
    //         );
    //         PRINT_COUNT += 1;
    //     }
    // }

    // Convert to G1serde
    results
        .iter()
        .map(|p| G1serde(G1Affine::from(*p)))
        .collect()
}



criterion_group!(benches, bench_prove0_simple);
criterion_main!(benches);
