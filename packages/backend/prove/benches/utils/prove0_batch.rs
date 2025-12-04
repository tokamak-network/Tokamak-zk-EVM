use crate::poly_comb;
use icicle_bls12_381::curve::{G1Affine, G1Projective, ScalarField};
use icicle_core::msm::{self, MSMConfig};
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::{DeviceVec, HostSlice};
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::group_structures::G1serde;
use libs::vector_operations::resize;
use prove::{Proof0, Prover};
use std::collections::HashMap;
use std::time::Instant;

/// Implement prove0 with batch MSM operations
/// This batches all the encode_poly operations (U, V, W, Q_AX, Q_AY, B)
pub fn prove0_with_batch_msm(prover: &mut Prover) -> Proof0 {
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
use icicle_runtime::stream::IcicleStream;
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
pub fn prove0_with_grouped_batch_msm(prover: &mut Prover) -> Proof0 {
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

/// Batch encode multiple polynomials using a single MSM operation
/// All polynomials MUST have the exact same dimensions (target_x, target_y)
fn batch_encode_polynomials_exact_size(
    polynomials: &[&DensePolynomialExt],
    target_x: usize,
    target_y: usize,
    sigma1: &libs::group_structures::Sigma1,
    params: &libs::iotools::SetupParams,
) -> Vec<G1serde> {
    let batch_size = polynomials.len();
    if batch_size == 0 {
        return vec![];
    }

    let rs_x_size = std::cmp::max(2 * params.n, 2 * (params.l_D - params.l));
    let rs_y_size = params.s_max * 2;

    if target_x > rs_x_size || target_y > rs_y_size {
        panic!("Polynomial size exceeds reference string size");
    }

    if target_x * target_y == 0 {
        return vec![G1serde::zero(); batch_size];
    }

    // Resize reference string ONCE to the exact dimensions needed
    let rs_shared = resize(
        &sigma1.xy_powers,
        rs_x_size,
        rs_y_size,
        target_x,
        target_y,
        G1serde::zero(),
    );
    let rs_points: Vec<G1Affine> = rs_shared.iter().map(|x| x.0).collect();

    // Prepare all polynomial coefficients (flattened for batch)
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

    // Configure batch MSM with SHARED POINTS
    let mut config = MSMConfig::default();
    config.batch_size = batch_size as i32;
    config.are_points_shared_in_batch = true; // Key optimization!

    let mut results = vec![G1Projective::zero(); batch_size];

    msm::msm(
        HostSlice::from_slice(&flat_scalars),
        HostSlice::from_slice(&rs_points), // Points passed only once
        &config,
        HostSlice::from_mut_slice(&mut results),
    )
    .unwrap();

    // Convert to G1serde
    results
        .iter()
        .map(|p| G1serde(G1Affine::from(*p)))
        .collect()
}
