use ark_ff::Zero;
use icicle_runtime::memory::HostSlice;

use clap::Parser;
use icicle_bls12_381::curve::{G1Affine, G1Projective, ScalarField};
use icicle_core::msm;
use icicle_core::msm::MSMConfig;
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::HostOrDeviceSlice;
use libs::bivariate_polynomial::DensePolynomialExt;
use libs::group_structures::{G1serde, Sigma, Sigma1, Sigma2};
use libs::iotools::{SetupParams, SubcircuitInfo};
use mpc_setup::accumulator::Accumulator;
use mpc_setup::mpc_utils::{
    poly_mult, compute_langrange_i_coeffs, compute_langrange_i_poly,
};
pub use mpc_setup::prepare::QAP;
use rayon::iter::ParallelIterator;
use rayon::prelude::IntoParallelRefIterator;
use rayon::ThreadPoolBuilder;
use std::ops::Sub;
use std::time::Instant;
use icicle_runtime::Device;
use mpc_setup::sigma::{SigmaV2};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,
}
// export ICICLE_BACKEND_INSTALL_DIR=/Users/suleymankardas/Documents/icicle/lib/backend
// cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output
fn main() {
    let config = Config::parse();
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
    let subcircuit_file_name = "subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(subcircuit_file_name).unwrap();

    let mut li_y_vec: Vec<DensePolynomialExt> = vec![];

    for i in 0..s_max {
        let li_y = compute_langrange_i_poly(i, 1, s_max);
         li_y_vec.push(li_y);

    }
    println!("loading latest challenge from phase1_latest_challenge.json");
    let latest_acc = Accumulator::read_from_json(&format!(
        "{}/phase1_latest_challenge.json",
        config.outfolder
    )).expect("cannot read from phase1_latest_challenge.json");
    let sigma_trusted = SigmaV2::read_from_json("setup/trusted-setup/output/combined_sigma.json").unwrap();

    let g1 = latest_acc.g1;
    let g2 = latest_acc.g2;

    // {γ^(-1)(L_t(y)o_j(x) + M_j(x))}_{t=0,j=0}^{1,l-1} where t=0 for j∈[0,l_in-1] and t=1 for j∈[l_in,l-1]
    let mut gamma_inv_o_inst = vec![G1serde::zero(); l].into_boxed_slice();
    let alpha1xy_g1s = latest_acc.get_alphaxy_g1_range(1, n, li_y_vec[0].y_size);
    let alpha2xy_g1s = latest_acc.get_alphaxy_g1_range(2, n, li_y_vec[0].y_size);
    let alpha3xy_g1s = latest_acc.get_alphaxy_g1_range(3, n, li_y_vec[0].y_size);

    let qap = QAP::gen_from_R1CS(&subcircuit_infos, &setup_params);
    println!("The qap load time: {:.6} seconds", start1.elapsed().as_secs_f64());

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
    assert_eq!(sigma_trusted.sigma.sigma_1.gamma_inv_o_inst, gamma_inv_o_inst);

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

    assert_eq!(
        sigma_trusted.sigma.sigma_1.delta_inv_alpha4_xj_tx,
        delta_inv_alpha4_xj_tx
    );

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
    assert_eq!(
        sigma_trusted.sigma.sigma_1.delta_inv_alphak_yi_ty,
        delta_inv_alphak_yi_ty
    );
    let lap = start1.elapsed();
    println!(
        "The total time for first part: {:.6} seconds",
        lap.as_secs_f64()
    );
    let start1 = Instant::now();

    let mut multpxy_coeffs = vec![ScalarField::zero(); n * li_y_vec[0].y_size];
    // {η^(-1)L_i(y)(o_{j+l}(x) + α^4 K_j(x))}_{i=0,j=0}^{s_max-1,m_I-1}
    let mut eta_inv_li_o_inter_alpha4_kj =
        vec![vec![G1serde::zero(); s_max].into_boxed_slice(); m_i].into_boxed_slice();
    let mut kj_x_vec: Vec<DensePolynomialExt> = vec![];
    for i in 0..m_i {
        let kj_x = compute_langrange_i_poly(i, m_i, 1);
        kj_x_vec.push(kj_x);
    }
    let mut xy_coeffs = vec![ScalarField::zero(); li_y_vec[0].y_size * kj_x_vec[0].x_size];
    let alpha4xy_g1s = latest_acc.get_alphaxy_g1_range(4, kj_x_vec[0].x_size, li_y_vec[0].y_size);
    println!("len of (eta_inv_li_o_inter_alpha4_kj) is {}", m_i * s_max);
    let mut cache: Vec<(usize, usize, Vec<ScalarField>, Vec<G1Affine>)> = vec![];

    let start2 = Instant::now();
    for i in 0..s_max {
        for j in 0..m_i {
            //let mut out = G1serde::zero();
            let mut coeffs: Vec<ScalarField> = Vec::with_capacity(multpxy_coeffs.len() * 3 + xy_coeffs.len());
            let mut commits: Vec<G1Affine> = Vec::with_capacity(multpxy_coeffs.len() * 3 + xy_coeffs.len());
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
                cache.push((j,i,  coeffs, commits));
            }
            if cache.len() > 1 {
                run_sum_vector_dot_product2(&cache, &mut eta_inv_li_o_inter_alpha4_kj);
                cache.clear();
                let avg = start2.elapsed().as_secs_f64() / (j + m_i * i) as f64;
                println!("avg delta per second {}", 1f64 / avg);
                println!("eta_inv_li_o_inter_alpha4_kj[{}][{}] = {:?}", j, i, eta_inv_li_o_inter_alpha4_kj[j][i].0.x);
                //assert_eq!(eta_inv_li_o_inter_alpha4_kj[j][i], sigma_trusted.sigma_1.eta_inv_li_o_inter_alpha4_kj[j][i]);
            }
        }
    }
    if cache.len() > 0{
        run_sum_vector_dot_product2(&cache, &mut eta_inv_li_o_inter_alpha4_kj);
        cache.clear();
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
            if cache.len() > 1 {
                run_sum_vector_dot_product2(&cache, &mut delta_inv_li_o_prv);
                cache.clear();
                let avg = start2.elapsed().as_secs_f64() / (j - (l + m_i) + (m_d - (l + m_i)) * i) as f64;
                println!("avg delta per second {}", 1f64 / avg);
            }
        }
        if cache.len() > 0 {
            run_sum_vector_dot_product2(&cache, &mut delta_inv_li_o_prv);
            cache.clear();
        }
    }

    #[cfg(feature = "testing-mode")] {
        let sigma_trusted = Sigma::read_from_json("setup/trusted-setup/output/combined_sigma.json").unwrap();
        assert_eq!(sigma_trusted.sigma_1.gamma_inv_o_inst, gamma_inv_o_inst);
        assert_eq!(
            sigma_trusted.sigma_1.delta_inv_alphak_xh_tx,
            delta_inv_alphak_xh_tx
        );
        assert_eq!(
            sigma_trusted.sigma_1.delta_inv_alpha4_xj_tx,
            delta_inv_alpha4_xj_tx
        );
        assert_eq!(
            sigma_trusted.sigma_1.delta_inv_alphak_yi_ty,
            delta_inv_alphak_yi_ty
        );
        assert_eq!(eta_inv_li_o_inter_alpha4_kj, sigma_trusted.sigma_1.eta_inv_li_o_inter_alpha4_kj);
        assert_eq!(
            delta_inv_li_o_prv,
            sigma_trusted.sigma_1.delta_inv_li_o_prv);
    }

    let sigma = SigmaV2 {
        contributor_index: 0,
        gamma:g1,
        sigma:Sigma{
            G: g1,
            H: g2,
            sigma_1: Sigma1 {
                xy_powers: latest_acc.get_boxed_xypower(),
                x: latest_acc.get_x_g1(1),
                y: latest_acc.get_y_g1(1),
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
        }
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
pub fn sum_vector_dot_product(scalars: &Vec<ScalarField>, commit: &[G1Affine]) -> G1serde {
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
    all_scalars: &[ScalarField], // length = N × chunk_size
    all_commits: &[G1Affine],    // same length
    chunk_size: usize,           // size of each MSM
) -> Vec<G1serde> {
    assert_eq!(all_scalars.len(), all_commits.len());

    let n = all_scalars.len() / chunk_size;

    let mut outputs = vec![G1Projective::zero(); n];

    let mut config = MSMConfig::default();
    config.batch_size = chunk_size as i32;
    config.are_points_shared_in_batch = false;

    msm::msm(
        HostSlice::from_slice(all_scalars),
        HostSlice::from_slice(all_commits),
        &mut config,
        HostSlice::from_mut_slice(&mut outputs),
    )
        .unwrap();

    outputs
        .into_iter()
        .map(|p| G1serde(G1Affine::from(p)))
        .collect()
}
