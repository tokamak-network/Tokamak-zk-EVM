use crate::sigma::FinalCrsProvenance;
use crate::versioning::compatible_backend_version;
use google_drive3::api::{File, Permission, Scope};
use google_drive3::hyper::client::HttpConnector;
use google_drive3::hyper::Client;
use google_drive3::hyper_rustls::{HttpsConnector, HttpsConnectorBuilder};
use google_drive3::{oauth2, DriveHub};
use oauth2::authenticator_delegate::{DefaultInstalledFlowDelegate, InstalledFlowDelegate};
use serde_json::from_slice;
use std::env;
use std::fs;
use std::fs::File as StdFile;
use std::future::Future;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::pin::Pin;
use thiserror::Error;
use zip::write::{ExtendedFileOptions, FileOptions};

const DRIVE_FOLDER_MIME_TYPE: &str = "application/vnd.google-apps.folder";
const PROVENANCE_FILE_NAME: &str = "crs_provenance.json";
const BUILD_METADATA_FILE_NAME: &str = "build-metadata-mpc-setup.json";
const FINAL_OUTPUT_FILES: [&str; 4] = [
    "combined_sigma.rkyv",
    "sigma_preprocess.rkyv",
    "sigma_verify.json",
    PROVENANCE_FILE_NAME,
];
const DRIVE_FOLDER_ID_ENV: &str = "TOKAMAK_MPC_DRIVE_FOLDER_ID";
const DRIVE_OAUTH_CLIENT_PATH_ENV: &str = "TOKAMAK_MPC_DRIVE_OAUTH_CLIENT_JSON_PATH";
const DRIVE_OAUTH_TOKEN_PATH_ENV: &str = "TOKAMAK_MPC_DRIVE_OAUTH_TOKEN_PATH";

