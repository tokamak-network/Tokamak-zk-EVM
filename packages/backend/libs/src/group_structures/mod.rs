use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarCfg, ScalarField};
use icicle_core::traits::{Arithmetic, FieldImpl};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use crate::tools::{Tau, SetupParams};
use crate::vectors::{inner_product_two_vecs, outer_product_two_vecs, point_mul_two_vecs};
use crate::s_max;
use std::io::{stdout, Write};
use std::sync::atomic::{AtomicU16, Ordering};
use icicle_runtime::memory::HostSlice;
use serde_json::{Value, json, Map};
use rayon::scope;

use rayon::prelude::*;

macro_rules! resize_monomial_vec {
    ($mono_vec: expr, $target_size: expr) => {
        {
            let mut res = vec![ScalarField::zero(); $target_size].into_boxed_slice();
            _resize_monomial_vec($mono_vec, &mut res);
            res
        }
    };
}

fn _resize_monomial_vec (
    mono_vec: &Box<[ScalarField]>,
    res: &mut Box<[ScalarField]>,
) {
    let size_diff = res.len() as i64 - mono_vec.len() as i64;
    if size_diff == 0 {
        res.copy_from_slice(mono_vec); 
    } else if size_diff > 0{
        res[0..mono_vec.len()].copy_from_slice(mono_vec);
        for i in 0..size_diff as usize {
            res[mono_vec.len() + i] = res[mono_vec.len() + i - 1] * mono_vec[1];
        }
    } else {
        res.copy_from_slice(&mono_vec[0..res.len()]);
    }
}   

fn _scaled_outer_product(
    col_vec: &Box<[ScalarField]>, 
    row_vec: &Box<[ScalarField]>,
    scaler: Option<&ScalarField>, 
    res: &mut Box<[ScalarField]>
) {
    let col_size = col_vec.len();
    let row_size = row_vec.len();
    let size = col_size * row_size;
    if res.len() != size {
        panic!("Insufficient buffer length");
    }
    let mut outer_prod_vec = vec![ScalarField::zero(); size].into_boxed_slice();
    outer_product_two_vecs(
        col_vec, 
        row_vec, 
        &mut outer_prod_vec
    );
    if let Some(_scaler) = scaler {
        let scaler_vec = vec![*_scaler; size].into_boxed_slice();
        point_mul_two_vecs(
            &outer_prod_vec, 
            &scaler_vec, 
            res
        );
    } else {
        res.clone_from_slice(&outer_prod_vec);
    }
}

macro_rules! type_scaled_outer_product_2d {
    ($col_vec: expr, $row_vec: expr, $g1_gen: expr, $scaler: expr) => {
        {
            let col_size = $col_vec.len();
            let row_size = $row_vec.len();
            let mut res = vec![vec![G1Affine::zero(); col_size].into_boxed_slice(); row_size].into_boxed_slice();
            _scaled_outer_product_2d($col_vec, $row_vec, $g1_gen, $scaler, &mut res);
            res
        }
    };  
}

fn _scaled_outer_product_2d(
    col_vec: &Box<[ScalarField]>, 
    row_vec: &Box<[ScalarField]>, 
    g1_gen: &G1Affine, 
    scaler: Option<&ScalarField>, 
    res: &mut Box<[Box<[G1Affine]>]>
) {
    let col_size = col_vec.len();
    let row_size = row_vec.len();
    let size = col_size * row_size;
    if res.len() > 0 {
        if res.len() * res[0].len() != size {
            panic!("Insufficient buffer length");
        }
    } else {
        panic!("Empty buffer");
    }
    
    let mut res_coef = vec![ScalarField::zero(); size].into_boxed_slice();
    _scaled_outer_product(col_vec, row_vec, scaler, &mut res_coef);
    from_coef_vec_to_affine_mat(
        &res_coef,
        row_size,
        col_size,
        g1_gen,
        res,
    );
}

macro_rules! type_scaled_outer_product_1d {
    ($col_vec: expr, $row_vec: expr, $g1_gen: expr, $scaler: expr) => {
        {
            let col_size = $col_vec.len();
            let row_size = $row_vec.len();
            let mut res = vec![G1Affine::zero(); row_size * col_size].into_boxed_slice();
            _scaled_outer_product_1d($col_vec, $row_vec, $g1_gen, $scaler, &mut res);
            res
        }
    };  
}

fn _scaled_outer_product_1d(
    col_vec: &Box<[ScalarField]>, 
    row_vec: &Box<[ScalarField]>, 
    g1_gen: &G1Affine, 
    scaler: Option<&ScalarField>, 
    res: &mut Box<[G1Affine]>
) {
    let col_size = col_vec.len();
    let row_size = row_vec.len();
    let size = col_size * row_size;
    if res.len() != size {
        panic!("Insufficient buffer length");
    }
    let mut res_coef = vec![ScalarField::zero(); size].into_boxed_slice();
    _scaled_outer_product(col_vec, row_vec, scaler, &mut res_coef);
    from_coef_vec_to_affine_vec(
        &res_coef,
        g1_gen,
        res,
    );
}

macro_rules! type_scaled_monomials_1d {
    ( $cached_col_vec: expr, $cached_row_vec: expr, $col_size: expr, $row_size: expr, $scaler: expr, $g1_gen: expr ) => {
        {
            let col_vec = resize_monomial_vec!($cached_col_vec, $col_size);
            let row_vec = resize_monomial_vec!($cached_row_vec, $row_size);
            let res = type_scaled_outer_product_1d!(&col_vec, &row_vec, $g1_gen, $scaler);
            res
        }
    };
}


