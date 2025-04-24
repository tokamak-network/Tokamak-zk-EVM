use ark_ec::pairing::PairingOutput;
use icicle_bls12_381::curve::{G1Affine, G1Projective, G2Affine, ScalarField, ScalarCfg};
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use icicle_core::msm::{self, MSMConfig};
use ark_bls12_381::{Bls12_381, G1Affine as ArkG1Affine, G2Affine as ArkG2Affine};
use ark_ec::{pairing::Pairing, AffineRepr, CurveGroup};
use ark_ff::{Field, PrimeField, Fp12};
use icicle_runtime::memory::HostSlice;
use crate::bivariate_polynomial::{DensePolynomialExt, BivariatePolynomial};
use crate::field_structures::{FieldSerde, Tau};
use crate::iotools::{from_coef_vec_to_g1serde_mat, from_coef_vec_to_g1serde_vec, scaled_outer_product_1d, scaled_outer_product_2d, PlacementVariables, SetupParams, SubcircuitInfo, SubcircuitR1CS};
use crate::vector_operations::{*};

use serde::{Deserialize, Serialize};
use std::{
    ops::{Add, Mul, Sub},
};


macro_rules! extend_monomial_vec {
    ($mono_vec: expr, $target_size: expr) => {
        {
            let mut res = vec![ScalarField::zero(); $target_size].into_boxed_slice();
            extend_monomial_vec($mono_vec, &mut res);
            res
        }
    };
}

macro_rules! type_scaled_outer_product_2d {
    ($col_vec: expr, $row_vec: expr, $g1_gen: expr, $scaler: expr) => {
        {
            let row_size = $col_vec.len();
            let col_size = $row_vec.len();
            let mut res = vec![vec![G1serde::zero(); col_size].into_boxed_slice(); row_size].into_boxed_slice(); 
            scaled_outer_product_2d($col_vec, $row_vec, $g1_gen, $scaler, &mut res);
            res
        }
    };  
}

macro_rules! type_scaled_outer_product_1d {
    ($col_vec: expr, $row_vec: expr, $g1_gen: expr, $scaler: expr) => {
        {
            let row_size = $col_vec.len();
            let col_size = $row_vec.len();
            let mut res = vec![G1serde::zero(); row_size * col_size].into_boxed_slice();
            scaled_outer_product_1d($col_vec, $row_vec, $g1_gen, $scaler, &mut res);
            res
        }
    };  
}


macro_rules! type_scaled_monomials_1d {
    ( $cached_x_vec: expr, $cached_y_vec: expr, $x_size: expr, $y_size: expr, $scaler: expr, $g1_gen: expr ) => {
        {
            let col_vec = extend_monomial_vec!($cached_x_vec, $x_size);
            let row_vec = extend_monomial_vec!($cached_y_vec, $y_size);
            let res = type_scaled_outer_product_1d!(&col_vec, &row_vec, $g1_gen, $scaler);
            res
        }
    };
}

/// CRS's AC component
/// This corresponds to σ_A,C in the mathematical formulation
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Sigma1 {
    // Elements of the form {x^h y^i}_{h=0,i=0}^{max(2n-2,3m_D-3),2*s_max-2}
    pub xy_powers: Box<[G1serde]>,
    pub delta: G1serde,
    pub eta: G1serde,
    pub gamma_inv_o_pub_mj: Box<[G1serde]>, // {γ^(-1)(L_t(y)o_j(x) + M_j(x))}_{t=0,j=0}^{1,l-1} where t=0 for j∈[0,l_in-1] and t=1 for j∈[l_in,l-1]
    pub eta_inv_li_o_inter_alpha4_kj: Box<[Box<[G1serde]>]>, // {η^(-1)L_i(y)(o_{j+l}(x) + α^4 K_j(x))}_{i=0,j=0}^{s_max-1,m_I-1}
    pub delta_inv_li_o_prv: Box<[Box<[G1serde]>]>, // {δ^(-1)L_i(y)o_j(x)}_{i=0,j=l+m_I}^{s_max-1,m_I-1}
    pub delta_inv_alphak_xh_tx: Box<[Box<[G1serde]>]>, // {δ^(-1)α^k x^h t_n(x)}_{h=0,k=1}^{2,3}
    pub delta_inv_alpha4_xj_tx: Box<[G1serde]>, // {δ^(-1)α^4 x^j t_{m_I}(x)}_{j=0}^{1}
    pub delta_inv_alphak_yi_ty: Box<[Box<[G1serde]>]>, // {δ^(-1)α^k y^i t_{s_max}(y)}_{i=0,k=1}^{2,4}
}

