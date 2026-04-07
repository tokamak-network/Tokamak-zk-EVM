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
use rkyv::ser::Serializer as _;
use rkyv::{
    check_archived_value, Archive, Deserialize as RkyvDeserialize, Serialize as RkyvSerialize,
};
use serde::{Deserialize, Serialize};
use serde_json::{from_reader, to_writer_pretty};
use std::env;
use std::fs;
use std::fs::File;
use std::io::{self, BufReader, BufWriter, Write};
use std::path::PathBuf;

pub const HASH_BYTES_LEN: usize = 64;
const PHASE2_ACC_MAGIC: &[u8; 8] = b"P2ACCRKY";
const PHASE2_ACC_HEADER_LEN: usize = PHASE2_ACC_MAGIC.len() + std::mem::size_of::<u64>();

#[derive(
    Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Archive, RkyvSerialize, RkyvDeserialize,
)]
#[archive(check_bytes)]
pub struct DuskSourceProvenance {
    pub source_path: String,
    pub source_size_bytes: u64,
    pub raw_encoding: String,
    pub pinned_contribution: String,
    pub pinned_readme_url: String,
    pub pinned_drive_file_id: String,
    pub expected_source_sha256: String,
    pub actual_source_sha256: String,
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

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct FinalCrsProvenance {
    pub phase1_source_provenance: Option<Phase1SourceProvenance>,
    pub combined_sigma_sha256: String,
    pub sigma_preprocess_sha256: String,
    pub sigma_verify_sha256: String,
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
        if bytes.len() < PHASE2_ACC_HEADER_LEN {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "phase-2 accumulator archive is too short: expected at least {PHASE2_ACC_HEADER_LEN} bytes, got {}",
                    bytes.len()
                ),
            ));
        }
        if &bytes[..PHASE2_ACC_MAGIC.len()] != PHASE2_ACC_MAGIC {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "unsupported phase-2 accumulator archive format",
            ));
        }
        let pos_offset = PHASE2_ACC_MAGIC.len();
        let archived_pos = u64::from_le_bytes(
            bytes[pos_offset..pos_offset + std::mem::size_of::<u64>()]
                .try_into()
                .expect("phase-2 accumulator position header has fixed width"),
        ) as usize;
        let payload = &bytes[PHASE2_ACC_HEADER_LEN..];
        let mut aligned_bytes = rkyv::AlignedVec::with_capacity(payload.len());
        aligned_bytes.extend_from_slice(payload);
        let archived =
            check_archived_value::<SigmaV2Rkyv>(&aligned_bytes, archived_pos).map_err(|err| {
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
        let mut serializer = rkyv::ser::serializers::AllocSerializer::<256>::default();
        let archived_pos = serializer
            .serialize_value(&archive)
            .map_err(io::Error::other)? as u64;
        let archived_bytes = serializer.into_serializer().into_inner();
        let mut file_bytes = Vec::with_capacity(PHASE2_ACC_HEADER_LEN + archived_bytes.len());
        file_bytes.extend_from_slice(PHASE2_ACC_MAGIC);
        file_bytes.extend_from_slice(&archived_pos.to_le_bytes());
        file_bytes.extend_from_slice(archived_bytes.as_ref());
        fs::write(&archive_path, file_bytes)
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

#[cfg(test)]
mod tests {
    use super::*;
    use libs::group_structures::{G2serde, Sigma1, Sigma2};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn empty_sigma() -> Sigma {
        Sigma {
            G: G1serde::zero(),
            H: G2serde::zero(),
            sigma_1: Sigma1 {
                xy_powers: Vec::new().into_boxed_slice(),
                x: G1serde::zero(),
                y: G1serde::zero(),
                delta: G1serde::zero(),
                eta: G1serde::zero(),
                gamma_inv_o_inst: Vec::new().into_boxed_slice(),
                eta_inv_li_o_inter_alpha4_kj: Vec::new().into_boxed_slice(),
                delta_inv_li_o_prv: Vec::new().into_boxed_slice(),
                delta_inv_alphak_xh_tx: Vec::new().into_boxed_slice(),
                delta_inv_alpha4_xj_tx: Vec::new().into_boxed_slice(),
                delta_inv_alphak_yi_ty: Vec::new().into_boxed_slice(),
            },
            sigma_2: Sigma2 {
                alpha: G2serde::zero(),
                alpha2: G2serde::zero(),
                alpha3: G2serde::zero(),
                alpha4: G2serde::zero(),
                gamma: G2serde::zero(),
                delta: G2serde::zero(),
                eta: G2serde::zero(),
                x: G2serde::zero(),
                y: G2serde::zero(),
            },
            lagrange_KL: G1serde::zero(),
        }
    }

    #[test]
    fn phase2_acc_rkyv_roundtrip() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock drift before unix epoch")
            .as_nanos();
        let relative_path = format!("/tmp/phase2_acc_roundtrip_{nonce}.rkyv");
        let sigma = SigmaV2 {
            contributor_index: 7,
            sigma: empty_sigma(),
            gamma: G1serde::zero(),
            public_y_hex: Some("0x05".to_string()),
            phase1_source_provenance: Some(Phase1SourceProvenance::Native),
        };

        sigma
            .write_phase2_acc(&relative_path)
            .expect("failed to write phase-2 accumulator archive");
        let loaded = SigmaV2::read_phase2_acc(&relative_path)
            .expect("failed to read phase-2 accumulator archive");

        assert_eq!(loaded.contributor_index, 7);
        assert_eq!(loaded.public_y_hex.as_deref(), Some("0x05"));
        assert_eq!(
            loaded.phase1_source_provenance,
            Some(Phase1SourceProvenance::Native)
        );
        assert_eq!(loaded.sigma.sigma_1.xy_powers.len(), 0);
        assert_eq!(loaded.sigma.sigma_1.gamma_inv_o_inst.len(), 0);

        fs::remove_file(SigmaV2::phase2_acc_rkyv_path(&relative_path).unwrap())
            .expect("failed to clean up temporary phase-2 accumulator archive");
    }
}