fn _gen_monomial_matrix(x_size: usize, y_size: usize, x: &ScalarField, y: &ScalarField, res_vec: &mut Box<[ScalarField]>) {
    // x_size: column size
    // y_size: row size
    if res_vec.len() != x_size * y_size {
        panic!("Not enough buffer length.")
    }
    let vec_ops_cfg = VecOpsConfig::default();
    let min_len = std::cmp::min(x_size, y_size);
    let max_len = std::cmp::max(x_size, y_size);
    let max_dir = if max_len == x_size {true } else {false};
    let mut base_row_vec = vec![ScalarField::one(); max_len];
    for ind in 1..max_len {
        if max_dir {
            base_row_vec[ind] = base_row_vec[ind-1] * *x;
        }
        else {
            base_row_vec[ind] = base_row_vec[ind-1] * *y;
        }
    }
    let mut res_vec_untransposed = res_vec.clone();
    let val_dup_vec = if max_dir {vec![*y; max_len].into_boxed_slice()} else {vec![*x; max_len].into_boxed_slice()};
    let val_dup = HostSlice::from_slice(&val_dup_vec);
    res_vec_untransposed[0 .. max_len].copy_from_slice(&base_row_vec);
    for ind in 1..min_len {
        let curr_row_view = HostSlice::from_slice(&res_vec_untransposed[(ind-1) * max_len .. (ind) * max_len]);
        let mut next_row_vec = vec![ScalarField::zero(); max_len].into_boxed_slice();
        let next_row = HostSlice::from_mut_slice(&mut next_row_vec); 
        ScalarCfg::mul(curr_row_view, val_dup, next_row, &vec_ops_cfg).unwrap();
        res_vec_untransposed[ind*max_len .. (ind+1)*max_len].copy_from_slice(&next_row_vec);
    }
    
    if !max_dir {
        let res_untranposed_buf = HostSlice::from_slice(&res_vec_untransposed);
        let res_buf = HostSlice::from_mut_slice(res_vec);
        ScalarCfg::transpose(
            res_untranposed_buf,
            min_len as u32,
            max_len as u32,
            res_buf,
            &vec_ops_cfg).unwrap();
    } else {
        res_vec.clone_from(&res_vec_untransposed);
    }
}

fn from_coef_vec_to_affine_vec(coef: &Box<[ScalarField]>, gen: &G1Affine, res: &mut Box<[G1Affine]>) {
    if res.len() != coef.len() {
        panic!("Not enough buffer length.")
    }
    // let mut msm_cfg = msm::MSMConfig::default();
    // let coef_buf = HostSlice::from_slice(&coef);
    // let bases_vec = vec![*gen; size].into_boxed_slice();
    // let bases = HostSlice::from_slice(&bases_vec);
    // msm_cfg.batch_size = size as i32;
    // let mut res_proj_vec = vec![G1Projective::zero(); size].into_boxed_slice();
    // let res_proj = HostSlice::from_mut_slice(&mut res_proj_vec);
    // msm::msm(coef_buf, bases, &msm_cfg, res_proj).unwrap();

    // let mut nzeros = 0 as usize;
    let gen_proj = gen.to_projective();
    // for i in 0..coef.len() {
    //     // if coef[i].eq(&ScalarField::zero()) {
    //     //     nzeros += 1;
    //     // }
    //     res[i] = G1Affine::from(gen_proj * coef[i]);
    //     println!("{:?} out of {:?}", i, coef.len());
    // }

    let cnt = AtomicU16::new(1);
    let progress = AtomicU16::new(0);
    let indi: u16 = coef.len() as u16 / 20;
    res.par_iter_mut()
        .zip(coef.par_iter())
        .for_each(|(r, &c)| {
            *r = G1Affine::from(gen_proj * c);
            let current_cnt = cnt.fetch_add(1, Ordering::Relaxed);
            if current_cnt % indi == 0 {
                let new_progress = progress.fetch_add(5, Ordering::Relaxed);
                print!("\rProgress: {}%", new_progress);
                stdout().flush().unwrap(); 
            }
        });
    print!("\r");

    // println!("Number of nonzero coefficients: {:?}", coef.len() - nzeros);
}

fn from_coef_vec_to_affine_mat(coef: &Box<[ScalarField]>, r_size: usize, c_size: usize, gen: &G1Affine, res: &mut Box<[Box<[G1Affine]>]>) {
    if res.len() != r_size || res.len() == 0 {
        panic!("Not enough buffer row length.")
    }
    let mut temp_vec = vec![G1Affine::zero(); r_size * c_size].into_boxed_slice();
    from_coef_vec_to_affine_vec(coef, gen, &mut temp_vec);
    for i in 0..r_size {
        if res[i].len() != c_size {
            panic!("Not enough buffer column length.")
        }
        res[i].copy_from_slice(&temp_vec[i * c_size .. (i + 1) * c_size]);
    }
}

pub struct Sigma {
    pub sigma_ai: SigmaArithAndIP,
    pub sigma_c: SigmaCopy,
    //pub sigma_zk: SigmaZK,
    pub sigma_v: SigmaVerify,
}

pub struct SigmaArithAndIP {
    // first line paper page 21 
    pub alpha: G1Affine,  
    pub xy_hi: Box<[G1Affine]>, // h ∈ ⟦0,n-1⟧ , i ∈ ⟦0, s_{max} -1⟧
    // second line paper page 21
    pub gamma_l_o_pub_j: Box<[G1Affine]>, // //  j ∈ ⟦0, l-1⟧
    pub eta1_l_o_inter_ij:Box<[Box<[G1Affine]>]>, // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
    pub delta_l_o_prv_ij: Box<[Box<[G1Affine]>]>,  // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l_{D} , m_{D} - 1 ⟧
    // third line paper page 21 
    pub eta0_l_o_ip_first_ij: Box<[Box<[G1Affine]>]>, //i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
    pub eta0_l_m_tz_ip_second_ij: Box<[Box<[G1Affine]>]>, //i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
    // fourth line paper page 21 
    pub delta_xy_tx_hi: Box<[G1Affine]>, // h ∈ ⟦0, n-2⟧ , i ∈ ⟦0 , s_{max} - 1 ⟧
    pub delta_xy_ty_hi :Box<[G1Affine]>, // h ∈ ⟦0, 2n-2⟧ , i ∈ ⟦0 , s_{max} - 2 ⟧
}

