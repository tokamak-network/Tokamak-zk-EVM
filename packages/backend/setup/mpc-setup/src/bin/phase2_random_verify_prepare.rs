use ark_ff::Zero;
use icicle_runtime::memory::{DeviceVec, HostSlice};
use std::env;

use clap::Parser;
use icicle_bls12_381::curve::{G1Affine, G1Projective, ScalarField};
use icicle_core::msm;
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::HostOrDeviceSlice;
use icicle_runtime::stream::IcicleStream;
use libs::bivariate_polynomial::DensePolynomialExt;
use libs::group_structures::{G1serde, PartialSigma1, SigmaPreprocess};
use libs::iotools::{SetupParams, SubcircuitInfo};
use libs::polynomial_structures::QAP;
use mpc_setup::accumulator::Accumulator;
use mpc_setup::mpc_utils::{compute_langrange_i_coeffs, compute_langrange_i_poly, poly_mult};
use mpc_setup::sigma::SigmaV2;
use mpc_setup::utils::{load_gpu_if_possible, prompt_user_input};
use mpc_setup::{compute_lagrange_kl, QAP_COMPILER_PATH_PREFIX};
use rand::rngs::ThreadRng;
use rand::Rng;
use std::ops::Sub;
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,
}
// cargo run --release --bin phase2_random_verify_prepare -- --outfolder ./setup/mpc-setup/output
fn main() {
    let base_path = env::current_dir().unwrap();
    let qap_path = base_path.join(QAP_COMPILER_PATH_PREFIX);

    let mut check_count = 0;
    let use_gpu: bool = env::var("USE_GPU")
        .ok()
        .and_then(|v| v.parse::<bool>().ok())
        .unwrap_or(false); // default to false
    let mut is_gpu_enabled = false;
    if use_gpu {
        is_gpu_enabled = load_gpu_if_possible()
    }
    let config = Config::parse();

    let contributor_index = prompt_user_input(
        "Enter the last contributor's index (the index i of the last phase1_acc_i.json file):",
    )
        .parse::<usize>()
        .expect("Please enter a valid number");

    let accumulator = format!("phase1_acc_{}.json", contributor_index);

    let setup_file_name = "setupParams.json";
    let mut setup_params =
        SetupParams::read_from_json(qap_path.join(&setup_file_name)).expect("cannot SetupParams read file");

    let n = setup_params.n; // Number of constraints per subcircuit

    let s_max = setup_params.s_max;
    let m_d = setup_params.m_D; // Total number of wires
    let l_pub_out = setup_params.l_pub_out;
    let l = setup_params.l; // Number of public I/O wires
    let l_pub = setup_params.l_pub_in + setup_params.l_pub_out;
    let l_prv_out = setup_params.l_prv_out;
    let l_d = setup_params.l_D; // Number of interface wires
    let m_i = l_d - l;
    println!(
        "Setup parameters: \n n = {:?}, \n s_max = {:?}, \n l = {:?}, \n m_I = {:?}, \n m_D = {:?}, \n l_pub_out = {:?}",
        n, s_max, l, m_i, m_d, l_pub_out
    );

    let start1 = Instant::now();
    let subcircuit_file_name = "subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::read_box_from_json(qap_path.join(&subcircuit_file_name)).unwrap();

    let mut li_y_vec: Vec<DensePolynomialExt> = vec![];

    for i in 0..s_max {
        let li_y = compute_langrange_i_poly(i, 1, s_max);
        li_y_vec.push(li_y);
    }
    println!("loading latest accumulator json");
    let latest_acc = Accumulator::read_from_json(&format!("{}/{}", config.outfolder, accumulator))
        .expect("cannot read from latest accumulator json");
    let sigma_trusted =
        SigmaV2::read_from_json("setup/mpc-setup/output/phase2_acc_0.json").unwrap();

    // {γ^(-1)(L_t(y)o_j(x) + M_j(x))}_{t=0,j=0}^{1,l-1} where t=0 for j∈[0,l_in-1] and t=1 for j∈[l_in,l-1]
    let mut gamma_inv_o_inst = vec![G1serde::zero(); l].into_boxed_slice();
    let alpha1xy_g1s = latest_acc.get_alphaxy_g1_range(1, n, li_y_vec[0].y_size);
    let alpha2xy_g1s = latest_acc.get_alphaxy_g1_range(2, n, li_y_vec[0].y_size);
    let alpha3xy_g1s = latest_acc.get_alphaxy_g1_range(3, n, li_y_vec[0].y_size);

    let qap = QAP::gen_from_R1CS(qap_path.to_str().unwrap(), &subcircuit_infos, &setup_params);
    println!(
        "The qap load time: {:.6} seconds",
        start1.elapsed().as_secs_f64()
    );

    let lagrange_kl = compute_lagrange_kl(
        &SigmaPreprocess {
            sigma_1: PartialSigma1 {
                xy_powers: latest_acc.get_boxed_xypower(),
            },
        },
        &setup_params,
    );

    assert_eq!(sigma_trusted.sigma.lagrange_KL, lagrange_kl);
    println!("lagrange_kl is checked!");

    compute_gamma_part_i(
        0,
        l_pub_out,
        &qap,
        &li_y_vec[1],
        &alpha1xy_g1s,
        &alpha2xy_g1s,
        &alpha3xy_g1s,
        &mut gamma_inv_o_inst,
    );
    let xi_g1s = latest_acc.get_x_g1_range(0, l_pub - 1);
    for j in 0..l_pub_out {
        let mut m_j_x_coeffs = vec![ScalarField::zero(); l_pub];
        compute_langrange_i_coeffs(j, l_pub, 1, &mut m_j_x_coeffs);
        gamma_inv_o_inst[j] = gamma_inv_o_inst[j] + sum_vector_dot_product(&m_j_x_coeffs, &xi_g1s);
        println!("gamma_inv_o_inst[{}] = {:?}", j, gamma_inv_o_inst[j].0.x);
        assert_eq!(
            sigma_trusted.sigma.sigma_1.gamma_inv_o_inst[j],
            gamma_inv_o_inst[j]
        );
        check_count = check_count + 1;
        println!("check_count = {}", check_count);
    }

    compute_gamma_part_i(
        l_pub_out,
        l_pub,
        &qap,
        &li_y_vec[0],
        &alpha1xy_g1s,
        &alpha2xy_g1s,
        &alpha3xy_g1s,
        &mut gamma_inv_o_inst,
    );
    for j in l_pub_out..l_pub {
        let mut m_j_x_coeffs = vec![ScalarField::zero(); l_pub];
        compute_langrange_i_coeffs(j, l_pub, 1, &mut m_j_x_coeffs);
        gamma_inv_o_inst[j] = gamma_inv_o_inst[j] + sum_vector_dot_product(&m_j_x_coeffs, &xi_g1s);
        println!("gamma_inv_o_inst[{}] = {:?}", j, gamma_inv_o_inst[j].0.x);
        assert_eq!(
            sigma_trusted.sigma.sigma_1.gamma_inv_o_inst[j],
            gamma_inv_o_inst[j]
        );
        check_count = check_count + 1;
        println!("check_count = {}", check_count);
    }
    compute_gamma_part_i(
        l_pub,
        l_pub + l_prv_out,
        &qap,
        &li_y_vec[3],
        &alpha1xy_g1s,
        &alpha2xy_g1s,
        &alpha3xy_g1s,
        &mut gamma_inv_o_inst,
    );
    for i in l_pub..l_pub + l_prv_out {
        assert_eq!(
            sigma_trusted.sigma.sigma_1.gamma_inv_o_inst[i],
            gamma_inv_o_inst[i]
        );
        check_count = check_count + 1;
    }
    compute_gamma_part_i(
        l_pub + l_prv_out,
        l,
        &qap,
        &li_y_vec[2],
        &alpha1xy_g1s,
        &alpha2xy_g1s,
        &alpha3xy_g1s,
        &mut gamma_inv_o_inst,
    );
    for i in l_pub + l_prv_out..l {
        assert_eq!(
            sigma_trusted.sigma.sigma_1.gamma_inv_o_inst[i],
            gamma_inv_o_inst[i]
        );
        check_count = check_count + 1;
    }
    // {δ^(-1)α^k x^h t_n(x)}_{h=0,k=1}^{2,3}
    let mut delta_inv_alphak_xh_tx =
        vec![vec![G1serde::zero(); 3].into_boxed_slice(); 3].into_boxed_slice();
    for k in 1..=3 {
        for h in 0..=2 {
            //let alpha^k x^{n+h}
            let alphak_xnh = latest_acc.get_alphax_g1(k, n + h);
            //let alpha^k x^{h}
            let alphak_xh = latest_acc.get_alphax_g1(k, h);

            delta_inv_alphak_xh_tx[k - 1][h] = alphak_xnh.sub(alphak_xh);
            println!(
                "delta_inv_alphak_xh_tx[{}][{}] = {:?}",
                k - 1,
                h,
                delta_inv_alphak_xh_tx[k - 1][h].0.x
            );
        }
    }
    assert_eq!(
        sigma_trusted.sigma.sigma_1.delta_inv_alphak_xh_tx,
        delta_inv_alphak_xh_tx
    );
    check_count = check_count + 9;
    println!("check_count = {}", check_count);
    // {δ^(-1)α^4 x^j t_{m_I}(x)}_{j=0}^{1}
    let mut delta_inv_alpha4_xj_tx = vec![G1serde::zero(); 2].into_boxed_slice();
    for j in 0..=1 {
        delta_inv_alpha4_xj_tx[j] = latest_acc.get_alphax_g1(4, m_i + j);
        delta_inv_alpha4_xj_tx[j] = delta_inv_alpha4_xj_tx[j].sub(latest_acc.get_alphax_g1(4, j));
        println!(
            "delta_inv_alpha4_xj_tx[{}] = {:?}",
            j, delta_inv_alpha4_xj_tx[j].0.x
        );
    }

    assert_eq!(
        sigma_trusted.sigma.sigma_1.delta_inv_alpha4_xj_tx,
        delta_inv_alpha4_xj_tx
    );
    check_count = check_count + 2;
    println!("check_count = {}", check_count);

    // {δ^(-1)α^k y^i t_{s_max}(y)}_{i=0,k=1}^{2,4}
    let mut delta_inv_alphak_yi_ty =
        vec![vec![G1serde::zero(); 3].into_boxed_slice(); 4].into_boxed_slice();
    for k in 1..=4 {
        for i in 0..=2 {
            delta_inv_alphak_yi_ty[k - 1][i] = latest_acc
                .get_alphay_g1(k, s_max + i)
                .sub(latest_acc.get_alphay_g1(k, i));

            println!(
                "delta_inv_alphak_yi_ty[{}][{}] = {:?}",
                k - 1,
                i,
                delta_inv_alphak_yi_ty[k - 1][i].0.x
            );
        }
    }
    assert_eq!(
        sigma_trusted.sigma.sigma_1.delta_inv_alphak_yi_ty,
        delta_inv_alphak_yi_ty
    );
    check_count = check_count + 12;
    println!("check_count = {}", check_count);

    let mut multpxy_coeffs = vec![ScalarField::zero(); n * li_y_vec[0].y_size];
    // {η^(-1)L_i(y)(o_{j+l}(x) + α^4 K_j(x))}_{i=0,j=0}^{s_max-1,m_I-1}
    let mut eta_inv_li_o_inter_alpha4_kj =
        vec![vec![G1serde::zero(); s_max].into_boxed_slice(); m_i].into_boxed_slice();
    let mut kj_x_vec: Vec<DensePolynomialExt> = vec![];
    println!("n = {} , s_max = {}, m_i = {} ", n, s_max, m_i);
    for i in 0..m_i {
        let kj_x = compute_langrange_i_poly(i, m_i, 1);
        kj_x_vec.push(kj_x);
    }
    let mut xy_coeffs = vec![ScalarField::zero(); li_y_vec[0].y_size * kj_x_vec[0].x_size];
    let alpha4xy_g1s = latest_acc.get_alphaxy_g1_range(4, kj_x_vec[0].x_size, li_y_vec[0].y_size);
    println!("len of (eta_inv_li_o_inter_alpha4_kj) is {}", m_i * s_max);
    let mut cache: Vec<(usize, usize, Vec<ScalarField>, Vec<G1Affine>)> = vec![];
    let mut rng = rand::thread_rng();

    let start2 = Instant::now();
    for i in 0..s_max {
        for j in 0..m_i {
            if skip_verify(&mut rng) {
                continue;
            }
            //let mut out = G1serde::zero();
            let mut coeffs: Vec<ScalarField> =
                Vec::with_capacity(multpxy_coeffs.len() * 3 + xy_coeffs.len());
            let mut commits: Vec<G1Affine> =
                Vec::with_capacity(multpxy_coeffs.len() * 3 + xy_coeffs.len());
            //lookup with alpha x^i y^j
            if !qap.u_j_X[j + l].is_zero() {
                //  let mut multpxy_coeffs = vec![ScalarField::zero(); qap.u_j_X[j].x_size * li_y.y_size];
                poly_mult(&qap.u_j_X[j + l], &li_y_vec[i], &mut multpxy_coeffs);
                //  let alphaxyG1s = acc.get_alphaxy_g1_range(1, qap.u_j_X[j].x_size, li_y.y_size);
                // out = out + sum_vector_dot_product(&multpxy_coeffs, &alpha1xy_g1s);
                coeffs.extend(&multpxy_coeffs);
                commits.extend(&alpha1xy_g1s);
            }
            //lookup with alpha^2 x^i y^j
            if !qap.v_j_X[j + l].is_zero() {
                // let mut multpxy_coeffs = vec![ScalarField::zero(); qap.v_j_X[j].x_size * li_y.y_size];
                poly_mult(&qap.v_j_X[j + l], &li_y_vec[i], &mut multpxy_coeffs);
                //  let alphaxyG1s = acc.get_alphaxy_g1_range(2, qap.v_j_X[j].x_size, li_y.y_size);
                // out = out + sum_vector_dot_product(&multpxy_coeffs, &alpha2xy_g1s);
                coeffs.extend(&multpxy_coeffs);
                commits.extend(&alpha2xy_g1s);
            }
            //lookup with alpha^3 x^i y^j
            if !qap.w_j_X[j + l].is_zero() {
                //  let mut multpxy_coeffs = vec![ScalarField::zero(); qap.w_j_X[j].x_size * li_y.y_size];
                poly_mult(&qap.w_j_X[j + l], &li_y_vec[i], &mut multpxy_coeffs);
                //  let alphaxyG1s = acc.get_alphaxy_g1_range(3, qap.w_j_X[j].x_size, li_y.y_size);
                //out = out + sum_vector_dot_product(&multpxy_coeffs, &alpha3xy_g1s);
                coeffs.extend(&multpxy_coeffs);
                commits.extend(&alpha3xy_g1s);
            }

            poly_mult(&kj_x_vec[j], &li_y_vec[i], &mut xy_coeffs);
            coeffs.extend(&xy_coeffs);
            commits.extend(&alpha4xy_g1s);
            // out = out + sum_vector_dot_product(&xy_coeffs, &alpha4xy_g1s);
            // eta_inv_li_o_inter_alpha4_kj[j][i] = out;

            //eta_inv_li_o_inter_alpha4_kj[j][i] = sum_vector_dot_product(&coeffs, &commits);
            if coeffs.len() > 0 {
                // println!("coeffs.len {}", coeffs.len());
                cache.push((j, i, coeffs, commits));
            }
            if cache.len() > 0 {
                run_sum_vector_dot_product2(&cache, &mut eta_inv_li_o_inter_alpha4_kj);
                cache.clear();
                println!(
                    "eta_inv_li_o_inter_alpha4_kj[{}][{}] = {:?}",
                    j, i, eta_inv_li_o_inter_alpha4_kj[j][i].0.x
                );
                assert_eq!(
                    eta_inv_li_o_inter_alpha4_kj[j][i],
                    sigma_trusted.sigma.sigma_1.eta_inv_li_o_inter_alpha4_kj[j][i]
                );
                check_count = check_count + 1;
                println!("check_count = {}", check_count);
            }
        }
    }

    // {δ^(-1)L_i(y)o_j(x)}_{i=0,j=l+m_I}^{s_max-1,m_I-1}
    let mut delta_inv_li_o_prv =
        vec![vec![G1serde::zero(); s_max].into_boxed_slice(); (m_d - (l + m_i))].into_boxed_slice();
    //for private wires,
    println!(
        "len of (delta_inv_li_o_prv) is {}",
        s_max * (m_d - (l + m_i))
    );
    let start2 = Instant::now();
    for i in 0..s_max {
        for j in (l + m_i)..m_d {
            if skip_verify(&mut rng) {
                continue;
            }
            let mut coeffs: Vec<ScalarField> = Vec::with_capacity(multpxy_coeffs.len() * 3);
            let mut commits: Vec<G1Affine> = Vec::with_capacity(multpxy_coeffs.len() * 3);
            //let mut out = G1serde::zero();
            //Li(y)oj(x)
            //lookup with alpha x^i y^j
            if !qap.u_j_X[j].is_zero() {
                poly_mult(&qap.u_j_X[j], &li_y_vec[i], &mut multpxy_coeffs);
                //out = out + sum_vector_dot_product(&multpxy_coeffs, &alpha1xy_g1s);
                coeffs.extend(&multpxy_coeffs);
                commits.extend(&alpha1xy_g1s);
            }
            //lookup with alpha^2 x^i y^j
            if !qap.v_j_X[j].is_zero() {
                poly_mult(&qap.v_j_X[j], &li_y_vec[i], &mut multpxy_coeffs);
                //out = out + sum_vector_dot_product(&multpxy_coeffs, &alpha2xy_g1s);
                coeffs.extend(&multpxy_coeffs);
                commits.extend(&alpha2xy_g1s);
            }
            //lookup with alpha^3 x^i y^j
            if !qap.w_j_X[j].is_zero() {
                poly_mult(&qap.w_j_X[j], &li_y_vec[i], &mut multpxy_coeffs);
                //out = out + sum_vector_dot_product(&multpxy_coeffs, &alpha3xy_g1s);
                coeffs.extend(&multpxy_coeffs);
                commits.extend(&alpha3xy_g1s);
            }
            if coeffs.len() > 0 {
                // delta_inv_li_o_prv[j - (l + m_i)][i] = sum_vector_dot_product(&coeffs, &commits);
                cache.push((j - (l + m_i), i, coeffs, commits));
            }
            if cache.len() > 0 {
                run_sum_vector_dot_product2(&cache, &mut delta_inv_li_o_prv);
                cache.clear();
                assert_eq!(
                    delta_inv_li_o_prv[j - (l + m_i)][i],
                    sigma_trusted.sigma.sigma_1.delta_inv_li_o_prv[j - (l + m_i)][i]
                );
                println!(
                    "delta_inv_li_o_prv[{}][{}] = {:?}",
                    j - (l + m_i), i, delta_inv_li_o_prv[j - (l + m_i)][i].0.x
                );
                check_count = check_count + 1;
                println!("check_count = {}", check_count);
            }
        }
    }

    println!(
        "The total time: {:.6} seconds",
        start1.elapsed().as_secs_f64()
    );
}

