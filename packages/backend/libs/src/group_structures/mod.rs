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

/// CRS (Common Reference String) structure
/// This corresponds to σ = ([σ_A,C], [σ_B], [σ_τ]) in the mathematical formulation
pub struct Sigma {
    pub sigma_ac: SigmaAC,
    pub sigma_b: SigmaB,
    pub sigma_v: SigmaV,
}

/// CRS's AC component
/// This corresponds to σ_A,C in the mathematical formulation
pub struct SigmaAC {
    // Elements of the form {x^h y^i}_{h=0,i=0}^{max(2n-2,3m_D-3),2*s_max-2}
    pub xy_powers: Box<[G1Affine]>,
}

impl SigmaAC {
    /// Generate CRS elements for AC component
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        g1_gen: &G1Affine
    ) -> Self {
        let n = params.n;
        let m_d = params.m_D;
        
        println!("Generating SigmaAC components...");
        
        // Calculate max(2n-2, 3m_D-3) for h upper bound
        let h_bound = std::cmp::max(2*n-2, 3*m_d-3);
        
        // Calculate elements of the form {x^h y^i}
        println!("Generating xy_powers of size {}...", h_bound * (2*s_max-2));
        let x_pows_vec = resize_monomial_vec!(
            &vec![ScalarField::one(), tau.x].into_boxed_slice(), 
            h_bound
        );
        let y_pows_vec = resize_monomial_vec!(
            &vec![ScalarField::one(), tau.y].into_boxed_slice(), 
            2*s_max-2
        );
        let xy_powers = type_scaled_monomials_1d!(&y_pows_vec, &x_pows_vec, 2*s_max-2, h_bound, None, g1_gen);
        
        Self {
            xy_powers
        }
    }

    /// Serialize SigmaAC to JSON
    pub fn serialize(&self) -> Value {
        json!({
            "xy_powers": g1_affine_array_to_json(&self.xy_powers),
        })
    }
}

/// CRS's B component
/// This corresponds to σ_B in the mathematical formulation
pub struct SigmaB {
    // δ, η elements
    pub delta: G1Affine,
    pub eta: G1Affine,
    pub gamma_inv_l_oj_mj: Box<[G1Affine]>, // {γ^(-1)(L_t(y)o_j(x) + M_j(x))}_{t=0,j=0}^{1,l-1} where t=0 for j∈[0,l_in-1] and t=1 for j∈[l_in,l-1]
    pub eta_inv_li_ojl_ak_kj: Box<[Box<[G1Affine]>]>, // {η^(-1)L_i(y)(o_{j+l}(x) + α^k K_j(x))}_{i=0,j=0}^{s_max-1,m_D-l-1}
    pub delta_inv_li_oj_prv: Box<[Box<[G1Affine]>]>, // {δ^(-1)L_i(y)o_j(x)}_{i=0,j=l+m_D}^{s_max-1,m_D-1}
    pub delta_inv_ak_xh_tn: Box<[G1Affine]>, // {δ^(-1)α^k x^h t_n(x)}_{h=0,k=1}^{2,3}
    pub delta_inv_ak_xi_tm: Box<[G1Affine]>, // {δ^(-1)α^k x^i t_{m_D}(x)}_{i=0}^{1}
    pub delta_inv_ak_yi_ts: Box<[G1Affine]>, // {δ^(-1)α^k y^i t_{s_max}(y)}_{i=0,k=1}^{2,4}
}