impl Sigma1 {
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        o_vec: &Box<[ScalarField]>,
        l_vec: &Box<[ScalarField]>,
        k_vec: &Box<[ScalarField]>,
        m_vec: &Box<[ScalarField]>,
        g1_gen: &G1Affine
    ) -> Self {
        let n = params.n;
        let m_d = params.m_D;
        let l = params.l;
        let s_max = params.s_max;
        if l % 2 == 1 {
            panic!("l is an odd number.");
        }
        let l_out = params.l_out;
        let m_i = params.l_D - l;
        
        println!("Generating Sigma1 components...");
        
        // Calculate max(2n-2, 3m_I-3) for h upper bound
        let h_max = std::cmp::max(2*n, 2*m_i);
        
        // Calculate elements of the form {x^h y^i}
        println!("Generating xy_powers of size {}...", h_max * (2*s_max));
        let x_pows_vec = extend_monomial_vec!(
            &vec![ScalarField::one(), tau.x].into_boxed_slice(), 
            h_max
        );
        let y_pows_vec = extend_monomial_vec!(
            &vec![ScalarField::one(), tau.y].into_boxed_slice(), 
            2*s_max
        );
        let xy_powers = type_scaled_monomials_1d!(&x_pows_vec, &y_pows_vec, h_max, 2*s_max, None, g1_gen);
        println!("");

        // Split output vector into input, output, intermediate, and private parts
        let o_pub_vec = &o_vec[0..l].to_vec().into_boxed_slice();
        let o_inter_vec = &o_vec[l..l+m_i].to_vec().into_boxed_slice();
        let o_prv_vec = &o_vec[l+m_i..m_d].to_vec().into_boxed_slice();
        
        // Generate delta = G1serde · δ and eta = G1serde · η
        println!("Generating delta and eta...");
        let delta = G1serde(G1Affine::from((*g1_gen).to_projective() * tau.delta));
        let eta = G1serde(G1Affine::from((*g1_gen).to_projective() * tau.eta));
        
        // Generate combined γ^(-1)(L_t(y)o_j(x) + M_j(x)) for all wires (input and output)
        println!("Generating gamma_inv_o_pub_mj of size {}...", l);
        let mut gamma_inv_o_pub_mj = vec![G1serde::zero(); l].into_boxed_slice();
        
        // Process input wires (j∈[0,l_in-1], t=0)
        {
            let scaler_vec = [vec![l_vec[1]; l_out], vec![l_vec[0]; l - l_out]].concat().into_boxed_slice();
            let mut l_o_pub_vec = vec![ScalarField::zero(); l].into_boxed_slice();
            point_mul_two_vecs(&scaler_vec, o_pub_vec, &mut l_o_pub_vec);
            let mut l_o_pub_mj_vec = vec![ScalarField::zero(); l].into_boxed_slice();
            point_add_two_vecs(&l_o_pub_vec, m_vec, &mut l_o_pub_mj_vec);
            let mut gamma_inv_o_pub_mj_vec = vec![ScalarField::zero(); l].into_boxed_slice();
            scale_vec(tau.gamma.inv(), &l_o_pub_mj_vec, &mut gamma_inv_o_pub_mj_vec);
            from_coef_vec_to_g1serde_vec(&gamma_inv_o_pub_mj_vec, g1_gen, &mut gamma_inv_o_pub_mj);
        }
        
        // Generate η^(-1)L_i(y)(o_{j+l}(x) + α^k K_j(x)) for intermediate wires
        println!("Generating eta_inv_li_o_inter_alpha4_kj of size {}...", m_i * s_max);
        let mut alpha4_kj_vec = vec![ScalarField::zero(); m_i].into_boxed_slice();
        scale_vec(tau.alpha.pow(4), k_vec, &mut alpha4_kj_vec);
        let mut o_inter_alpha4_kj_vec = vec![ScalarField::zero(); m_i].into_boxed_slice();
        point_add_two_vecs(o_inter_vec, &alpha4_kj_vec, &mut o_inter_alpha4_kj_vec);
        let eta_inv_li_o_inter_alpha4_kj = type_scaled_outer_product_2d!(&o_inter_alpha4_kj_vec, l_vec, g1_gen, Some(&tau.eta.inv()));   
        drop(alpha4_kj_vec);
        drop(o_inter_alpha4_kj_vec);
        
        // Generate δ^(-1)L_i(y)o_j(x) for private wires
        println!("Generating delta_inv_li_o_prv of size {}...", (m_d - (l + m_i)) * s_max );
        let delta_inv_li_o_prv = type_scaled_outer_product_2d!(o_prv_vec, l_vec, g1_gen, Some(&tau.delta.inv()));
        
        // Generate δ^(-1)α^k x^h t_n(x) for a vanishing polynomial in x
        println!("Generating delta_inv_alphak_xh_tx...");
        let mut delta_inv_alphak_xh_tx = vec![vec![G1serde::zero(); 3].into_boxed_slice(); 3].into_boxed_slice(); // k ∈ [1,3], h ∈ [0,2]
        {
            let mut delta_inv_alphak_xh_tx_vec = vec![ScalarField::zero(); 9].into_boxed_slice(); // k ∈ [1,3], h ∈ [0,2]
            let t_x = tau.x.pow(n) - ScalarField::one(); // t_n(x) = x^n - 1
            for k in 1..=3 {
                for h in 0..=2 {
                    let idx = (k-1) * 3 + h;
                    delta_inv_alphak_xh_tx_vec[idx] = tau.delta.inv() * tau.alpha.pow(k) * tau.x.pow(h) * t_x;
                }
            }
            from_coef_vec_to_g1serde_mat(&delta_inv_alphak_xh_tx_vec, 3, 3, g1_gen, &mut delta_inv_alphak_xh_tx);
        }
        
        // Generate δ^(-1)α^4 x^j t_{m_I}(x) for a vanishing polynomial in x
        println!("Generating delta_inv_alpha4_xj_tx...");
        let mut delta_inv_alpha4_xj_tx = vec![G1serde::zero(); 2].into_boxed_slice(); // Only j ∈ [0,1]
        {
            let mut delta_inv_alpha4_xj_tx_vec = vec![ScalarField::zero(); 2].into_boxed_slice();
            let t_x = tau.x.pow(m_i) - ScalarField::one(); // t_{m_I}(x) = x^{m_I} - 1
            for j in 0..=1 {
                delta_inv_alpha4_xj_tx_vec[j] = tau.delta.inv() * tau.alpha.pow(4) * tau.x.pow(j) * t_x;
            }
            from_coef_vec_to_g1serde_vec(&delta_inv_alpha4_xj_tx_vec, g1_gen, &mut delta_inv_alpha4_xj_tx);
        }
        
        // Generate δ^(-1)α^k y^i t_{s_max}(y) for a vanishing polynomial in y
        println!("Generating delta_inv_alphak_yi_ty...");
        let mut delta_inv_alphak_yi_ty = vec![vec![G1serde::zero(); 3].into_boxed_slice(); 4].into_boxed_slice(); // k ∈ [1,4], i ∈ [0,2]
        {
            let mut delta_inv_alphak_yi_ty_vec = vec![ScalarField::zero(); 12].into_boxed_slice();
            let t_y = tau.y.pow(s_max) - ScalarField::one(); // t_{s_max}(y) = y^{s_max} - 1
            for k in 1..=4 {
                for i in 0..=2 {
                    let idx = (k-1) * 3 + i;
                    delta_inv_alphak_yi_ty_vec[idx] = tau.delta.inv() * tau.alpha.pow(k) * tau.y.pow(i) * t_y;
                }
            }
            from_coef_vec_to_g1serde_mat(&delta_inv_alphak_yi_ty_vec, 4, 3, g1_gen, &mut delta_inv_alphak_yi_ty);
        }

        Self {
            xy_powers,
            delta,
            eta,
            gamma_inv_o_pub_mj,
            eta_inv_li_o_inter_alpha4_kj,
            delta_inv_li_o_prv,
            delta_inv_alphak_xh_tx,
            delta_inv_alpha4_xj_tx,
            delta_inv_alphak_yi_ty
        }
        
    }

    pub fn encode_poly(
        &self,
        poly: &DensePolynomialExt,
        params: &SetupParams
    ) -> G1serde {
        let x_size = poly.x_size;
        let y_size = poly.y_size;
        let rs_x_size = std::cmp::max(2*params.n, 2*(params.l_D - params.l) );
        let rs_y_size = params.s_max*2;
        let target_x_size = (poly.x_degree + 1) as usize;
        let target_y_size = (poly.y_degree + 1) as usize;
        if target_x_size > rs_x_size || target_y_size > rs_y_size {
            panic!("Insufficient length of sigma.sigma_1.xy_powers");
        }
        if target_x_size * target_y_size == 0 {
            return G1serde::zero()
        }
        let mut poly_coeffs_vec = vec![ScalarField::zero(); x_size * y_size];
        let poly_coeffs = HostSlice::from_mut_slice(&mut poly_coeffs_vec);
        poly.copy_coeffs(0, poly_coeffs);
        let mut msm_res = vec![G1Projective::zero(); 1];
        let rs: Vec<G1Affine> = self.xy_powers.iter().map(|x| x.0).collect();
        msm::msm(
            HostSlice::from_slice(
                &resize(
                    &poly_coeffs_vec, 
                    x_size, 
                    y_size, 
                    target_x_size, 
                    target_y_size,
                    ScalarField::zero()
                )
            ),
            HostSlice::from_slice(
                &resize(
                    &rs, 
                    rs_x_size, 
                    rs_y_size, 
                    target_x_size, 
                    target_y_size,
                    G1Affine::zero()
                )
            ),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut msm_res)
        ).unwrap();
        G1serde(G1Affine::from(msm_res[0]))
    }

    pub fn encode_O_pub(
        &self,
        placement_variables: &[PlacementVariables],
        subcircuit_infos: &[SubcircuitInfo],
        setup_params: &SetupParams
    ) -> G1serde {
        let mut aligned_rs = vec![G1Affine::zero(); setup_params.l];
        let mut aligned_wtns = vec![ScalarField::zero(); setup_params.l];
        let mut cnt: usize = 0;
        for i in 0..2 {
            let subcircuit_id = placement_variables[i].subcircuitId;
            let variables = &placement_variables[i].variables;
            let subcircuit_info = &subcircuit_infos[subcircuit_id];
            let flatten_map = &subcircuit_info.flattenMap;
            let start_idx = if i==0 {
                // Public input placement
                subcircuit_info.In_idx[0]
            } else {
                // Public output placement
                subcircuit_info.Out_idx[0]
            };
            let end_idx_exclusive = if i==0 {
                // Public input placement
                subcircuit_info.In_idx[0] + subcircuit_info.In_idx[1]
            } else {
                // Public output placement
                subcircuit_info.Out_idx[0] + subcircuit_info.Out_idx[1]
            };

            for j in start_idx..end_idx_exclusive {
                aligned_wtns[cnt] = ScalarField::from_hex(&variables[j]);
                let global_idx = flatten_map[j];
                let curve_point = self.gamma_inv_o_pub_mj[global_idx].0;
                aligned_rs[cnt] = curve_point;
                cnt += 1;
            }        
        }
        let mut msm_res = vec![G1Projective::zero(); 1];
        msm::msm(
            HostSlice::from_slice(&aligned_wtns),
            HostSlice::from_slice(&aligned_rs),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut msm_res)
        ).unwrap();

        G1serde(G1Affine::from(msm_res[0]))
    }

    pub fn encode_O_mid_no_zk(
        &self,
        placement_variables: &[PlacementVariables],
        subcircuit_infos: &[SubcircuitInfo],
        setup_params: &SetupParams
    ) -> G1serde {
        let mut nVar: usize = 0;
        for i in 0..placement_variables.len() {
            let subcircuit_id = placement_variables[i].subcircuitId;
            let subcircuit_info = &subcircuit_infos[subcircuit_id];
            if i == 0 {
                // Public input placement
                nVar = nVar + subcircuit_info.Out_idx[1]; // Number of output wires
            } else if i == 1 {
                // Public output placement
                nVar = nVar + subcircuit_info.In_idx[1]; // Number of input wires
            } else {
                nVar = nVar + subcircuit_info.Out_idx[1] + subcircuit_info.In_idx[1];
            }
        }
        // if nVar != m_i {
        //     panic!("Mismatch between m_I and the actual number of interface wires.")
        // }

        let mut aligned_rs = vec![G1Affine::zero(); nVar];
        let mut aligned_wtns = vec![ScalarField::zero(); nVar];
        let mut cnt: usize = 0;
        for i in 0..placement_variables.len() {
            let subcircuit_id = placement_variables[i].subcircuitId;
            let variables = &placement_variables[i].variables;
            let subcircuit_info = &subcircuit_infos[subcircuit_id];
            let flatten_map = &subcircuit_info.flattenMap;
            let start_idx = if i==0 {
                // Public input placement
                subcircuit_info.Out_idx[0]
            } else if i==1 {
                // Public output placement
                subcircuit_info.In_idx[0]
            } else {
                subcircuit_info.Out_idx[0]
            };
            let end_idx_exclusive = if i==0 {
                // Public input placement
                subcircuit_info.Out_idx[0] + subcircuit_info.Out_idx[1]
            } else if i==1 {
                // Public output placement
                subcircuit_info.In_idx[0] + subcircuit_info.In_idx[1]
            } else {
                subcircuit_info.Out_idx[0] + subcircuit_info.Out_idx[1] + subcircuit_info.In_idx[1]
            };

            for j in start_idx..end_idx_exclusive {
                aligned_wtns[cnt] = ScalarField::from_hex(&variables[j]);
                let global_idx = flatten_map[j] - setup_params.l;
                let curve_point = self.eta_inv_li_o_inter_alpha4_kj[global_idx][i].0;
                aligned_rs[cnt] = curve_point;
                cnt += 1;
            }        
        }
        let mut msm_res = vec![G1Projective::zero(); 1];
        msm::msm(
            HostSlice::from_slice(&aligned_wtns),
            HostSlice::from_slice(&aligned_rs),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut msm_res)
        ).unwrap();
        return G1serde(G1Affine::from(msm_res[0]))
    }

    pub fn encode_O_prv_no_zk(
        &self,
        placement_variables: &[PlacementVariables],
        subcircuit_infos: &[SubcircuitInfo],
        setup_params: &SetupParams
    ) -> G1serde {
        let mut nVar: usize = 0;
        for i in 0..placement_variables.len() {
            let subcircuit_id = placement_variables[i].subcircuitId;
            let subcircuit_info = &subcircuit_infos[subcircuit_id];
            nVar = nVar + ( subcircuit_info.Nwires - subcircuit_info.In_idx[1] - subcircuit_info.Out_idx[1] );
        }
        // if nVar != m_d - l_d {
        //     panic!("Mismatch between m_D and the actual number of internal wires.")
        // }

        let mut aligned_rs = vec![G1Affine::zero(); nVar];
        let mut aligned_wtns = vec![ScalarField::zero(); nVar];
        let mut cnt: usize = 0;
        for i in 0..placement_variables.len() {
            let subcircuit_id = placement_variables[i].subcircuitId;
            let variables = &placement_variables[i].variables;
            let subcircuit_info = &subcircuit_infos[subcircuit_id];
            let flatten_map = &subcircuit_info.flattenMap;
            for j in 0..subcircuit_info.Nwires {
                if flatten_map[j] >= setup_params.l_D {
                    let global_idx = flatten_map[j] - setup_params.l_D;
                    aligned_wtns[cnt] = ScalarField::from_hex(&variables[j]);
                    let curve_point = self.delta_inv_li_o_prv[global_idx][i].0;
                    aligned_rs[cnt] = curve_point;
                    cnt += 1;
                }
            }        
        }
        let mut msm_res = vec![G1Projective::zero(); 1];
        msm::msm(
            HostSlice::from_slice(&aligned_wtns),
            HostSlice::from_slice(&aligned_rs),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut msm_res)
        ).unwrap();
        return G1serde(G1Affine::from(msm_res[0]))
    }
}
/// This corresponds to σ_2 in the paper:
/// σ_2 := (α, α^2, α^3, α^4, γ, δ, η, x, y)
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Sigma2 {
    pub alpha: G2serde,
    pub alpha2: G2serde,
    pub alpha3: G2serde,
    pub alpha4: G2serde,
    pub gamma: G2serde,
    pub delta: G2serde,
    pub eta: G2serde,
    pub x: G2serde,
    pub y: G2serde,
}

