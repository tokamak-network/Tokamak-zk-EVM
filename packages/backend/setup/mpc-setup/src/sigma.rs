use crate::contributor::{get_device_info, ContributorInfo};
use crate::{impl_read_from_json, impl_write_into_json};
use blake2::{Blake2b, Digest};
use chrono::Local;
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField};
use icicle_core::traits::FieldImpl;
use libs::field_structures::Tau;
use libs::group_structures::{G1serde, Sigma};
use libs::iotools::SetupParams;
use libs::iotools::{ArchivedG1SerdeRkyv, ArchivedSigma1Rkyv, G1SerdeRkyv, Sigma1Rkyv, SigmaRkyv};
use rkyv::{
    check_archived_root, Archive, Deserialize as RkyvDeserialize, Serialize as RkyvSerialize,
};
use serde::{Deserialize, Serialize};
use serde_json::{from_reader, to_writer_pretty};
use std::env;
use std::fs;
use std::fs::File;
use std::io::{self, BufReader, BufWriter, Write};
use std::path::PathBuf;

pub const HASH_BYTES_LEN: usize = 64;

#[derive(
    Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Archive, RkyvSerialize, RkyvDeserialize,
)]
#[archive(check_bytes)]
pub struct DuskSourceProvenance {
    pub source_path: String,
    pub source_size_bytes: u64,
    pub raw_encoding: String,
    pub auto_downloaded: bool,
    pub downloaded_contribution: Option<String>,
    pub downloaded_readme_url: Option<String>,
    pub downloaded_drive_file_id: Option<String>,
    pub max_g1_exp_used: usize,
    pub max_g2_exp_used: usize,
    pub transcript_consistency_verified: bool,
}

#[derive(
    Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Archive, RkyvSerialize, RkyvDeserialize,
)]
#[archive(check_bytes)]
pub enum Phase1SourceProvenance {
    Native,
    DuskGroth16(DuskSourceProvenance),
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SigmaV2 {
    pub contributor_index: usize,
    // #[serde(flatten)]
    pub sigma: Sigma,
    pub gamma: G1serde,
    #[serde(default)]
    pub public_y_hex: Option<String>,
    #[serde(default)]
    pub phase1_source_provenance: Option<Phase1SourceProvenance>,
}
impl_read_from_json!(SigmaV2);
impl_write_into_json!(SigmaV2);

#[derive(Debug, Archive, RkyvSerialize, RkyvDeserialize)]
#[archive(check_bytes)]
struct SigmaV2Rkyv {
    contributor_index: usize,
    sigma: SigmaRkyv,
    gamma: G1SerdeRkyv,
    public_y_hex: Option<String>,
    phase1_source_provenance: Option<Phase1SourceProvenance>,
}

impl SigmaV2Rkyv {
    fn from_sigma_v2(value: &SigmaV2) -> Self {
        Self {
            contributor_index: value.contributor_index,
            sigma: SigmaRkyv::from_sigma(&value.sigma),
            gamma: G1SerdeRkyv::from_g1serde(&value.gamma),
            public_y_hex: value.public_y_hex.clone(),
            phase1_source_provenance: value.phase1_source_provenance.clone(),
        }
    }
}

impl SigmaV2 {
    fn phase2_acc_rkyv_path(path: &str) -> io::Result<PathBuf> {
        Ok(env::current_dir()?.join(path))
    }

    pub fn read_phase2_acc(path: &str) -> io::Result<Self> {
        let archive_path = Self::phase2_acc_rkyv_path(path)?;
        let bytes = fs::read(&archive_path)?;
        let archived = check_archived_root::<SigmaV2Rkyv>(&bytes).map_err(|err| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("failed to validate phase-2 accumulator archive: {err}"),
            )
        })?;
        Ok(Self {
            contributor_index: archived.contributor_index as usize,
            sigma: archived_sigma_to_sigma(&archived.sigma),
            gamma: archived.gamma.to_g1serde(),
            public_y_hex: archived
                .public_y_hex
                .as_ref()
                .map(|value| value.as_str().to_string()),
            phase1_source_provenance: archived.phase1_source_provenance.as_ref().map(|value| {
                value
                    .deserialize(&mut rkyv::Infallible)
                    .expect("cannot deserialize phase-1 source provenance")
            }),
        })
    }

    pub fn write_phase2_acc(&self, path: &str) -> io::Result<()> {
        let archive_path = Self::phase2_acc_rkyv_path(path)?;
        if let Some(parent) = archive_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let archive = SigmaV2Rkyv::from_sigma_v2(self);
        let bytes = rkyv::to_bytes::<_, 256>(&archive).map_err(io::Error::other)?;
        fs::write(&archive_path, bytes)
    }

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
            phase1_source_provenance: None,
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

    pub fn public_phase2_y(&self) -> Result<ScalarField, String> {
        let public_y_hex = self
            .public_y_hex
            .as_deref()
            .ok_or_else(|| "missing public phase-2 y disclosure".to_string())?;
        Self::parse_public_y_hex(public_y_hex)
    }
}

fn archived_sigma_to_sigma(archived: &rkyv::Archived<SigmaRkyv>) -> Sigma {
    Sigma {
        G: archived.G.to_g1serde(),
        H: archived.H.to_g2serde(),
        sigma_1: archived_sigma1_to_sigma1(&archived.sigma_1),
        sigma_2: archived.sigma_2.to_sigma2(),
        lagrange_KL: archived.lagrange_KL.to_g1serde(),
    }
}

fn archived_sigma1_to_sigma1(archived: &ArchivedSigma1Rkyv) -> libs::group_structures::Sigma1 {
    libs::group_structures::Sigma1 {
        xy_powers: archived_g1_slice_to_box(&archived.xy_powers),
        x: archived.x.to_g1serde(),
        y: archived.y.to_g1serde(),
        delta: archived.delta.to_g1serde(),
        eta: archived.eta.to_g1serde(),
        gamma_inv_o_inst: archived_g1_slice_to_box(&archived.gamma_inv_o_inst),
        eta_inv_li_o_inter_alpha4_kj: archived_g1_matrix_to_box(
            &archived.eta_inv_li_o_inter_alpha4_kj,
        ),
        delta_inv_li_o_prv: archived_g1_matrix_to_box(&archived.delta_inv_li_o_prv),
        delta_inv_alphak_xh_tx: archived_g1_matrix_to_box(&archived.delta_inv_alphak_xh_tx),
        delta_inv_alpha4_xj_tx: archived_g1_slice_to_box(&archived.delta_inv_alpha4_xj_tx),
        delta_inv_alphak_yi_ty: archived_g1_matrix_to_box(&archived.delta_inv_alphak_yi_ty),
    }
}

fn archived_g1_slice_to_box(slice: &[ArchivedG1SerdeRkyv]) -> Box<[G1serde]> {
    slice
        .iter()
        .map(ArchivedG1SerdeRkyv::to_g1serde)
        .collect::<Vec<_>>()
        .into_boxed_slice()
}

fn archived_g1_matrix_to_box(
    matrix: &rkyv::vec::ArchivedVec<rkyv::vec::ArchivedVec<ArchivedG1SerdeRkyv>>,
) -> Box<[Box<[G1serde]>]> {
    matrix
        .iter()
        .map(|row| {
            row.iter()
                .map(ArchivedG1SerdeRkyv::to_g1serde)
                .collect::<Vec<_>>()
                .into_boxed_slice()
        })
        .collect::<Vec<_>>()
        .into_boxed_slice()
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