impl SigmaB {
    /// Generate CRS elements for B component
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        o_vec: &Box<[ScalarField]>,
        l_vec: &Box<[ScalarField]>,
        k_vec: &Box<[ScalarField]>,
        m_vec: &Box<[ScalarField]>,
        g1_gen: &G1Affine
    ) -> Self {
        let l = params.l;
        if l % 2 == 1 {
            panic!("l is an odd number.");
        }
        let l_in = l/2;
        let l_d = params.l_D;
        let m_d = params.m_D;
        let n = params.n;
        
        let vec_ops_cfg = VecOpsConfig::default();
        
        println!("Generating SigmaB components...");
        
        // Split output vector into input, output, intermediate, and private parts
        let o_vec_in = &o_vec[0..l_in].to_vec().into_boxed_slice();
        let o_vec_out = &o_vec[l_in..l].to_vec().into_boxed_slice();
        let o_vec_inter = &o_vec[l..l_d].to_vec().into_boxed_slice();
        let o_vec_prv = &o_vec[l_d..m_d].to_vec().into_boxed_slice();
        
        // Split M vector into input, output parts
        let m_vec_in = &m_vec[0..l_in].to_vec().into_boxed_slice();
        let m_vec_out = &m_vec[l_in..l].to_vec().into_boxed_slice();
        
        // Generate delta = g1 · δ and eta = g1 · η
        println!("Generating delta and eta...");
        let delta = G1Affine::from((*g1_gen).to_projective() * tau.delta);
        let eta = G1Affine::from((*g1_gen).to_projective() * tau.eta);
        
        // Generate combined γ^(-1)(L_t(y)o_j(x) + M_j(x)) for all wires (input and output)
        println!("Generating gamma_inv_l_oj_mj of size {}...", l);
        let mut gamma_inv_l_oj_mj = vec![G1Affine::zero(); l].into_boxed_slice();
        
        // Process input wires (j∈[0,l_in-1], t=0)
        {
            let mut oj_plus_mj = vec![ScalarField::zero(); l_in].into_boxed_slice();
            for j in 0..l_in {
                oj_plus_mj[j] = o_vec_in[j] + m_vec_in[j];
            }
            
            let gamma_inv_l0_vec = vec![tau.gamma.inv()*l_vec[0]; l_in].into_boxed_slice();
            let mut coef = vec![ScalarField::zero(); l_in].into_boxed_slice();
            point_mul_two_vecs(&oj_plus_mj, &gamma_inv_l0_vec, &mut coef);
            
            // Copy to the first part of the combined array
            for j in 0..l_in {
                gamma_inv_l_oj_mj[j] = G1Affine::from((*g1_gen).to_projective() * coef[j]);
            }
        }
        
        // Process output wires (j∈[l_in,l-1], t=1)
        {
            let mut oj_plus_mj = vec![ScalarField::zero(); l_in].into_boxed_slice();
            for j in 0..l_in {
                oj_plus_mj[j] = o_vec_out[j] + m_vec_out[j];
            }
            
            let gamma_inv_l1_vec = vec![tau.gamma.inv()*l_vec[s_max-1]; l_in].into_boxed_slice();
            let mut coef = vec![ScalarField::zero(); l_in].into_boxed_slice();
            point_mul_two_vecs(&oj_plus_mj, &gamma_inv_l1_vec, &mut coef);
            
            // Copy to the second part of the combined array
            for j in 0..l_in {
                gamma_inv_l_oj_mj[l_in + j] = G1Affine::from((*g1_gen).to_projective() * coef[j]);
            }
        }
        
        // Generate η^(-1)L_i(y)(o_{j+l}(x) + α^k K_j(x)) for intermediate wires
        println!("Generating eta_inv_li_ojl_ak_kj of size {}...", s_max * (m_d - l));
        let mut eta_inv_li_ojl_ak_kj = vec![vec![G1Affine::zero(); m_d - l].into_boxed_slice(); s_max].into_boxed_slice();
        
        for i in 0..s_max {
            for j in 0..(m_d - l) {
                let ojl = if j < l_d - l {
                    o_vec_inter[j]
                } else {
                    ScalarField::zero()
                };
                
                let k_term = if j < k_vec.len() {
                    tau.alpha.pow(4) * k_vec[j]
                } else {
                    ScalarField::zero()
                };
                
                let coefficient = tau.eta.inv() * l_vec[i] * (ojl + k_term);
                eta_inv_li_ojl_ak_kj[i][j] = G1Affine::from((*g1_gen).to_projective() * coefficient);
            }
        }
        
        // Generate δ^(-1)L_i(y)o_j(x) for private wires
        println!("Generating delta_inv_li_oj_prv of size {}...", s_max * (m_d - l_d));
        let delta_inv_li_oj_prv = type_scaled_outer_product_2d!(o_vec_prv, l_vec, g1_gen, Some(&tau.delta.inv()));
        
        // Generate δ^(-1)α^k x^h t_n(x) for vanishing polynomial in x
        println!("Generating delta_inv_ak_xh_tn...");
        let mut delta_inv_ak_xh_tn = vec![G1Affine::zero(); 9].into_boxed_slice(); // h ∈ [0,2], k ∈ [1,3]
        
        let tn_x = tau.x.pow(n) - ScalarField::one(); // t_n(x) = x^n - 1
        
        for h in 0..=2 {
            for k in 1..=3 {
                let idx = h * 3 + (k - 1);
                let coefficient = tau.delta.inv() * tau.alpha.pow(k) * tau.x.pow(h) * tn_x;
                delta_inv_ak_xh_tn[idx] = G1Affine::from((*g1_gen).to_projective() * coefficient);
            }
        }
        
        // Generate δ^(-1)α^k x^i t_{m_D}(x) for i ∈ [0,1]
        println!("Generating delta_inv_ak_xi_tm...");
        let mut delta_inv_ak_xi_tm = vec![G1Affine::zero(); 1*1].into_boxed_slice(); // Only i=0, k=4 according to the formula
        
        let tm_x = tau.x.pow(m_d) - ScalarField::one(); // t_{m_D}(x) = x^{m_D} - 1
        delta_inv_ak_xi_tm[0] = G1Affine::from((*g1_gen).to_projective() * (tau.delta.inv() * tau.alpha.pow(4) * tm_x));
        
        // Generate δ^(-1)α^k y^i t_{s_max}(y) for i ∈ [0,2], k ∈ [1,4]
        println!("Generating delta_inv_ak_yi_ts...");
        let mut delta_inv_ak_yi_ts = vec![G1Affine::zero(); 4].into_boxed_slice(); // Based on indices in the formula
        
        let ts_y = tau.y.pow(s_max) - ScalarField::one(); // t_{s_max}(y) = y^{s_max} - 1
        
        // For (i=0,k=1) and (i=2,k=4) as specified in the formula
        delta_inv_ak_yi_ts[0] = G1Affine::from((*g1_gen).to_projective() * (tau.delta.inv() * tau.alpha.pow(1) * ts_y));
        delta_inv_ak_yi_ts[1] = G1Affine::from((*g1_gen).to_projective() * (tau.delta.inv() * tau.alpha.pow(4) * tau.y.pow(2) * ts_y));
        
        Self {
            delta,
            eta,
            gamma_inv_l_oj_mj,
            eta_inv_li_ojl_ak_kj,
            delta_inv_li_oj_prv,
            delta_inv_ak_xh_tn,
            delta_inv_ak_xi_tm,
            delta_inv_ak_yi_ts
        }
    }
    
    /// Serialize SigmaB to JSON
    pub fn serialize(&self) -> Value {
        json!({
            "delta": g1_affine_to_json(&self.delta),
            "eta": g1_affine_to_json(&self.eta),
            "gamma_inv_l_oj_mj": g1_affine_array_to_json(&self.gamma_inv_l_oj_mj),
            "eta_inv_li_ojl_ak_kj": g1_affine_2d_array_to_json(&self.eta_inv_li_ojl_ak_kj),
            "delta_inv_li_oj_prv": g1_affine_2d_array_to_json(&self.delta_inv_li_oj_prv),
            "delta_inv_ak_xh_tn": g1_affine_array_to_json(&self.delta_inv_ak_xh_tn),
            "delta_inv_ak_xi_tm": g1_affine_array_to_json(&self.delta_inv_ak_xi_tm),
            "delta_inv_ak_yi_ts": g1_affine_array_to_json(&self.delta_inv_ak_yi_ts)
        })
    }
}