impl SigmaArithAndIP {
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        o_vec: &Box<[ScalarField]>,
        m_vec: &Box<[ScalarField]>,
        l_vec: &Box<[ScalarField]>,
        k_vec: &Box<[ScalarField]>,
        g1_gen: &G1Affine
    ) -> Self {
        let l = params.l;
        if l % 2 == 1 {
            panic!{"l is an odd number."}
        }
        let l_in = l/2;
        let m_d = params.m_D;
        let l_d = params.l_D;
        let n = params.n;

        let vec_ops_cfg = VecOpsConfig::default();

        let o_vec_pub = &o_vec[0..l].to_vec().into_boxed_slice();
        let o_vec_inter = &o_vec[l..l_d].to_vec().into_boxed_slice();
        let o_vec_prv = &o_vec[l_d..m_d].to_vec().into_boxed_slice();

        let cached_x_pows_vec = &resize_monomial_vec!(
            &vec![ScalarField::one(), tau.x].into_boxed_slice(), 
            2*n
        );
        let cached_y_pows_vec = &resize_monomial_vec!(
            &vec![ScalarField::one(), tau.y].into_boxed_slice(), 
            s_max
        );

        // generate alpha
        let alpha = G1Affine::from( (*g1_gen).to_projective() * tau.alpha );
        
        // generate xy_hi: Box<[G1Affine]>, // h ∈ ⟦0,n-1⟧ as column , i ∈ ⟦0, s_{max} -1⟧ as row
        println!("Generating xy_hi of size {:?}...", n * s_max);
        let xy_hi = type_scaled_monomials_1d!(cached_y_pows_vec, cached_x_pows_vec, s_max, n, None, g1_gen);
        
        // generate gamma_l_o_pub_j: Box<[G1Affine]>, // //  j ∈ ⟦0, l-1⟧
        println!("Generating gamma_l_o_pub_j of size {:?}...", l);
        let mut gamma_l_o_pub_j= vec![G1Affine::zero(); l].into_boxed_slice();
        {
            let mut gamma_l_o_pub_j_coef_vec = vec![ScalarField::zero(); l].into_boxed_slice();
            {
                let mut gamma_l_pub_vec = Vec::with_capacity(l);
                let gamma_l_in_vec = vec![tau.gamma.inv()*l_vec[0]; l_in].into_boxed_slice();
                let gamma_l_out_vec = vec![tau.gamma.inv()*l_vec[s_max - 1]; l_in].into_boxed_slice();
                gamma_l_pub_vec.extend_from_slice(&gamma_l_in_vec);
                gamma_l_pub_vec.extend_from_slice(&gamma_l_out_vec);
                point_mul_two_vecs(
                    o_vec_pub,
                    &gamma_l_pub_vec.into_boxed_slice(),
                    &mut gamma_l_o_pub_j_coef_vec
                );
            }   
            from_coef_vec_to_affine_vec(
                &gamma_l_o_pub_j_coef_vec,
                g1_gen,
                &mut gamma_l_o_pub_j
            );
        }

        // generate eta1_l_o_inter_ij:Box<[Box<[G1Affine]>]>, // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
        println!("Generating eta1_l_o_inter_ij of size {:?}...", s_max * (l_d - l));
        let eta1_l_o_inter_ij = type_scaled_outer_product_2d!(o_vec_inter, l_vec, g1_gen, Some(&tau.eta1.inv()));

        // generate delta_l_o_prv_ij: Box<[Box<[G1Affine]>]>,  // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l_{D} , m_{D} - 1 ⟧
        println!("Generating delta_l_o_prv_ij of size {:?}...", s_max * (m_d - l_d));
        let delta_l_o_prv_ij = type_scaled_outer_product_2d!(o_vec_prv, l_vec, g1_gen, Some(&tau.delta.inv()));

        // generate eta0_l_o_ip_first_ij: Box<[Box<[G1Affine]>]>, //i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
        println!("Generating eta0_l_o_ip_first_ij of size {:?}...", s_max * (l_d - l));
        let mut k2_j_vec = vec![ScalarField::zero(); l_d - l].into_boxed_slice();
        point_mul_two_vecs(k_vec, k_vec, &mut k2_j_vec);
        let ones_vec = vec![ScalarField::one(); l_d - l].into_boxed_slice();
        let mut k2_minus_1_j_vec = vec![ScalarField::zero(); l_d - l].into_boxed_slice();
        ScalarCfg::sub(
            HostSlice::from_slice(&k2_j_vec), 
            HostSlice::from_slice(&ones_vec), 
            HostSlice::from_mut_slice(&mut k2_minus_1_j_vec), 
            &vec_ops_cfg
        ).unwrap();
        drop(k2_j_vec);
        drop(ones_vec);
        let mut col_vec = vec![ScalarField::zero(); l_d - l].into_boxed_slice();
        point_mul_two_vecs(
            o_vec_inter,
            &k2_minus_1_j_vec,
            &mut col_vec,
        );
        drop(k2_minus_1_j_vec);
        let eta0_l_o_ip_first_ij = type_scaled_outer_product_2d!(&col_vec, l_vec, g1_gen, Some(&tau.eta0.inv()));
        drop(col_vec);

        // generate eta0_l_m_tz_ip_second_ij: Box<[Box<[G1Affine]>]>, //i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
        println!("Generating eta0_l_m_tz_ip_second_ij of size {:?}...", s_max * (l_d - l));
        let scaler = tau.eta0.inv() * (tau.z.pow(l_d - l) - ScalarField::one());
        let eta0_l_m_tz_ip_second_ij = type_scaled_outer_product_2d!( m_vec, l_vec, g1_gen, Some(&scaler) );

        // generate delta_xy_tx_hi: Box<[G1Affine]>, // h ∈ ⟦0, n-2⟧ , i ∈ ⟦0 , s_{max} - 1 ⟧
        println!("Generating delta_xy_tx_hi of size {:?}...", (n - 1) * s_max );
        let scaler = tau.delta.inv() * (tau.x.pow(n) - ScalarField::one());
        let delta_xy_tx_hi = type_scaled_monomials_1d!(cached_y_pows_vec, cached_x_pows_vec, s_max, n-1, Some(&scaler), g1_gen);

        // generate delta_xy_ty_hi :Box<[G1Affine]>, // h ∈ ⟦0, 2n-2⟧ , i ∈ ⟦0 , s_{max} - 2 ⟧
        println!("Generating delta_xy_ty_hi of size {:?}...", (2*n - 1) * (s_max - 1) );
        let scaler = tau.delta.inv() * (tau.y.pow(s_max) - ScalarField::one());
        let delta_xy_ty_hi = type_scaled_monomials_1d!(cached_y_pows_vec, cached_x_pows_vec, s_max - 1, 2*n - 1, Some(&scaler), g1_gen);

        //// End of generation

        Self {
            alpha,
            xy_hi,
            gamma_l_o_pub_j,
            delta_l_o_prv_ij,
            eta1_l_o_inter_ij,
            eta0_l_o_ip_first_ij,
            eta0_l_m_tz_ip_second_ij,
            delta_xy_tx_hi,
            delta_xy_ty_hi,
        }
    
    }

    pub fn serialize_sigma_ai(sigma: &SigmaArithAndIP) -> Value {
        json!({
            "alpha": g1_affine_to_json(&sigma.alpha),
            "xy_hi": g1_affine_array_to_json(&sigma.xy_hi),
            "gamma_l_o_pub_j": g1_affine_array_to_json(&sigma.gamma_l_o_pub_j),
            "eta1_l_o_inter_ij": g1_affine_2d_array_to_json(&sigma.eta1_l_o_inter_ij),
            "delta_l_o_prv_ij": g1_affine_2d_array_to_json(&sigma.delta_l_o_prv_ij),
            "eta0_l_o_ip_first_ij": g1_affine_2d_array_to_json(&sigma.eta0_l_o_ip_first_ij),
            "eta0_l_m_tz_ip_second_ij": g1_affine_2d_array_to_json(&sigma.eta0_l_m_tz_ip_second_ij),
            "delta_xy_tx_hi": g1_affine_array_to_json(&sigma.delta_xy_tx_hi),
            "delta_xy_ty_hi": g1_affine_array_to_json(&sigma.delta_xy_ty_hi)
        })
    }
}

