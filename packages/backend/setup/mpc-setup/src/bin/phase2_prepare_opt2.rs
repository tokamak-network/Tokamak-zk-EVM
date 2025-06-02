use ark_ff::Zero;
use icicle_bls12_381::curve::{G1Affine, G1Projective, ScalarField};
use icicle_core::msm;
use icicle_core::msm::MSMConfig;
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice};
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::group_structures::{G1serde, Sigma, Sigma1, Sigma2};
use libs::iotools::SetupParams;
use libs::vector_operations::{outer_product_two_vecs, outer_product_two_vecs_rayon};
use mpc_setup::accumulator::Accumulator;
use mpc_setup::mpc_utils::{
    poly_mult, thread_safe_compute_langrange_i_coeffs, thread_safe_compute_langrange_i_poly,
};
pub use mpc_setup::prepare::QAP;
use rayon::iter::ParallelIterator;
use rayon::prelude::*;
use rayon::ThreadPoolBuilder;
use std::ops::Sub;
use std::time::Instant;
use clap::Parser;
use mpc_setup::utils::check_outfolder_writable;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,
    
}
// cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output 
fn main() {
    ThreadPoolBuilder::new()
        .num_threads(num_cpus::get() - 1)
        .build_global()
        .unwrap();

    let config = Config::parse();

    // Validate outfolder
    if let Err(e) = check_outfolder_writable(&config.outfolder) {
        eprintln!(
            "Error: output folder '{}' is not accessible: {}",
            config.outfolder, e
        );
        std::process::exit(1);
    }

    let latest_acc = Accumulator::load_from_json(&format!(
        "{}/phase1_latest_challenge.json",
        config.outfolder
    )).expect("cannot read from phase1_latest_challenge.json");

    let g1 = latest_acc.g1;
    let g2 = latest_acc.g2;

    let setup_file_name = "setupParams.json";
    let setup_params = SetupParams::from_path(setup_file_name).unwrap();
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

    
    let qap = QAP::load_from_json(&format!(
        "{}/qap_all.bin",
        config.outfolder
    )).expect("cannot read from qap_all.bin");

    println!("The qap load time: {:.6} seconds", start1.elapsed().as_secs_f64());
    let mut kj_x_vec: Vec<DensePolynomialExt> = vec![];
    for i in 0..m_i {
        let kj_x = thread_safe_compute_langrange_i_poly(i, m_i, 1);
        kj_x_vec.push(kj_x);
    }
    let mut li_y_vec: Vec<DensePolynomialExt> = vec![];
    for i in 0..s_max {
        let li_y = thread_safe_compute_langrange_i_poly(i, 1, s_max);
        li_y_vec.push(li_y);
    }
    // {γ^(-1)(L_t(y)o_j(x) + M_j(x))}_{t=0,j=0}^{1,l-1} where t=0 for j∈[0,l_in-1] and t=1 for j∈[l_in,l-1]
    let mut gamma_inv_o_inst = vec![G1serde::zero(); l].into_boxed_slice();
    let alpha1xyG1s = latest_acc.get_alphaxy_g1_range(1, n, li_y_vec[0].y_size);
    let alpha2xyG1s = latest_acc.get_alphaxy_g1_range(2, n, li_y_vec[0].y_size);
    let alpha3xyG1s = latest_acc.get_alphaxy_g1_range(3, n, li_y_vec[0].y_size);
    let alpha4xyG1s = latest_acc.get_alphaxy_g1_range(4, kj_x_vec[0].x_size, li_y_vec[0].y_size);

    compute_gamma_part_i(
        0,
        l_pub_out,
        &qap,
        &li_y_vec[1],
        &alpha1xyG1s,
        &alpha2xyG1s,
        &alpha3xyG1s,
        &mut gamma_inv_o_inst,
    );
    let xiG1s = latest_acc.get_x_g1_range(0, l_pub - 1);
    for j in 0..l_pub_out {
        let mut m_j_x_coeffs = vec![ScalarField::zero(); l_pub];
        thread_safe_compute_langrange_i_coeffs(j, l_pub, 1, &mut m_j_x_coeffs);
        gamma_inv_o_inst[j] = gamma_inv_o_inst[j] + sum_vector_dot_product(&m_j_x_coeffs, &xiG1s);
        println!("gamma_inv_o_inst[{}] = {:?}", j, gamma_inv_o_inst[j].0.x);
    }

    compute_gamma_part_i(
        l_pub_out,
        l_pub,
        &qap,
        &li_y_vec[0],
        &alpha1xyG1s,
        &alpha2xyG1s,
        &alpha3xyG1s,
        &mut gamma_inv_o_inst,
    );
    for j in l_pub_out..l_pub {
        let mut m_j_x_coeffs = vec![ScalarField::zero(); l_pub];
        thread_safe_compute_langrange_i_coeffs(j, l_pub, 1, &mut m_j_x_coeffs);
        gamma_inv_o_inst[j] = gamma_inv_o_inst[j] + sum_vector_dot_product(&m_j_x_coeffs, &xiG1s);
        println!("gamma_inv_o_inst[{}] = {:?}", j, gamma_inv_o_inst[j].0.x);
    }
    compute_gamma_part_i(
        l_pub,
        l_pub + l_prv_out,
        &qap,
        &li_y_vec[3],
        &alpha1xyG1s,
        &alpha2xyG1s,
        &alpha3xyG1s,
        &mut gamma_inv_o_inst,
    );
    compute_gamma_part_i(
        l_pub + l_prv_out,
        l,
        &qap,
        &li_y_vec[2],
        &alpha1xyG1s,
        &alpha2xyG1s,
        &alpha3xyG1s,
        &mut gamma_inv_o_inst,
    );

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


    // {δ^(-1)α^k y^i t_{s_max}(y)}_{i=0,k=1}^{2,4}
    let mut delta_inv_alphak_yi_ty =
        vec![vec![G1serde::zero(); 3].into_boxed_slice(); 4].into_boxed_slice();
    for k in 1..=4 {
        for i in 0..=2 {
            delta_inv_alphak_yi_ty[k - 1][i] =
                latest_acc.get_alphay_g1(k, s_max + i).sub(latest_acc.get_alphay_g1(k, i));

            println!(
                "delta_inv_alphak_yi_ty[{}][{}] = {:?}",
                k - 1,
                i,
                delta_inv_alphak_yi_ty[k - 1][i].0.x
            );
        }
    }


    let lap = start1.elapsed();
    println!(
        "The total time for first part: {:.6} seconds",
        lap.as_secs_f64()
    );
    let start1 = Instant::now();

    // {η^(-1)L_i(y)(o_{j+l}(x) + α^4 K_j(x))}_{i=0,j=0}^{s_max-1,m_I-1}
    let mut eta_inv_li_o_inter_alpha4_kj =
        vec![vec![G1serde::zero(); s_max].into_boxed_slice(); m_i].into_boxed_slice();

    println!("len of (eta_inv_li_o_inter_alpha4_kj) is {}", m_i * s_max);
    // {δ^(-1)L_i(y)o_j(x)}_{i=0,j=l+m_I}^{s_max-1,m_D-1}
    let mut delta_inv_li_o_prv =
        vec![vec![G1serde::zero(); s_max].into_boxed_slice(); (m_d - (l + m_i))].into_boxed_slice();
    //for private wires,
    println!(
        "len of (delta_inv_li_o_prv) is {}",
        s_max * (m_d - (l + m_i))
    );
    
    let shared_points_u = alpha1xyG1s;
    let shared_points_v = alpha2xyG1s;
    let shared_points_w = alpha3xyG1s;
    let shared_points_lk = alpha4xyG1s;

    let mut micro_timer = Instant::now();
    for j in l..m_d {
        let mut scalars_u = vec![ScalarField::zero(); n * s_max * s_max ];
        let mut scalars_v = vec![ScalarField::zero(); n * s_max * s_max ];
        let mut scalars_w = vec![ScalarField::zero(); n * s_max * s_max ];
        let mut scalars_lk = vec![ScalarField::zero(); m_i * s_max * s_max ];

        let mut cached_u = vec![G1Projective::zero(); s_max];
        let mut cached_v = vec![G1Projective::zero(); s_max];
        let mut cached_w = vec![G1Projective::zero(); s_max];
        let mut cached_lk = vec![G1Projective::zero(); s_max];

        micro_timer = Instant::now();
        for i in 0..s_max {
            let mut buffer_xy = vec![ScalarField::zero(); n * s_max];

            if !qap.u_j_X[j].is_zero(){
                poly_mult(&qap.u_j_X[j], &li_y_vec[i], &mut buffer_xy);
            }
            scalars_u[i * (n * s_max) .. (i + 1) * (n * s_max)].copy_from_slice(&buffer_xy);

            if !qap.v_j_X[j].is_zero(){
                poly_mult(&qap.v_j_X[j], &li_y_vec[i], &mut buffer_xy);
            }
            scalars_v[i * (n * s_max) .. (i + 1) * (n * s_max)].copy_from_slice(&buffer_xy);

            if !qap.w_j_X[j].is_zero(){
                poly_mult(&qap.w_j_X[j], &li_y_vec[i], &mut buffer_xy);
            }
            scalars_w[i * (n * s_max) .. (i + 1) * (n * s_max)].copy_from_slice(&buffer_xy);

            if j < l + m_i {
                std::mem::drop(buffer_xy);
                let mut buffer_xy = vec![ScalarField::zero(); m_i * s_max];
                poly_mult(&kj_x_vec[j - l], &li_y_vec[i], &mut buffer_xy);
                scalars_lk[i * (m_i * s_max) .. (i + 1) * (m_i * s_max)].copy_from_slice(&buffer_xy);
            }
        }
        println!("outer product time: {:.6} seconds", micro_timer.elapsed().as_secs_f32());

        micro_timer = Instant::now();
        batch_sum_vector_dot_product(&scalars_u, &shared_points_u, &mut cached_u);
        batch_sum_vector_dot_product(&scalars_v, &shared_points_v, &mut cached_v);
        batch_sum_vector_dot_product(&scalars_w, &shared_points_w, &mut cached_w);
        if j < l + m_i {
            batch_sum_vector_dot_product(&scalars_lk, &shared_points_lk, &mut cached_lk);
        }
        println!("msm time: {:.6} seconds", micro_timer.elapsed().as_secs_f32());

        micro_timer = Instant::now();
        if j < l + m_i {
            eta_inv_li_o_inter_alpha4_kj[j - l]
                .par_iter_mut()
                .enumerate()
                .for_each(|(i, dst)| {
                    *dst = G1serde(G1Affine::from(cached_u[i] + cached_v[i] + cached_w[i] + cached_lk[i]));
                });
        } else {
            delta_inv_li_o_prv[j - (l + m_i)]
                .par_iter_mut()
                .enumerate()
                .for_each(|(i, dst)| {
                    *dst = G1serde(G1Affine::from(cached_u[i] + cached_v[i] + cached_w[i]));
                });
        }
        println!("addition time: {:.6} seconds", micro_timer.elapsed().as_secs_f32());

        println!("Progress {:?} out of {:?}", j, m_d);
        
    }

    #[cfg(feature = "testing-mode")] {
        let sigma_old = Sigma::read_from_json("setup/mpc-setup/output/combined_sigma_o.json").unwrap();
        assert_eq!(sigma_old.sigma_1.gamma_inv_o_inst, gamma_inv_o_inst);
        assert_eq!(
            sigma_old.sigma_1.delta_inv_alphak_xh_tx,
            delta_inv_alphak_xh_tx
        );
        assert_eq!(
            sigma_old.sigma_1.delta_inv_alpha4_xj_tx,
            delta_inv_alpha4_xj_tx
        );
        assert_eq!(
            sigma_old.sigma_1.delta_inv_alphak_yi_ty,
            delta_inv_alphak_yi_ty
        );
        assert_eq!(eta_inv_li_o_inter_alpha4_kj, sigma_old.sigma_1.eta_inv_li_o_inter_alpha4_kj);
        assert_eq!(
            delta_inv_li_o_prv,
            sigma_old.sigma_1.delta_inv_li_o_prv);
    }

    let sigma = Sigma {
        contributor_index: 0,
        G: g1,
        H: g2,
        sigma_1: Sigma1 {
            xy_powers: latest_acc.get_boxed_xypower(),
            x: latest_acc.get_x_g1(1),
            y: latest_acc.get_y_g1(1),
            delta: g1,
            eta: g1,
            gamma: g1,
            gamma_inv_o_inst,
            eta_inv_li_o_inter_alpha4_kj,
            delta_inv_li_o_prv,
            delta_inv_alphak_xh_tx,
            delta_inv_alpha4_xj_tx,
            delta_inv_alphak_yi_ty,
        },
        sigma_2: Sigma2 {
            alpha: latest_acc.alpha[0].g2,
            alpha2: latest_acc.alpha[1].g2,
            alpha3: latest_acc.alpha[2].g2,
            alpha4: latest_acc.alpha[3].g2,
            gamma: g2,
            delta: g2,
            eta: g2,
            x: latest_acc.x[0].g2,
            y: latest_acc.y.g2,
        },
    };
    
    sigma.write_into_json(&format!(
            "{}/phase2_latest_combined_sigma.json",
            config.outfolder
        ))
        .expect("cannot write sigma into json");

    println!("The total time: {:.6} seconds", start1.elapsed().as_secs_f64());
}


