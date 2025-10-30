use crate::bivariate_polynomial::BivariatePolynomial;
use crate::field_structures::Tau;
use crate::group_structures::G1serde;
use crate::iotools::{
    from_coef_vec_to_g1serde_mat, from_coef_vec_to_g1serde_vec, scaled_outer_product_1d,
    scaled_outer_product_2d, PlacementVariables, SetupParams, SubcircuitInfo,
};
use crate::vector_operations::*;
use icicle_bls12_381::curve::{G1Affine, G1Projective, ScalarField};
use icicle_core::msm::{self, MSMConfig};
use icicle_core::traits::{Arithmetic, FieldImpl};
use icicle_runtime::memory::HostSlice;
use serde::{Deserialize, Serialize};

/// Extends a vector of monomials to a target size.
#[macro_export]
macro_rules! extend_monomial_vec {
    ($mono_vec: expr, $target_size: expr) => {{
        let mut res = vec![ScalarField::zero(); $target_size].into_boxed_slice();
        extend_monomial_vec($mono_vec, &mut res);
        res
    }};
}

/// Computes the scaled outer product of two vectors of monomials.
macro_rules! type_scaled_outer_product_2d {
    ($col_vec: expr, $row_vec: expr, $g1_gen: expr, $scalar: expr) => {{
        let row_size = $col_vec.len();
        let col_size = $row_vec.len();
        let mut res =
            vec![vec![G1serde::zero(); col_size].into_boxed_slice(); row_size].into_boxed_slice();
        scaled_outer_product_2d($col_vec, $row_vec, $g1_gen, $scalar, &mut res);
        res
    }};
}

/// Computes the scaled outer product of two vectors of monomials.
macro_rules! type_scaled_outer_product_1d {
    ($col_vec: expr, $row_vec: expr, $g1_gen: expr, $scalar: expr) => {{
        let row_size = $col_vec.len();
        let col_size = $row_vec.len();
        let mut res = vec![G1serde::zero(); row_size * col_size].into_boxed_slice();
        scaled_outer_product_1d($col_vec, $row_vec, $g1_gen, $scalar, &mut res);
        res
    }};
}

macro_rules! type_scaled_monomials_1d {
    ( $cached_x_vec: expr, $cached_y_vec: expr, $x_size: expr, $y_size: expr, $scaler: expr, $g1_gen: expr ) => {{
        let col_vec = extend_monomial_vec!($cached_x_vec, $x_size);
        let row_vec = extend_monomial_vec!($cached_y_vec, $y_size);
        let res = type_scaled_outer_product_1d!(&col_vec, &row_vec, $g1_gen, $scaler);
        res
    }};
}

// Use the impl_encode_poly macro from parent module
crate::impl_encode_poly!(Sigma1);

