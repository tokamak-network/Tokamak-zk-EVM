use std::env;
use std::path::Path;

use clap::Parser;
use icicle_bls12_381::curve::{G1Affine, ScalarField};
use icicle_core::traits::FieldImpl;
use libs::group_structures::{G1serde, Sigma, Sigma1, Sigma2};
use libs::iotools::{SetupParams, SubcircuitInfo, SubcircuitR1CS};
use libs::utils::{
    init_ntt_domain, setup_shape, trusted_setup_ntt_domain_size, validate_public_wire_size,
    validate_setup_shape,
};
use mpc_setup::mpc_utils::compute_langrange_i_coeffs;
use mpc_setup::phase1_source::{AccumulatorSource, Phase1SrsSource};
use mpc_setup::sigma::{save_contributor_info, SigmaV2, HASH_BYTES_LEN};
use mpc_setup::utils::{load_gpu_if_possible, prompt_user_input};
use mpc_setup::{
    compute_lagrange_kl_from_source, ensure_testing_mode, public_wire_segments, MsmWorkspace,
    NttWorkspace, QAP_COMPILER_PATH_PREFIX,
};
use std::ops::Sub;
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,

    #[arg(long, value_name = "IS_CHECKING")]
    is_checking: bool,

    #[arg(long, value_name = "PART_NO", default_value = "0")]
    part_no: Option<usize>,

    #[arg(long, value_name = "TOTAL_PART", default_value = "1")]
    total_part: Option<usize>,

    #[arg(long, value_name = "MERGE_PARTS", default_value = "false")]
    merge_parts: Option<bool>,
}
// cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output --is-checking
// cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output
//cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output --total-part 16 --part-no 0
//cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output --total-part 16 --part-no 0 --merge-parts

fn main() {
    let use_gpu: bool = env::var("USE_GPU")
        .ok()
        .and_then(|v| v.parse::<bool>().ok())
        .unwrap_or(false); // default to false
    let mut is_gpu_enabled = false;
    if use_gpu {
        is_gpu_enabled = load_gpu_if_possible()
    }
    let config = Config::parse();
    let outfolder = config.outfolder;
    let start1 = Instant::now();
    let part_no = config.part_no.unwrap();
    let total_part = config.total_part.unwrap();
    let is_merge = config.merge_parts.unwrap();
    if is_merge {
        let sigma: SigmaV2 = merge_all_parts(&outfolder, total_part);
        sigma
            .write_into_json(&format!("{}/phase2_acc_0.json", outfolder))
            .expect("cannot write sigma into json");
        return;
    }
    if total_part > 1 {
        assert_eq!(part_no < total_part, true);
        assert_eq!(is_power_of_two_bitwise(total_part), true);
    }
    let contributor_index = prompt_user_input("Enter the last phase-1 contributor's index:")
        .parse::<usize>()
        .expect("Please enter a valid number");
    let sigma = process_prepare(
        contributor_index,
        &outfolder,
        is_gpu_enabled,
        config.is_checking,
        total_part,
        part_no,
    );
    if config.part_no.is_some() && config.total_part.is_some() {
        sigma
            .write_into_json(&format!(
                "{}/phase2_acc_0_{}_{}.json",
                outfolder, total_part, part_no
            ))
            .expect("cannot write sigma into json");
    } else {
        sigma
            .write_into_json(&format!("{}/phase2_acc_0.json", outfolder))
            .expect("cannot write sigma into json");
    }

    save_contributor_info(
        &sigma,
        start1.elapsed(),
        "Phase2 Prepare",
        "UK",
        format!("{}/phase2_contributor_0.txt", outfolder),
        hex::encode([0u8; HASH_BYTES_LEN]),
        hex::encode([0u8; HASH_BYTES_LEN]),
        hex::encode([0u8; HASH_BYTES_LEN]),
    )
    .expect("cannot write contributor info");
    println!(
        "The total time: {:.6} seconds",
        start1.elapsed().as_secs_f64()
    );
}
pub fn extend_boxed_2d_array(target: &mut Box<[Box<[G1serde]>]>, source: &Box<[Box<[G1serde]>]>) {
    let mut temp: Vec<Vec<G1serde>> = target.iter().map(|row| row.to_vec()).collect();
    let source_vec: Vec<Vec<G1serde>> = source.iter().map(|row| row.to_vec()).collect();

    temp.extend(source_vec);

    *target = temp
        .into_iter()
        .map(|v| v.into_boxed_slice())
        .collect::<Vec<_>>()
        .into_boxed_slice();
}

fn merge_optional_point(target: &mut G1serde, source: G1serde) {
    if *target == G1serde::zero() {
        *target = source;
    } else if source != G1serde::zero() {
        assert_eq!(*target, source);
    }
}

fn add_point(target: &mut G1serde, source: G1serde) {
    if source != G1serde::zero() {
        *target = *target + source;
    }
}

