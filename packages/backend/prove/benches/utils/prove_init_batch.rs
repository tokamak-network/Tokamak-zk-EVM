use icicle_bls12_381::curve::{G1Affine, G1Projective, ScalarField};
use icicle_core::msm::{self, MSMConfig};
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::{DeviceVec, HostSlice};
use icicle_runtime::stream::IcicleStream;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::group_structures::{G1serde, Sigma1};
use libs::iotools::{PlacementVariables, SetupParams, SubcircuitInfo};
use libs::vector_operations::resize;
use prove::{Binding, Prover};

/// Prepare data for encode_poly
pub fn prepare_encode_poly(
    poly: &mut DensePolynomialExt,
    sigma1: &Sigma1,
    params: &SetupParams,
) -> (Vec<ScalarField>, Vec<G1Affine>) {
    poly.optimize_size();
    let x_size = poly.x_size;
    let y_size = poly.y_size;
    let rs_x_size = std::cmp::max(2 * params.n, 2 * (params.l_D - params.l));
    let rs_y_size = params.s_max * 2;
    let target_x_size = (poly.x_degree + 1) as usize;
    let target_y_size = (poly.y_degree + 1) as usize;

    if target_x_size > rs_x_size || target_y_size > rs_y_size {
        panic!("Insufficient length of sigma.sigma_1.xy_powers");
    }
    if target_x_size * target_y_size == 0 {
        return (vec![], vec![]);
    }

    let poly_coeffs_vec_compact = {
        let mut poly_coeffs_vec = vec![ScalarField::zero(); x_size * y_size];
        let poly_coeffs = HostSlice::from_mut_slice(&mut poly_coeffs_vec);
        poly.copy_coeffs(0, poly_coeffs);
        resize(
            &poly_coeffs_vec,
            x_size,
            y_size,
            target_x_size,
            target_y_size,
            ScalarField::zero(),
        )
    };

    let rs_unpacked: Vec<G1Affine> = {
        let rs_resized = resize(
            &sigma1.xy_powers,
            rs_x_size,
            rs_y_size,
            target_x_size,
            target_y_size,
            G1serde::zero(),
        );
        rs_resized.iter().map(|x| x.0).collect()
    };

    (poly_coeffs_vec_compact, rs_unpacked)
}

/// Prepare data for encode_o_inst
pub fn prepare_encode_O_inst(
    sigma1: &Sigma1,
    placement_variables: &[PlacementVariables],
    subcircuit_infos: &[SubcircuitInfo],
    setup_params: &SetupParams,
) -> (Vec<ScalarField>, Vec<G1Affine>) {
    let mut aligned_rs = vec![G1Affine::zero(); setup_params.l];
    let mut aligned_wtns = vec![ScalarField::zero(); setup_params.l];
    let mut cnt: usize = 0;
    for i in 0..4 {
        let subcircuit_id = placement_variables[i].subcircuitId;
        let variables = &placement_variables[i].variables;
        let subcircuit_info = &subcircuit_infos[subcircuit_id];
        let flatten_map = &subcircuit_info.flattenMap;
        let (start_idx, end_idx_exclusive) = if subcircuit_info.name == "bufferPubOut" {
            // PUBLIC_OUT
            (
                subcircuit_info.Out_idx[0],
                subcircuit_info.Out_idx[0] + subcircuit_info.Out_idx[1],
            )
        } else if subcircuit_info.name == "bufferPubIn" {
            // PUBLIC_IN
            (
                subcircuit_info.In_idx[0],
                subcircuit_info.In_idx[0] + subcircuit_info.In_idx[1],
            )
        } else if subcircuit_info.name == "bufferBlockIn" {
            // BLOCK_IN
            (
                subcircuit_info.In_idx[0],
                subcircuit_info.In_idx[0] + subcircuit_info.In_idx[1],
            )
        } else if subcircuit_info.name == "bufferEVMIn" {
            // EVM_IN
            (
                subcircuit_info.In_idx[0],
                subcircuit_info.In_idx[0] + subcircuit_info.In_idx[1],
            )
        } else {
            panic!("Target placement is not a buffer")
        };

        for j in start_idx..end_idx_exclusive {
            aligned_wtns[cnt] = ScalarField::from_hex(&variables[j]);
            let global_idx = flatten_map[j];
            let curve_point = sigma1.gamma_inv_o_inst[global_idx].0;
            aligned_rs[cnt] = curve_point;
            cnt += 1;
        }
    }
    (aligned_wtns, aligned_rs)
}

