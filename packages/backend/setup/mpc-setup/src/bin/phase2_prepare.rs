use std::env;
use std::path::Path;

use clap::Parser;
use icicle_bls12_381::curve::{G1Affine, ScalarField};
use icicle_core::ntt;
use icicle_core::traits::{Arithmetic, FieldImpl};
use libs::group_structures::{G1serde, Sigma, Sigma1, Sigma2};
use libs::iotools::{scalar_to_hex, SetupParams, SubcircuitInfo, SubcircuitR1CS};
use libs::utils::{
    init_ntt_domain, setup_shape, trusted_setup_ntt_domain_size, validate_public_wire_size,
    validate_setup_shape,
};
use libs::vector_operations::gen_evaled_lagrange_bases;
use mpc_setup::phase1_source::{
    AccumulatorSource, DuskGroth16Source, Phase1Source, Phase1SrsSource,
};
use mpc_setup::sigma::{save_contributor_info, SigmaV2, HASH_BYTES_LEN};
use mpc_setup::utils::{
    initialize_random_generator, load_gpu_if_possible, prompt_user_input, Mode, RandomGenerator,
    StepTimer,
};
use mpc_setup::{
    ensure_testing_mode, public_wire_segments, MsmWorkspace, NttWorkspace, QAP_COMPILER_PATH_PREFIX,
};
use rayon::prelude::*;
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

    #[arg(
        long,
        value_enum,
        value_name = "MODE",
        default_value = "random",
        help = "Phase-2 y sampling mode when not built with testing-mode: random | beacon"
    )]
    mode: Mode,

    #[arg(
        long,
        value_enum,
        value_name = "PHASE1_SOURCE_MODE",
        default_value = "native",
        help = "Phase-1 source mode: native Tokamak phase-1 accumulator or Dusk Groth16 raw PoT"
    )]
    phase1_source_mode: Phase1SourceMode,

    #[arg(
        long,
        value_name = "DUSK_RAW_FILE",
        help = "Path to a Dusk Groth16 raw challenge/response file, required when --phase1-source-mode dusk-groth16"
    )]
    dusk_raw_file: Option<String>,

    #[arg(
        long,
        value_name = "Y_HEX",
        help = "Optional explicit y scalar as a hex string to reuse across multipart runs"
    )]
    y_hex: Option<String>,
}

#[derive(Clone, Debug, clap::ValueEnum)]
enum Phase1SourceMode {
    Native,
    DuskGroth16,
}
// cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output --is-checking
// cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output
//cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output --total-part 16 --part-no 0
//cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output --total-part 16 --part-no 0 --merge-parts