fn add_matrix(target: &mut Box<[Box<[G1serde]>]>, source: &Box<[Box<[G1serde]>]>) {
    assert_eq!(target.len(), source.len());
    for (target_row, source_row) in target.iter_mut().zip(source.iter()) {
        assert_eq!(target_row.len(), source_row.len());
        for (target_cell, source_cell) in target_row.iter_mut().zip(source_row.iter()) {
            add_point(target_cell, *source_cell);
        }
    }
}

fn merge_all_parts(outfolder: &str, total_part: usize) -> SigmaV2 {
    let mut sigma = SigmaV2::read_from_json(&format!(
        "{}/phase2_acc_0_{}_{}.json",
        outfolder, total_part, 0
    ))
    .unwrap();
    for part_no in 1..total_part {
        let next = SigmaV2::read_from_json(&format!(
            "{}/phase2_acc_0_{}_{}.json",
            outfolder, total_part, part_no
        ))
        .unwrap();
        //check some conditions
        assert_eq!(sigma.gamma, next.gamma);
        assert_eq!(sigma.sigma.G, next.sigma.G);
        assert_eq!(sigma.sigma.H, next.sigma.H);
        assert_eq!(sigma.sigma.sigma_2.gamma, next.sigma.sigma_2.gamma);
        assert_eq!(sigma.sigma.sigma_2.y, next.sigma.sigma_2.y);
        assert_eq!(sigma.sigma.sigma_2.x, next.sigma.sigma_2.x);
        assert_eq!(sigma.sigma.sigma_2.delta, next.sigma.sigma_2.delta);
        assert_eq!(sigma.sigma.sigma_2.eta, next.sigma.sigma_2.eta);
        assert_eq!(sigma.sigma.sigma_2.alpha, next.sigma.sigma_2.alpha);
        assert_eq!(sigma.sigma.sigma_2.alpha2, next.sigma.sigma_2.alpha2);
        assert_eq!(sigma.sigma.sigma_2.alpha3, next.sigma.sigma_2.alpha3);
        assert_eq!(sigma.sigma.sigma_2.alpha4, next.sigma.sigma_2.alpha4);
        assert_eq!(sigma.sigma.sigma_1.x, next.sigma.sigma_1.x);
        assert_eq!(sigma.sigma.sigma_1.y, next.sigma.sigma_1.y);
        assert_eq!(sigma.sigma.sigma_1.eta, next.sigma.sigma_1.eta);
        assert_eq!(sigma.sigma.sigma_1.delta, next.sigma.sigma_1.delta);
        for (target, source) in sigma
            .sigma
            .sigma_1
            .gamma_inv_o_inst
            .iter_mut()
            .zip(next.sigma.sigma_1.gamma_inv_o_inst.iter())
        {
            add_point(target, *source);
        }
        for (target_row, source_row) in sigma
            .sigma
            .sigma_1
            .delta_inv_alphak_yi_ty
            .iter_mut()
            .zip(next.sigma.sigma_1.delta_inv_alphak_yi_ty.iter())
        {
            for (target, source) in target_row.iter_mut().zip(source_row.iter()) {
                merge_optional_point(target, *source);
            }
        }
        for (target, source) in sigma
            .sigma
            .sigma_1
            .delta_inv_alpha4_xj_tx
            .iter_mut()
            .zip(next.sigma.sigma_1.delta_inv_alpha4_xj_tx.iter())
        {
            merge_optional_point(target, *source);
        }
        for (target_row, source_row) in sigma
            .sigma
            .sigma_1
            .delta_inv_alphak_xh_tx
            .iter_mut()
            .zip(next.sigma.sigma_1.delta_inv_alphak_xh_tx.iter())
        {
            for (target, source) in target_row.iter_mut().zip(source_row.iter()) {
                merge_optional_point(target, *source);
            }
        }

        add_matrix(
            &mut sigma.sigma.sigma_1.eta_inv_li_o_inter_alpha4_kj,
            &next.sigma.sigma_1.eta_inv_li_o_inter_alpha4_kj,
        );

        add_matrix(
            &mut sigma.sigma.sigma_1.delta_inv_li_o_prv,
            &next.sigma.sigma_1.delta_inv_li_o_prv,
        );
    }
    sigma
}

