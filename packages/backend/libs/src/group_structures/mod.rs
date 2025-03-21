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

/// CRS's KZG (Kate-Zaverucha-Goldberg) polynomial commitment component
/// This corresponds to σ_KZG in the mathematical formulation
pub struct SigmaKZG {
    // Elements of the form {x^i y^j}_{h=0,i=0}^{n-1,s_max-1}
    // This corresponds to the first part of σ_KZG
    pub xy_powers: Box<[G1Affine]>,
    
    // Elements of the form {y^i z^j}_{i=0,j=0}^{2h-2,2n-3}
    // This corresponds to the second part of σ_KZG
    pub yz_powers: Box<[G1Affine]>
}

impl SigmaKZG {
    /// Generate CRS elements for KZG commitment system
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        g1_gen: &G1Affine
    ) -> Self {
        let n = params.n;
        
        println!("Generating SigmaKZG components...");
        
        // Calculate elements of the form {x^h y^i}
        // This computes g1 · x^h y^i for all h ∈ [0,n-1], i ∈ [0,s_max-1]
        println!("Generating xy_powers of size {}...", n * s_max);
        let x_pows_vec = resize_monomial_vec!(
            &vec![ScalarField::one(), tau.x].into_boxed_slice(), 
            n
        );
        let y_pows_vec = resize_monomial_vec!(
            &vec![ScalarField::one(), tau.y].into_boxed_slice(), 
            s_max
        );
        let xy_powers = type_scaled_monomials_1d!(&y_pows_vec, &x_pows_vec, s_max, n, None, g1_gen);
        
        // Calculate elements of the form {y^i z^j}
        // PDF shows y^i z^j for i ∈ [0, 2s_max-2], j ∈ [0, 2n-3]
        println!("Generating yz_powers of size {}...", (2*s_max-1) * (2*n-2));
        let z_pows_vec = resize_monomial_vec!(
            &vec![ScalarField::one(), tau.z].into_boxed_slice(), 
            2*n-2
        );
        let y_pows_extended = resize_monomial_vec!(
            &vec![ScalarField::one(), tau.y].into_boxed_slice(), 
            2*s_max-1
        );
        let yz_powers = type_scaled_monomials_1d!(&y_pows_extended, &z_pows_vec, 2*s_max-1, 2*n-2, None, g1_gen);
        
        Self {
            xy_powers,
            yz_powers
        }
    }

    /// Serialize SigmaKZG to JSON
    pub fn serialize(&self) -> Value {
        json!({
            "xy_powers": g1_affine_array_to_json(&self.xy_powers),
            "yz_powers": g1_affine_array_to_json(&self.yz_powers)
        })
    }
}
pub struct SigmaA {
    // α element
    pub alpha: G1Affine,
    
    // {γ^(-1)L_0(y)o_j(α,β,x)}_{j=0}^{l_in-1}
    pub gamma_l0_o_in: Box<[G1Affine]>,
    
    // {γ^(-1)L_1(y)o_j(α,β,x)}_{j=l_in}^{l-1}
    pub gamma_l1_o_out: Box<[G1Affine]>,
    
    // {η^(-1)L_i(y)o_j(α,β,x)}_{i=0,j=l}^{s_max-1,l_D-1}
    pub eta_lt_o_inter: Box<[Box<[G1Affine]>]>,
    
    // {δ^(-1)L_i(y)o_j(α,β,x)}_{i=0,j=l_D}^{s_max-1,m_D-1}
    pub delta_lt_o_prv: Box<[Box<[G1Affine]>]>,
}