impl Sigma2 {
    /// Generate CRS elements for trapdoor component
    pub fn gen(
        tau: &Tau,
        g2_gen: &G2Affine
    ) -> Self {
        println!("Generating Sigma2 components...");
        let alpha = G2serde(G2Affine::from((*g2_gen).to_projective() * tau.alpha));
        let alpha2 = G2serde(G2Affine::from((*g2_gen).to_projective() * tau.alpha.pow(2)));
        let alpha3 = G2serde(G2Affine::from((*g2_gen).to_projective() * tau.alpha.pow(3)));
        let alpha4 = G2serde(G2Affine::from((*g2_gen).to_projective() * tau.alpha.pow(4)));
        let gamma = G2serde(G2Affine::from((*g2_gen).to_projective() * tau.gamma));
        let delta = G2serde(G2Affine::from((*g2_gen).to_projective() * tau.delta));
        let eta = G2serde(G2Affine::from((*g2_gen).to_projective() * tau.eta));
        let x = G2serde(G2Affine::from((*g2_gen).to_projective() * tau.x));
        let y = G2serde(G2Affine::from((*g2_gen).to_projective() * tau.y));
        
        Self {
            alpha,
            alpha2,
            alpha3,
            alpha4,
            gamma,
            delta,
            eta,
            x,
            y
        }
    }
}