fn is_power_of_two_bitwise(n: usize) -> bool {
    // Handle the special case of 0, which is not a power of two
    // (unless you define it as 2^negative_infinity, which is generally not the case)
    if n == 0 {
        false
    } else {
        (n & (n - 1)) == 0
    }
}
pub fn process_prepare(
    contributor_index: usize,
    outfolder: &str,
    is_gpu_enabled: bool,
    is_checking: bool,
    total_part: usize,
    part_no: usize,
) -> SigmaV2 {
    let base_path = env::current_dir().unwrap();
    let qap_path = base_path.join(QAP_COMPILER_PATH_PREFIX);

    let start1 = Instant::now();
    let accumulator = format!("phase1_acc_{}.json", contributor_index);
    let setup_file_name = "setupParams.json";
    let setup_params = SetupParams::read_from_json(qap_path.join(&setup_file_name))
        .expect("cannot SetupParams read file");
    let shape = setup_shape(&setup_params);
    validate_setup_shape(&shape);
    validate_public_wire_size(shape.l_free);
    let ntt_domain_size = trusted_setup_ntt_domain_size(&shape);
    init_ntt_domain(ntt_domain_size);
    let segments = public_wire_segments(&setup_params);
    let n = setup_params.n; // Number of constraints per subcircuit
    let s_max = setup_params.s_max;
    let m_d = setup_params.m_D; // Total number of wires
    let l = setup_params.l; // Number of public I/O wires
    let l_free = setup_params.l_free;
    let l_d = setup_params.l_D; // Number of interface wires
    let m_i = l_d - l;
    println!(
        "Phase-2 prepare setup: n={}, s_max={}, l={}, l_free={}, m_i={}, m_d={}",
        n, s_max, l, l_free, m_i, m_d
    );

    let subcircuit_file_name = "subcircuitInfo.json";
    let subcircuit_infos =
        SubcircuitInfo::read_box_from_json(qap_path.join(&subcircuit_file_name)).unwrap();

    let li_y_coeffs = build_li_y_coeffs(s_max);
    println!("Loading phase-1 source...");
    let phase1_source =
        AccumulatorSource::read_from_json(&format!("{}/{}", outfolder, accumulator))
            .expect("cannot read from latest accumulator json");

    let sigma_trusted = if is_checking {
        ensure_testing_mode("phase2_prepare --is-checking");
        assert_eq!(
            total_part, 1,
            "trusted-reference checking only supports a single-part run"
        );
        println!("Loading trusted reference sigma...");
        Some(SigmaV2::read_from_json("setup/mpc-setup/output/phase2_acc_0.json").unwrap())
    } else {
        None
    };

    let g1 = phase1_source.g1();
    let g2 = phase1_source.g2();
    let batch_count = env::var("BATCH_COUNT")
        .unwrap_or("512".to_string())
        .parse::<usize>()
        .unwrap();
    let basis_x_chunk_size = env::var("BASIS_X_CHUNK_SIZE")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(DEFAULT_BASIS_X_CHUNK_SIZE)
        .max(1);
    let mut msm_workspace = MsmWorkspace::new(batch_count.max(8));
    let mut ntt_workspace = NttWorkspace::new(n.max(1));

    // {γ^(-1)(L_t(y)o_j(x) + M_j(x))}_{t=0,j=0}^{1,l-1} where t=0 for j∈[0,l_in-1] and t=1 for j∈[l_in,l-1]
    let mut gamma_inv_o_inst = vec![G1serde::zero(); l].into_boxed_slice();

    let subcircuit_start = part_no * subcircuit_infos.len() / total_part.max(1);
    let mut subcircuit_end = (part_no + 1) * subcircuit_infos.len() / total_part.max(1);
    if part_no + 1 == total_part {
        subcircuit_end = subcircuit_infos.len();
    }
    let compute_shared_terms = total_part == 1 || part_no == 0;
    // {δ^(-1)α^k x^h t_n(x)}_{h=0,k=1}^{2,3}
    let mut delta_inv_alphak_xh_tx =
        vec![vec![G1serde::zero(); 3].into_boxed_slice(); 3].into_boxed_slice();
    if compute_shared_terms {
        for k in 1..=3 {
            for h in 0..=2 {
                let alphak_xnh = phase1_source.alphax_g1(k, n + h);
                let alphak_xh = phase1_source.alphax_g1(k, h);
                delta_inv_alphak_xh_tx[k - 1][h] = alphak_xnh.sub(alphak_xh);
            }
        }
    }

    // {δ^(-1)α^4 x^j t_{m_I}(x)}_{j=0}^{1}
    let mut delta_inv_alpha4_xj_tx = vec![G1serde::zero(); 2].into_boxed_slice();
    if compute_shared_terms {
        for j in 0..=1 {
            delta_inv_alpha4_xj_tx[j] = phase1_source.alphax_g1(4, m_i + j);
            delta_inv_alpha4_xj_tx[j] =
                delta_inv_alpha4_xj_tx[j].sub(phase1_source.alphax_g1(4, j));
        }
    }

    if compute_shared_terms {
        if let Some(sigma_for_check) = &sigma_trusted {
            assert_eq!(
                sigma_for_check.sigma.sigma_1.delta_inv_alpha4_xj_tx,
                delta_inv_alpha4_xj_tx
            );
        }
    }

    // {δ^(-1)α^k y^i t_{s_max}(y)}_{i=0,k=1}^{2,4}
    let mut delta_inv_alphak_yi_ty =
        vec![vec![G1serde::zero(); 3].into_boxed_slice(); 4].into_boxed_slice();
    if compute_shared_terms {
        for k in 1..=4 {
            for i in 0..=2 {
                delta_inv_alphak_yi_ty[k - 1][i] = phase1_source
                    .alphay_g1(k, s_max + i)
                    .sub(phase1_source.alphay_g1(k, i));
            }
        }
    }
    //assert_eq!(sigma_trusted.sigma.sigma_1.delta_inv_alphak_yi_ty, delta_inv_alphak_yi_ty);
    let lap = start1.elapsed();
    println!(
        "Prepared gamma and delta constants in {:.2} seconds",
        lap.as_secs_f64()
    );

    // {η^(-1)L_i(y)(o_{j+l}(x) + α^4 K_j(x))}_{i=0,j=0}^{s_max-1,m_I-1}
    let mut eta_inv_li_o_inter_alpha4_kj =
        vec![vec![G1serde::zero(); s_max].into_boxed_slice(); m_i].into_boxed_slice();

    // {δ^(-1)L_i(y)o_j(x)}_{i=0,j=l+m_I}^{s_max-1,m_I-1}
    let mut delta_inv_li_o_prv =
        vec![vec![G1serde::zero(); s_max].into_boxed_slice(); m_d - (l + m_i)].into_boxed_slice();
    let chunked_scalar_width = basis_x_chunk_size.min(n) * s_max;
    let gamma_batch_size = gamma_batch_size(is_gpu_enabled, chunked_scalar_width);
    let eta_batch_size = effective_batch_size(chunked_scalar_width, batch_count);
    let delta_batch_size = effective_batch_size(chunked_scalar_width, batch_count);
    let stream_start = Instant::now();

    for (subcircuit_idx, subcircuit_info) in subcircuit_infos
        .iter()
        .enumerate()
        .skip(subcircuit_start)
        .take(subcircuit_end.saturating_sub(subcircuit_start))
    {
        println!(
            "Processing subcircuit {} / {}",
            subcircuit_idx + 1,
            subcircuit_infos.len()
        );
        let r1cs_path = qap_path.join(format!("json/subcircuit{subcircuit_idx}.json"));
        let coeff_view = load_coeff_view(
            &r1cs_path,
            &setup_params,
            subcircuit_info,
            &mut ntt_workspace,
        );

        process_component_for_subcircuit(
            &coeff_view.a,
            &subcircuit_info.flattenMap,
            &segments,
            &li_y_coeffs,
            &phase1_source,
            1,
            compute_shared_terms,
            &mut gamma_inv_o_inst,
            &mut eta_inv_li_o_inter_alpha4_kj,
            &mut delta_inv_li_o_prv,
            l,
            m_i,
            m_d,
            gamma_batch_size,
            eta_batch_size,
            delta_batch_size,
            basis_x_chunk_size,
            0,
            s_max,
            &mut msm_workspace,
        );
        process_component_for_subcircuit(
            &coeff_view.b,
            &subcircuit_info.flattenMap,
            &segments,
            &li_y_coeffs,
            &phase1_source,
            2,
            compute_shared_terms,
            &mut gamma_inv_o_inst,
            &mut eta_inv_li_o_inter_alpha4_kj,
            &mut delta_inv_li_o_prv,
            l,
            m_i,
            m_d,
            gamma_batch_size,
            eta_batch_size,
            delta_batch_size,
            basis_x_chunk_size,
            0,
            s_max,
            &mut msm_workspace,
        );
        process_component_for_subcircuit(
            &coeff_view.c,
            &subcircuit_info.flattenMap,
            &segments,
            &li_y_coeffs,
            &phase1_source,
            3,
            compute_shared_terms,
            &mut gamma_inv_o_inst,
            &mut eta_inv_li_o_inter_alpha4_kj,
            &mut delta_inv_li_o_prv,
            l,
            m_i,
            m_d,
            gamma_batch_size,
            eta_batch_size,
            delta_batch_size,
            basis_x_chunk_size,
            0,
            s_max,
            &mut msm_workspace,
        );
    }
    println!(
        "Streamed subcircuit coefficients in {:.2} seconds",
        stream_start.elapsed().as_secs_f64()
    );

    let xi_g1s = if compute_shared_terms && l_free > 0 {
        phase1_source.x_g1_range(0, l_free - 1)
    } else {
        Vec::new()
    };
    if compute_shared_terms && l_free > 0 {
        let mut batched_scalars = vec![ScalarField::zero(); l_free * l_free];
        for j in 0..l_free {
            let row = &mut batched_scalars[j * l_free..(j + 1) * l_free];
            compute_langrange_i_coeffs(j, l_free, 1, row);
        }
        let results = msm_workspace.shared_bases_msm(&xi_g1s, &batched_scalars, l_free);
        for j in 0..l_free {
            gamma_inv_o_inst[j] = gamma_inv_o_inst[j] + G1serde(G1Affine::from(results[j]));
        }
    }
    if compute_shared_terms {
        if let Some(sigma_for_check) = &sigma_trusted {
            assert_eq!(
                sigma_for_check.sigma.sigma_1.gamma_inv_o_inst,
                gamma_inv_o_inst
            );
            println!("Verified gamma terms against the trusted reference");
        }
    }

    let start2 = Instant::now();
    let lagrange_chunk_width = basis_x_chunk_size.min(m_i) * s_max;
    if compute_shared_terms {
        process_coeff_source_for_eta(
            "kjx",
            m_i,
            effective_batch_size(lagrange_chunk_width, batch_count),
            &li_y_coeffs,
            |j, coeffs| {
                compute_langrange_i_coeffs(j, m_i, 1, coeffs);
                true
            },
            &phase1_source,
            4,
            &mut eta_inv_li_o_inter_alpha4_kj,
            m_i,
            basis_x_chunk_size,
            0,
            s_max,
            &mut msm_workspace,
        );
    }
    if let Some(sigma_for_check) = &sigma_trusted {
        for col_idx in 0..s_max {
            for row_idx in 0..m_i {
                assert_eq!(
                    eta_inv_li_o_inter_alpha4_kj[row_idx][col_idx],
                    sigma_for_check.sigma.sigma_1.eta_inv_li_o_inter_alpha4_kj[row_idx][col_idx]
                );
            }
        }
        println!("Verified eta terms against the trusted reference");
    }
    let eta_items = s_max * m_i;
    if eta_items > 0 {
        let avg = start2.elapsed().as_secs_f64() / eta_items as f64;
        println!("Prepared eta terms at {:.2} items/s", 1f64 / avg);
    }

    if let Some(sigma_for_check) = &sigma_trusted {
        for col_idx in 0..s_max {
            for global_idx in (l + m_i)..m_d {
                let row_idx = global_idx - (l + m_i);
                assert_eq!(
                    delta_inv_li_o_prv[row_idx][col_idx],
                    sigma_for_check.sigma.sigma_1.delta_inv_li_o_prv[row_idx][col_idx]
                );
            }
        }
        println!("Verified private-wire delta terms against the trusted reference");
    }
    let delta_items = s_max * (m_d - (l + m_i));
    if delta_items > 0 {
        let avg = start2.elapsed().as_secs_f64() / delta_items as f64;
        println!(
            "Prepared private-wire delta terms at {:.2} items/s",
            1f64 / avg
        );
    }

    let lagrange_kl = compute_lagrange_kl_from_source(&phase1_source, &setup_params);

    SigmaV2 {
        contributor_index: 0,
        gamma: g1,
        sigma: Sigma {
            G: g1,
            H: g2,
            sigma_1: Sigma1 {
                xy_powers: phase1_source.xy_powers(),
                x: phase1_source.xy_g1(1, 0),
                y: phase1_source.xy_g1(0, 1),
                delta: g1,
                eta: g1,
                gamma_inv_o_inst,
                eta_inv_li_o_inter_alpha4_kj,
                delta_inv_li_o_prv,
                delta_inv_alphak_xh_tx,
                delta_inv_alpha4_xj_tx,
                delta_inv_alphak_yi_ty,
            },
            sigma_2: Sigma2 {
                alpha: phase1_source.alpha_g2(1),
                alpha2: phase1_source.alpha_g2(2),
                alpha3: phase1_source.alpha_g2(3),
                alpha4: phase1_source.alpha_g2(4),
                gamma: g2,
                delta: g2,
                eta: g2,
                x: phase1_source.x_g2(1),
                y: phase1_source.y_g2(1),
            },
            lagrange_KL: lagrange_kl,
        },
    }
}

