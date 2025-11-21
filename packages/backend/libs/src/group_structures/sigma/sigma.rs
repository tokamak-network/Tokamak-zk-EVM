use super::sigma1::Sigma1;
use super::sigma2::Sigma2;
use crate::field_structures::Tau;
use crate::group_structures::{G1serde, G2serde};
use crate::iotools::SetupParams;
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField};
use serde::{Deserialize, Serialize};

/// CRS (Common Reference String) structure
/// This corresponds to σ = ([σ_1]_1, [σ_2]_2) defined in the paper
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Sigma {
    pub G: G1serde,
    pub H: G2serde,
    pub sigma_1: Sigma1,
    pub sigma_2: Sigma2,
    pub lagrange_KL: G1serde,
}

impl Sigma {
    /// Generate full CRS
    pub fn gen(
        params: &SetupParams,
        tau: &Tau,
        o_vec: &[ScalarField],
        l_vec: &[ScalarField],
        k_vec: &[ScalarField],
        m_vec: &[ScalarField],
        g1_gen: &G1Affine,
        g2_gen: &G2Affine,
    ) -> Self {
        println!("Generating a sigma (σ)...");
        let lagrange_KL =
            (l_vec[params.s_max - 1] * k_vec[params.l_D - params.l - 1]) * G1serde(*g1_gen);
        let sigma_1 = Sigma1::gen(params, tau, o_vec, l_vec, k_vec, m_vec, g1_gen);
        let sigma_2 = Sigma2::gen(tau, g2_gen);
        Self {
            G: G1serde(*g1_gen),
            H: G2serde(*g2_gen),
            sigma_1,
            sigma_2,
            lagrange_KL,
        }
    }
}
