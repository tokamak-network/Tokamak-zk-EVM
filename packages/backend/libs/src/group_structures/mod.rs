use icicle_bls12_381::curve::{BaseField, G2BaseField, CurveCfg, G1Projective, G2Projective, G1Affine, G2Affine, ScalarCfg, ScalarField};
use icicle_bls12_381::{curve, vec_ops};
use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use crate::tools::{Tau, SetupParams, SubcircuitInfo, MixedSubcircuitQAPEvaled, gen_cached_pows};
use crate::s_max;
use icicle_core::{ntt, msm};
use std::path::Path;
use std::ops::{Add, Mul, Sub};
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice, DeviceSlice, DeviceVec};
use std::time::Instant;

fn gen_monomial_matrix(x_size: usize, y_size: usize, x: &ScalarField, y: &ScalarField, res_vec: &mut Box<[ScalarField]>) {
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

fn from_coef_vec_to_affine_vec(coef: &Box<[ScalarField]>, size: usize, gen: &G1Affine, res: &mut Box<[G1Affine]>) {
    if res.len() != size {
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
    let mut nzeros = 0 as usize;
    let gen_proj = gen.to_projective();
    for i in 0..size {
        if coef[i].eq(&ScalarField::zero()) {
            nzeros += 1;
        }
        res[i] = G1Affine::from(gen_proj * coef[i]);
    }
    println!("Number of nonzero coefficients: {:?}", size - nzeros);
}

fn from_coef_vec_to_affine_mat(coef: &Box<[ScalarField]>, r_size: usize, c_size: usize, gen: &G1Affine, res: &mut Box<[Box<[G1Affine]>]>) {
    if res.len() != r_size || res.len() == 0 {
        panic!("Not enough buffer row length.")
    }
    let mut temp_vec = vec![G1Affine::zero(); r_size * c_size].into_boxed_slice();
    from_coef_vec_to_affine_vec(coef, r_size * c_size, gen, &mut temp_vec);
    for i in 0..r_size {
        if res[i].len() != c_size {
            panic!("Not enough buffer column length.")
        }
        res[i].copy_from_slice(&temp_vec[i * c_size .. (i + 1) * c_size]);
    }
}

fn point_mul_two_vecs(lhs: &Box<[ScalarField]>, rhs: &Box<[ScalarField]>, res: &mut Box<[ScalarField]>){
    if lhs.len() != rhs.len() || lhs.len() != res.len() {
        panic!("Mismatch of sizes of vectors to be pointwise-multiplied");
    }
    let vec_ops_cfg = VecOpsConfig::default();
    let lhs_buff = HostSlice::from_slice(lhs);
    let rhs_buff = HostSlice::from_slice(rhs);
    let res_buff = HostSlice::from_mut_slice(res);
    ScalarCfg::mul(lhs_buff, rhs_buff, res_buff, &vec_ops_cfg).unwrap();
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
    pub gamma_l_pub_o_j: Box<[G1Affine]>, // //  j ∈ ⟦0, l-1⟧
    pub eta1_l_inter_o_ij:Box<[Box<[G1Affine]>]>, // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
    pub delta_l_prv_o_ij: Box<[Box<[G1Affine]>]>,  // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l_{D} , m_{D} - 1 ⟧
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

    // generate alpha
    let alpha = G1Affine::from( (*g1_gen).to_projective() * tau.alpha );
    
    // generate xy_hi: Box<[G1Affine]>, // h ∈ ⟦0,n-1⟧ as column , i ∈ ⟦0, s_{max} -1⟧ as row
    let start = Instant::now(); println!("Generating xy_hi of size {:?}...", n*s_max);
    let mut xy_hi_affine_vec = vec![G1Affine::zero(); n * s_max].into_boxed_slice();
    {
        let mut xy_pows_vec = vec![ScalarField::zero(); n * s_max].into_boxed_slice();
        gen_monomial_matrix(
            n,
            s_max,
            &tau.x,
            &tau.y,
            &mut xy_pows_vec
        );
        from_coef_vec_to_affine_vec(
            &xy_pows_vec,
            n * s_max,
            g1_gen,
            &mut xy_hi_affine_vec
        );
    }
    let lap = start.elapsed(); println!("Done! in {:.6} seconds", lap.as_secs_f64());

    // generate gamma_l_pub_o_j: Box<[G1Affine]>, // //  j ∈ ⟦0, l-1⟧
    let start = Instant::now(); println!("Generating gamma_l_pub_o_j of size {:?}...", l);
    let mut gamma_l_pub_o_j= vec![G1Affine::zero(); l].into_boxed_slice();
    {
        let mut gamma_l_pub_o_j_coef_vec = vec![ScalarField::zero(); l].into_boxed_slice();
        {
            let mut gamma_l_pub_vec = Vec::with_capacity(l);
            let gamma_l_in_vec = vec![tau.gamma.inv()*l_vec[0]; l_in].into_boxed_slice();
            let gamma_l_out_vec = vec![tau.gamma.inv()*l_vec[s_max - 1]; l_in].into_boxed_slice();
            gamma_l_pub_vec.extend_from_slice(&gamma_l_in_vec);
            gamma_l_pub_vec.extend_from_slice(&gamma_l_out_vec);
            point_mul_two_vecs(
                &o_vec[0..l].to_owned().into_boxed_slice(),
                &gamma_l_pub_vec.into_boxed_slice(),
                &mut gamma_l_pub_o_j_coef_vec
            );
        }   
        from_coef_vec_to_affine_vec(
            &gamma_l_pub_o_j_coef_vec,
            l,
            g1_gen,
            &mut gamma_l_pub_o_j
        );
    }
    let lap = start.elapsed(); println!("Done! in {:.6} seconds", lap.as_secs_f64());

    // generate eta1_l_inter_o_ij:Box<[Box<[G1Affine]>]>, // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
    let start = Instant::now(); println!("Generating eta1_l_inter_o_ij of size {:?}...", s_max * (l_d - l));
    let mut eta1_l_inter_o_ij = vec![
        vec![
            G1Affine::zero(); 
            l_d - l
            ].into_boxed_slice(); 
        s_max
        ].into_boxed_slice();
    {
        let size = s_max * (l_d - l);
        let mut eta1_l_inter_o_ij_coef_vec = vec![ScalarField::zero(); size].into_boxed_slice();
        {
            let mut eta1_l_i_vec = Vec::<ScalarField>::with_capacity(size);
            let mut inter_o_j_vec = Vec::<ScalarField>::with_capacity(size);
            for ind in 0..s_max{ 
                eta1_l_i_vec.extend_from_slice(&vec![tau.eta1.inv() * l_vec[ind]; l_d-l]);
                inter_o_j_vec.extend_from_slice(&o_vec[l..l_d]);
            }
            
            point_mul_two_vecs(
                &inter_o_j_vec.into_boxed_slice(),
                &eta1_l_i_vec.into_boxed_slice(),
                &mut eta1_l_inter_o_ij_coef_vec,
            );
        }
        from_coef_vec_to_affine_mat(
            &eta1_l_inter_o_ij_coef_vec,
            s_max,
            l_d - l,
            g1_gen,
            &mut eta1_l_inter_o_ij,
        );
    }
    let lap = start.elapsed(); println!("Done! in {:.6} seconds", lap.as_secs_f64());

    // generate delta_l_prv_o_j: Box<[Box<[G1Affine]>]>,  // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l_{D} , m_{D} - 1 ⟧
    let start = Instant::now(); println!("Generating delta_l_prv_o_j of size {:?}...", s_max * (m_d - l_d));
    let mut delta_l_prv_o_ij = vec![
        vec![
            G1Affine::zero();
            m_d - l_d
            ].into_boxed_slice();
        s_max
        ].into_boxed_slice();
    {
        let size = s_max * (m_d - l_d);
        let mut delta_l_prv_o_ij_coef_vec = vec![ScalarField::zero(); size].into_boxed_slice();
        for ind in 0..s_max {
            let mut this_row_vec = vec![ScalarField::zero(); m_d - l_d].into_boxed_slice();
            point_mul_two_vecs(
                &o_vec[l_d..m_d].to_owned().into_boxed_slice(),
                &vec![tau.delta.inv() * l_vec[ind]; m_d-l_d].into_boxed_slice(),
                &mut this_row_vec,
            );
            delta_l_prv_o_ij_coef_vec[ind * (m_d - l_d) .. (ind + 1) * (m_d - l_d)].copy_from_slice(&this_row_vec);
        }
        from_coef_vec_to_affine_mat(
            &delta_l_prv_o_ij_coef_vec,
            s_max,
            m_d - l_d,
            g1_gen,
            &mut delta_l_prv_o_ij,
        );
    }
    let lap = start.elapsed(); println!("Done! in {:.6} seconds", lap.as_secs_f64());

    // generate eta0_l_o_ip_first_ij: Box<[Box<[G1Affine]>]>, //i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
    let start = Instant::now(); println!("Generating eta0_l_o_ip_first_ij of size {:?}...", s_max * (l_d - l));
    let mut eta0_l_o_ip_first_ij = vec![
        vec![
            G1Affine::zero(); 
            l_d - l
            ].into_boxed_slice();
        s_max
        ].into_boxed_slice();
    {
        let size = s_max * (l_d - l);
        let mut k2_minus_1_j_vec = vec![ScalarField::zero(); l_d - l].into_boxed_slice();
        {
            let mut k2_j_vec = vec![ScalarField::zero(); l_d - l].into_boxed_slice();
            point_mul_two_vecs(k_vec, k_vec, &mut k2_j_vec);
            let ones_vec = vec![ScalarField::one(); l_d - l].into_boxed_slice();
            let ones = HostSlice::from_slice(&ones_vec);
            let k2_minus_1_j = HostSlice::from_mut_slice(&mut k2_minus_1_j_vec);
            ScalarCfg::sub(HostSlice::from_slice(&k2_j_vec), ones, k2_minus_1_j, &vec_ops_cfg).unwrap();
        }

        let mut k2_minus_1_j_long_vec = Vec::<ScalarField>::with_capacity(size);
        for _ in 0..s_max{ 
            k2_minus_1_j_long_vec.extend_from_slice(&k2_minus_1_j_vec);
        }
        drop(k2_minus_1_j_vec);

        let mut inter_o_j_vec = Vec::<ScalarField>::with_capacity(size);
        for _ in 0..s_max{ 
            inter_o_j_vec.extend_from_slice(&o_vec[l..l_d]);
        }

        let mut temp = vec![ScalarField::zero(); size].into_boxed_slice();
        point_mul_two_vecs(
            &inter_o_j_vec.into_boxed_slice(),
            &k2_minus_1_j_long_vec.into_boxed_slice(),
            &mut temp
        );
        let mut eta0_l_o_ip_first_ij_vec = vec![ScalarField::zero(); size].into_boxed_slice();
        let mut eta0_l_i_vec = Vec::<ScalarField>::with_capacity(size);
        for ind in 0..s_max{ 
            eta0_l_i_vec.extend_from_slice(&vec![tau.eta0.inv() * l_vec[ind]; l_d-l]);
        }   
        point_mul_two_vecs(
            &eta0_l_i_vec.into_boxed_slice(),
            &temp,
            &mut eta0_l_o_ip_first_ij_vec,
        );
        drop(temp);

        from_coef_vec_to_affine_mat(
            &eta0_l_o_ip_first_ij_vec,
            s_max,
            l_d - l,
            g1_gen,
            &mut eta0_l_o_ip_first_ij,
        );
    }
    let lap = start.elapsed(); println!("Done! in {:.6} seconds", lap.as_secs_f64());

    // generate eta0_l_m_tz_ip_second_ij: Box<[Box<[G1Affine]>]>, //i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
    let start = Instant::now(); println!("Generating eta0_l_m_tz_ip_second_ij of size {:?}...", s_max * (l_d - l));
    let mut eta0_l_m_tz_ip_second_ij = vec![
        vec![
            G1Affine::zero(); 
            l_d - l
            ].into_boxed_slice();
        s_max
        ].into_boxed_slice();
    {
        let size = s_max * (l_d - l);
        let mut eta0_l_m_tz_ip_second_ij_vec = vec![ScalarField::zero(); size].into_boxed_slice();
        {
            let mut m_j_long_vec = Vec::<ScalarField>::with_capacity(size);
            for _ in 0..s_max{ 
                m_j_long_vec.extend_from_slice(&m_vec);
            }

            let mut eta0_l_tz_i_vec = Vec::<ScalarField>::with_capacity(size);
            for ind in 0..s_max{ 
                eta0_l_tz_i_vec.extend_from_slice(&vec![
                    (tau.eta0.inv() * l_vec[ind]) * (tau.z.pow(l_d - l) - ScalarField::one())
                    ; l_d-l]);
            }   
            point_mul_two_vecs(
                &eta0_l_tz_i_vec.into_boxed_slice(),
                &m_j_long_vec.into_boxed_slice(),
                &mut eta0_l_m_tz_ip_second_ij_vec,
            );
        }

        from_coef_vec_to_affine_mat(
            &eta0_l_m_tz_ip_second_ij_vec,
            s_max,
            l_d - l,
            g1_gen,
            &mut eta0_l_m_tz_ip_second_ij,
        );
    }
    let lap = start.elapsed(); println!("Done! in {:.6} seconds", lap.as_secs_f64());

    // generate delta_xy_tx_hi: Box<[G1Affine]>, // h ∈ ⟦0, n-2⟧ , i ∈ ⟦0 , s_{max} - 1 ⟧
    let start = Instant::now(); println!("Generating delta_xy_tx_hi of size {:?}...", s_max * (n-1));
    let size = (n-1) * s_max;

    let mut delta_xy_tx_hi_coef = vec![ScalarField::zero(); size].into_boxed_slice();
    { 
        let mut xy_pows_vec = vec![ScalarField::zero(); size].into_boxed_slice();
        gen_monomial_matrix(
            n-1,
            s_max,
            &tau.x,
            &tau.y,
            &mut xy_pows_vec
        );
        let delta_tx_vec = vec![
            tau.delta.inv() * (tau.x.pow(n) - ScalarField::one()); 
            size
            ].into_boxed_slice();
        point_mul_two_vecs(
            &xy_pows_vec,
            &delta_tx_vec,
            &mut delta_xy_tx_hi_coef,
        );
    }
   
    let mut delta_xy_tx_hi = vec![G1Affine::zero(); size].into_boxed_slice();
    from_coef_vec_to_affine_vec(
        &delta_xy_tx_hi_coef,
        size,
        g1_gen,
        &mut delta_xy_tx_hi,
    );
    let lap = start.elapsed(); println!("Done! in {:.6} seconds", lap.as_secs_f64());

    // generate delta_xy_ty_hi :Box<[G1Affine]>, // h ∈ ⟦0, 2n-2⟧ , i ∈ ⟦0 , s_{max} - 2 ⟧
    let start = Instant::now(); println!("Generating delta_xy_ty_hi of size {:?}...", (s_max-1) * (2*n-1));
    let size = (2*n-1) * (s_max-1);

    let mut delta_xy_ty_hi_coef = vec![ScalarField::zero(); size].into_boxed_slice();
    { 
        let mut xy_pows_vec = vec![ScalarField::zero(); size].into_boxed_slice();
        gen_monomial_matrix(
            2*n-1,
            s_max-1,
            &tau.x,
            &tau.y,
            &mut xy_pows_vec
        );
        let delta_ty_vec = vec![
            tau.delta.inv() * (tau.y.pow(s_max) - ScalarField::one()); 
            size
            ].into_boxed_slice();
        point_mul_two_vecs(
            &xy_pows_vec,
            &delta_ty_vec,
            &mut delta_xy_ty_hi_coef,
        );
    }
   
    let mut delta_xy_ty_hi = vec![G1Affine::zero(); size].into_boxed_slice();
    from_coef_vec_to_affine_vec(
        &delta_xy_ty_hi_coef,
        size,
        g1_gen,
        &mut delta_xy_ty_hi,
    );
    let lap = start.elapsed(); println!("Done! in {:.6} seconds", lap.as_secs_f64());

    Self {
        alpha,
        xy_hi: xy_hi_affine_vec,
        gamma_l_pub_o_j,
        delta_l_prv_o_ij,
        eta1_l_inter_o_ij,
        eta0_l_o_ip_first_ij,
        eta0_l_m_tz_ip_second_ij,
        delta_xy_tx_hi,
        delta_xy_ty_hi,
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
    pub beta: G2Affine,
    pub gamma: G2Affine,
    pub delta: G2Affine,
    pub eta1: G2Affine,
    pub mu_eta0: G2Affine,
    pub mu_eta1: G2Affine,
    pub xy_hi: Box<[G2Affine]>, // h ∈ ⟦0,n-1⟧ , i ∈ ⟦0, s_{max} -1⟧
    pub mu_comb_o_inter: G2Affine,
    pub mu_3_nu: G2Affine,
    pub mu_4_kappa_0: G2Affine,
    pub mu_4_kappa_1: G2Affine,
    pub mu_4_kappa_2: G2Affine,
    pub mu_3_psi_yz_hij: Box<[Box<[Box<[G2Affine]>]>]> // h ∈ ⟦0,1,2,3⟧ , i ∈ ⟦0,1⟧, j ∈ ⟦0,1⟧
}