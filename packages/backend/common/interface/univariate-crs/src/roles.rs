// Generated from common/contracts/univariate-artifact-contract.json. Do not edit.
use super::{UnivariateG1Rkyv, UnivariateG2Rkyv};
#[derive(Debug, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
pub struct TauSequenceRkyv {
    pub schema_id: String,
    pub s0_g1: Vec<UnivariateG1Rkyv>,
    pub sxi_g1: Vec<UnivariateG1Rkyv>,
    pub spsi_g1: Vec<UnivariateG1Rkyv>,
    pub tau_powers_g2: Vec<UnivariateG2Rkyv>,
    pub psi_g2: UnivariateG2Rkyv,
}
#[derive(Debug, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
pub struct ProverKeysRkyv {
    pub schema_id: String,
    pub weighted_g1: Vec<UnivariateG1Rkyv>,
    pub weighted_shifted_g1: Vec<UnivariateG1Rkyv>,
    pub free_public_queries: Vec<UnivariateG1Rkyv>,
    pub nonpublic_queries: Vec<UnivariateG1Rkyv>,
    pub mask_u: [UnivariateG1Rkyv; 2],
    pub mask_v: [UnivariateG1Rkyv; 2],
    pub mask_w: [UnivariateG1Rkyv; 2],
    pub mask_b: [UnivariateG1Rkyv; 2],
    pub mask_selection: UnivariateG1Rkyv,
}
#[derive(Debug, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
pub struct PreprocessKeysRkyv {
    pub schema_id: String,
    pub sc_g1: Vec<UnivariateG1Rkyv>,
    pub selection_g2: Vec<UnivariateG2Rkyv>,
    pub fixed_public_queries: Vec<UnivariateG1Rkyv>,
}
#[derive(Debug, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
pub struct VerifierKeysRkyv {
    pub schema_id: String,
    pub one_g1: UnivariateG1Rkyv,
    pub xi_g1: UnivariateG1Rkyv,
    pub psi_g1: UnivariateG1Rkyv,
    pub one_g2: UnivariateG2Rkyv,
    pub tau_g2: UnivariateG2Rkyv,
    pub tau_k_g2: UnivariateG2Rkyv,
    pub delta_g2: UnivariateG2Rkyv,
}