pub struct SigmaCopy {
    // first line paper page 21
    pub mu_l_k_ij: Box<[G1Affine]>, // i ∈ ⟦0 , s_{max} - 1 ⟧ , j ∈ ⟦0 , l_D - l - 1 ⟧
    // second line paper page 21 
    pub nu_yz_ty_ij: Box<[G1Affine]>,  // i ∈ ⟦0 , s_{max} - 2 ⟧ , j ∈ ⟦0 , 2⋅l_D - 2⋅l - 2 ⟧
    pub nu_yz_tz_ij: Box<[G1Affine]>,  // i ∈ ⟦0 , 2⋅s_{max} - 2 ⟧ , j ∈ ⟦0 , 2⋅l_D - 2⋅l - 3 ⟧
    // third line paper page 21 
    pub psi0_kappa_0_yz_ij: Box<[G1Affine]>, // i ∈ ⟦0 , 2⋅s_{max} - 3 ⟧,j ∈ ⟦0 , 3⋅l_D - 3⋅l - 3 ⟧
    pub psi0_kappa_1_yz_ij: Box<[G1Affine]>, // i ∈ ⟦0 , 2⋅s_{max} - 3 ⟧,j ∈ ⟦0 , 3⋅l_D - 3⋅l - 3 ⟧
    pub psi1_z_j: Box<[G1Affine]>,// j ∈ ⟦0 , 3⋅l_D - 3⋅l - 4 ⟧
    pub psi2_kappa_2_yz_ij: Box<[G1Affine]> , //i ∈ ⟦0 , s_{max} - 2 ⟧,j ∈ ⟦0 , l_D - l - 1 ⟧
    pub psi3_kappa_1_z_j: Box<[G1Affine]>, // j ∈ ⟦0 , l_D - l - 2 ⟧
    pub psi3_kappa_2_z_j: Box<[G1Affine]>, // j ∈ ⟦0 , l_D - l - 2 ⟧
}

