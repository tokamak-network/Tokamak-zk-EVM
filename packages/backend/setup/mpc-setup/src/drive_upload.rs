use crate::sigma::FinalCrsProvenance;
use google_drive3::api::{File, Scope};
use google_drive3::hyper::client::HttpConnector;
use google_drive3::hyper::Client;
use google_drive3::hyper_rustls::{HttpsConnector, HttpsConnectorBuilder};
use google_drive3::{oauth2, DriveHub};
use oauth2::ServiceAccountAuthenticator;
use serde_json::from_slice;
use std::env;
use std::fs;
use std::fs::File as StdFile;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use thiserror::Error;
use zip::write::{ExtendedFileOptions, FileOptions};

const DRIVE_FOLDER_MIME_TYPE: &str = "application/vnd.google-apps.folder";
const PROVENANCE_FILE_NAME: &str = "crs_provenance.json";
const FINAL_OUTPUT_FILES: [&str; 4] = [
    "combined_sigma.rkyv",
    "sigma_preprocess.rkyv",
    "sigma_verify.rkyv",
    PROVENANCE_FILE_NAME,
];
const DRIVE_FOLDER_ID_ENV: &str = "TOKAMAK_MPC_DRIVE_FOLDER_ID";
const DRIVE_SERVICE_ACCOUNT_PATH_ENV: &str = "TOKAMAK_MPC_DRIVE_SERVICE_ACCOUNT_JSON_PATH";

#[derive(Debug, Clone)]
pub struct DriveUploadConfig {
    pub folder_id: String,
    pub folder_url: String,
    pub service_account_json_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct DriveUploadResult {
    pub folder_url: String,
    pub archive_name: String,
}

#[derive(Debug, Error)]
pub enum DriveUploadError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),
    #[error("drive api error: {0}")]
    DriveApi(#[from] google_drive3::Error),
}

pub fn preflight_drive_upload() -> Result<DriveUploadConfig, DriveUploadError> {
    let _ = dotenvy::dotenv();
    let config = read_drive_upload_config()?;
    let runtime = tokio::runtime::Runtime::new()
        .map_err(|err| DriveUploadError::Message(format!("cannot create tokio runtime: {err}")))?;
    runtime.block_on(validate_drive_folder(&config))?;
    Ok(config)
}

pub fn publish_output_archive(
    config: &DriveUploadConfig,
    intermediate_dir: &str,
    output_dir: &str,
) -> Result<DriveUploadResult, DriveUploadError> {
    let output_path = fs::canonicalize(output_dir).map_err(|err| {
        io::Error::new(
            err.kind(),
            format!("cannot resolve output directory {output_dir}: {err}"),
        )
    })?;
    let intermediate_path = fs::canonicalize(intermediate_dir).map_err(|err| {
        io::Error::new(
            err.kind(),
            format!("cannot resolve intermediate directory {intermediate_dir}: {err}"),
        )
    })?;

    let mut provenance = read_provenance(&output_path)?;
    let original_provenance = provenance.clone();
    let archive_name = build_archive_name(&provenance)?;
    provenance.published_folder_url = Some(config.folder_url.clone());
    provenance.published_archive_name = Some(archive_name.clone());
    write_provenance(&output_path, &provenance)?;

    let archive_path = intermediate_path.join(&archive_name);
    create_output_archive(&output_path, &archive_path)?;

    let runtime = tokio::runtime::Runtime::new()
        .map_err(|err| DriveUploadError::Message(format!("cannot create tokio runtime: {err}")))?;
    if let Err(err) = runtime.block_on(upload_archive(config, &archive_path, &archive_name)) {
        let _ = write_provenance(&output_path, &original_provenance);
        return Err(err);
    }

    Ok(DriveUploadResult {
        folder_url: config.folder_url.clone(),
        archive_name,
    })
}

fn read_drive_upload_config() -> Result<DriveUploadConfig, DriveUploadError> {
    let folder_id = read_required_env(DRIVE_FOLDER_ID_ENV)?;
    let service_account_json_path =
        PathBuf::from(read_required_env(DRIVE_SERVICE_ACCOUNT_PATH_ENV)?);

    if !service_account_json_path.exists() {
        return Err(DriveUploadError::Message(format!(
            "{} points to a missing file: {}",
            DRIVE_SERVICE_ACCOUNT_PATH_ENV,
            service_account_json_path.display()
        )));
    }

    Ok(DriveUploadConfig {
        folder_url: drive_folder_url(&folder_id),
        folder_id,
        service_account_json_path,
    })
}

fn drive_folder_url(folder_id: &str) -> String {
    format!("https://drive.google.com/drive/folders/{folder_id}")
}