fn main() {
    let mut timer = StepTimer::new("phase2_prepare");
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
            .write_phase2_acc(&format!("{}/phase2_acc_0.rkyv", outfolder))
            .expect("cannot write sigma into rkyv");
        timer.log_step("merge multipart accumulators");
        timer.log_total();
        return;
    }
    if total_part > 1 {
        assert_eq!(part_no < total_part, true);
        assert_eq!(is_power_of_two_bitwise(total_part), true);
    }
    let contributor_index = match config.phase1_source_mode {
        Phase1SourceMode::Native => {
            prompt_user_input("Enter the last phase-1 contributor's index:")
                .parse::<usize>()
                .expect("Please enter a valid number")
        }
        Phase1SourceMode::DuskGroth16 => 0,
    };
    let sigma = process_prepare(
        contributor_index,
        &outfolder,
        is_gpu_enabled,
        config.is_checking,
        total_part,
        part_no,
        &config.mode,
        config.y_hex.as_deref(),
        &config.phase1_source_mode,
        config.dusk_raw_file.as_deref(),
    );
    timer.log_step("build phase-2 accumulator");
    if total_part > 1 {
        sigma
            .write_phase2_acc(&format!(
                "{}/phase2_acc_0_{}_{}.rkyv",
                outfolder, total_part, part_no
            ))
            .expect("cannot write sigma into rkyv");
    } else {
        sigma
            .write_phase2_acc(&format!("{}/phase2_acc_0.rkyv", outfolder))
            .expect("cannot write sigma into rkyv");
    }
    timer.log_step("write phase-2 accumulator");

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
    timer.log_step("write contributor info");
    println!(
        "The total time: {:.6} seconds",
        start1.elapsed().as_secs_f64()
    );
    timer.log_total();
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
    let mut sigma = SigmaV2::read_phase2_acc(&format!(
        "{}/phase2_acc_0_{}_{}.rkyv",
        outfolder, total_part, 0
    ))
    .unwrap();
    for part_no in 1..total_part {
        let next = SigmaV2::read_phase2_acc(&format!(
            "{}/phase2_acc_0_{}_{}.rkyv",
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
        assert_eq!(sigma.public_y_hex, next.public_y_hex);
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

fn parse_scalar_hex(input: &str) -> ScalarField {
    let trimmed = input.trim().trim_start_matches("0x");
    let bytes = hex::decode(trimmed).expect("invalid hex encoding for y");
    ScalarField::from_bytes_le(&bytes)
}

fn sample_phase2_y(
    mode: &Mode,
    y_hex: Option<&str>,
    total_part: usize,
    s_max: usize,
) -> ScalarField {
    let mut y = if let Some(hex_value) = y_hex {
        parse_scalar_hex(hex_value)
    } else {
        if total_part > 1 {
            panic!("multipart phase2_prepare requires --y-hex so every part uses the same y");
        }
        if mpc_setup::testing_mode_enabled() {
            ScalarField::from_u32(5)
        } else {
            let mut rng: RandomGenerator = initialize_random_generator(mode);
            rng.next_random()
        }
    };

    while y.pow(s_max) == ScalarField::one() {
        if y_hex.is_some() {
            panic!("the supplied phase-2 y is invalid because y^s_max = 1");
        }
        y = if mpc_setup::testing_mode_enabled() {
            ScalarField::from_u32(7)
        } else {
            let mut rng: RandomGenerator = initialize_random_generator(mode);
            rng.next_random()
        };
    }
    y
}

fn build_x_basis<S: Phase1SrsSource>(source: &S, exp_alpha: usize, x_size: usize) -> Vec<G1Affine> {
    if exp_alpha == 0 {
        return source.x_g1_range(0, x_size - 1);
    }
    (0..x_size)
        .map(|exp_x| source.alphax_g1(exp_alpha, exp_x).0)
        .collect()
}

fn gather_component_x_only_rows(
    coeffs: &ActiveCoeffMatrix,
    flatten_map: &[usize],
    row_len: usize,
) -> (Vec<ScalarField>, Vec<usize>) {
    let mut scalars = Vec::new();
    let mut global_indexes = Vec::new();
    for (local_idx, &global_idx) in flatten_map.iter().enumerate() {
        let Some(x_coeffs) = coeffs.row(local_idx) else {
            continue;
        };
        scalars.extend_from_slice(x_coeffs);
        global_indexes.push(global_idx);
    }
    debug_assert_eq!(scalars.len(), global_indexes.len() * row_len);
    (scalars, global_indexes)
}

fn commit_component_x_only(
    coeff_views: &[SubcircuitCoeffView],
    subcircuit_infos: &[&SubcircuitInfo],
    coeff_selector: fn(&SubcircuitCoeffView) -> &ActiveCoeffMatrix,
    bases: &[G1Affine],
    row_len: usize,
    msm_workspace: &mut MsmWorkspace,
    dest: &mut [G1serde],
) {
    let gathered: Vec<(Vec<ScalarField>, Vec<usize>)> = coeff_views
        .par_iter()
        .zip(subcircuit_infos.par_iter())
        .map(|(coeff_view, subcircuit_info)| {
            gather_component_x_only_rows(
                coeff_selector(coeff_view),
                &subcircuit_info.flattenMap,
                row_len,
            )
        })
        .collect();

    let total_outputs = gathered
        .iter()
        .map(|(_, indexes)| indexes.len())
        .sum::<usize>();
    if total_outputs == 0 {
        return;
    }

    let mut scalars = Vec::with_capacity(total_outputs * row_len);
    let mut global_indexes = Vec::with_capacity(total_outputs);
    for (subcircuit_scalars, subcircuit_indexes) in gathered {
        scalars.extend(subcircuit_scalars);
        global_indexes.extend(subcircuit_indexes);
    }

    let results = msm_workspace.shared_bases_msm(bases, &scalars, global_indexes.len());
    for (batch_idx, &global_idx) in global_indexes.iter().enumerate() {
        dest[global_idx] = dest[global_idx] + G1serde(G1Affine::from(results[batch_idx]));
    }
}

fn build_x_only_commitments<S: Phase1SrsSource>(
    coeff_views: &[SubcircuitCoeffView],
    subcircuit_infos: &[&SubcircuitInfo],
    source: &S,
    setup_params: &SetupParams,
    msm_workspace: &mut MsmWorkspace,
) -> Box<[G1serde]> {
    let mut commitments = vec![G1serde::zero(); setup_params.m_D].into_boxed_slice();
    let a_bases = build_x_basis(source, 1, setup_params.n);
    let b_bases = build_x_basis(source, 2, setup_params.n);
    let c_bases = build_x_basis(source, 3, setup_params.n);

    commit_component_x_only(
        coeff_views,
        subcircuit_infos,
        |coeff_view| &coeff_view.a,
        &a_bases,
        setup_params.n,
        msm_workspace,
        &mut commitments,
    );
    commit_component_x_only(
        coeff_views,
        subcircuit_infos,
        |coeff_view| &coeff_view.b,
        &b_bases,
        setup_params.n,
        msm_workspace,
        &mut commitments,
    );
    commit_component_x_only(
        coeff_views,
        subcircuit_infos,
        |coeff_view| &coeff_view.c,
        &c_bases,
        setup_params.n,
        msm_workspace,
        &mut commitments,
    );

    commitments
}

fn scaled_inverse_root_powers(size: usize) -> Vec<ScalarField> {
    let omega = ntt::get_root_of_unity::<ScalarField>(size as u64);
    let omega_inv = omega.inv();
    let inv_size = ScalarField::from_u32(size as u32).inv();

    let mut powers = Vec::with_capacity(size);
    let mut current = ScalarField::one();
    for _ in 0..size {
        powers.push(inv_size * current);
        current = current * omega_inv;
    }
    powers
}

fn fill_lagrange_row_coeffs_from_root_table(
    scaled_inv_root_pows: &[ScalarField],
    row_idx: usize,
    out: &mut [ScalarField],
) {
    if out.is_empty() {
        return;
    }
    let size = scaled_inv_root_pows.len();
    let step = row_idx % size;
    let mut root_idx = 0usize;
    for slot in out.iter_mut() {
        *slot = scaled_inv_root_pows[root_idx];
        root_idx += step;
        if root_idx >= size {
            root_idx -= size;
        }
    }
}

fn build_plain_lagrange_commitments<S: Phase1SrsSource>(
    source: &S,
    size: usize,
    msm_workspace: &mut MsmWorkspace,
) -> Box<[G1serde]> {
    if size == 0 {
        return Vec::new().into_boxed_slice();
    }
    let bases = build_x_basis(source, 0, size);
    let mut batched_scalars = vec![ScalarField::zero(); size * size];
    let scaled_inv_root_pows = scaled_inverse_root_powers(size);
    batched_scalars
        .par_chunks_mut(size)
        .enumerate()
        .for_each(|(row_idx, row)| {
            fill_lagrange_row_coeffs_from_root_table(&scaled_inv_root_pows, row_idx, row);
        });
    let results = msm_workspace.shared_bases_msm(&bases, &batched_scalars, size);
    results
        .iter()
        .map(|point| G1serde(G1Affine::from(*point)))
        .collect::<Vec<_>>()
        .into_boxed_slice()
}

fn build_alpha4_k_commitments<S: Phase1SrsSource>(
    source: &S,
    m_i: usize,
    msm_workspace: &mut MsmWorkspace,
) -> Box<[G1serde]> {
    if m_i == 0 {
        return Vec::new().into_boxed_slice();
    }
    let bases = build_x_basis(source, 4, m_i);
    let mut batched_scalars = vec![ScalarField::zero(); m_i * m_i];
    let scaled_inv_root_pows = scaled_inverse_root_powers(m_i);
    batched_scalars
        .par_chunks_mut(m_i)
        .enumerate()
        .for_each(|(row_idx, row)| {
            fill_lagrange_row_coeffs_from_root_table(&scaled_inv_root_pows, row_idx, row);
        });
    let results = msm_workspace.shared_bases_msm(&bases, &batched_scalars, m_i);
    results
        .iter()
        .map(|point| G1serde(G1Affine::from(*point)))
        .collect::<Vec<_>>()
        .into_boxed_slice()
}

fn build_plain_last_lagrange_commitment<S: Phase1SrsSource>(
    source: &S,
    size: usize,
    msm_workspace: &mut MsmWorkspace,
) -> G1serde {
    let bases = build_x_basis(source, 0, size);
    let mut scalars = vec![ScalarField::zero(); size];
    let scaled_inv_root_pows = scaled_inverse_root_powers(size);
    fill_lagrange_row_coeffs_from_root_table(&scaled_inv_root_pows, size - 1, &mut scalars);
    msm_workspace.msm(&scalars, &bases)
}

fn build_xy_powers_from_x_basis<S: Phase1SrsSource>(
    source: &S,
    h_max: usize,
    y_pows: &[ScalarField],
) -> Box<[G1serde]> {
    let x_basis = source.x_g1_range(0, h_max - 1);
    let y_len = y_pows.len();
    let mut xy = vec![G1serde::zero(); h_max * y_len];
    xy.par_chunks_mut(y_len)
        .zip(x_basis.par_iter())
        .for_each(|(row, x_point)| {
            let base = G1serde(*x_point);
            for (slot, y_pow) in row.iter_mut().zip(y_pows.iter()) {
                *slot = base * *y_pow;
            }
        });
    xy.into_boxed_slice()
}
fn process_prepare(
    contributor_index: usize,
    outfolder: &str,
    _is_gpu_enabled: bool,
    is_checking: bool,
    total_part: usize,
    part_no: usize,
    mode: &Mode,
    y_hex: Option<&str>,
    phase1_source_mode: &Phase1SourceMode,
    dusk_raw_file: Option<&str>,
) -> SigmaV2 {
    let mut timer = StepTimer::new("phase2_prepare::process_prepare");
    let base_path = env::current_dir().unwrap();
    let qap_path = env::var("TOKAMAK_QAP_PATH")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| base_path.join(QAP_COMPILER_PATH_PREFIX));

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
    timer.log_step("load setup metadata and initialize domains");

    let subcircuit_file_name = "subcircuitInfo.json";
    let subcircuit_infos =
        SubcircuitInfo::read_box_from_json(qap_path.join(&subcircuit_file_name)).unwrap();

    let phase2_y = sample_phase2_y(mode, y_hex, total_part, s_max);
    let mut l_evaled_vec = vec![ScalarField::zero(); s_max].into_boxed_slice();
    gen_evaled_lagrange_bases(&phase2_y, s_max, &mut l_evaled_vec);

    let mut y_pows = Vec::with_capacity(2 * s_max);
    let mut current_y_pow = ScalarField::one();
    for _ in 0..(2 * s_max) {
        y_pows.push(current_y_pow);
        current_y_pow = current_y_pow * phase2_y;
    }
    timer.log_step("sample y and prepare lagrange data");

    println!("Loading phase-1 source...");
    let phase1_source = match phase1_source_mode {
        Phase1SourceMode::Native => {
            let accumulator = format!("phase1_acc_{}.json", contributor_index);
            Phase1Source::Accumulator(
                AccumulatorSource::read_from_json(&format!("{}/{}", outfolder, accumulator))
                    .expect("cannot read from latest accumulator json"),
            )
        }
        Phase1SourceMode::DuskGroth16 => {
            let dusk_raw_file =
                dusk_raw_file.expect("--dusk-raw-file is required in dusk-groth16 mode");
            let tokamak_n = std::cmp::max(n, m_i);
            Phase1Source::DuskGroth16(
                DuskGroth16Source::read_from_file(dusk_raw_file, tokamak_n)
                    .expect("cannot read Dusk Groth16 raw PoT file"),
            )
        }
    };
    timer.log_step("load phase-1 source");

    let sigma_trusted = if is_checking {
        ensure_testing_mode("phase2_prepare --is-checking");
        assert_eq!(
            total_part, 1,
            "trusted-reference checking only supports a single-part run"
        );
        println!("Loading trusted reference sigma...");
        Some(SigmaV2::read_phase2_acc("setup/mpc-setup/output/phase2_acc_0.rkyv").unwrap())
    } else {
        None
    };
    timer.log_step("load trusted reference when checking");

    let g1 = phase1_source.g1();
    let g2 = phase1_source.g2();
    let mut msm_workspace = MsmWorkspace::new(1);
    let mut ntt_workspace = NttWorkspace::new(n.max(1));

    let subcircuit_start = part_no * subcircuit_infos.len() / total_part.max(1);
    let mut subcircuit_end = (part_no + 1) * subcircuit_infos.len() / total_part.max(1);
    if part_no + 1 == total_part {
        subcircuit_end = subcircuit_infos.len();
    }
    let compute_shared_terms = total_part == 1 || part_no == 0;
    let mut assigned_infos = Vec::new();
    let mut coeff_views = Vec::new();
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
        assigned_infos.push(subcircuit_info);
        coeff_views.push(coeff_view);
    }
    println!(
        "Loaded coefficient rows in {:.2} seconds",
        stream_start.elapsed().as_secs_f64()
    );
    timer.log_step("load coefficient rows");

    let commitment_start = Instant::now();
    let o_commitments = build_x_only_commitments(
        &coeff_views,
        &assigned_infos,
        &phase1_source,
        &setup_params,
        &mut msm_workspace,
    );
    let k_commitments = if compute_shared_terms {
        build_alpha4_k_commitments(&phase1_source, m_i, &mut msm_workspace)
    } else {
        vec![G1serde::zero(); m_i].into_boxed_slice()
    };
    let m_commitments = if compute_shared_terms {
        build_plain_lagrange_commitments(&phase1_source, l_free, &mut msm_workspace)
    } else {
        Vec::new().into_boxed_slice()
    };
    println!(
        "Built x-only commitments in {:.2} seconds",
        commitment_start.elapsed().as_secs_f64()
    );
    timer.log_step("build x-only commitments");

    // {γ^(-1)(L_t(y)o_j(x) + M_j(x))}
    let mut gamma_inv_o_inst = vec![G1serde::zero(); l].into_boxed_slice();
    gamma_inv_o_inst
        .par_iter_mut()
        .enumerate()
        .for_each(|(global_idx, cell)| {
            let segment_idx = public_segment_index(global_idx, &segments)
                .expect("public wire must map to a segment");
            let mut value = o_commitments[global_idx] * l_evaled_vec[segment_idx];
            if global_idx < l_free {
                value = value + m_commitments[global_idx];
            }
            *cell = value;
        });

    // {η^(-1)L_i(y)(o_{j+l}(x) + α^4 K_j(x))}
    let mut eta_inv_li_o_inter_alpha4_kj =
        vec![vec![G1serde::zero(); s_max].into_boxed_slice(); m_i].into_boxed_slice();
    eta_inv_li_o_inter_alpha4_kj
        .par_iter_mut()
        .enumerate()
        .for_each(|(row_idx, row)| {
            let base = o_commitments[l + row_idx] + k_commitments[row_idx];
            for col_idx in 0..s_max {
                row[col_idx] = base * l_evaled_vec[col_idx];
            }
        });

    // {δ^(-1)L_i(y)o_j(x)}
    let mut delta_inv_li_o_prv =
        vec![vec![G1serde::zero(); s_max].into_boxed_slice(); m_d - (l + m_i)].into_boxed_slice();
    delta_inv_li_o_prv
        .par_iter_mut()
        .enumerate()
        .for_each(|(row_idx, row)| {
            let base = o_commitments[l + m_i + row_idx];
            for col_idx in 0..s_max {
                row[col_idx] = base * l_evaled_vec[col_idx];
            }
        });

    // {δ^(-1)α^k x^h t_n(x)}
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

    // {δ^(-1)α^4 x^j t_{m_i}(x)}
    let mut delta_inv_alpha4_xj_tx = vec![G1serde::zero(); 2].into_boxed_slice();
    if compute_shared_terms {
        for j in 0..=1 {
            delta_inv_alpha4_xj_tx[j] = phase1_source.alphax_g1(4, m_i + j);
            delta_inv_alpha4_xj_tx[j] =
                delta_inv_alpha4_xj_tx[j].sub(phase1_source.alphax_g1(4, j));
        }
    }

    // {δ^(-1)α^k y^i t_s(y)}
    let mut delta_inv_alphak_yi_ty =
        vec![vec![G1serde::zero(); 3].into_boxed_slice(); 4].into_boxed_slice();
    if compute_shared_terms {
        let t_y = phase2_y.pow(s_max) - ScalarField::one();
        for k in 1..=4 {
            let alpha_k = phase1_source.alphax_g1(k, 0);
            for i in 0..=2 {
                delta_inv_alphak_yi_ty[k - 1][i] = alpha_k * (y_pows[i] * t_y);
            }
        }
    }

    let h_max = std::cmp::max(2 * n, 2 * m_i);
    let xy_powers = if compute_shared_terms {
        build_xy_powers_from_x_basis(&phase1_source, h_max, &y_pows)
    } else {
        Vec::new().into_boxed_slice()
    };
    let lagrange_kl = if compute_shared_terms {
        build_plain_last_lagrange_commitment(&phase1_source, m_i, &mut msm_workspace)
            * l_evaled_vec[s_max - 1]
    } else {
        G1serde::zero()
    };

    if let Some(sigma_for_check) = &sigma_trusted {
        assert_eq!(
            sigma_for_check.sigma.sigma_1.gamma_inv_o_inst,
            gamma_inv_o_inst
        );
        assert_eq!(
            sigma_for_check.sigma.sigma_1.eta_inv_li_o_inter_alpha4_kj,
            eta_inv_li_o_inter_alpha4_kj
        );
        assert_eq!(
            sigma_for_check.sigma.sigma_1.delta_inv_li_o_prv,
            delta_inv_li_o_prv
        );
        assert_eq!(
            sigma_for_check.sigma.sigma_1.delta_inv_alphak_xh_tx,
            delta_inv_alphak_xh_tx
        );
        assert_eq!(
            sigma_for_check.sigma.sigma_1.delta_inv_alpha4_xj_tx,
            delta_inv_alpha4_xj_tx
        );
        assert_eq!(
            sigma_for_check.sigma.sigma_1.delta_inv_alphak_yi_ty,
            delta_inv_alphak_yi_ty
        );
        assert_eq!(sigma_for_check.sigma.lagrange_KL, lagrange_kl);
        println!("Verified phase-2 prepare outputs against the trusted reference");
    }
    timer.log_step("assemble and validate phase-2 sigma");
    timer.log_total();

    SigmaV2 {
        contributor_index: 0,
        gamma: g1,
        public_y_hex: Some(scalar_to_hex(&phase2_y)),
        sigma: Sigma {
            G: g1,
            H: g2,
            sigma_1: Sigma1 {
                xy_powers,
                x: phase1_source.alphax_g1(0, 1),
                y: g1 * phase2_y,
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
                y: g2 * phase2_y,
            },
            lagrange_KL: lagrange_kl,
        },
    }
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

fn load_coeff_view(
    source_path: &Path,
    setup_params: &SetupParams,
    subcircuit_info: &SubcircuitInfo,
    ntt_workspace: &mut NttWorkspace,
) -> SubcircuitCoeffView {
    let compact_r1cs =
        SubcircuitR1CS::from_path(source_path.to_path_buf(), setup_params, subcircuit_info)
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