#[derive(Debug, Clone)]
pub struct DriveUploadConfig {
    pub folder_id: String,
    pub folder_url: String,
    pub oauth_client_json_path: PathBuf,
    pub oauth_token_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct DriveUploadResult {
    pub folder_url: String,
    pub archive_name: String,
    pub crs_download_url: String,
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
    let runtime = new_runtime()?;
    runtime.block_on(validate_drive_folder(&config))?;
    Ok(config)
}

pub fn validate_release_build_metadata() -> Result<PathBuf, DriveUploadError> {
    ensure_release_publish_supported()?;
    resolve_build_metadata_path()
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
    let provenance_compatible_version = validate_canonical_compatible_version(
        &provenance.backend_version,
        "crs_provenance.json backend_version",
    )?;
    if provenance_compatible_version != compatible_backend_version() {
        return Err(DriveUploadError::Message(format!(
            "crs_provenance.json backend_version {} does not match CLI compatible backend version {}",
            provenance_compatible_version,
            compatible_backend_version()
        )));
    }
    let archive_name = build_archive_name(&provenance)?;
    provenance.published_folder_url = Some(config.folder_url.clone());
    provenance.published_archive_name = Some(archive_name.clone());
    provenance.crs_download_url = None;
    write_provenance(&output_path, &provenance)?;

    let archive_path = intermediate_path.join(&archive_name);
    let build_metadata_path = resolve_build_metadata_path()?;
    create_output_archive(&output_path, &archive_path, &build_metadata_path)?;

    let runtime = new_runtime()?;
    let upload_result = match runtime.block_on(upload_archive(config, &archive_path, &archive_name))
    {
        Ok(upload_result) => upload_result,
        Err(err) => {
            let _ = write_provenance(&output_path, &original_provenance);
            return Err(err);
        }
    };
    provenance.crs_download_url = Some(upload_result.crs_download_url.clone());
    if let Err(err) = write_provenance(&output_path, &provenance) {
        let _ = write_provenance(&output_path, &original_provenance);
        return Err(err.into());
    }

    Ok(DriveUploadResult {
        folder_url: config.folder_url.clone(),
        archive_name,
        crs_download_url: upload_result.crs_download_url,
    })
}

fn read_drive_upload_config() -> Result<DriveUploadConfig, DriveUploadError> {
    let folder_id = read_required_env(DRIVE_FOLDER_ID_ENV)?;
    let oauth_client_json_path = PathBuf::from(read_required_env(DRIVE_OAUTH_CLIENT_PATH_ENV)?);
    let oauth_token_path = PathBuf::from(read_required_env(DRIVE_OAUTH_TOKEN_PATH_ENV)?);

    if !oauth_client_json_path.exists() {
        return Err(DriveUploadError::Message(format!(
            "{} points to a missing file: {}",
            DRIVE_OAUTH_CLIENT_PATH_ENV,
            oauth_client_json_path.display()
        )));
    }

    if let Some(parent) = oauth_token_path.parent() {
        fs::create_dir_all(parent)?;
    }

    Ok(DriveUploadConfig {
        folder_url: drive_folder_url(&folder_id),
        folder_id,
        oauth_client_json_path,
        oauth_token_path,
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
    validate_canonical_compatible_version(
        &provenance.backend_version,
        "crs_provenance.json backend_version",
    )?;
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
        add_file_to_archive(&mut archive, file_name, &file_path, options.clone())?;
    }

    add_file_to_archive(
        &mut archive,
        BUILD_METADATA_FILE_NAME,
        build_metadata_path,
        options.clone(),
    )?;

    archive.finish()?;
    Ok(())
}

fn add_file_to_archive(
    archive: &mut zip::ZipWriter<StdFile>,
    archive_name: &str,
    source_path: &Path,
    options: FileOptions<'_, ExtendedFileOptions>,
) -> Result<(), DriveUploadError> {
    let mut source = StdFile::open(source_path)?;
    archive.start_file(archive_name, options)?;
    io::copy(&mut source, archive)?;
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

    let compatible_version = value
        .get("compatibleBackendVersion")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            DriveUploadError::Message(format!(
                "{} is missing compatibleBackendVersion",
                path.display()
            ))
        })?;
    let normalized_compatible = validate_canonical_compatible_version(
        compatible_version,
        "build metadata compatibleBackendVersion",
    )?;
    if normalized_compatible != compatible_backend_version() {
        return Err(DriveUploadError::Message(format!(
            "{} has compatibleBackendVersion {}; expected {}",
            path.display(),
            normalized_compatible,
            compatible_backend_version()
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

    let subcircuit_version = value
        .get("dependencies")
        .and_then(|dependencies| dependencies.get("subcircuitLibrary"))
        .and_then(|dependency| dependency.get("buildVersion"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            DriveUploadError::Message(format!(
                "{} is missing dependencies.subcircuitLibrary.buildVersion",
                path.display()
            ))
        })?;
    if subcircuit_version != env!("CARGO_PKG_VERSION") {
        return Err(DriveUploadError::Message(format!(
            "{} embeds subcircuit-library {}; expected backend workspace version {}",
            path.display(),
            subcircuit_version,
            env!("CARGO_PKG_VERSION")
        )));
    }

    Ok(())
}

fn validate_canonical_compatible_version(
    value: &str,
    label: &str,
) -> Result<String, DriveUploadError> {
    let parts = value.split('.').collect::<Vec<_>>();
    if parts.len() != 2
        || parts
            .iter()
            .any(|part| part.is_empty() || !part.chars().all(|ch| ch.is_ascii_digit()))
    {
        return Err(DriveUploadError::Message(format!(
            "{label} must be strict MAJOR.MINOR, got {value:?}"
        )));
    }
    Ok(format!(
        "{}.{}",
        parts[0].parse::<u64>().map_err(|err| {
            DriveUploadError::Message(format!("{label} major version is invalid: {err}"))
        })?,
        parts[1].parse::<u64>().map_err(|err| {
            DriveUploadError::Message(format!("{label} minor version is invalid: {err}"))
        })?
    ))
}

#[cfg(tokamak_release_profile)]
fn ensure_release_publish_supported() -> Result<(), DriveUploadError> {
    Ok(())
}

#[cfg(not(tokamak_release_profile))]
fn ensure_release_publish_supported() -> Result<(), DriveUploadError> {
    Err(DriveUploadError::Message(
        "dusk-backed Google Drive publication is only supported in release builds".to_string(),
    ))
}

async fn validate_drive_folder(config: &DriveUploadConfig) -> Result<(), DriveUploadError> {
    let hub = build_drive_hub(config).await?;
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
            "authenticated Google Drive user cannot upload into drive folder {}",
            config.folder_id
        )));
    }

    let archive_prefix = archive_version_prefix();
    let list_query = format!(
        "'{}' in parents and trashed = false and mimeType = 'application/zip'",
        config.folder_id
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
        let existing_names = existing_files
            .into_iter()
            .filter_map(|file| file.name)
            .filter(|name| name.starts_with(&archive_prefix))
            .collect::<Vec<_>>();
        if !existing_names.is_empty() {
            return Err(DriveUploadError::Message(format!(
                "drive folder {} already contains CRS archive(s) for backend compatibility version {}: {}; bump the backend compatible version before publishing again",
                config.folder_id,
                compatible_backend_version(),
                existing_names.join(", ")
            )));
        }
    }