/// CRS (Common Reference String) structure
/// This corresponds to σ = ([σ_1]_1, [σ_2]_2) defined in the paper
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Sigma {
    pub G: G1serde,
    pub H: G2serde,
    pub sigma_1: Sigma1,
    pub sigma_2: Sigma2,
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
        println!("Generating a sigma (σ)...");
        let sigma_1 = Sigma1::gen(params, tau, o_vec, l_vec, k_vec, m_vec, g1_gen);
        let sigma_2 = Sigma2::gen(tau, g2_gen);
        Self {
            G: G1serde(*g1_gen),
            H: G2serde(*g2_gen),
            sigma_1,
            sigma_2
        }
    }
}

pub fn pairing(lhs: &[G1serde], rhs: &[G2serde]) -> PairingOutput<Bls12_381> {
    let lhs_ark: Vec<ArkG1Affine> = lhs.iter().map(|x| icicle_g1_affine_to_ark(&x.0)).collect();
    let rhs_ark: Vec<ArkG2Affine> = rhs.iter().map(|x| icicle_g2_affine_to_ark(&x.0)).collect();
    Bls12_381::multi_pairing(
        lhs_ark, 
        rhs_ark
    )
}


// fn g1_affine_to_json(point: &G1Affine) -> Value {
//     json!({
//         "x": point.x.to_string(),
//         "y": point.y.to_string(),
//     })
// }