/// CRS's trapdoor component
/// This corresponds to σ_V in the mathematical formulation:
/// σ_V := (α, α^2, α^3, α^4, γ, δ, η, x, y)
pub struct SigmaV {
    pub alpha: G2Affine,
    pub alpha_squared: G2Affine,
    pub alpha_cubed: G2Affine,
    pub alpha_fourth: G2Affine,
    pub gamma: G2Affine,
    pub delta: G2Affine,
    pub eta: G2Affine,
    pub x: G2Affine,
    pub y: G2Affine,
}

impl SigmaV {
    /// Generate CRS elements for trapdoor component
    pub fn gen(
        tau: &Tau,
        g2_gen: &G2Affine
    ) -> Self {
        println!("Generating SigmaV components...");
        
        // Convert trapdoor values to G2 elements
        let alpha = G2Affine::from((*g2_gen).to_projective() * tau.alpha);
        let alpha_squared = G2Affine::from((*g2_gen).to_projective() * tau.alpha.pow(2));
        let alpha_cubed = G2Affine::from((*g2_gen).to_projective() * tau.alpha.pow(3));
        let alpha_fourth = G2Affine::from((*g2_gen).to_projective() * tau.alpha.pow(4));
        let gamma = G2Affine::from((*g2_gen).to_projective() * tau.gamma);
        let delta = G2Affine::from((*g2_gen).to_projective() * tau.delta);
        let eta = G2Affine::from((*g2_gen).to_projective() * tau.eta);
        let x = G2Affine::from((*g2_gen).to_projective() * tau.x);
        let y = G2Affine::from((*g2_gen).to_projective() * tau.y);
        
        Self {
            alpha,
            alpha_squared,
            alpha_cubed,
            alpha_fourth,
            gamma,
            delta,
            eta,
            x,
            y
        }
    }
    