const MAX_BATCH_SCALARS: usize = 1 << 22;
const DEFAULT_BASIS_X_CHUNK_SIZE: usize = 128;

fn effective_batch_size(scalars_per_item: usize, requested: usize) -> usize {
    let max_batch = (MAX_BATCH_SCALARS / scalars_per_item).max(1);
    requested.max(1).min(max_batch)
}

fn gamma_batch_size(is_gpu_enabled: bool, scalars_per_item: usize) -> usize {
    let requested = if is_gpu_enabled { 1 } else { 7 };
    effective_batch_size(scalars_per_item, requested)
}

struct ActiveCoeffMatrix {
    compact_by_local: Vec<usize>,
    coeffs: Vec<ScalarField>,
    row_len: usize,
}

impl ActiveCoeffMatrix {
    fn from_coeffs(
        active_wires: &[usize],
        coeffs: Vec<ScalarField>,
        local_wire_count: usize,
        row_len: usize,
    ) -> Self {
        let mut compact_by_local = vec![usize::MAX; local_wire_count];
        for (compact_idx, &local_idx) in active_wires.iter().enumerate() {
            compact_by_local[local_idx] = compact_idx;
        }

        Self {
            compact_by_local,
            coeffs,
            row_len,
        }
    }

    fn from_compact_eval_rows(
        compact_eval_rows: &[ScalarField],
        active_wires: &[usize],
        local_wire_count: usize,
        row_len: usize,
        ntt_workspace: &mut NttWorkspace,
    ) -> Self {
        let mut coeffs = Vec::new();
        ntt_workspace.inverse_rows_into(
            compact_eval_rows,
            active_wires.len(),
            row_len,
            &mut coeffs,
        );
        Self::from_coeffs(active_wires, coeffs, local_wire_count, row_len)
    }