impl SigmaA {
    /// Generate CRS elements for arithmetic check according to the PDF definition
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        o_vec: &Box<[ScalarField]>,
        l_vec: &Box<[ScalarField]>,
        g1_gen: &G1Affine
    ) -> Self {
        let l = params.l;
        if l % 2 == 1 {
            panic!("l is an odd number.");
        }
        let l_in = l/2;
        let l_d = params.l_D;
        let m_d = params.m_D;
        
        // Split output vector into input, output, intermediate, and private parts
        let o_vec_in = &o_vec[0..l_in].to_vec().into_boxed_slice();
        let o_vec_out = &o_vec[l_in..l].to_vec().into_boxed_slice();
        let o_vec_inter = &o_vec[l..l_d].to_vec().into_boxed_slice();
        let o_vec_prv = &o_vec[l_d..m_d].to_vec().into_boxed_slice();
        
        // Generate alpha = g1 · α
        println!("Generating alpha...");
        let alpha = G1Affine::from((*g1_gen).to_projective() * tau.alpha);
        
        // Generate γ^(-1)L_0(y)o_j(x) for input wires
        println!("Generating gamma_l0_o_in of size {}...", l_in);
        let mut gamma_l0_o_in = vec![G1Affine::zero(); l_in].into_boxed_slice();
        {
            let mut gamma_l0_o_in_coef = vec![ScalarField::zero(); l_in].into_boxed_slice();
            let gamma_l0_vec = vec![tau.gamma.inv()*l_vec[0]; l_in].into_boxed_slice();
            point_mul_two_vecs(o_vec_in, &gamma_l0_vec, &mut gamma_l0_o_in_coef);
            from_coef_vec_to_affine_vec(&gamma_l0_o_in_coef, g1_gen, &mut gamma_l0_o_in);
        }
        
        // Generate γ^(-1)L_1(y)o_j(x) for output wires
        println!("Generating gamma_l1_o_out of size {}...", l_in);
        let mut gamma_l1_o_out = vec![G1Affine::zero(); l_in].into_boxed_slice();
        {
            let mut gamma_l1_o_out_coef = vec![ScalarField::zero(); l_in].into_boxed_slice();
            let gamma_l1_vec = vec![tau.gamma.inv()*l_vec[s_max-1]; l_in].into_boxed_slice();
            point_mul_two_vecs(o_vec_out, &gamma_l1_vec, &mut gamma_l1_o_out_coef);
            from_coef_vec_to_affine_vec(&gamma_l1_o_out_coef, g1_gen, &mut gamma_l1_o_out);
        }
        
        // Generate η^(-1)L_t(y)o_j(x) for intermediate wires
        println!("Generating eta_lt_o_inter of size {}...", s_max * (l_d - l));
        let eta_lt_o_inter = type_scaled_outer_product_2d!(o_vec_inter, l_vec, g1_gen, Some(&tau.eta1.inv()));
        
        // Generate δ^(-1)L_t(y)o_j(x) for private wires
        println!("Generating delta_lt_o_prv of size {}...", s_max * (m_d - l_d));
        let delta_lt_o_prv = type_scaled_outer_product_2d!(o_vec_prv, l_vec, g1_gen, Some(&tau.delta.inv()));
        
        Self {
            alpha,
            gamma_l0_o_in,
            gamma_l1_o_out,
            eta_lt_o_inter,
            delta_lt_o_prv
        }
    }
    
    /// Serialize SigmaA to JSON
    pub fn serialize(&self) -> Value {
        json!({
            "alpha": g1_affine_to_json(&self.alpha),
            "gamma_l0_o_in": g1_affine_array_to_json(&self.gamma_l0_o_in),
            "gamma_l1_o_out": g1_affine_array_to_json(&self.gamma_l1_o_out),
            "eta_lt_o_inter": g1_affine_2d_array_to_json(&self.eta_lt_o_inter),
            "delta_lt_o_prv": g1_affine_2d_array_to_json(&self.delta_lt_o_prv)
        })
    }
}

/// σ_I := {(μ^(-1)L_i(y)o_j(α,β,x) + K_{j-l}(z))}_{i=0,j=l}^{s_max-1,l_D-1}
pub struct SigmaI {
    pub mu_lt_o_k: Box<[Box<[G1Affine]>]>, // Elements for inner product constraint: {μ^(-1)L_i(y)o_j(x) + K_{j-l}(z)}_{i=0,j=l}^{s_max-1,l_D-1}
}

impl SigmaI {
    /// Generate CRS elements for inner product check
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        o_vec: &Box<[ScalarField]>,
        l_vec: &Box<[ScalarField]>,
        k_vec: &Box<[ScalarField]>,
        g1_gen: &G1Affine
    ) -> Self {
        let l = params.l;
        let l_d = params.l_D;
        
        let vec_ops_cfg = VecOpsConfig::default();
        
        // Use only the intermediate wire vector part
        let o_vec_inter = &o_vec[l..l_d].to_vec().into_boxed_slice();
        
        println!("Generating mu_lt_o_k of size {}...", s_max * (l_d - l));
        
        // Create 2D array to store the result
        let mut mu_lt_o_k = vec![vec![G1Affine::zero(); l_d - l].into_boxed_slice(); s_max].into_boxed_slice();
        
        for i in 0..s_max {
            let l_i = l_vec[i];
            for j in 0..(l_d - l) {
                // Calculate o_j(x)
                let o_j = o_vec_inter[j];
                
                // Calculate K_{j-l}(z)
                let k_j = k_vec[j];
                
                // Calculate μ^(-1)L_i(y)o_j(x) + K_{j-l}(z)
                let coefficient = tau.mu.inv() * l_i * o_j + k_j;
                
                // Convert to G1Affine point
                mu_lt_o_k[i][j] = G1Affine::from((*g1_gen).to_projective() * coefficient);
            }
        }
        
        Self {
            mu_lt_o_k
        }
    }
    
    /// Serialize SigmaI to JSON
    pub fn serialize(&self) -> Value {
        json!({
            "mu_lt_o_k": g1_affine_2d_array_to_json(&self.mu_lt_o_k)
        })
    }
}