fn skip_verify(rng: &mut ThreadRng) -> bool {
    !(rng.gen_range(0..1000) == 0) // 0 to 9 → 1 out of 1000 chance
}

fn compute_gamma_part_i(
    start: usize,
    end: usize,
    qap: &QAP,
    lag_i: &DensePolynomialExt,
    alpha1xy_g1s: &Vec<G1Affine>,
    alpha2xy_g1s: &Vec<G1Affine>,
    alpha3xy_g1s: &Vec<G1Affine>,
    gamma_inv_o_inst: &mut Box<[G1serde]>,
) {
    let mut multpxy_coeffs = vec![ScalarField::zero(); qap.w_j_X[start].x_size * lag_i.y_size];
    let mut cache: Vec<(usize, Vec<ScalarField>, Vec<G1Affine>)> = vec![];

    for j in start..end {
        let mut coeffs: Vec<ScalarField> = Vec::with_capacity(multpxy_coeffs.len() * 3);
        let mut commits: Vec<G1Affine> = Vec::with_capacity(multpxy_coeffs.len() * 3);

        //lookup with alpha x^i y^j
        if !qap.u_j_X[j].is_zero() {
            poly_mult(&qap.u_j_X[j], lag_i, &mut multpxy_coeffs);
            coeffs.extend(&multpxy_coeffs);
            commits.extend(alpha1xy_g1s);
        }
        //lookup with alpha^2 x^i y^j
        if !qap.v_j_X[j].is_zero() {
            poly_mult(&qap.v_j_X[j], lag_i, &mut multpxy_coeffs);
            coeffs.extend(&multpxy_coeffs);
            commits.extend(alpha2xy_g1s);
        }
        //lookup with alpha^3 x^i y^j
        if !qap.w_j_X[j].is_zero() {
            poly_mult(&qap.w_j_X[j], lag_i, &mut multpxy_coeffs);
            coeffs.extend(&multpxy_coeffs);
            commits.extend(alpha3xy_g1s);
        }

        if coeffs.len() > 0 {
            cache.push((j, coeffs, commits));
            //gamma_inv_o_inst[j] = sum_vector_dot_product(&coeffs, &commits);//out;
        }
        if cache.len() > 7 {
            run_sum_vector_dot_product(&cache, gamma_inv_o_inst);
            cache.clear();
        }
    }
    if cache.len() > 0 {
        run_sum_vector_dot_product(&cache, gamma_inv_o_inst);
    }
}