fn compute_gamma_part_i(
    start: usize,
    end: usize,
    qap: &QAP,
    lag_i: &DensePolynomialExt,
    alpha1xyG1s: &Vec<G1Affine>,
    alpha2xyG1s: &Vec<G1Affine>,
    alpha3xyG1s: &Vec<G1Affine>,
    gamma_inv_o_inst: &mut Box<[G1serde]>,
) {
    let mut multpxy_coeffs = vec![ScalarField::zero(); qap.w_j_X[start].x_size * lag_i.y_size];
    let mut cache: Vec<(usize, Vec<ScalarField>, Vec<G1Affine>)> = vec![];

    for j in start..end {
        let mut coeffs: Vec<ScalarField> = Vec::with_capacity(multpxy_coeffs.len() * 3);
        let mut commits: Vec<G1Affine> = Vec::with_capacity(multpxy_coeffs.len() * 3);

        //lookup with alpha x^i y^j
        if !qap.u_j_X[j].is_zero() {
            poly_mult(&qap.u_j_X[j], &lag_i, &mut multpxy_coeffs);
            coeffs.extend(&multpxy_coeffs);
            commits.extend(alpha1xyG1s);
        }
        //lookup with alpha^2 x^i y^j
        if !qap.v_j_X[j].is_zero() {
            poly_mult(&qap.v_j_X[j], &lag_i, &mut multpxy_coeffs);
            coeffs.extend(&multpxy_coeffs);
            commits.extend(alpha2xyG1s);
        }
        //lookup with alpha^3 x^i y^j
        if !qap.w_j_X[j].is_zero() {
            poly_mult(&qap.w_j_X[j], &lag_i, &mut multpxy_coeffs);
            coeffs.extend(&multpxy_coeffs);
            commits.extend(alpha3xyG1s);
        }
        if coeffs.len() > 0 {
            cache.push((j, coeffs, commits));
            //gamma_inv_o_inst[j] = sum_vector_dot_product(&coeffs, &commits);//out;
        }
        if cache.len() > 10 {
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
        .par_iter()
        .map(|(j, coeffs, commits)| (*j, sum_vector_dot_product(coeffs, commits)))
        .collect();

    results.sort_by_key(|(j, _)| *j);
    for (j, val) in results {
        gamma_inv_o_inst[j] = val;
    }
}

fn run_sum_vector_dot_product2(cache: &Vec<(usize, usize, Vec<ScalarField>, Vec<G1Affine>)>, p1: &mut Box<[Box<[G1serde]>]>) {
    let mut results: Vec<(usize, usize, G1serde)> = cache
        .par_iter()
        .map(|(j, i, coeffs, commits)| (*j, *i, sum_vector_dot_product(coeffs, commits)))
        .collect();

    //results.sort_by_key(|(i,j, _)| *j);
    for (j, i, val) in results {
        p1[j][i] = val;
    }
}


/// Computes the multi-scalar multiplication, or MSM: s1*P1 + s2*P2 + ... + sn*Pn, or a batch of several MSMs.
fn sum_vector_dot_product(scalars: &Vec<ScalarField>, commit: &[G1Affine]) -> G1serde {
    let mut msm_res = vec![G1Projective::zero(); 1];
    let mut config = MSMConfig::default();
    config.are_points_shared_in_batch = false;
    msm::msm(
        HostSlice::from_slice(&scalars),
        HostSlice::from_slice(&commit),
        &config,
        HostSlice::from_mut_slice(&mut msm_res),
    )
        .unwrap();

    G1serde(G1Affine::from(msm_res[0]))
}

fn batch_sum_vector_dot_product(
    scalars: &[ScalarField],    // length = N × chunk_size
    shared_points: &[G1Affine],   //  length = chunk_size
    out: &mut [G1Projective]
) {
    let chunk_size = shared_points.len();
    let out_dim = scalars.len() / chunk_size;
    assert_eq!(scalars.len() % chunk_size, 0);
    assert_eq!(out.len(), out_dim);

    let mut _out = vec![G1Projective::zero(); out_dim];

    let mut config = MSMConfig::default();
    config.batch_size = chunk_size as i32;
    config.are_points_shared_in_batch = true;

    msm::msm(
        HostSlice::from_slice(scalars),
        HostSlice::from_slice(shared_points),
        &mut config,
        HostSlice::from_mut_slice(&mut _out),
    )
        .unwrap();
}