// fn g2_affine_to_json(point: &G2Affine) -> Value {
//     json!({
//         "x": point.x.to_string(),
//         "y": point.y.to_string(),
//     })
// }

// fn g1_affine_from_json(json_value: &Value) -> Result<G1Affine, Box<dyn std::error::Error>> {
//     let x_str = json_value["x"].as_str().ok_or("Missing x coordinate")?;
//     let y_str = json_value["y"].as_str().ok_or("Missing y coordinate")?;
    
//     let x_bytes = hex::decode(x_str.trim_start_matches("0x"))?;
//     let y_bytes = hex::decode(y_str.trim_start_matches("0x"))?;
    
//     let x_field = BaseField::from_bytes_le(&x_bytes);
//     let y_field = BaseField::from_bytes_le(&y_bytes);
    
//     Ok(G1Affine {
//         x: x_field,
//         y: y_field,
//     })
// }


// fn g2_affine_from_json(json_value: &Value) -> Result<G2Affine, Box<dyn std::error::Error>> {
//     let x_str = json_value["x"].as_str().ok_or("Missing x coordinate")?;
//     let y_str = json_value["y"].as_str().ok_or("Missing y coordinate")?;
    
//     let x_bytes = hex::decode(x_str.trim_start_matches("0x"))?;
//     let y_bytes = hex::decode(y_str.trim_start_matches("0x"))?;
    