    fn row(&self, local_idx: usize) -> Option<&[ScalarField]> {
        let compact_idx = *self.compact_by_local.get(local_idx)?;
        if compact_idx == usize::MAX {
            return None;
        }
        let start = compact_idx * self.row_len;
        let end = start + self.row_len;
        Some(&self.coeffs[start..end])
    }
}

struct LagrangeCoeffTable {
    row_len: usize,
    coeffs: Vec<ScalarField>,
}

impl LagrangeCoeffTable {
    fn new(row_len: usize, coeffs: Vec<ScalarField>) -> Self {
        assert_eq!(coeffs.len() % row_len, 0);
        Self { row_len, coeffs }
    }

    fn row(&self, row_idx: usize) -> &[ScalarField] {
        let start = row_idx * self.row_len;
        let end = start + self.row_len;
        &self.coeffs[start..end]
    }
}

struct SubcircuitCoeffView {
    a: ActiveCoeffMatrix,
    b: ActiveCoeffMatrix,
    c: ActiveCoeffMatrix,
}

impl SubcircuitCoeffView {
    fn from_compact_r1cs(
        compact_r1cs: &SubcircuitR1CS,
        subcircuit_info: &SubcircuitInfo,
        row_len: usize,
        ntt_workspace: &mut NttWorkspace,
    ) -> Self {
        Self {
            a: ActiveCoeffMatrix::from_compact_eval_rows(
                &compact_r1cs.A_compact_col_mat,
                &compact_r1cs.A_active_wires,
                subcircuit_info.Nwires,
                row_len,
                ntt_workspace,
            ),
            b: ActiveCoeffMatrix::from_compact_eval_rows(
                &compact_r1cs.B_compact_col_mat,
                &compact_r1cs.B_active_wires,
                subcircuit_info.Nwires,
                row_len,
                ntt_workspace,
            ),
            c: ActiveCoeffMatrix::from_compact_eval_rows(
                &compact_r1cs.C_compact_col_mat,
                &compact_r1cs.C_active_wires,
                subcircuit_info.Nwires,
                row_len,
                ntt_workspace,
            ),
        }
    }
}