/// Helper for encode_statement
fn _prepare_encode_statement(
    global_wire_index_offset: usize,
    global_wire_index_end: usize,
    nVar: usize,
    bases: &Box<[Box<[G1serde]>]>,
    placement_variables: &[PlacementVariables],
    subcircuit_infos: &[SubcircuitInfo],
) -> (Vec<ScalarField>, Vec<G1Affine>) {
    let mut aligned_rs = vec![G1Affine::zero(); nVar];
    let mut aligned_variable = vec![ScalarField::zero(); nVar];
    let mut cnt: usize = 0;
    for i in 0..placement_variables.len() {
        let subcircuit_id = placement_variables[i].subcircuitId;
        let variables = &placement_variables[i].variables;
        let subcircuit_info = &subcircuit_infos[subcircuit_id];
        let flatten_map = &subcircuit_info.flattenMap;
        for j in 0..subcircuit_info.Nwires {
            if flatten_map[j] >= global_wire_index_offset && flatten_map[j] < global_wire_index_end
            {
                let global_idx = flatten_map[j] - global_wire_index_offset;
                aligned_variable[cnt] = ScalarField::from_hex(&variables[j]);
                let curve_point = bases[global_idx][i].0;
                aligned_rs[cnt] = curve_point;
                cnt += 1;
            }
        }
    }
    (aligned_variable, aligned_rs)
}

/// Prepare data for encode_O_mid_no_zk
pub fn prepare_encode_O_mid_no_zk(
    sigma1: &Sigma1,
    placement_variables: &[PlacementVariables],
    subcircuit_infos: &[SubcircuitInfo],
    setup_params: &SetupParams,
) -> (Vec<ScalarField>, Vec<G1Affine>) {
    let mut nVar: usize = 0;
    for i in 0..placement_variables.len() {
        let subcircuit_id = placement_variables[i].subcircuitId;
        let subcircuit_info = &subcircuit_infos[subcircuit_id];
        if subcircuit_info.name == "bufferPubOut" {
            // PUBLIC_OUT
            nVar = nVar + subcircuit_info.In_idx[1]; // Number of input wires
        } else if subcircuit_info.name == "bufferPubIn" {
            // PUBLIC_IN
            nVar = nVar + subcircuit_info.Out_idx[1]; // Number of output wires
        } else if subcircuit_info.name == "bufferBlockIn" {
            // BLOCK_IN
            nVar = nVar + subcircuit_info.Out_idx[1]; // Number of output wires
        } else if subcircuit_info.name == "bufferEVMIn" {
            // EVM_IN
            nVar = nVar + subcircuit_info.Out_idx[1]; // Number of output wires
        } else {
            nVar = nVar + subcircuit_info.Out_idx[1] + subcircuit_info.In_idx[1];
        }
    }

    _prepare_encode_statement(
        setup_params.l,
        setup_params.l_D,
        nVar,
        &sigma1.eta_inv_li_o_inter_alpha4_kj,
        placement_variables,
        subcircuit_infos,
    )
}

/// Prepare data for encode_O_prv_no_zk
pub fn prepare_encode_O_prv_no_zk(
    sigma1: &Sigma1,
    placement_variables: &[PlacementVariables],
    subcircuit_infos: &[SubcircuitInfo],
    setup_params: &SetupParams,
) -> (Vec<ScalarField>, Vec<G1Affine>) {
    let mut nVar: usize = 0;
    for i in 0..placement_variables.len() {
        let subcircuit_id = placement_variables[i].subcircuitId;
        let subcircuit_info = &subcircuit_infos[subcircuit_id];
        nVar = nVar
            + (subcircuit_info.Nwires - subcircuit_info.In_idx[1] - subcircuit_info.Out_idx[1]);
    }

    _prepare_encode_statement(
        setup_params.l_D,
        setup_params.m_D,
        nVar,
        &sigma1.delta_inv_li_o_prv,
        placement_variables,
        subcircuit_infos,
    )
}

