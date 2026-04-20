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
const BUILD_METADATA_FILE_NAME: &str = "build-metadata-mpc-setup.json";
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
    ensure_release_publish_supported()?;
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
    ensure_release_publish_supported()?;
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
    let build_metadata_path = resolve_build_metadata_path()?;
    create_output_archive(&output_path, &archive_path, &build_metadata_path)?;

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

fn create_output_archive(
    output_path: &Path,
    archive_path: &Path,
    build_metadata_path: &Path,
) -> Result<(), DriveUploadError> {
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

    let mut source = StdFile::open(build_metadata_path)?;
    let mut bytes = Vec::new();
    source.read_to_end(&mut bytes)?;
    archive.start_file(BUILD_METADATA_FILE_NAME, options.clone())?;
    archive.write_all(&bytes)?;

    archive.finish()?;
    Ok(())
}

fn resolve_build_metadata_path() -> Result<PathBuf, DriveUploadError> {
    let mut candidates = Vec::new();

    if let Ok(executable_path) = env::current_exe() {
        if let Some(parent) = executable_path.parent() {
            candidates.push(parent.join(BUILD_METADATA_FILE_NAME));
        }
    }

    let manifest_candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/release")
        .join(BUILD_METADATA_FILE_NAME);
    candidates.push(manifest_candidate);

    for candidate in candidates {
        if candidate.exists() {
            validate_build_metadata(&candidate)?;
            return Ok(candidate);
        }
    }

    Err(DriveUploadError::Message(format!(
        "cannot locate {}; expected it next to the executing binary or under packages/backend/target/release",
        BUILD_METADATA_FILE_NAME
    )))
}

fn validate_build_metadata(path: &Path) -> Result<(), DriveUploadError> {
    let value: serde_json::Value = serde_json::from_slice(&fs::read(path)?)?;
    let package_name = value
        .get("packageName")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            DriveUploadError::Message(format!("{} is missing packageName", path.display()))
        })?;
    if package_name != "mpc-setup" {
        return Err(DriveUploadError::Message(format!(
            "{} has unexpected packageName {}; expected mpc-setup",
            path.display(),
            package_name
        )));
    }

    let package_version = value
        .get("packageVersion")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            DriveUploadError::Message(format!("{} is missing packageVersion", path.display()))
        })?;
    if package_version != env!("CARGO_PKG_VERSION") {
        return Err(DriveUploadError::Message(format!(
            "{} has stale packageVersion {}; expected {}",
            path.display(),
            package_version,
            env!("CARGO_PKG_VERSION")
        )));
    }

    let runtime_mode = value
        .get("dependencies")
        .and_then(|dependencies| dependencies.get("subcircuitLibrary"))
        .and_then(|dependency| dependency.get("runtimeMode"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            DriveUploadError::Message(format!(
                "{} is missing dependencies.subcircuitLibrary.runtimeMode",
                path.display()
            ))
        })?;
    if runtime_mode != "bundled" {
        return Err(DriveUploadError::Message(format!(
            "{} has unexpected subcircuitLibrary runtimeMode {}; expected bundled",
            path.display(),
            runtime_mode
        )));
    }

    Ok(())
}

#[cfg(tokamak_embedded_subcircuit_library)]
fn ensure_release_publish_supported() -> Result<(), DriveUploadError> {
    Ok(())
}

#[cfg(not(tokamak_embedded_subcircuit_library))]
fn ensure_release_publish_supported() -> Result<(), DriveUploadError> {
    Err(DriveUploadError::Message(
        "dusk-backed Google Drive publication is only supported in release builds with embedded subcircuit library assets".to_string(),
    ))
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

    let archive_prefix = archive_version_prefix();
    let list_query = format!(
        "'{}' in parents and trashed = false and mimeType != '{}' and name contains '{}'",
        config.folder_id, DRIVE_FOLDER_MIME_TYPE, archive_prefix
    );
    let (_, listing) = hub
        .files()
        .list()
        .q(&list_query)
        .param("fields", "files(id,name)")
        .page_size(10)
        .supports_all_drives(true)
        .include_items_from_all_drives(true)
        .add_scope(Scope::Full)
        .doit()
        .await?;
    if let Some(existing_files) = listing.files {
        if !existing_files.is_empty() {
            let existing_names = existing_files
                .into_iter()
                .filter_map(|file| file.name)
                .collect::<Vec<_>>()
                .join(", ");
            return Err(DriveUploadError::Message(format!(
                "drive folder {} already contains CRS archive(s) for backend version {}: {}; bump the backend version before publishing again",
                config.folder_id,
                env!("CARGO_PKG_VERSION"),
                existing_names
            )));
        }
    }

    Ok(())
}

fn archive_version_prefix() -> String {
    format!("tokamak-backend-crs-v{}-", env!("CARGO_PKG_VERSION"))
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