fn read_required_env(key: &str) -> Result<String, DriveUploadError> {
    let value = env::var(key).map_err(|_| {
        DriveUploadError::Message(format!(
            "missing required environment variable {key}; load it through .env before running dusk_backed_mpc_setup"
        ))
    })?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(DriveUploadError::Message(format!(
            "environment variable {key} must not be empty"
        )));
    }
    Ok(trimmed.to_string())
}

fn read_provenance(output_path: &Path) -> Result<FinalCrsProvenance, DriveUploadError> {
    let bytes = fs::read(output_path.join(PROVENANCE_FILE_NAME))?;
    Ok(from_slice(&bytes)?)
}

fn write_provenance(
    output_path: &Path,
    provenance: &FinalCrsProvenance,
) -> Result<(), DriveUploadError> {
    let bytes = serde_json::to_vec_pretty(provenance)?;
    fs::write(output_path.join(PROVENANCE_FILE_NAME), bytes)?;
    Ok(())
}

fn build_archive_name(provenance: &FinalCrsProvenance) -> Result<String, DriveUploadError> {
    let generated_at =
        chrono::DateTime::parse_from_rfc3339(&provenance.generated_at_utc).map_err(|err| {
            DriveUploadError::Message(format!("invalid generated_at_utc in provenance: {err}"))
        })?;
    Ok(format!(
        "tokamak-backend-crs-v{}-{}.zip",
        provenance.backend_version,
        generated_at.format("%Y%m%dT%H%M%SZ")
    ))
}

fn create_output_archive(output_path: &Path, archive_path: &Path) -> Result<(), DriveUploadError> {
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let archive_file = StdFile::create(archive_path)?;
    let mut archive = zip::ZipWriter::new(archive_file);
    let options = FileOptions::<ExtendedFileOptions>::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for file_name in FINAL_OUTPUT_FILES {
        let file_path = output_path.join(file_name);
        let mut source = StdFile::open(&file_path)?;
        let mut bytes = Vec::new();
        source.read_to_end(&mut bytes)?;
        archive.start_file(file_name, options.clone())?;
        archive.write_all(&bytes)?;
    }

    archive.finish()?;
    Ok(())
}

async fn validate_drive_folder(config: &DriveUploadConfig) -> Result<(), DriveUploadError> {
    let hub = build_drive_hub(&config.service_account_json_path).await?;
    let (_, folder) = hub
        .files()
        .get(&config.folder_id)
        .param("fields", "id,mimeType,capabilities(canAddChildren)")
        .supports_all_drives(true)
        .add_scope(Scope::Full)
        .doit()
        .await?;

    if folder.mime_type.as_deref() != Some(DRIVE_FOLDER_MIME_TYPE) {
        return Err(DriveUploadError::Message(format!(
            "drive folder id {} does not resolve to a Google Drive folder",
            config.folder_id
        )));
    }

    let can_add_children = folder
        .capabilities
        .as_ref()
        .and_then(|capabilities| capabilities.can_add_children)
        .unwrap_or(false);
    if !can_add_children {
        return Err(DriveUploadError::Message(format!(
            "service account cannot upload into drive folder {}",
            config.folder_id
        )));
    }

    Ok(())
}

async fn upload_archive(
    config: &DriveUploadConfig,
    archive_path: &Path,
    archive_name: &str,
) -> Result<(), DriveUploadError> {
    let hub = build_drive_hub(&config.service_account_json_path).await?;
    let metadata = File {
        name: Some(archive_name.to_string()),
        mime_type: Some("application/zip".to_string()),
        parents: Some(vec![config.folder_id.clone()]),
        ..Default::default()
    };
    let file = StdFile::open(archive_path)?;
    hub.files()
        .create(metadata)
        .supports_all_drives(true)
        .add_scope(Scope::Full)
        .upload(
            file,
            "application/zip".parse().expect("zip mime type must parse"),
        )
        .await?;
    Ok(())
}

async fn build_drive_hub(
    service_account_json_path: &Path,
) -> Result<DriveHub<HttpsConnector<HttpConnector>>, DriveUploadError> {
    let service_account_json = fs::read_to_string(service_account_json_path)?;
    let key: oauth2::ServiceAccountKey = serde_json::from_str(&service_account_json)?;
    let auth = ServiceAccountAuthenticator::builder(key)
        .build()
        .await
        .map_err(|err| {
            DriveUploadError::Message(format!("cannot build service account authenticator: {err}"))
        })?;
    let https = HttpsConnectorBuilder::new()
        .with_native_roots()
        .map_err(|err| {
            DriveUploadError::Message(format!("cannot load native root certificates: {err}"))
        })?
        .https_or_http()
        .enable_http1()
        .build();
    let client = Client::builder().build(https);
    Ok(DriveHub::new(client, auth))
}
