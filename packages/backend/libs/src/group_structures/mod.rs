use icicle_bls12_381::curve::{BaseField, G2BaseField, CurveCfg, G1Projective, G2Projective, G1Affine, G2Affine, ScalarCfg, ScalarField};
use icicle_bls12_381::curve;
use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use crate::tools::{Tau, SetupParams, SubcircuitInfo, SubcircuitQAPEvaled, gen_cached_pows};
use crate::s_max;
use icicle_core::{ntt, msm};
use std::path::Path;
use std::ops::{Add, Mul, Sub};
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice, DeviceSlice, DeviceVec};

fn gen_monomial_matrix(x_size: usize, y_size: usize, x: &ScalarField, y: &ScalarField, res_vec: &mut Box<[ScalarField]>) {
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

fn from_coef_vec_to_affine_vec(coef: &Box<[ScalarField]>, size: usize, gen: &G1Affine, res: &mut Box<[G1Affine]>) {
    let mut msm_cfg = msm::MSMConfig::default();
    let coef_buf = HostSlice::from_slice(&coef);
    let bases_vec = vec![*gen; size].into_boxed_slice();
    let bases = HostSlice::from_slice(&bases_vec);
    msm_cfg.batch_size = size as i32;
    let mut res_proj_vec = vec![G1Projective::zero(); size].into_boxed_slice();
    let res_proj = HostSlice::from_mut_slice(&mut res_proj_vec);
    msm::msm(coef_buf, bases, &msm_cfg, res_proj);
    for i in 0..size {
        res[i] = G1Affine::from(res_proj_vec[i]);
    }
}

pub struct SigmaArithAndIP {
    // first line paper page 21 
    pub alpha: G1Affine,  
    pub xy_hi: Box<[G1Affine]>, // h ∈ ⟦0,n-1⟧ , i ∈ ⟦0, s_{max} -1⟧
    // second line paper page 21
    pub gamma_l_pub_o_j: Box<[G1Affine]>, // //  j ∈ ⟦0, l-1⟧
    pub eta1_l_inter_o_j:Box<[Box<[G1Affine]>]>, // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
    pub delta_l_prv_o_j: Box<[Box<[G1Affine]>]>,  // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l_{D} , m_{D} - 1 ⟧
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
        xy: &Box<[ScalarField]>,
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
    let l_D = params.l_D;
    let z_dom_length = l_D - l;
    let n = params.n;

    let mut msm_cfg = msm::MSMConfig::default();
    let vec_ops_cfg = VecOpsConfig::default();

    // generate alpha
    let alpha = G1Affine::from( (*g1_gen).to_projective() * tau.alpha );
    
    // generate xy_hi: Box<[G1Affine]>, // h ∈ ⟦0,n-1⟧ as column , i ∈ ⟦0, s_{max} -1⟧ as row
    let mut xy_pows_vec = vec![ScalarField::zero(); n * s_max].into_boxed_slice();
    gen_monomial_matrix(
        n,
        s_max,
        &tau.x,
        &tau.y,
        &mut xy_pows_vec
    );
    let mut xy_hi_affine_vec = vec![G1Affine::zero(); n * s_max].into_boxed_slice();
    let mut xy_hi_affine = HostSlice::from_mut_slice(&mut xy_hi_affine_vec);
    from_coef_vec_to_affine_vec(
        &xy_pows_vec,
        n * s_max,
        g1_gen,
        &mut xy_hi_affine_vec
    );

    // generate gamma_l_pub_o_j: Box<[G1Affine]>, // //  j ∈ ⟦0, l-1⟧
    let mut gamma_l_pub_vec = Vec::with_capacity(l);
    let gamma_l_in_vec = vec![tau.gamma.inv()*l_vec[0]; l_in].into_boxed_slice();
    let gamma_l_out_vec = vec![tau.gamma.inv()*l_vec[s_max - 1]; l_in].into_boxed_slice();
    gamma_l_pub_vec.extend_from_slice(&gamma_l_in_vec);
    gamma_l_pub_vec.extend_from_slice(&gamma_l_out_vec);
    gamma_l_pub_vec.into_boxed_slice();
    let gamma_l_pub = HostSlice::from_slice(&gamma_l_pub_vec);
    let pub_o_j_vec= o_vec[0..l].to_owned().into_boxed_slice();
    let pub_o_j = HostSlice::from_slice(&pub_o_j_vec);
    let mut gamma_l_pub_o_j_coef_vec = vec![ScalarField::zero(); l].into_boxed_slice();
    let gamma_l_pub_o_j_coef = HostSlice::from_mut_slice(&mut gamma_l_pub_o_j_coef_vec);
    ScalarCfg::mul(pub_o_j, gamma_l_pub, gamma_l_pub_o_j_coef, &vec_ops_cfg).unwrap();
    let mut gamma_l_pub_o_j_affine_vec= vec![G1Affine::zero(); l].into_boxed_slice();
    from_coef_vec_to_affine_vec(
        &gamma_l_pub_o_j_coef_vec,
        l,
        g1_gen,
        &mut gamma_l_pub_o_j_affine_vec
    );

    // generate eta1_l_inter_o_j:Box<[Box<[G1Affine]>]>, // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
    

    Self {
        alpha,
        xy_hi: xy_hi_affine_vec,
        gamma_l_pub_o_j: gamma_l_pub_o_j_affine_vec,

    }
    
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

pub struct SigmaVerify {
    pub beta: G2,
    pub gamma: G2,
    pub delta: G2,
    pub eta1: G2,
    pub mu_eta0: G2,
    pub mu_eta1: G2,
    pub xy_hi: Box<[G2]>, // h ∈ ⟦0,n-1⟧ , i ∈ ⟦0, s_{max} -1⟧
    pub mu_comb_o_inter: G2,
    pub mu_3_nu: G2,
    pub mu_4_kappa_0: G2,
    pub mu_4_kappa_1: G2,
    pub mu_4_kappa_2: G2,
    pub mu_3_psi_yz_hij: Box<[Box<[Box<[G2]>]>]> // h ∈ ⟦0,1,2,3⟧ , i ∈ ⟦0,1⟧, j ∈ ⟦0,1⟧
}