/// CRS's trapdoor component
/// This corresponds to σ_τ in the mathematical formulation:
/// σ_τ := (β, γ, η, δ, μ, α, x, y, z)
pub struct SigmaTau {
    // G2 representations of trapdoor values
    pub beta_g2: G2Affine,
    pub gamma_g2: G2Affine,
    pub eta_g2: G2Affine,
    pub delta_g2: G2Affine,
    pub mu_g2: G2Affine,
    pub alpha_g2: G2Affine,
    pub x_g2: G2Affine,
    pub y_g2: G2Affine,
    pub z_g2: G2Affine,
}

impl SigmaTau {
    /// Create the trapdoor component with G2 elements
    pub fn gen(tau: &Tau, g2_gen: &G2Affine) -> Self {
        println!("Generating SigmaTau G2 elements...");
        
        // Convert trapdoor scalar values to G2 elements
        let beta_g2 = G2Affine::from((*g2_gen).to_projective() * tau.beta);
        let gamma_g2 = G2Affine::from((*g2_gen).to_projective() * tau.gamma);
        let eta_g2 = G2Affine::from((*g2_gen).to_projective() * tau.eta0); // Assuming eta0 is the η value
        let delta_g2 = G2Affine::from((*g2_gen).to_projective() * tau.delta);
        let mu_g2 = G2Affine::from((*g2_gen).to_projective() * tau.mu);
        let alpha_g2 = G2Affine::from((*g2_gen).to_projective() * tau.alpha);
        let x_g2 = G2Affine::from((*g2_gen).to_projective() * tau.x);
        let y_g2 = G2Affine::from((*g2_gen).to_projective() * tau.y);
        let z_g2 = G2Affine::from((*g2_gen).to_projective() * tau.z);
        
        Self {
            beta_g2,
            gamma_g2,
            eta_g2,
            delta_g2,
            mu_g2,
            alpha_g2,
            x_g2,
            y_g2,
            z_g2
        }
    }
    
    /// Serialize SigmaTau to JSON
    pub fn serialize(&self) -> Value {
        json!({
            "beta_g2": g2_affine_to_json(&self.beta_g2),
            "gamma_g2": g2_affine_to_json(&self.gamma_g2),
            "eta_g2": g2_affine_to_json(&self.eta_g2),
            "delta_g2": g2_affine_to_json(&self.delta_g2),
            "mu_g2": g2_affine_to_json(&self.mu_g2),
            "alpha_g2": g2_affine_to_json(&self.alpha_g2),
            "x_g2": g2_affine_to_json(&self.x_g2),
            "y_g2": g2_affine_to_json(&self.y_g2),
            "z_g2": g2_affine_to_json(&self.z_g2)
        })
    }
}

// Update the main Sigma struct to include the new components
pub struct Sigma {
    pub sigma_kzg: SigmaKZG,
    pub sigma_a: SigmaA,
    pub sigma_i: SigmaI,
    pub sigma_tau: SigmaTau,
    // Additional components can be added here
}