//     let x_field = G2BaseField::from_bytes_le(&x_bytes);
//     let y_field = G2BaseField::from_bytes_le(&y_bytes);
        
//     Ok(G2Affine {
//         x: x_field,
//         y: y_field,
//     })
// }

// fn g1_affine_array_from_json(json_value: &Value) -> Result<Box<[G1Affine]>, Box<dyn std::error::Error>> {
//     let array = json_value.as_array().ok_or("Expected array")?;
//     let mut result = Vec::with_capacity(array.len());
    
//     for item in array {
//         result.push(g1_affine_from_json(item)?);
//     }
    
//     Ok(result.into_boxed_slice())
// }

// fn g2_affine_array_from_json(json_value: &Value) -> Result<Box<[G2Affine]>, Box<dyn std::error::Error>> {
//     let array = json_value.as_array().ok_or("Expected array")?;
//     let mut result = Vec::with_capacity(array.len());
    
//     for item in array {
//         result.push(g2_affine_from_json(item)?);
//     }
    
//     Ok(result.into_boxed_slice())
// }

// fn g1_affine_2d_array_from_json(json_value: &Value) -> Result<Box<[Box<[G1Affine]>]>, Box<dyn std::error::Error>> {
//     let array = json_value.as_array().ok_or("Expected array")?;
//     let mut result = Vec::with_capacity(array.len());
    
