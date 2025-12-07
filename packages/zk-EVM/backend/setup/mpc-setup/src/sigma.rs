use crate::contributor::{get_device_info, ContributorInfo};
use crate::{impl_read_from_json, impl_write_into_json};
use blake2::{Blake2b, Digest};
use chrono::Local;
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField};
use libs::field_structures::Tau;
use libs::group_structures::{
    G1serde, Sigma
    ,
};
use libs::iotools::SetupParams;
use serde::{Deserialize, Serialize};
use serde_json::{from_reader, to_writer_pretty};
use std::env;
use std::fs;
use std::fs::File;
use std::io::{self, BufReader, BufWriter, Write};
use std::path::PathBuf;

pub const HASH_BYTES_LEN: usize = 64;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SigmaV2 {
    pub contributor_index: usize,
   // #[serde(flatten)]
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
        g2_gen: &G2Affine,
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
    pub fn write_into_json_for_verify(&self, abs_path: PathBuf) -> io::Result<()> {
        self.sigma.write_into_json_for_verify(abs_path)
    }

    /// Write preprocess CRS into JSON
    pub fn write_into_json_for_preprocess(&self, abs_path: PathBuf) -> io::Result<()> {
        self.sigma.write_into_json_for_preprocess(abs_path)
    }

    pub fn write_into_rust_code(&self, path: &str) -> io::Result<()> {
        self.sigma.write_into_rust_code(path)
    }

}

impl AaccExt for SigmaV2{
    fn get_contributor_index (&self) -> u32 {
        self.contributor_index as u32
    }
    fn blake2b_hash(&self) -> [u8; HASH_BYTES_LEN] {
        // Serialize without the hash field
        let serialized = bincode::serialize(&self).expect("Serialization failed for Accumulator");
        let hash = Blake2b::digest(&serialized);

        let mut result = [0u8; HASH_BYTES_LEN];
        result.copy_from_slice(&hash[..HASH_BYTES_LEN]);
        result
    }
}

pub fn save_contributor_info(
    acc: &dyn AaccExt,
    duration: std::time::Duration,
    contributor_name: &str,
    location: &str,
    fpath: String,
    prev_acc_hash: String,
    prev_proof_hash: String,
    current_proof_hash: String,
) -> io::Result<()> {
    let current_date = Local::now().format("%Y-%m-%d").to_string();
    let contributor_info = ContributorInfo {
        contributor_no: acc.get_contributor_index(),
        date: current_date,
        name: contributor_name.to_string(),
        location: location.to_string(),
        devices: get_device_info().to_string(),
        prev_acc_hash,
        prev_proof_hash,
        current_acc_hash: hex::encode(acc.blake2b_hash()),
        current_proof_hash,
        time_taken_seconds: duration.as_secs_f64(),
    };

    let file = File::create(fpath)?;
    let mut writer = BufWriter::new(file);
    writer.write_all(contributor_info.to_string().as_bytes())
}

pub trait AaccExt {
    fn get_contributor_index (&self) -> u32;
    fn blake2b_hash(&self) -> [u8; HASH_BYTES_LEN];
}
