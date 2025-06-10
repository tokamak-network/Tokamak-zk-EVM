use std::fs;
use std::env;
use std::fs::File;
use std::io::{self, BufReader, BufWriter};
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField};
use serde::{Deserialize, Serialize};
use serde_json::{from_reader, to_writer_pretty};
use libs::field_structures::Tau;
use libs::group_structures::{G1serde, G2serde, PartialSigma1, PartialSigma1Verify, Sigma, Sigma1, Sigma2, SigmaPreprocess, SigmaVerify};
use libs::iotools::SetupParams;
use crate::{impl_read_from_json, impl_write_into_json};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SigmaV2 {
    pub contributor_index: usize,
    #[serde(flatten)]
    pub sigma: Sigma,
    pub gamma: G1serde,
}
impl_read_from_json!(SigmaV2);
impl_write_into_json!(SigmaV2);
impl SigmaV2 {
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
        let sigma = Sigma::gen(params, tau, o_vec, l_vec, k_vec, m_vec, g1_gen, g2_gen);
        let gamma = G1serde(G1Affine::from((*g1_gen).to_projective() * tau.gamma));
        Self {
            contributor_index: 0,
            sigma,
            gamma,
        }
    }
    /// Write verifier CRS into JSON
    pub fn write_into_json_for_verify(&self, path: &str) -> io::Result<()> {
        self.sigma.write_into_json_for_verify(path)
    }

    /// Write preprocess CRS into JSON
    pub fn write_into_json_for_preprocess(&self, path: &str) -> io::Result<()> {
        self.sigma.write_into_json_for_preprocess(path)
    }

    pub fn write_into_rust_code(&self, path: &str) -> io::Result<()> {
        self.sigma.write_into_rust_code(path)
    }
}