impl SigmaCopy {
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        l_vec: &Box<[ScalarField]>,
        k_vec: &Box<[ScalarField]>,
        g1_gen: &G1Affine
    ) -> Self {
        let l = params.l;
        if l % 2 == 1 {
            panic!{"l is an odd number."}
        }
        let l_d = params.l_D;

        let cached_y_pows_vec = &resize_monomial_vec!(
            &vec![ScalarField::one(), tau.y].into_boxed_slice(), 
            2*s_max
        );
        let cached_z_pows_vec = &resize_monomial_vec!(
            &vec![ScalarField::one(), tau.z].into_boxed_slice(), 
            3*l_d - 3*l
        );

        // generate mu_l_k_ij: Box<[G1Affine]>, // i ∈ ⟦0 , s_{max} - 1 ⟧ , j ∈ ⟦0 , l_D - l - 1 ⟧
        println!("Generating mu_l_k_ij of size {:?}...", s_max * (l_d - l));
        let mu_l_k_ij = type_scaled_outer_product_1d!(k_vec, l_vec, g1_gen, Some(&tau.mu.inv()));

        // generate nu_yz_ty_ij: Box<[G1Affine]>,  // i ∈ ⟦0 , s_{max} - 2 ⟧ , j ∈ ⟦0 , 2⋅l_D - 2⋅l - 2 ⟧
        println!("Generating nu_yz_ty_ij of size {:?}...", (s_max - 1) * (2*l_d - 2*l - 1));
        let scaler = tau.nu.inv() * (tau.y.pow(s_max) - ScalarField::one());
        let nu_yz_ty_ij = type_scaled_monomials_1d!(cached_z_pows_vec, cached_y_pows_vec, 2*l_d - 2*l - 1, s_max - 1, Some(&scaler), g1_gen);

        // generate nu_yz_tz_ij: Box<[G1Affine]>,  // i ∈ ⟦0 , 2s_{max} - 2 ⟧ , j ∈ ⟦0 , 2⋅l_D - 2⋅l - 3 ⟧
        println!("Generating nu_yz_tz_ij of size {:?}...", (2*s_max - 1) * (2*l_d - 2*l - 2));
        let scaler = tau.nu.inv() * (tau.z.pow(l_d - l) - ScalarField::one());
        let nu_yz_tz_ij = type_scaled_monomials_1d!(cached_z_pows_vec, cached_y_pows_vec, 2*l_d - 2*l - 2, 2*s_max - 1, Some(&scaler), g1_gen);

        // generate psi0_kappa_0_yz_ij: Box<[G1Affine]>, // i ∈ ⟦0 , 2⋅s_{max} - 3 ⟧,j ∈ ⟦0 , 3⋅l_D - 3⋅l - 3 ⟧
        println!("Generating psi0_kappa_0_yz_ij of size {:?}...", (2*s_max - 2) * (3*l_d - 3*l - 2));
        let scaler = tau.psi0.inv();
        let psi0_kappa_0_yz_ij = type_scaled_monomials_1d!(cached_z_pows_vec, cached_y_pows_vec, 3*l_d - 3*l - 2, 2*s_max - 2, Some(&scaler), g1_gen);

        // generate psi0_kappa_1_yz_ij: Box<[G1Affine]>, // i ∈ ⟦0 , 2⋅s_{max} - 3 ⟧,j ∈ ⟦0 , 3⋅l_D - 3⋅l - 3 ⟧
        println!("Generating psi0_kappa_1_yz_ij of size {:?}...", (2*s_max - 2) * (3*l_d - 3*l - 2));
        let scaler = tau.psi0.inv() * tau.kappa;
        let psi0_kappa_1_yz_ij = type_scaled_monomials_1d!(cached_z_pows_vec, cached_y_pows_vec, 3*l_d - 3*l - 2, 2*s_max - 2, Some(&scaler), g1_gen);

        // generate pub psi1_z_j: Box<[G1Affine]>,// j ∈ ⟦0 , 3⋅l_D - 3⋅l - 4 ⟧
        println!("Generating psi1_z_j of size {:?}...", 3*l_d - 3*l - 3);
        let scaler = tau.psi1.inv();
        let row_vec = vec![ScalarField::one(), ScalarField::one()].into_boxed_slice();
        let psi1_z_j = type_scaled_monomials_1d!(cached_z_pows_vec, &row_vec, 3*l_d - 3*l - 3, 1, Some(&scaler), g1_gen);

        // generate psi2_kappa_2_yz_ij: Box<[G1Affine]> , //i ∈ ⟦0 , s_{max} - 2 ⟧,j ∈ ⟦0 , l_D - l - 1 ⟧
        println!("Generating psi2_kappa_2_yz_ij of size {:?}...", (s_max - 1) * (l_d - l));
        let scaler = tau.psi2.inv() * tau.kappa.pow(2);
        let psi2_kappa_2_yz_ij = type_scaled_monomials_1d!(cached_z_pows_vec, cached_y_pows_vec, l_d - l, s_max - 1, Some(&scaler), g1_gen);

        // generate psi3_kappa_1_z_j: Box<[G1Affine]>, // j ∈ ⟦0 , l_D - l - 2 ⟧
        println!("Generating psi3_kappa_1_z_j of size {:?}...", l_d - l - 1);
        let scaler = tau.psi3.inv() * tau.kappa;
        let row_vec = vec![ScalarField::one(), ScalarField::one()].into_boxed_slice();
        let psi3_kappa_1_z_j = type_scaled_monomials_1d!(cached_z_pows_vec, &row_vec, l_d - l - 1, 1, Some(&scaler), g1_gen);
        
        // generate psi3_kappa_2_z_j: Box<[G1Affine]>, // j ∈ ⟦0 , l_D - l - 2 ⟧
        println!("Generating psi3_kappa_2_z_j of size {:?}...", l_d - l - 1);
        let scaler = tau.psi3.inv() * tau.kappa.pow(2);
        let row_vec = vec![ScalarField::one(), ScalarField::one()].into_boxed_slice();
        let psi3_kappa_2_z_j = type_scaled_monomials_1d!(cached_z_pows_vec, &row_vec, l_d - l - 1, 1, Some(&scaler), g1_gen);
        //// End of generation

        Self {
            mu_l_k_ij,
            nu_yz_ty_ij,
            nu_yz_tz_ij,
            psi0_kappa_0_yz_ij,
            psi0_kappa_1_yz_ij,
            psi1_z_j,
            psi2_kappa_2_yz_ij,
            psi3_kappa_1_z_j,
            psi3_kappa_2_z_j
        }
    }

    pub fn serialize_sigma_c(sigma: &SigmaCopy) -> Value {
        json!({
            "mu_l_k_ij": g1_affine_array_to_json(&sigma.mu_l_k_ij),
            "nu_yz_ty_ij": g1_affine_array_to_json(&sigma.nu_yz_ty_ij),
            "nu_yz_tz_ij": g1_affine_array_to_json(&sigma.nu_yz_tz_ij),
            "psi0_kappa_0_yz_ij": g1_affine_array_to_json(&sigma.psi0_kappa_0_yz_ij),
            "psi0_kappa_1_yz_ij": g1_affine_array_to_json(&sigma.psi0_kappa_1_yz_ij),
            "psi1_z_j": g1_affine_array_to_json(&sigma.psi1_z_j),
            "psi2_kappa_2_yz_ij": g1_affine_array_to_json(&sigma.psi2_kappa_2_yz_ij),
            "psi3_kappa_1_z_j": g1_affine_array_to_json(&sigma.psi3_kappa_1_z_j),
            "psi3_kappa_2_z_j": g1_affine_array_to_json(&sigma.psi3_kappa_2_z_j)
        })
    }
}

