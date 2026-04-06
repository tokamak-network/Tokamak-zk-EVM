use crate::contributor::{get_device_info, ContributorInfo};
use crate::{impl_read_from_json, impl_write_into_json};
use blake2::{Blake2b, Digest};
use chrono::Local;
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField};
use icicle_core::traits::{Arithmetic, FieldImpl};
use libs::field_structures::Tau;
use libs::group_structures::{G1serde, Sigma};
use libs::iotools::{scalar_to_hex, SetupParams};
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
    #[serde(default)]
    pub public_y_hex: Option<String>,
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
        let sigma = Sigma::gen(params, tau, o_vec, l_vec, k_vec, m_vec, g1_gen, g2_gen);
        let gamma = G1serde(G1Affine::from((*g1_gen).to_projective() * tau.gamma));
        Self {
            contributor_index: 0,
            sigma,
            gamma,
            public_y_hex: None,
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

    fn parse_public_y_hex(input: &str) -> Result<ScalarField, String> {
        let trimmed = input.trim().trim_start_matches("0x");
        let mut bytes = hex::decode(trimmed)
            .map_err(|err| format!("invalid public phase-2 y hex encoding: {err}"))?;
        bytes.reverse();
        Ok(ScalarField::from_bytes_le(&bytes))
    }

    fn infer_phase2_s_max(&self) -> Option<usize> {
        self.sigma
            .sigma_1
            .eta_inv_li_o_inter_alpha4_kj
            .first()
            .map(|row| row.len())
            .filter(|len| *len > 0)
            .or_else(|| {
                self.sigma
                    .sigma_1
                    .delta_inv_li_o_prv
                    .first()
                    .map(|row| row.len())
                    .filter(|len| *len > 0)
            })
    }

    pub fn public_phase2_y(&self) -> Result<ScalarField, String> {
        let public_y_hex = self
            .public_y_hex
            .as_deref()
            .ok_or_else(|| "missing public phase-2 y disclosure".to_string())?;
        Self::parse_public_y_hex(public_y_hex)
    }

    pub fn validate_public_phase2_y(&self) -> Result<ScalarField, String> {
        let public_y = self.public_phase2_y()?;
        let inferred_s = self
            .infer_phase2_s_max()
            .ok_or_else(|| "cannot infer s_max from phase-2 accumulator shape".to_string())?;

        if public_y.pow(inferred_s) == ScalarField::one() {
            return Err("public phase-2 y is invalid because y^s_max = 1".to_string());
        }

        let expected_g1_y = self.sigma.G * public_y;
        if self.sigma.sigma_1.y != expected_g1_y {
            return Err(format!(
                "Sigma1.y does not match the disclosed phase-2 y {}",
                scalar_to_hex(&public_y)
            ));
        }

        let expected_g2_y = self.sigma.H * public_y;
        if self.sigma.sigma_2.y != expected_g2_y {
            return Err(format!(
                "Sigma2.y does not match the disclosed phase-2 y {}",
                scalar_to_hex(&public_y)
            ));
        }

        Ok(public_y)
    }
}

impl AaccExt for SigmaV2 {
    fn get_contributor_index(&self) -> u32 {
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
    fn get_contributor_index(&self) -> u32;
    fn blake2b_hash(&self) -> [u8; HASH_BYTES_LEN];
}