fn run_sum_vector_dot_product(
    cache: &Vec<(usize, Vec<ScalarField>, Vec<G1Affine>)>,
    gamma_inv_o_inst: &mut Box<[G1serde]>,
) {
    let mut results: Vec<(usize, G1serde)> = cache
        .iter() //par_iter
        .map(|(j, coeffs, commits)| (*j, sum_vector_dot_product(coeffs, commits)))
        .collect();

    results.sort_by_key(|(j, _)| *j);
    for (j, val) in results {
        gamma_inv_o_inst[j] = val;
    }
}

fn run_sum_vector_dot_product2(
    cache: &Vec<(usize, usize, Vec<ScalarField>, Vec<G1Affine>)>,
    p1: &mut Box<[Box<[G1serde]>]>,
) {
    let results: Vec<(usize, usize, G1serde)> = cache
        .iter() //par_iter
        .map(|(j, i, coeffs, commits)| (*j, *i, sum_vector_dot_product(coeffs, commits)))
        .collect();

    //results.sort_by_key(|(i,j, _)| *j);
    for (j, i, val) in results {
        p1[j][i] = val;
    }
}
// phase1_acc_1.json
/// Computes the multi-scalar multiplication, or MSM: s1*P1 + s2*P2 + ... + sn*Pn, or a batch of several MSMs.
pub fn sum_vector_dot_product(scalars: &Vec<ScalarField>, commit: &[G1Affine]) -> G1serde {
    //  sum_vector_dot_product_chunked(scalars,commit,1024*32)
    let mut msm_res = DeviceVec::<G1Projective>::device_malloc(1).expect("device_malloc failed");
    let mut stream = IcicleStream::create().expect("Stream creation failed");
    let mut cfg = msm::MSMConfig::default();
    cfg.stream_handle = *stream;
    cfg.is_async = true;
    msm::msm(
        HostSlice::from_slice(&scalars),
        HostSlice::from_slice(&commit),
        &cfg,
        &mut msm_res[..],
    )
        .unwrap();
    stream.synchronize().unwrap();
    let mut host_res = vec![G1Projective::zero(); 1];
    msm_res
        .copy_to_host(HostSlice::from_mut_slice(&mut host_res[..]))
        .unwrap();

    stream.destroy().unwrap();
    G1serde(G1Affine::from(host_res[0]))
}
pub fn sum_vector_dot_product_chunked(
    scalars: &[ScalarField],
    commit: &[G1Affine],
    chunk_size: usize,
) -> G1serde {
    assert_eq!(scalars.len(), commit.len());

    let mut partial_results = Vec::new();
    let mut stream = IcicleStream::create().expect("Stream creation failed");
    let mut cfg = msm::MSMConfig::default();
    cfg.stream_handle = *stream;
    cfg.is_async = true;

    for (scalar_chunk, commit_chunk) in scalars.chunks(chunk_size).zip(commit.chunks(chunk_size)) {
        let mut msm_res =
            DeviceVec::<G1Projective>::device_malloc(1).expect("device_malloc failed");
        msm::msm(
            HostSlice::from_slice(scalar_chunk),
            HostSlice::from_slice(commit_chunk),
            &cfg,
            &mut msm_res[..],
        )
            .unwrap();

        stream.synchronize().unwrap();

        let mut host_res = vec![G1Projective::zero(); 1];
        msm_res
            .copy_to_host(HostSlice::from_mut_slice(&mut host_res[..]))
            .unwrap();

        partial_results.push(host_res[0]);
    }
    stream.destroy().unwrap();

    // Sum all partial MSM results using CPU
    let final_sum = partial_results
        .into_iter()
        .fold(G1Projective::zero(), |acc, p| acc + p);

    G1serde(G1Affine::from(final_sum))
}
//phase1_acc_1.json