pub struct SigmaVerify {
    pub beta: G2Affine,
    pub gamma: G2Affine,
    pub delta: G2Affine,
    pub eta1: G2Affine,
    pub mu_eta0: G2Affine,
    pub mu_eta1: G2Affine,
    pub xy_hi: Box<[G2Affine]>, // h ∈ ⟦0,n-1⟧ , i ∈ ⟦0, s_{max} -1⟧
    pub mu_comb_o_inter: G2Affine,
    pub mu_3_nu: G2Affine,
    pub mu_4_kappa_i: Box<[G2Affine]>,
    pub mu_3_psi0_yz_ij: Box<[Box<[G2Affine]>]>, // i ∈ ⟦0,1⟧, j ∈ ⟦0,1⟧
    pub mu_3_psi1_yz_ij: Box<[Box<[G2Affine]>]>, // i ∈ ⟦0,1⟧, j ∈ ⟦0,1⟧
    pub mu_3_psi2_yz_ij: Box<[Box<[G2Affine]>]>, // i ∈ ⟦0,1⟧, j ∈ ⟦0,1⟧
    pub mu_3_psi3_yz_ij: Box<[Box<[G2Affine]>]> // i ∈ ⟦0,1⟧, j ∈ ⟦0,1⟧
}

impl SigmaVerify {
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        o_vec: &Box<[ScalarField]>,
        k_vec: &Box<[ScalarField]>,
        g2_gen: &G2Affine
    ) -> Self {
        let l = params.l;
        let l_d = params.l_D;
        let n = params.n;

        let o_vec_inter = &o_vec[l..l_d].to_vec().into_boxed_slice();
        let gen_proj = g2_gen.to_projective();

        //generate xy_hi: Box<[G2Affine]>, // h ∈ ⟦0,n-1⟧ , i ∈ ⟦0, s_{max} -1⟧
        println!("Generating xy_hi of size {:?} on G2...", n * s_max);
        let x_pows_vec = resize_monomial_vec!(
            &vec![ScalarField::one(), tau.x].into_boxed_slice(), 
            n
        );
        let y_pows_vec = resize_monomial_vec!(
            &vec![ScalarField::one(), tau.y].into_boxed_slice(), 
            s_max
        );
        let mut coef = vec![ScalarField::zero(); n * s_max].into_boxed_slice();
        _scaled_outer_product(&y_pows_vec, &x_pows_vec, None, &mut coef);
        drop(y_pows_vec);
        drop(x_pows_vec);
        let mut xy_hi = vec![G2Affine::zero(); n * s_max].into_boxed_slice();
        let cnt = AtomicU16::new(1);
        let progress = AtomicU16::new(0);
        let indi: u16 = coef.len() as u16 / 20;
        xy_hi.par_iter_mut()
            .zip(coef.par_iter())
            .for_each(|(r, &c)| {
                *r = G2Affine::from(gen_proj * c);
                let current_cnt = cnt.fetch_add(1, Ordering::Relaxed);
                if current_cnt % indi == 0 {
                    let new_progress = progress.fetch_add(5, Ordering::Relaxed);
                    print!("\rProgress: {}%", new_progress);
                    stdout().flush().unwrap(); 
                }
            });
        print!("\r");
        drop(coef);

        // generate others
        println!("Generating other G2 points...");
        let beta = G2Affine::from(gen_proj * tau.beta);
        let gamma = G2Affine::from(gen_proj * tau.gamma);
        let delta = G2Affine::from(gen_proj * tau.delta);
        let eta1 = G2Affine::from(gen_proj * tau.eta1);
        let mu_eta0 = G2Affine::from(gen_proj * (tau.mu * tau.eta0));
        let mu_eta1 = G2Affine::from(gen_proj * (tau.mu * tau.eta1));
        let val = inner_product_two_vecs(o_vec_inter, k_vec);
        let mu_comb_o_inter = G2Affine::from(gen_proj * (tau.mu.pow(2) * val));
        let mu_3_nu = G2Affine::from(gen_proj * (tau.mu.pow(3) * tau.nu));
        let mut mu_4_kappa_i = vec![G2Affine::zero(); 3].into_boxed_slice();
        for i in 0..3 {
            mu_4_kappa_i[i] = G2Affine::from(gen_proj * (tau.mu.pow(4) * tau.kappa.pow(i)));
        }
        let mut mu_3_psi0_yz_ij = vec![vec![G2Affine::zero(); 2].into_boxed_slice(); 2].into_boxed_slice();
        let mut mu_3_psi1_yz_ij = vec![vec![G2Affine::zero(); 2].into_boxed_slice(); 2].into_boxed_slice();
        let mut mu_3_psi2_yz_ij = vec![vec![G2Affine::zero(); 2].into_boxed_slice(); 2].into_boxed_slice();
        let mut mu_3_psi3_yz_ij = vec![vec![G2Affine::zero(); 2].into_boxed_slice(); 2].into_boxed_slice();
        for y_i  in 0.. 2 {
            for z_j in 0..2 {
                let common_val = (tau.mu.pow(3) * tau.y.pow(y_i)) * tau.z.pow(z_j);
                mu_3_psi0_yz_ij[y_i][z_j] = G2Affine::from(gen_proj * (tau.psi0 * common_val));
                mu_3_psi1_yz_ij[y_i][z_j] = G2Affine::from(gen_proj * (tau.psi1 * common_val));
                mu_3_psi2_yz_ij[y_i][z_j] = G2Affine::from(gen_proj * (tau.psi2 * common_val));
                mu_3_psi3_yz_ij[y_i][z_j] = G2Affine::from(gen_proj * (tau.psi3 * common_val));
            }
        }

        //// End of generation
        Self {
            beta,
            gamma,
            delta,
            eta1,
            mu_eta0,
            mu_eta1,
            xy_hi,
            mu_comb_o_inter,
            mu_3_nu,
            mu_4_kappa_i,
            mu_3_psi0_yz_ij,
            mu_3_psi1_yz_ij,
            mu_3_psi2_yz_ij,
            mu_3_psi3_yz_ij
        }
    }


    pub fn gen_rayon(
        params: &SetupParams,
        tau: &Tau,
        o_vec: &Box<[ScalarField]>,
        k_vec: &Box<[ScalarField]>,
        g2_gen: &G2Affine
    ) -> Self {
        let l = params.l;
        let l_d = params.l_D;
        let n = params.n;

        let o_vec_inter = &o_vec[l..l_d].to_vec().into_boxed_slice();
        let gen_proj = g2_gen.to_projective();

        println!("Generating xy_hi of size {:?} on G2...", n * s_max);
        let x_pows_vec = resize_monomial_vec!(
            &vec![ScalarField::one(), tau.x].into_boxed_slice(), 
            n
        );
        let y_pows_vec = resize_monomial_vec!(
            &vec![ScalarField::one(), tau.y].into_boxed_slice(), 
            s_max
        );
        let mut coef = vec![ScalarField::zero(); n * s_max].into_boxed_slice();
        _scaled_outer_product(&y_pows_vec, &x_pows_vec, None, &mut coef);
        drop(y_pows_vec);
        drop(x_pows_vec);

        let mut xy_hi = vec![G2Affine::zero(); n * s_max].into_boxed_slice();
        let progress = AtomicU16::new(0);
        let indi: u16 = coef.len() as u16 / 20;

        xy_hi.par_iter_mut()
            .zip(coef.par_iter())
            .for_each(|(r, &c)| {
                *r = G2Affine::from(gen_proj * c);
                let current_progress = progress.fetch_add(1, Ordering::Relaxed);
                if current_progress % indi == 0 {
                    print!("\rProgress: {}%", (current_progress * 5 / indi));
                    stdout().flush().unwrap();
                }
            });
        print!("\r");
        drop(coef);
        
        println!("Generating other G2 points...");
        let (mut beta, mut gamma, mut delta, mut eta1, mut mu_eta0, mut mu_eta1) =
        (G2Affine::zero(), G2Affine::zero(), G2Affine::zero(), G2Affine::zero(), G2Affine::zero(), G2Affine::zero());

        scope(|s| {
            s.spawn(|_| { beta = G2Affine::from(gen_proj * tau.beta); });
            s.spawn(|_| { gamma = G2Affine::from(gen_proj * tau.gamma); });
            s.spawn(|_| { delta = G2Affine::from(gen_proj * tau.delta); });
            s.spawn(|_| { eta1 = G2Affine::from(gen_proj * tau.eta1); });
            s.spawn(|_| { mu_eta0 = G2Affine::from(gen_proj * (tau.mu * tau.eta0)); });
            s.spawn(|_| { mu_eta1 = G2Affine::from(gen_proj * (tau.mu * tau.eta1)); });
        });

        let mu_comb_o_inter = G2Affine::from(gen_proj * (tau.mu.pow(2) * inner_product_two_vecs(o_vec_inter, k_vec)));
        let mu_3_nu = G2Affine::from(gen_proj * (tau.mu.pow(3) * tau.nu));

        // mu_4_kappa_i 벡터 병렬화
        let mut mu_4_kappa_i = vec![G2Affine::zero(); 3].into_boxed_slice();
        mu_4_kappa_i.par_iter_mut().enumerate().for_each(|(i, v)| {
            *v = G2Affine::from(gen_proj * (tau.mu.pow(4) * tau.kappa.pow(i)));
        });

        // mu_3_psi_yz_ij 벡터 병렬화
        let mut mu_3_psi0_yz_ij = vec![vec![G2Affine::zero(); 2].into_boxed_slice(); 2].into_boxed_slice();
        let mut mu_3_psi1_yz_ij = vec![vec![G2Affine::zero(); 2].into_boxed_slice(); 2].into_boxed_slice();
        let mut mu_3_psi2_yz_ij = vec![vec![G2Affine::zero(); 2].into_boxed_slice(); 2].into_boxed_slice();
        let mut mu_3_psi3_yz_ij = vec![vec![G2Affine::zero(); 2].into_boxed_slice(); 2].into_boxed_slice();

        // 🔹 Rayon을 이용하여 병렬 실행, but Mutex 없이 직접 수정 가능
        mu_3_psi0_yz_ij.par_iter_mut().enumerate().for_each(|(y_i, row)| {
            row.iter_mut().enumerate().for_each(|(z_j, cell)| {
                let common_val = (tau.mu.pow(3) * tau.y.pow(y_i)) * tau.z.pow(z_j);
                *cell = G2Affine::from(gen_proj * (tau.psi0 * common_val));
            });
        });

        mu_3_psi1_yz_ij.par_iter_mut().enumerate().for_each(|(y_i, row)| {
            row.iter_mut().enumerate().for_each(|(z_j, cell)| {
                let common_val = (tau.mu.pow(3) * tau.y.pow(y_i)) * tau.z.pow(z_j);
                *cell = G2Affine::from(gen_proj * (tau.psi1 * common_val));
            });
        });

        mu_3_psi2_yz_ij.par_iter_mut().enumerate().for_each(|(y_i, row)| {
            row.iter_mut().enumerate().for_each(|(z_j, cell)| {
                let common_val = (tau.mu.pow(3) * tau.y.pow(y_i)) * tau.z.pow(z_j);
                *cell = G2Affine::from(gen_proj * (tau.psi2 * common_val));
            });
        });

        mu_3_psi3_yz_ij.par_iter_mut().enumerate().for_each(|(y_i, row)| {
            row.iter_mut().enumerate().for_each(|(z_j, cell)| {
                let common_val = (tau.mu.pow(3) * tau.y.pow(y_i)) * tau.z.pow(z_j);
                *cell = G2Affine::from(gen_proj * (tau.psi3 * common_val));
            });
        });

        //// End of generation
        Self {
            beta,
            gamma,
            delta,
            eta1,
            mu_eta0,
            mu_eta1,
            xy_hi,
            mu_comb_o_inter,
            mu_3_nu,
            mu_4_kappa_i,
            mu_3_psi0_yz_ij,
            mu_3_psi1_yz_ij,
            mu_3_psi2_yz_ij,
            mu_3_psi3_yz_ij
        }
    }

    pub fn serialize_sigma_v(sigma: &SigmaVerify) -> Value {
        json!({
            "beta": g2_affine_to_json(&sigma.beta),
            "gamma": g2_affine_to_json(&sigma.gamma),
            "delta": g2_affine_to_json(&sigma.delta),
            "eta1": g2_affine_to_json(&sigma.eta1),
            "mu_eta0": g2_affine_to_json(&sigma.mu_eta0),
            "mu_eta1": g2_affine_to_json(&sigma.mu_eta1),
            "xy_hi": g2_affine_array_to_json(&sigma.xy_hi),
            "mu_comb_o_inter": g2_affine_to_json(&sigma.mu_comb_o_inter),
            "mu_3_nu": g2_affine_to_json(&sigma.mu_3_nu),
            "mu_4_kappa_i": g2_affine_array_to_json(&sigma.mu_4_kappa_i),
            "mu_3_psi0_yz_ij": g2_affine_2d_array_to_json(&sigma.mu_3_psi0_yz_ij),
            "mu_3_psi1_yz_ij": g2_affine_2d_array_to_json(&sigma.mu_3_psi1_yz_ij),
            "mu_3_psi2_yz_ij": g2_affine_2d_array_to_json(&sigma.mu_3_psi2_yz_ij),
            "mu_3_psi3_yz_ij": g2_affine_2d_array_to_json(&sigma.mu_3_psi3_yz_ij)
        })
    }
}