pub fn prove_init_msm_batched(
    prover: &mut Prover,
    placement_variables: &[PlacementVariables],
    subcircuit_infos: &[SubcircuitInfo],
) -> Binding {
    // 1. Prepare data for all MSMs
    let (scalars_A, points_A) = prepare_encode_poly(
        &mut prover.instance.a_pub_X,
        &prover.sigma.sigma_1,
        &prover.setup_params,
    );

    let (scalars_O_inst, points_O_inst) = prepare_encode_O_inst(
        &prover.sigma.sigma_1,
        placement_variables,
        subcircuit_infos,
        &prover.setup_params,
    );

    let (scalars_O_mid, points_O_mid) = prepare_encode_O_mid_no_zk(
        &prover.sigma.sigma_1,
        placement_variables,
        subcircuit_infos,
        &prover.setup_params,
    );

    let (scalars_O_prv, points_O_prv) = prepare_encode_O_prv_no_zk(
        &prover.sigma.sigma_1,
        placement_variables,
        subcircuit_infos,
        &prover.setup_params,
    );

    // 2. Batch MSM
    let sizes = [
        scalars_A.len(),
        scalars_O_inst.len(),
        scalars_O_mid.len(),
        scalars_O_prv.len(),
    ];
    let max_size = *sizes.iter().max().unwrap();

    // Pad scalars and points
    let mut flat_scalars = Vec::with_capacity(4 * max_size);
    let mut flat_points = Vec::with_capacity(4 * max_size);

    let inputs = [
        (&scalars_A, &points_A),
        (&scalars_O_inst, &points_O_inst),
        (&scalars_O_mid, &points_O_mid),
        (&scalars_O_prv, &points_O_prv),
    ];

    for (scalars, points) in inputs.iter() {
        // Pad scalars with zero
        let mut padded_scalars = scalars.to_vec();
        padded_scalars.resize(max_size, ScalarField::zero());
        flat_scalars.extend(padded_scalars);

        // Pad points with zero (infinity)
        let mut padded_points = points.to_vec();
        padded_points.resize(max_size, G1Affine::zero());
        flat_points.extend(padded_points);
    }

    // Run batch MSM
    let mut stream = IcicleStream::create().unwrap();
    let mut d_scalars = DeviceVec::device_malloc_async(flat_scalars.len(), &stream).unwrap();
    let mut d_points = DeviceVec::device_malloc_async(flat_points.len(), &stream).unwrap();
    let mut d_results = DeviceVec::device_malloc_async(4, &stream).unwrap();

    d_scalars
        .copy_from_host_async(HostSlice::from_slice(&flat_scalars), &stream)
        .unwrap();
    d_points
        .copy_from_host_async(HostSlice::from_slice(&flat_points), &stream)
        .unwrap();

    let mut config = MSMConfig::default();
    config.batch_size = 4;
    config.are_points_shared_in_batch = false;
    config.is_async = true;
    config.stream_handle = *stream;

    msm::msm(&d_scalars[..], &d_points[..], &config, &mut d_results[..]).unwrap();

    stream.synchronize().unwrap();
    let mut results = vec![G1Projective::zero(); 4];
    d_results
        .copy_to_host(HostSlice::from_mut_slice(&mut results))
        .unwrap();
    stream.destroy().unwrap();

    let A = G1serde(G1Affine::from(results[0]));
    let O_inst_core = G1serde(G1Affine::from(results[1]));
    let O_mid_core = G1serde(G1Affine::from(results[2]));
    let O_prv_core = G1serde(G1Affine::from(results[3]));

    // 3. Post-processing
    let O_inst = O_inst_core;

    let O_mid = O_mid_core + prover.sigma.sigma_1.delta * prover.mixer.rO_mid;

    let mut O_prv = O_prv_core - prover.sigma.sigma_1.eta * prover.mixer.rO_mid;

    O_prv = O_prv + prover.sigma.sigma_1.delta_inv_alphak_xh_tx[0][0] * prover.mixer.rU_X;
    O_prv = O_prv + prover.sigma.sigma_1.delta_inv_alphak_xh_tx[1][0] * prover.mixer.rV_X;
    O_prv = O_prv
        + (prover.sigma.sigma_1.delta_inv_alphak_xh_tx[2][0] * prover.mixer.rW_X[0]
            + prover.sigma.sigma_1.delta_inv_alphak_xh_tx[2][1] * prover.mixer.rW_X[1]
            + prover.sigma.sigma_1.delta_inv_alphak_xh_tx[2][2] * prover.mixer.rW_X[2]);
    O_prv = O_prv
        + (prover.sigma.sigma_1.delta_inv_alpha4_xj_tx[0] * prover.mixer.rB_X[0]
            + prover.sigma.sigma_1.delta_inv_alpha4_xj_tx[1] * prover.mixer.rB_X[1]);

    O_prv = O_prv + prover.sigma.sigma_1.delta_inv_alphak_yi_ty[0][0] * prover.mixer.rU_Y;
    O_prv = O_prv + prover.sigma.sigma_1.delta_inv_alphak_yi_ty[1][0] * prover.mixer.rV_Y;
    O_prv = O_prv
        + (prover.sigma.sigma_1.delta_inv_alphak_yi_ty[2][0] * prover.mixer.rW_Y[0]
            + prover.sigma.sigma_1.delta_inv_alphak_yi_ty[2][1] * prover.mixer.rW_Y[1]
            + prover.sigma.sigma_1.delta_inv_alphak_yi_ty[2][2] * prover.mixer.rW_Y[2]);
    O_prv = O_prv
        + (prover.sigma.sigma_1.delta_inv_alphak_yi_ty[3][0] * prover.mixer.rB_Y[0]
            + prover.sigma.sigma_1.delta_inv_alphak_yi_ty[3][1] * prover.mixer.rB_Y[1]);

    Binding {
        A,
        O_inst,
        O_mid,
        O_prv,
    }
}