fn build_li_y_coeffs(s_max: usize) -> LagrangeCoeffTable {
    let mut coeffs = vec![ScalarField::zero(); s_max * s_max];
    for row_idx in 0..s_max {
        let row = &mut coeffs[row_idx * s_max..(row_idx + 1) * s_max];
        compute_langrange_i_coeffs(row_idx, 1, s_max, row);
    }
    LagrangeCoeffTable::new(s_max, coeffs)
}

fn load_coeff_view(
    source_path: &Path,
    setup_params: &SetupParams,
    subcircuit_info: &SubcircuitInfo,
    ntt_workspace: &mut NttWorkspace,
) -> SubcircuitCoeffView {
    let compact_r1cs = SubcircuitR1CS::from_path_compact_only(
        source_path.to_path_buf(),
        setup_params,
        subcircuit_info,
    )
    .unwrap();
    let coeff_view = SubcircuitCoeffView::from_compact_r1cs(
        &compact_r1cs,
        subcircuit_info,
        setup_params.n,
        ntt_workspace,
    );
    coeff_view
}

fn public_segment_index(
    global_idx: usize,
    segments: &mpc_setup::PublicWireSegments,
) -> Option<usize> {
    if global_idx < segments.user_out_end {
        Some(0)
    } else if global_idx < segments.user_end {
        Some(1)
    } else if global_idx < segments.free_end {
        Some(2)
    } else if global_idx < segments.total_end {
        Some(3)
    } else {
        None
    }
}

fn fill_outer_product_scalars(
    x_coeffs: &[ScalarField],
    y_coeffs: &[ScalarField],
    dest: &mut [ScalarField],
) {
    let y_len = y_coeffs.len();
    assert_eq!(dest.len(), x_coeffs.len() * y_len);
    for (row_idx, x_coeff) in x_coeffs.iter().enumerate() {
        let row = &mut dest[row_idx * y_len..(row_idx + 1) * y_len];
        for (slot, y_coeff) in row.iter_mut().zip(y_coeffs.iter()) {
            *slot = *x_coeff * *y_coeff;
        }
    }
}

struct Pending1d<'a> {
    dest_idx: usize,
    x_coeffs: &'a [ScalarField],
    y_coeffs: &'a [ScalarField],
}

struct Pending2d<'a> {
    row_idx: usize,
    col_idx: usize,
    x_coeffs: &'a [ScalarField],
    y_coeffs: &'a [ScalarField],
}

struct BatchScratch<I> {
    bases: Vec<G1Affine>,
    scalars: Vec<ScalarField>,
    indexes: Vec<I>,
}

impl<I> BatchScratch<I> {
    fn new() -> Self {
        Self {
            bases: Vec::new(),
            scalars: Vec::new(),
            indexes: Vec::new(),
        }
    }
}

fn flush_shared_batch_1d(
    msm_workspace: &mut MsmWorkspace,
    scratch: &mut BatchScratch<usize>,
    dest: &mut Box<[G1serde]>,
) {
    if scratch.indexes.is_empty() {
        return;
    }

    let results =
        msm_workspace.shared_bases_msm(&scratch.bases, &scratch.scalars, scratch.indexes.len());
    for (batch_idx, row_idx) in scratch.indexes.iter().enumerate() {
        dest[*row_idx] = dest[*row_idx] + G1serde(G1Affine::from(results[batch_idx]));
    }
    scratch.scalars.clear();
    scratch.indexes.clear();
}