fn g1_affine_to_json(point: &G1Affine) -> Value {
    // G1Affine 포인트를 직렬화 (예: x, y 좌표를 문자열로 변환)
    json!({
        "x": point.x.to_string(),
        "y": point.y.to_string(),
    })
}

fn g2_affine_to_json(point: &G2Affine) -> Value {
    // G2Affine 포인트를 직렬화
    // json!({
    //     "x": {
    //         "c0": point.x.c0.to_string(),
    //         "c1": point.x.c1().to_string()
    //     },
    //     "y": {
    //         "c0": point.y.c0().to_string(),
    //         "c1": point.y.c1().to_string()
    //     }
    // })
    json!({
        "x": point.x.to_string(),
        "y": point.y.to_string(),
    })
}

fn g1_affine_array_to_json(array: &Box<[G1Affine]>) -> Value {
    let mut json_array = Vec::new();
    for point in array.iter() {
        json_array.push(g1_affine_to_json(point));
    }
    Value::Array(json_array)
}

fn g2_affine_array_to_json(array: &Box<[G2Affine]>) -> Value {
    let mut json_array = Vec::new();
    for point in array.iter() {
        json_array.push(g2_affine_to_json(point));
    }
    Value::Array(json_array)
}

fn g1_affine_2d_array_to_json(array: &Box<[Box<[G1Affine]>]>) -> Value {
    let mut json_array = Vec::new();
    for row in array.iter() {
        json_array.push(g1_affine_array_to_json(row));
    }
    Value::Array(json_array)
}

fn g2_affine_2d_array_to_json(array: &Box<[Box<[G2Affine]>]>) -> Value {
    let mut json_array = Vec::new();
    for row in array.iter() {
        json_array.push(g2_affine_array_to_json(row));
    }
    Value::Array(json_array)
}