pub fn prove_init_msm_sequential(
    prover: &mut Prover,
    placement_variables: &[PlacementVariables],
    subcircuit_infos: &[SubcircuitInfo],
) -> Binding {
    let A = prover
        .sigma
        .sigma_1
        .encode_poly(&mut prover.instance.a_pub_X, &prover.setup_params);
    let O_inst = prover.sigma.sigma_1.encode_O_inst(
        placement_variables,
        subcircuit_infos,
        &prover.setup_params,
    );
    // prover.sigma.sigma_1.gamma_inv_o_inst = vec![G1serde::zero()].into_boxed_slice(); // Skip clearing for benchmark
    let O_mid_core = prover.sigma.sigma_1.encode_O_mid_no_zk(
        placement_variables,
        subcircuit_infos,
        &prover.setup_params,
    );
    // prover.sigma.sigma_1.eta_inv_li_o_inter_alpha4_kj = vec![vec![G1serde::zero()].into_boxed_slice()].into_boxed_slice(); // Skip clearing
    let O_mid = O_mid_core + prover.sigma.sigma_1.delta * prover.mixer.rO_mid;
    let O_prv_core = prover.sigma.sigma_1.encode_O_prv_no_zk(
        placement_variables,
        subcircuit_infos,
        &prover.setup_params,
    );
    // prover.sigma.sigma_1.delta_inv_li_o_prv = vec![vec![G1serde::zero()].into_boxed_slice()].into_boxed_slice(); // Skip clearing
    let mut O_prv = O_prv_core - prover.sigma.sigma_1.eta * prover.mixer.rO_mid;

    O_prv = O_prv + prover.sigma.sigma_1.delta_inv_alphak_xh_tx[0][0] * prover.mixer.rU_X;
    O_prv = O_prv + prover.sigma.sigma_1.delta_inv_alphak_xh_tx[1][0] * prover.mixer.rV_X;
    O_prv = O_prv
        + (prover.sigma.sigma_1.delta_inv_alphak_xh_tx[2][0] * prover.mixer.rW_X[0]
            + prover.sigma.sigma_1.delta_inv_alphak_xh_tx[2][1] * prover.mixer.rW_X[1]
            + prover.sigma.sigma_1.delta_inv_alphak_xh_tx[2][2] * prover.mixer.rW_X[2]);
    O_prv = O_prv
        + (prover.sigma.sigma_1.delta_inv_alpha4_xj_tx[0] * prover.mixer.rB_X[0]
            + prover.sigma.sigma_1.delta_inv_alpha4_xj_tx[1] * prover.mixer.rB_X[1]);

    O_prv = O_prv + prover.sigma.sigma_1.delta_inv_alphak_yi_ty[0][0] * prover.mixer.rU_Y;
    O_prv = O_prv + prover.sigma.sigma_1.delta_inv_alphak_yi_ty[1][0] * prover.mixer.rV_Y;
    O_prv = O_prv
        + (prover.sigma.sigma_1.delta_inv_alphak_yi_ty[2][0] * prover.mixer.rW_Y[0]
            + prover.sigma.sigma_1.delta_inv_alphak_yi_ty[2][1] * prover.mixer.rW_Y[1]
            + prover.sigma.sigma_1.delta_inv_alphak_yi_ty[2][2] * prover.mixer.rW_Y[2]);
    O_prv = O_prv
        + (prover.sigma.sigma_1.delta_inv_alphak_yi_ty[3][0] * prover.mixer.rB_Y[0]
            + prover.sigma.sigma_1.delta_inv_alphak_yi_ty[3][1] * prover.mixer.rB_Y[1]);

    Binding {
        A,
        O_inst,
        O_mid,
        O_prv,
    }
}