// Let's assume we have implementations for SigmaKZG and SigmaA already
impl Sigma {
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        o_vec: &Box<[ScalarField]>,
        l_vec: &Box<[ScalarField]>,
        k_vec: &Box<[ScalarField]>,
        g1_gen: &G1Affine,
        g2_gen: &G2Affine
    ) -> Self {
        println!("Generating all Sigma components...");
        
        let sigma_kzg = SigmaKZG::gen(params, tau, g1_gen);
        let sigma_a = SigmaA::gen(params, tau, o_vec, l_vec, g1_gen);
        let sigma_i = SigmaI::gen(params, tau, o_vec, l_vec, k_vec, g1_gen);
        let sigma_tau = SigmaTau::gen(tau, g2_gen);
        
        Self {
            sigma_kzg,
            sigma_a,
            sigma_i,
            sigma_tau
        }
    }
    
    pub fn serialize(&self) -> Value {
        json!({
            "sigma_kzg": self.sigma_kzg.serialize(),
            "sigma_a": self.sigma_a.serialize(),
            "sigma_i": self.sigma_i.serialize(),
            "sigma_tau": self.sigma_tau.serialize()
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

// pub struct SigmaArithAndIP {
//     // first line paper page 21 
//     pub alpha: G1Affine,  
//     pub xy_hi: Box<[G1Affine]>, // h ∈ ⟦0,n-1⟧ , i ∈ ⟦0, s_{max} -1⟧
//     // second line paper page 21
//     pub gamma_l_o_pub_j: Box<[G1Affine]>, // //  j ∈ ⟦0, l-1⟧
//     pub eta1_l_o_inter_ij:Box<[Box<[G1Affine]>]>, // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
//     pub delta_l_o_prv_ij: Box<[Box<[G1Affine]>]>,  // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l_{D} , m_{D} - 1 ⟧
//     // third line paper page 21 
//     pub eta0_l_o_ip_first_ij: Box<[Box<[G1Affine]>]>, //i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
//     pub eta0_l_m_tz_ip_second_ij: Box<[Box<[G1Affine]>]>, //i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
//     // fourth line paper page 21 
//     pub delta_xy_tx_hi: Box<[G1Affine]>, // h ∈ ⟦0, n-2⟧ , i ∈ ⟦0 , s_{max} - 1 ⟧
//     pub delta_xy_ty_hi :Box<[G1Affine]>, // h ∈ ⟦0, 2n-2⟧ , i ∈ ⟦0 , s_{max} - 2 ⟧
// }

// impl SigmaArithAndIP {
//     pub fn gen(
//         params: &SetupParams,
//         tau: &Tau,
//         o_vec: &Box<[ScalarField]>,
//         m_vec: &Box<[ScalarField]>,
//         l_vec: &Box<[ScalarField]>,
//         k_vec: &Box<[ScalarField]>,
//         g1_gen: &G1Affine
//     ) -> Self {
//         let l = params.l;
//         if l % 2 == 1 {
//             panic!{"l is an odd number."}
//         }
//         let l_in = l/2;
//         let m_d = params.m_D;
//         let l_d = params.l_D;
//         let n = params.n;

//         let vec_ops_cfg = VecOpsConfig::default();

//         let o_vec_pub = &o_vec[0..l].to_vec().into_boxed_slice();
//         let o_vec_inter = &o_vec[l..l_d].to_vec().into_boxed_slice();
//         let o_vec_prv = &o_vec[l_d..m_d].to_vec().into_boxed_slice();

//         let cached_x_pows_vec = &resize_monomial_vec!(
//             &vec![ScalarField::one(), tau.x].into_boxed_slice(), 
//             2*n
//         );
//         let cached_y_pows_vec = &resize_monomial_vec!(
//             &vec![ScalarField::one(), tau.y].into_boxed_slice(), 
//             s_max
//         );

//         // generate alpha
//         let alpha = G1Affine::from( (*g1_gen).to_projective() * tau.alpha );
        
//         // generate xy_hi: Box<[G1Affine]>, // h ∈ ⟦0,n-1⟧ as column , i ∈ ⟦0, s_{max} -1⟧ as row
//         println!("Generating xy_hi of size {:?}...", n * s_max);
//         let xy_hi = type_scaled_monomials_1d!(cached_y_pows_vec, cached_x_pows_vec, s_max, n, None, g1_gen);
        
//         // generate gamma_l_o_pub_j: Box<[G1Affine]>, // //  j ∈ ⟦0, l-1⟧
//         println!("Generating gamma_l_o_pub_j of size {:?}...", l);
//         let mut gamma_l_o_pub_j= vec![G1Affine::zero(); l].into_boxed_slice();
//         {
//             let mut gamma_l_o_pub_j_coef_vec = vec![ScalarField::zero(); l].into_boxed_slice();
//             {
//                 let mut gamma_l_pub_vec = Vec::with_capacity(l);
//                 let gamma_l_in_vec: Box<[icicle_core::field::Field<8, ScalarCfg>]> = vec![tau.gamma.inv()*l_vec[0]; l_in].into_boxed_slice();
//                 let gamma_l_out_vec = vec![tau.gamma.inv()*l_vec[s_max - 1]; l_in].into_boxed_slice();
//                 gamma_l_pub_vec.extend_from_slice(&gamma_l_in_vec);
//                 gamma_l_pub_vec.extend_from_slice(&gamma_l_out_vec);
//                 point_mul_two_vecs(
//                     o_vec_pub,
//                     &gamma_l_pub_vec.into_boxed_slice(),
//                     &mut gamma_l_o_pub_j_coef_vec
//                 );
//             }   
//             from_coef_vec_to_affine_vec(
//                 &gamma_l_o_pub_j_coef_vec,
//                 g1_gen,
//                 &mut gamma_l_o_pub_j
//             );
//         }

//         // generate eta1_l_o_inter_ij:Box<[Box<[G1Affine]>]>, // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
//         println!("Generating eta1_l_o_inter_ij of size {:?}...", s_max * (l_d - l));
//         let eta1_l_o_inter_ij = type_scaled_outer_product_2d!(o_vec_inter, l_vec, g1_gen, Some(&tau.eta1.inv()));

//         // generate delta_l_o_prv_ij: Box<[Box<[G1Affine]>]>,  // i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l_{D} , m_{D} - 1 ⟧
//         println!("Generating delta_l_o_prv_ij of size {:?}...", s_max * (m_d - l_d));
//         let delta_l_o_prv_ij = type_scaled_outer_product_2d!(o_vec_prv, l_vec, g1_gen, Some(&tau.delta.inv()));

//         // generate eta0_l_o_ip_first_ij: Box<[Box<[G1Affine]>]>, //i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
//         println!("Generating eta0_l_o_ip_first_ij of size {:?}...", s_max * (l_d - l));
//         let mut k2_j_vec = vec![ScalarField::zero(); l_d - l].into_boxed_slice();
//         point_mul_two_vecs(k_vec, k_vec, &mut k2_j_vec);
//         let ones_vec = vec![ScalarField::one(); l_d - l].into_boxed_slice();
//         let mut k2_minus_1_j_vec = vec![ScalarField::zero(); l_d - l].into_boxed_slice();
//         ScalarCfg::sub(
//             HostSlice::from_slice(&k2_j_vec), 
//             HostSlice::from_slice(&ones_vec), 
//             HostSlice::from_mut_slice(&mut k2_minus_1_j_vec), 
//             &vec_ops_cfg
//         ).unwrap();
//         drop(k2_j_vec);
//         drop(ones_vec);
//         let mut col_vec = vec![ScalarField::zero(); l_d - l].into_boxed_slice();
//         point_mul_two_vecs(
//             o_vec_inter,
//             &k2_minus_1_j_vec,
//             &mut col_vec,
//         );
//         drop(k2_minus_1_j_vec);
//         let eta0_l_o_ip_first_ij = type_scaled_outer_product_2d!(&col_vec, l_vec, g1_gen, Some(&tau.eta0.inv()));
//         drop(col_vec);

//         // generate eta0_l_m_tz_ip_second_ij: Box<[Box<[G1Affine]>]>, //i ∈ ⟦0, s_{max} -1⟧ , j ∈ ⟦l, l_{D} - 1⟧
//         println!("Generating eta0_l_m_tz_ip_second_ij of size {:?}...", s_max * (l_d - l));
//         let scaler = tau.eta0.inv() * (tau.z.pow(l_d - l) - ScalarField::one());
//         let eta0_l_m_tz_ip_second_ij = type_scaled_outer_product_2d!( m_vec, l_vec, g1_gen, Some(&scaler) );

//         // generate delta_xy_tx_hi: Box<[G1Affine]>, // h ∈ ⟦0, n-2⟧ , i ∈ ⟦0 , s_{max} - 1 ⟧
//         println!("Generating delta_xy_tx_hi of size {:?}...", (n - 1) * s_max );
//         let scaler = tau.delta.inv() * (tau.x.pow(n) - ScalarField::one());
//         let delta_xy_tx_hi = type_scaled_monomials_1d!(cached_y_pows_vec, cached_x_pows_vec, s_max, n-1, Some(&scaler), g1_gen);

//         // generate delta_xy_ty_hi :Box<[G1Affine]>, // h ∈ ⟦0, 2n-2⟧ , i ∈ ⟦0 , s_{max} - 2 ⟧
//         println!("Generating delta_xy_ty_hi of size {:?}...", (2*n - 1) * (s_max - 1) );
//         let scaler = tau.delta.inv() * (tau.y.pow(s_max) - ScalarField::one());
//         let delta_xy_ty_hi = type_scaled_monomials_1d!(cached_y_pows_vec, cached_x_pows_vec, s_max - 1, 2*n - 1, Some(&scaler), g1_gen);

//         //// End of generation

//         Self {
//             alpha,
//             xy_hi,
//             gamma_l_o_pub_j,
//             delta_l_o_prv_ij,
//             eta1_l_o_inter_ij,
//             eta0_l_o_ip_first_ij,
//             eta0_l_m_tz_ip_second_ij,
//             delta_xy_tx_hi,
//             delta_xy_ty_hi,
//         }
    
//     }
// }