fn flush_chunked_batch_1d<S: Phase1SrsSource>(
    source: &S,
    exp_alpha: usize,
    y_size: usize,
    x_chunk_size: usize,
    msm_workspace: &mut MsmWorkspace,
    pending: &mut Vec<Pending1d<'_>>,
    scratch: &mut BatchScratch<usize>,
    dest: &mut Box<[G1serde]>,
) {
    if pending.is_empty() {
        return;
    }

    let x_size = pending[0].x_coeffs.len();

    for x_start in (0..x_size).step_by(x_chunk_size.max(1)) {
        let x_len = (x_size - x_start).min(x_chunk_size.max(1));
        source.fill_alphaxy_g1_chunk(exp_alpha, x_start, x_len, y_size, &mut scratch.bases);
        scratch
            .scalars
            .resize(scratch.bases.len() * pending.len(), ScalarField::zero());
        scratch.indexes.clear();
        scratch
            .indexes
            .extend(pending.iter().map(|item| item.dest_idx));
        for (pending_idx, item) in pending.iter().enumerate() {
            let scalar_start = pending_idx * scratch.bases.len();
            fill_outer_product_scalars(
                &item.x_coeffs[x_start..x_start + x_len],
                item.y_coeffs,
                &mut scratch.scalars[scalar_start..scalar_start + scratch.bases.len()],
            );
        }
        flush_shared_batch_1d(msm_workspace, scratch, dest);
    }

    pending.clear();
}

fn flush_shared_batch_2d(
    msm_workspace: &mut MsmWorkspace,
    scratch: &mut BatchScratch<(usize, usize)>,
    dest: &mut Box<[Box<[G1serde]>]>,
) {
    if scratch.indexes.is_empty() {
        return;
    }

    let results =
        msm_workspace.shared_bases_msm(&scratch.bases, &scratch.scalars, scratch.indexes.len());
    for (batch_idx, &(row_idx, col_idx)) in scratch.indexes.iter().enumerate() {
        dest[row_idx][col_idx] =
            dest[row_idx][col_idx] + G1serde(G1Affine::from(results[batch_idx]));
    }
    scratch.scalars.clear();
    scratch.indexes.clear();
}

fn flush_chunked_batch_2d<S: Phase1SrsSource>(
    source: &S,
    exp_alpha: usize,
    y_size: usize,
    x_chunk_size: usize,
    msm_workspace: &mut MsmWorkspace,
    pending: &mut Vec<Pending2d<'_>>,
    scratch: &mut BatchScratch<(usize, usize)>,
    dest: &mut Box<[Box<[G1serde]>]>,
) {
    if pending.is_empty() {
        return;
    }

    let x_size = pending[0].x_coeffs.len();

    for x_start in (0..x_size).step_by(x_chunk_size.max(1)) {
        let x_len = (x_size - x_start).min(x_chunk_size.max(1));
        source.fill_alphaxy_g1_chunk(exp_alpha, x_start, x_len, y_size, &mut scratch.bases);
        scratch
            .scalars
            .resize(scratch.bases.len() * pending.len(), ScalarField::zero());
        scratch.indexes.clear();
        scratch
            .indexes
            .extend(pending.iter().map(|item| (item.row_idx, item.col_idx)));
        for (pending_idx, item) in pending.iter().enumerate() {
            let scalar_start = pending_idx * scratch.bases.len();
            fill_outer_product_scalars(
                &item.x_coeffs[x_start..x_start + x_len],
                item.y_coeffs,
                &mut scratch.scalars[scalar_start..scalar_start + scratch.bases.len()],
            );
        }
        flush_shared_batch_2d(msm_workspace, scratch, dest);
    }

    pending.clear();
}