    Ok(())
}

fn archive_version_prefix() -> String {
    format!("tokamak-backend-crs-v{}-", compatible_backend_version())
}

fn new_runtime() -> Result<tokio::runtime::Runtime, DriveUploadError> {
    tokio::runtime::Runtime::new()
        .map_err(|err| DriveUploadError::Message(format!("cannot create tokio runtime: {err}")))
}

async fn upload_archive(
    config: &DriveUploadConfig,
    archive_path: &Path,
    archive_name: &str,
) -> Result<DriveUploadResult, DriveUploadError> {
    let hub = build_drive_hub(config).await?;
    let metadata = File {
        name: Some(archive_name.to_string()),
        mime_type: Some("application/zip".to_string()),
        parents: Some(vec![config.folder_id.clone()]),
        ..Default::default()
    };
    let file = StdFile::open(archive_path)?;
    let (_, uploaded_file) = hub
        .files()
        .create(metadata)
        .supports_all_drives(true)
        .add_scope(Scope::Full)
        .upload(
            file,
            "application/zip".parse().expect("zip mime type must parse"),
        )
        .await?;
    let file_id = uploaded_file.id.ok_or_else(|| {
        DriveUploadError::Message(format!(
            "drive upload for {archive_name} succeeded without returning a file id"
        ))
    })?;
    configure_public_archive_access(&hub, &file_id, archive_name).await?;
    Ok(DriveUploadResult {
        folder_url: config.folder_url.clone(),
        archive_name: archive_name.to_string(),
        crs_download_url: drive_file_download_url(&file_id),
    })
}

fn drive_file_download_url(file_id: &str) -> String {
    format!("https://drive.google.com/uc?id={file_id}&export=download")
}

async fn configure_public_archive_access(
    hub: &DriveHub<HttpsConnector<HttpConnector>>,
    file_id: &str,
    archive_name: &str,
) -> Result<(), DriveUploadError> {
    let permission = Permission {
        type_: Some("anyone".to_string()),
        role: Some("reader".to_string()),
        allow_file_discovery: Some(false),
        ..Default::default()
    };
    hub.permissions()
        .create(permission, file_id)
        .supports_all_drives(true)
        .add_scope(Scope::Full)
        .doit()
        .await
        .map_err(|err| {
            DriveUploadError::Message(format!(
                "uploaded archive {archive_name} but failed to grant anyone-with-link viewer access: {err}"
            ))
        })?;

    let file_metadata = File {
        copy_requires_writer_permission: Some(false),
        ..Default::default()
    };
    hub.files()
        .update(file_metadata, file_id)
        .supports_all_drives(true)
        .add_scope(Scope::Full)
        .doit_without_upload()
        .await
        .map_err(|err| {
            DriveUploadError::Message(format!(
                "uploaded archive {archive_name} but failed to allow viewers to download, print, and copy it: {err}"
            ))
        })?;

    Ok(())
}

#[derive(Copy, Clone)]
struct DriveOauthBrowserDelegate;

impl InstalledFlowDelegate for DriveOauthBrowserDelegate {
    fn present_user_url<'a>(
        &'a self,
        url: &'a str,
        need_code: bool,
    ) -> Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'a>> {
        Box::pin(async move {
            if webbrowser::open(url).is_ok() {
                println!("Opened a browser window for Google Drive login.");
            }
            let delegate = DefaultInstalledFlowDelegate;
            delegate.present_user_url(url, need_code).await
        })
    }
}

async fn build_drive_hub(
    config: &DriveUploadConfig,
) -> Result<DriveHub<HttpsConnector<HttpConnector>>, DriveUploadError> {
    let app_secret = oauth2::read_application_secret(&config.oauth_client_json_path)
        .await
        .map_err(|err| {
            DriveUploadError::Message(format!(
                "cannot read OAuth client JSON from {}: {err}",
                config.oauth_client_json_path.display()
            ))
        })?;
    let auth = oauth2::InstalledFlowAuthenticator::builder(
        app_secret,
        oauth2::InstalledFlowReturnMethod::HTTPRedirect,
    )
    .persist_tokens_to_disk(&config.oauth_token_path)
    .flow_delegate(Box::new(DriveOauthBrowserDelegate))
    .build()
    .await
    .map_err(|err| {
        DriveUploadError::Message(format!(
            "cannot build Google Drive OAuth authenticator: {err}"
        ))
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