    /// Serialize SigmaV to JSON
    pub fn serialize(&self) -> Value {
        json!({
            "alpha": g2_affine_to_json(&self.alpha),
            "alpha_squared": g2_affine_to_json(&self.alpha_squared),
            "alpha_cubed": g2_affine_to_json(&self.alpha_cubed),
            "alpha_fourth": g2_affine_to_json(&self.alpha_fourth),
            "gamma": g2_affine_to_json(&self.gamma),
            "delta": g2_affine_to_json(&self.delta),
            "eta": g2_affine_to_json(&self.eta),
            "x": g2_affine_to_json(&self.x),
            "y": g2_affine_to_json(&self.y)
        })
    }
}

impl Sigma {
    /// Generate full CRS
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        o_vec: &Box<[ScalarField]>,
        l_vec: &Box<[ScalarField]>,
        k_vec: &Box<[ScalarField]>,
        m_vec: &Box<[ScalarField]>,
        g1_gen: &G1Affine,
        g2_gen: &G2Affine
    ) -> Self {
        println!("Generating complete CRS (σ)...");
        
        let sigma_ac = SigmaAC::gen(params, tau, g1_gen);
        let sigma_b = SigmaB::gen(params, tau, o_vec, l_vec, k_vec, m_vec, g1_gen);
        let sigma_v = SigmaV::gen(tau, g2_gen);
        
        Self {
            sigma_ac,
            sigma_b,
            sigma_v
        }
    }
    
    /// Serialize full CRS to JSON
    pub fn serialize(&self) -> Value {
        json!({
            "sigma_ac": self.sigma_ac.serialize(),
            "sigma_b": self.sigma_b.serialize(),
            "sigma_v": self.sigma_v.serialize()
        })
    }
}

// Helper functions for JSON serialization
fn g1_affine_to_json(point: &G1Affine) -> Value {
    json!({
        "x": point.x.to_string(),
        "y": point.y.to_string(),
    })
}

fn g2_affine_to_json(point: &G2Affine) -> Value {
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

fn g1_affine_2d_array_to_json(array: &Box<[Box<[G1Affine]>]>) -> Value {
    let mut json_array = Vec::new();
    for row in array.iter() {
        json_array.push(g1_affine_array_to_json(row));
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