//     for row in array {
//         result.push(g1_affine_array_from_json(row)?);
//     }
    
//     Ok(result.into_boxed_slice())
// }

// fn g1_affine_array_to_json(array: &Box<[G1Affine]>) -> Value {
//     let mut json_array = Vec::new();
//     for point in array.iter() {
//         json_array.push(g1_affine_to_json(point));
//     }
//     Value::Array(json_array)
// }

// fn g1_affine_2d_array_to_json(array: &Box<[Box<[G1Affine]>]>) -> Value {
//     let mut json_array = Vec::new();
//     for row in array.iter() {
//         json_array.push(g1_affine_array_to_json(row));
//     }
//     Value::Array(json_array)
// }

// fn g2_affine_array_to_json(array: &Box<[G2Affine]>) -> Value {
//     let mut json_array = Vec::new();
//     for point in array.iter() {
//         json_array.push(g2_affine_to_json(point));
//     }
//     Value::Array(json_array)
// }

#[derive(Clone, Debug, Copy, PartialEq)]
pub struct G1serde(pub G1Affine);
impl G1serde {
    pub fn zero() -> Self {
        Self(G1Affine::zero())
    }
}
impl Add for G1serde {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        G1serde(G1Affine::from(self.0.to_projective() + other.0.to_projective()))
    }
}

impl Sub for G1serde {
    type Output = Self;

    fn sub(self, other: Self) -> Self {
        G1serde(G1Affine::from(self.0.to_projective() - other.0.to_projective()))
    }
}

// G1serde * original field
impl Mul<ScalarField> for G1serde {
    type Output = Self;

    fn mul(self, other: ScalarField) -> Self {
        G1serde(G1Affine::from(self.0.to_projective() * other))
    }
}
// original field * G1serde
impl Mul<G1serde> for ScalarField {
    type Output = G1serde;

    fn mul(self, other: G1serde) -> Self::Output {
        G1serde(G1Affine::from(other.0.to_projective() * self))
    }
}

// G1serde * FieldSerde
impl Mul<FieldSerde> for G1serde {
    type Output = Self;

    fn mul(self, other: FieldSerde) -> Self {
        G1serde(G1Affine::from(self.0.to_projective() * other.0))
    }
}
// original field * G1serde
impl Mul<G1serde> for FieldSerde {
    type Output = G1serde;

    fn mul(self, other: G1serde) -> Self::Output {
        G1serde(G1Affine::from(other.0.to_projective() * self.0))
    }
}



#[derive(Clone, Debug, Copy)]
pub struct G2serde(pub G2Affine);


pub fn icicle_g1_affine_to_ark(g: &G1Affine) -> ArkG1Affine {
    let x_bytes = g.x.to_bytes_le();
    let y_bytes = g.y.to_bytes_le();
    let x = ark_bls12_381::Fq::from_random_bytes(&x_bytes)
        .expect("failed to convert x from icicle to ark");
    let y = ark_bls12_381::Fq::from_random_bytes(&y_bytes)
        .expect("failed to convert y from icicle to ark");
    ArkG1Affine::new_unchecked(x, y)
}

pub fn icicle_g2_affine_to_ark(g: &G2Affine) -> ArkG2Affine {
    let x_bytes = g.x.to_bytes_le();
    let y_bytes = g.y.to_bytes_le();
    let x = ark_bls12_381::Fq2::from_random_bytes(&x_bytes)
        .expect("failed to convert x from icicle to ark");
    let y = ark_bls12_381::Fq2::from_random_bytes(&y_bytes)
        .expect("failed to convert y from icicle to ark");
    ArkG2Affine::new_unchecked(x, y)
}