fn process_component_for_subcircuit<S: Phase1SrsSource>(
    coeffs: &ActiveCoeffMatrix,
    flatten_map: &[usize],
    segments: &mpc_setup::PublicWireSegments,
    li_y_coeffs: &LagrangeCoeffTable,
    phase1_source: &S,
    exp_alpha: usize,
    compute_gamma: bool,
    gamma_inv_o_inst: &mut Box<[G1serde]>,
    eta_inv_li_o_inter_alpha4_kj: &mut Box<[Box<[G1serde]>]>,
    delta_inv_li_o_prv: &mut Box<[Box<[G1serde]>]>,
    l: usize,
    m_i: usize,
    m_d: usize,
    gamma_batch_size: usize,
    eta_batch_size: usize,
    delta_batch_size: usize,
    basis_x_chunk_size: usize,
    start: usize,
    end: usize,
    msm_workspace: &mut MsmWorkspace,
) {
    let mut gamma_pending = Vec::with_capacity(gamma_batch_size);
    let mut eta_pending = Vec::with_capacity(eta_batch_size);
    let mut delta_pending = Vec::with_capacity(delta_batch_size);
    let mut gamma_scratch = BatchScratch::new();
    let mut eta_scratch = BatchScratch::new();
    let mut delta_scratch = BatchScratch::new();

    for (local_idx, &global_idx) in flatten_map.iter().enumerate() {
        let Some(x_coeffs) = coeffs.row(local_idx) else {
            continue;
        };

        if compute_gamma {
            if let Some(segment_idx) = public_segment_index(global_idx, segments) {
                gamma_pending.push(Pending1d {
                    dest_idx: global_idx,
                    x_coeffs,
                    y_coeffs: li_y_coeffs.row(segment_idx),
                });
                if gamma_pending.len() == gamma_batch_size {
                    flush_chunked_batch_1d(
                        phase1_source,
                        exp_alpha,
                        li_y_coeffs.row(segment_idx).len(),
                        basis_x_chunk_size,
                        msm_workspace,
                        &mut gamma_pending,
                        &mut gamma_scratch,
                        gamma_inv_o_inst,
                    );
                }
            }
        }

        if global_idx >= l && global_idx < l + m_i {
            let row_idx = global_idx - l;
            for col_idx in start..end {
                eta_pending.push(Pending2d {
                    row_idx,
                    col_idx,
                    x_coeffs,
                    y_coeffs: li_y_coeffs.row(col_idx),
                });
                if eta_pending.len() == eta_batch_size {
                    flush_chunked_batch_2d(
                        phase1_source,
                        exp_alpha,
                        li_y_coeffs.row(col_idx).len(),
                        basis_x_chunk_size,
                        msm_workspace,
                        &mut eta_pending,
                        &mut eta_scratch,
                        eta_inv_li_o_inter_alpha4_kj,
                    );
                }
            }
        } else if global_idx >= l + m_i && global_idx < m_d {
            let row_idx = global_idx - (l + m_i);
            for col_idx in start..end {
                delta_pending.push(Pending2d {
                    row_idx,
                    col_idx,
                    x_coeffs,
                    y_coeffs: li_y_coeffs.row(col_idx),
                });
                if delta_pending.len() == delta_batch_size {
                    flush_chunked_batch_2d(
                        phase1_source,
                        exp_alpha,
                        li_y_coeffs.row(col_idx).len(),
                        basis_x_chunk_size,
                        msm_workspace,
                        &mut delta_pending,
                        &mut delta_scratch,
                        delta_inv_li_o_prv,
                    );
                }
            }
        }
    }

    if compute_gamma {
        flush_chunked_batch_1d(
            phase1_source,
            exp_alpha,
            li_y_coeffs.row(0).len(),
            basis_x_chunk_size,
            msm_workspace,
            &mut gamma_pending,
            &mut gamma_scratch,
            gamma_inv_o_inst,
        );
    }
    flush_chunked_batch_2d(
        phase1_source,
        exp_alpha,
        li_y_coeffs.row(0).len(),
        basis_x_chunk_size,
        msm_workspace,
        &mut eta_pending,
        &mut eta_scratch,
        eta_inv_li_o_inter_alpha4_kj,
    );
    flush_chunked_batch_2d(
        phase1_source,
        exp_alpha,
        li_y_coeffs.row(0).len(),
        basis_x_chunk_size,
        msm_workspace,
        &mut delta_pending,
        &mut delta_scratch,
        delta_inv_li_o_prv,
    );
}

fn process_coeff_source_for_eta<S: Phase1SrsSource, F>(
    label: &str,
    row_count: usize,
    batch_count: usize,
    li_y_coeffs: &LagrangeCoeffTable,
    mut fill_x_coeffs: F,
    phase1_source: &S,
    exp_alpha: usize,
    result_matrix: &mut Box<[Box<[G1serde]>]>,
    x_size: usize,
    basis_x_chunk_size: usize,
    start: usize,
    end: usize,
    msm_workspace: &mut MsmWorkspace,
) where
    F: FnMut(usize, &mut [ScalarField]) -> bool,
{
    println!("Preparing eta contribution: {}", label);
    let mut x_coeffs = vec![ScalarField::zero(); x_size];
    let mut scratch = BatchScratch::new();

    for row_idx in 0..row_count {
        if !fill_x_coeffs(row_idx, &mut x_coeffs) {
            continue;
        }

        let mut pending = Vec::with_capacity(batch_count);
        for col_idx in start..end {
            pending.push(Pending2d {
                row_idx,
                col_idx,
                x_coeffs: &x_coeffs,
                y_coeffs: li_y_coeffs.row(col_idx),
            });
            if pending.len() == batch_count {
                flush_chunked_batch_2d(
                    phase1_source,
                    exp_alpha,
                    li_y_coeffs.row(col_idx).len(),
                    basis_x_chunk_size,
                    msm_workspace,
                    &mut pending,
                    &mut scratch,
                    result_matrix,
                );
            }
        }

        flush_chunked_batch_2d(
            phase1_source,
            exp_alpha,
            li_y_coeffs.row(0).len(),
            basis_x_chunk_size,
            msm_workspace,
            &mut pending,
            &mut scratch,
            result_matrix,
        );
    }
    println!("Finished eta contribution: {}", label);
}