/// CRS's AC component
/// This corresponds to σ_A,C in the mathematical formulation
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Sigma1 {
    // Elements of the form {x^h y^i}_{h=0,i=0}^{max(2n-2,3m_D-3),2*s_max-2}
    pub xy_powers: Box<[G1serde]>,
    pub x: G1serde,
    pub y: G1serde,
    pub delta: G1serde,
    pub eta: G1serde,
    pub gamma_inv_o_inst: Box<[G1serde]>, // {γ^(-1)(L_t(y)o_j(x) + M_j(x))}_{t=0,j=0}^{1,l-1} where t=0 for j∈[0,l_in-1] and t=1 for j∈[l_in,l-1]
    pub eta_inv_li_o_inter_alpha4_kj: Box<[Box<[G1serde]>]>, // {η^(-1)L_i(y)(o_{j+l}(x) + α^4 K_j(x))}_{i=0,j=0}^{s_max-1,m_I-1}
    pub delta_inv_li_o_prv: Box<[Box<[G1serde]>]>, // {δ^(-1)L_i(y)o_j(x)}_{i=0,j=l+m_I}^{s_max-1,m_I-1}
    pub delta_inv_alphak_xh_tx: Box<[Box<[G1serde]>]>, // {δ^(-1)α^k x^h t_n(x)}_{h=0,k=1}^{2,3}
    pub delta_inv_alpha4_xj_tx: Box<[G1serde]>,    // {δ^(-1)α^4 x^j t_{m_I}(x)}_{j=0}^{1}
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
        g1_gen: &G1Affine,
    ) -> Self {
        let n = params.n;
        let m_d = params.m_D;
        let l = params.l;
        let s_max = params.s_max;
        if l % 2 == 1 {
            panic!("l is an odd number.");
        }
        let l_pub_out = params.l_pub_out;
        let l_pub_in = params.l_pub_in;
        let l_prv_out = params.l_prv_out;
        let l_prv_in = params.l_prv_in;
        let m_i = params.l_D - l;

        println!("Generating Sigma1 components...");

        // Calculate max(2n-2, 3m_I-3) for h upper bound
        let h_max = std::cmp::max(2 * n, 2 * m_i);

        // Calculate elements of the form {x^h y^i}
        println!("Generating xy_powers of size {}...", h_max * (2 * s_max));
        let x_pows_vec =
            extend_monomial_vec!(&vec![ScalarField::one(), tau.x].into_boxed_slice(), h_max);
        let y_pows_vec = extend_monomial_vec!(
            &vec![ScalarField::one(), tau.y].into_boxed_slice(),
            2 * s_max
        );
        let xy_powers =
            type_scaled_monomials_1d!(&x_pows_vec, &y_pows_vec, h_max, 2 * s_max, None, g1_gen);
        println!("");

        // Split output vector into input, output, intermediate, and private parts
        let o_inst_vec = &o_vec[0..l].to_vec().into_boxed_slice();
        let o_inter_vec = &o_vec[l..l + m_i].to_vec().into_boxed_slice();
        let o_prv_vec = &o_vec[l + m_i..m_d].to_vec().into_boxed_slice();

        // Generate delta = G1serde · δ and eta = G1serde · η
        let x = G1serde(G1Affine::from((*g1_gen).to_projective() * tau.x));
        let y = G1serde(G1Affine::from((*g1_gen).to_projective() * tau.y));
        let delta = G1serde(G1Affine::from((*g1_gen).to_projective() * tau.delta));
        let eta = G1serde(G1Affine::from((*g1_gen).to_projective() * tau.eta));

        // Generate γ^(-1)(L_t(y)o_j(x) + M_j(x)) for public instance wires j∈[0,l_pub-1], t={0, 1} and γ^(-1)L_t(y)o_j(x) for private instance wires j∈[l_pub,l-1], t={2, 3}
        println!("Generating gamma_inv_o_inst of size {}...", l);
        let mut gamma_inv_o_inst = vec![G1serde::zero(); l].into_boxed_slice();
        {
            // For the indices of l_vec, see tokamak-zk-evm/packages/frontend/synthesizer/src/tokamak/constant/constants.ts
            let scaler_vec = [
                vec![l_vec[1]; l_pub_out],
                vec![l_vec[0]; l_pub_in],
                vec![l_vec[3]; l_prv_out],
                vec![l_vec[2]; l_prv_in],
            ]
            .concat()
            .into_boxed_slice();
            let l_pub = l_pub_in + l_pub_out;
            // let l_prv = l_prv_in + l_prv_out;
            let mut l_o_inst_vec = vec![ScalarField::zero(); l].into_boxed_slice();
            point_mul_two_vecs(&scaler_vec, &o_inst_vec, &mut l_o_inst_vec);
            drop(scaler_vec);
            let mut l_o_inst_pub_mj_vec = vec![ScalarField::zero(); l_pub].into_boxed_slice();
            point_add_two_vecs(&l_o_inst_vec[0..l_pub], m_vec, &mut l_o_inst_pub_mj_vec);
            let l_o_inst_pub_mj_prv_vec = [l_o_inst_pub_mj_vec, l_o_inst_vec[l_pub..l].into()]
                .concat()
                .into_boxed_slice();
            let mut gamma_inv_o_inst_vec = vec![ScalarField::zero(); l].into_boxed_slice();
            scale_vec(
                tau.gamma.inv(),
                &l_o_inst_pub_mj_prv_vec,
                &mut gamma_inv_o_inst_vec,
            );
            from_coef_vec_to_g1serde_vec(&gamma_inv_o_inst_vec, g1_gen, &mut gamma_inv_o_inst);
        }

        // Generate η^(-1)L_i(y)(o_{j+l}(x) + α^k K_j(x)) for intermediate wires
        println!(
            "Generating eta_inv_li_o_inter_alpha4_kj of size {}...",
            m_i * s_max
        );
        let mut alpha4_kj_vec = vec![ScalarField::zero(); m_i].into_boxed_slice();
        scale_vec(tau.alpha.pow(4), k_vec, &mut alpha4_kj_vec);
        let mut o_inter_alpha4_kj_vec = vec![ScalarField::zero(); m_i].into_boxed_slice();
        point_add_two_vecs(o_inter_vec, &alpha4_kj_vec, &mut o_inter_alpha4_kj_vec);
        let eta_inv_li_o_inter_alpha4_kj = type_scaled_outer_product_2d!(
            &o_inter_alpha4_kj_vec,
            l_vec,
            g1_gen,
            Some(&tau.eta.inv())
        );
        drop(alpha4_kj_vec);
        drop(o_inter_alpha4_kj_vec);

        // Generate δ^(-1)L_i(y)o_j(x) for private wires
        println!(
            "Generating delta_inv_li_o_prv of size {}...",
            (m_d - (l + m_i)) * s_max
        );
        let delta_inv_li_o_prv =
            type_scaled_outer_product_2d!(o_prv_vec, l_vec, g1_gen, Some(&tau.delta.inv()));

        // Generate δ^(-1)α^k x^h t_n(x) for a vanishing polynomial in x
        println!("Generating delta_inv_alphak_xh_tx...");
        let mut delta_inv_alphak_xh_tx =
            vec![vec![G1serde::zero(); 3].into_boxed_slice(); 3].into_boxed_slice(); // k ∈ [1,3], h ∈ [0,2]
        {
            let mut delta_inv_alphak_xh_tx_vec = vec![ScalarField::zero(); 9].into_boxed_slice(); // k ∈ [1,3], h ∈ [0,2]
            let t_x = tau.x.pow(n) - ScalarField::one(); // t_n(x) = x^n - 1
            for k in 1..=3 {
                for h in 0..=2 {
                    let idx = (k - 1) * 3 + h;
                    delta_inv_alphak_xh_tx_vec[idx] =
                        tau.delta.inv() * tau.alpha.pow(k) * tau.x.pow(h) * t_x;
                }
            }
            from_coef_vec_to_g1serde_mat(
                &delta_inv_alphak_xh_tx_vec,
                3,
                3,
                g1_gen,
                &mut delta_inv_alphak_xh_tx,
            );
        }

        // Generate δ^(-1)α^4 x^j t_{m_I}(x) for a vanishing polynomial in x
        println!("Generating delta_inv_alpha4_xj_tx...");
        let mut delta_inv_alpha4_xj_tx = vec![G1serde::zero(); 2].into_boxed_slice(); // Only j ∈ [0,1]
        {
            let mut delta_inv_alpha4_xj_tx_vec = vec![ScalarField::zero(); 2].into_boxed_slice();
            let t_x = tau.x.pow(m_i) - ScalarField::one(); // t_{m_I}(x) = x^{m_I} - 1
            for j in 0..=1 {
                delta_inv_alpha4_xj_tx_vec[j] =
                    tau.delta.inv() * tau.alpha.pow(4) * tau.x.pow(j) * t_x;
            }
            from_coef_vec_to_g1serde_vec(
                &delta_inv_alpha4_xj_tx_vec,
                g1_gen,
                &mut delta_inv_alpha4_xj_tx,
            );
        }

        // Generate δ^(-1)α^k y^i t_{s_max}(y) for a vanishing polynomial in y
        println!("Generating delta_inv_alphak_yi_ty...");
        let mut delta_inv_alphak_yi_ty =
            vec![vec![G1serde::zero(); 3].into_boxed_slice(); 4].into_boxed_slice(); // k ∈ [1,4], i ∈ [0,2]
        {
            let mut delta_inv_alphak_yi_ty_vec = vec![ScalarField::zero(); 12].into_boxed_slice();
            let t_y = tau.y.pow(s_max) - ScalarField::one(); // t_{s_max}(y) = y^{s_max} - 1
            for k in 1..=4 {
                for i in 0..=2 {
                    let idx = (k - 1) * 3 + i;
                    delta_inv_alphak_yi_ty_vec[idx] =
                        tau.delta.inv() * tau.alpha.pow(k) * tau.y.pow(i) * t_y;
                }
            }
            from_coef_vec_to_g1serde_mat(
                &delta_inv_alphak_yi_ty_vec,
                4,
                3,
                g1_gen,
                &mut delta_inv_alphak_yi_ty,
            );
        }

        Self {
            xy_powers,
            x,
            y,
            delta,
            eta,
            gamma_inv_o_inst,
            eta_inv_li_o_inter_alpha4_kj,
            delta_inv_li_o_prv,
            delta_inv_alphak_xh_tx,
            delta_inv_alpha4_xj_tx,
            delta_inv_alphak_yi_ty,
        }
    }

    pub fn encode_O_inst(
        &self,
        placement_variables: &[PlacementVariables],
        subcircuit_infos: &[SubcircuitInfo],
        setup_params: &SetupParams,
    ) -> G1serde {
        let mut aligned_rs = vec![G1Affine::zero(); setup_params.l];
        let mut aligned_wtns = vec![ScalarField::zero(); setup_params.l];
        let mut cnt: usize = 0;
        for i in 0..4 {
            let subcircuit_id = placement_variables[i].subcircuitId;
            let variables = &placement_variables[i].variables;
            let subcircuit_info = &subcircuit_infos[subcircuit_id];
            let flatten_map = &subcircuit_info.flattenMap;
            let start_idx = match i {
                0 | 2 => subcircuit_info.In_idx[0],
                1 | 3 => subcircuit_info.Out_idx[0],
                _ => unreachable!(),
            };
            let end_idx_exclusive = match i {
                0 | 2 => subcircuit_info.In_idx[0] + subcircuit_info.In_idx[1],
                1 | 3 => subcircuit_info.Out_idx[0] + subcircuit_info.Out_idx[1],
                _ => unreachable!(),
            };

            for j in start_idx..end_idx_exclusive {
                aligned_wtns[cnt] = ScalarField::from_hex(&variables[j]);
                let global_idx = flatten_map[j];
                let curve_point = self.gamma_inv_o_inst[global_idx].0;
                aligned_rs[cnt] = curve_point;
                cnt += 1;
            }
        }
        let mut msm_res = vec![G1Projective::zero(); 1];
        msm::msm(
            HostSlice::from_slice(&aligned_wtns),
            HostSlice::from_slice(&aligned_rs),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut msm_res),
        )
        .unwrap();

        G1serde(G1Affine::from(msm_res[0]))
    }

    pub fn encode_O_mid_no_zk(
        &self,
        placement_variables: &[PlacementVariables],
        subcircuit_infos: &[SubcircuitInfo],
        setup_params: &SetupParams,
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
            // Filterling out interface wires
            let start_idx = if i == 0 {
                // Public input placement
                subcircuit_info.Out_idx[0]
            } else if i == 1 {
                // Public output placement
                subcircuit_info.In_idx[0]
            } else if i == 2 {
                // Private input placement
                subcircuit_info.Out_idx[0]
            } else if i == 3 {
                // Private output placement
                subcircuit_info.In_idx[0]
            } else {
                subcircuit_info.Out_idx[0]
            };
            let end_idx_exclusive = if i == 0 {
                // Public input placement
                subcircuit_info.Out_idx[0] + subcircuit_info.Out_idx[1]
            } else if i == 1 {
                // Public output placement
                subcircuit_info.In_idx[0] + subcircuit_info.In_idx[1]
            } else if i == 2 {
                // Private input placement
                subcircuit_info.Out_idx[0] + subcircuit_info.Out_idx[1]
            } else if i == 3 {
                // Private output placement
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
            HostSlice::from_mut_slice(&mut msm_res),
        )
        .unwrap();
        return G1serde(G1Affine::from(msm_res[0]));
    }

    pub fn encode_O_prv_no_zk(
        &self,
        placement_variables: &[PlacementVariables],
        subcircuit_infos: &[SubcircuitInfo],
        setup_params: &SetupParams,
    ) -> G1serde {
        let mut nVar: usize = 0;
        for i in 0..placement_variables.len() {
            let subcircuit_id = placement_variables[i].subcircuitId;
            let subcircuit_info = &subcircuit_infos[subcircuit_id];
            nVar = nVar
                + (subcircuit_info.Nwires - subcircuit_info.In_idx[1] - subcircuit_info.Out_idx[1]);
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
            HostSlice::from_mut_slice(&mut msm_res),
        )
        .unwrap();
        return G1serde(G1Affine::from(msm_res[0]));
    }
}
