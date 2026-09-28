use crate::compatibility::{compatibility_from_package_version, parse_compatible_backend_version};
use crate::crs_provenance::{
    parse_crs_provenance, CrsGenerationMethod, CrsProvenance, SubcircuitLibraryProvenance,
    CRS_DOCUMENT_KIND, CRS_PROVENANCE_FILE_NAME,
};
use crate::errors::CrsError;
use crate::univariate_crs::UNIVARIATE_CRS_SCHEMA_ID;
use crate::univariate_setup::SetupCrsDigests;
use clap::Args;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
#[cfg(tokamak_embedded_subcircuit_library)]
use std::io;
use std::path::{Path, PathBuf};
#[cfg(tokamak_embedded_subcircuit_library)]
use std::sync::OnceLock;
#[cfg(tokamak_embedded_subcircuit_library)]
use std::time::Duration;

include!(concat!(env!("OUT_DIR"), "/embedded_subcircuit_library.rs"));

const SUBCIRCUIT_LIBRARY_PACKAGE_NAME: &str = "@tokamak-zk-evm/subcircuit-library";

#[cfg(tokamak_embedded_subcircuit_library)]
static MATERIALIZED_PATH: OnceLock<PathBuf> = OnceLock::new();

#[cfg(not(tokamak_embedded_subcircuit_library))]
#[derive(Args, Debug, Clone)]
pub struct SubcircuitLibraryArg {
    /// Subcircuit library directory produced by the QAP compiler
    #[arg(long, value_name = "PATH")]
    pub subcircuit_library: String,
}

#[cfg(tokamak_embedded_subcircuit_library)]
#[derive(Args, Debug, Clone, Default)]
pub struct SubcircuitLibraryArg {}

impl SubcircuitLibraryArg {
    #[cfg(not(tokamak_embedded_subcircuit_library))]
    pub fn as_deref(&self) -> Option<&str> {
        Some(self.subcircuit_library.as_str())
    }

    #[cfg(tokamak_embedded_subcircuit_library)]
    pub fn as_deref(&self) -> Option<&str> {
        None
    }
}

/// Development-only opt-in for skipping CRS compatibility validation.
#[cfg(all(
    feature = "development-crs-bypass",
    not(tokamak_embedded_subcircuit_library)
))]
#[derive(Args, Debug, Clone, Default)]
pub struct DevelopmentCrsProvenanceArg {
    /// Skip CRS compatibility validation for local development only
    #[arg(long)]
    allow_unverified_crs: bool,
}

#[cfg(not(all(
    feature = "development-crs-bypass",
    not(tokamak_embedded_subcircuit_library)
)))]
#[derive(Args, Debug, Clone, Default)]
pub struct DevelopmentCrsProvenanceArg {}

impl DevelopmentCrsProvenanceArg {
    pub fn allows_unverified_crs(&self) -> bool {
        #[cfg(all(
            feature = "development-crs-bypass",
            not(tokamak_embedded_subcircuit_library)
        ))]
        {
            return self.allow_unverified_crs;
        }

        #[cfg(not(all(
            feature = "development-crs-bypass",
            not(tokamak_embedded_subcircuit_library)
        )))]
        false
    }
}

pub fn try_resolve_subcircuit_library_path(local_path: Option<&str>) -> Result<PathBuf, CrsError> {
    if let Some(path) = local_path {
        return fs::canonicalize(path).map_err(|source| CrsError::Read {
            path: PathBuf::from(path),
            source,
        });
    }

    #[cfg(tokamak_embedded_subcircuit_library)]
    {
        return materialize_embedded_subcircuit_library().map_err(|source| CrsError::Read {
            path: PathBuf::from("embedded subcircuit library"),
            source,
        });
    }

    #[cfg(not(tokamak_embedded_subcircuit_library))]
    {
        Err(CrsError::Compatibility(
            "--subcircuit-library is required for non-release backend binaries".to_string(),
        ))
    }
}

pub fn validate_crs_compatibility(crs_dir: &Path, library_dir: &Path) -> std::io::Result<()> {
    let provenance_path = crs_dir.join(CRS_PROVENANCE_FILE_NAME);
    let provenance_bytes = fs::read(&provenance_path).map_err(|source| {
        std::io::Error::new(
            source.kind(),
            format!(
                "cannot read CRS provenance {}: {source}",
                provenance_path.display()
            ),
        )
    })?;
    let provenance = parse_crs_provenance(&provenance_bytes).map_err(|reason| {
        std::io::Error::other(format!(
            "cannot validate CRS provenance {}: {reason}",
            provenance_path.display()
        ))
    })?;
    let crs_compatible_version = provenance.compatible_backend_version;
    let crs_compatible_version = parse_compatible_backend_version(&crs_compatible_version)
        .map(|version| version.to_string())
        .map_err(|error| {
            std::io::Error::other(format!("CRS provenance compatibleBackendVersion {error}"))
        })?;
    let compiled_backend_version = compatibility_from_package_version(env!("CARGO_PKG_VERSION"))
        .map(|version| version.to_string())
        .map_err(|error| {
            std::io::Error::other(format!("compiled backend package version {error}"))
        })?;

    if crs_compatible_version != compiled_backend_version {
        return Err(std::io::Error::other(format!(
            "CRS compatibility version {} does not match compiled backend compatibility class {}",
            crs_compatible_version, compiled_backend_version
        )));
    }

    let library_version = selected_library_package_version(library_dir)?;
    let library_compatible_version = compatibility_from_package_version(&library_version)
        .map(|version| version.to_string())
        .map_err(|error| {
            std::io::Error::other(format!("subcircuit-library package version {error}"))
        })?;

    if crs_compatible_version != library_compatible_version {
        return Err(std::io::Error::other(format!(
            "CRS compatibility version {} does not match subcircuit-library package version {} (compatibility class {})",
            crs_compatible_version, library_version, library_compatible_version
        )));
    }

    Ok(())
}

pub fn write_development_only_univariate_keys_provenance(
    output_dir: &Path,
    library: SubcircuitLibraryProvenance,
    digests: &SetupCrsDigests,
) -> std::io::Result<()> {
    let provenance = CrsProvenance {
        document_kind: CRS_DOCUMENT_KIND.to_string(),
        protocol_schema_id: UNIVARIATE_CRS_SCHEMA_ID.to_string(),
        generation_method: CrsGenerationMethod::TrustedSetup,
        release_eligible: false,
        generated_at_utc: chrono::Utc::now().to_rfc3339(),
        compatible_backend_version: compatibility_from_package_version(env!("CARGO_PKG_VERSION"))
            .map_err(std::io::Error::other)?
            .to_string(),
        subcircuit_library: library,
        artifacts: [
            (
                "tau_sequence.rkyv".to_string(),
                digests.tau_sequence_sha256.clone(),
            ),
            (
                "prover_keys.rkyv".to_string(),
                digests.prover_keys_sha256.clone(),
            ),
            (
                "preprocess_keys.rkyv".to_string(),
                digests.preprocess_keys_sha256.clone(),
            ),
            (
                "verifier_keys.rkyv".to_string(),
                digests.verifier_keys_sha256.clone(),
            ),
        ]
        .into(),
        phase1_source_provenance: None,
        ceremony_protocol_version: None,
        ceremony_transcript_sha256: None,
        phase2_contribution_count: None,
    };
    crate::crs_provenance::write_crs_provenance(output_dir, &provenance)
}

pub fn validate_operational_crs_compatibility(
    development: &DevelopmentCrsProvenanceArg,
    crs_dir: &Path,
    library_dir: &Path,
) -> Result<(), CrsError> {
    if development.allows_unverified_crs() {
        eprintln!(
            "WARNING: skipping CRS provenance compatibility validation for local development"
        );
        return Ok(());
    }

    validate_crs_compatibility(crs_dir, library_dir)
        .map_err(|error| CrsError::Compatibility(error.to_string()))
}

/// Owned bytes from one validated invocation; never a persistent identity cache.
pub struct ValidatedUnivariateCrsBytes {
    pub tau: Vec<u8>,
    pub prover_keys: Vec<u8>,
}

pub fn validate_operational_univariate_crs_compatibility(
    development: &DevelopmentCrsProvenanceArg,
    tau_sequence_path: &Path,
    keys_dir: &Path,
    library_dir: &Path,
    check_digests: bool,
) -> Result<Option<ValidatedUnivariateCrsBytes>, CrsError> {
    if development.allows_unverified_crs() {
        if check_digests {
            return Err(CrsError::Compatibility(
                "--check-digests cannot be combined with --allow-unverified-crs".to_string(),
            ));
        }
        eprintln!(
            "WARNING: skipping CRS provenance compatibility validation for local development"
        );
        return Ok(None);
    }
    let provenance = read_univariate_crs_identity(keys_dir)?;
    if !check_digests {
        // Decode and validate the consumed CRS later; no payload or source hashing here.
        return Ok(None);
    }
    let mut payloads = validate_univariate_payloads(&[
        (
            tau_sequence_path.to_path_buf(),
            provenance.artifacts["tau_sequence.rkyv"].clone(),
            "tau",
        ),
        (
            keys_dir.join(crate::crs_artifacts::PROVER_KEYS_RKYV_FILE_NAME),
            provenance.artifacts["prover_keys.rkyv"].clone(),
            "prover_keys",
        ),
        (
            keys_dir.join(crate::crs_artifacts::VERIFIER_KEYS_RKYV_FILE_NAME),
            provenance.artifacts["verifier_keys.rkyv"].clone(),
            "verifier_keys",
        ),
    ])?;
    #[cfg(feature = "timing")]
    let _library = crate::timing::SpanGuard::new("univariate.identity.library", "identity", vec![]);
    let expected = selected_subcircuit_library_provenance(library_dir)
        .map_err(|error| CrsError::Compatibility(error.to_string()))?;
    if provenance.subcircuit_library.package_name != expected.package_name
        || provenance.subcircuit_library.origin != expected.origin
        || provenance.subcircuit_library.source_digest != expected.source_digest
    {
        return Err(CrsError::Compatibility(
            "univariate CRS subcircuit-library identity does not match the selected library"
                .to_string(),
        ));
    }
    payloads.pop(); // The verifier digest is checked, but prove does not consume its bytes.
    let prover_keys = payloads.pop().expect("three validated payloads");
    let tau = payloads.pop().expect("three validated payloads");
    Ok(Some(ValidatedUnivariateCrsBytes { tau, prover_keys }))
}

/// Metadata-only identity shared by native CRS consumers. Does not open other
/// role payloads, hash circuit sources, or impose publication eligibility.
pub fn read_univariate_crs_identity(keys_dir: &Path) -> Result<CrsProvenance, CrsError> {
    let provenance_path = keys_dir.join(CRS_PROVENANCE_FILE_NAME);
    let bytes = fs::read(&provenance_path).map_err(|source| {
        CrsError::Compatibility(format!(
            "cannot read CRS provenance {}: {source}",
            provenance_path.display()
        ))
    })?;
    let provenance =
        crate::crs_provenance::parse_crs_provenance(&bytes).map_err(CrsError::Compatibility)?;
    provenance
        .require_protocol(UNIVARIATE_CRS_SCHEMA_ID)
        .map_err(CrsError::Compatibility)?;
    let compiled_compatibility = compatibility_from_package_version(env!("CARGO_PKG_VERSION"))
        .map_err(|error| CrsError::Compatibility(error.to_string()))?
        .to_string();
    if provenance.compatible_backend_version != compiled_compatibility {
        return Err(CrsError::Compatibility(
            "CRS compatibleBackendVersion does not match the compiled backend".into(),
        ));
    }
    {
        let (origin, version) = selected_subcircuit_library_package_identity();
        let library_compatibility =
            compatibility_from_package_version(&provenance.subcircuit_library.package_version)
                .map_err(|error| CrsError::Compatibility(error.to_string()))?;
        let selected_compatibility = compatibility_from_package_version(&version)
            .map_err(|error| CrsError::Compatibility(error.to_string()))?;
        #[cfg(tokamak_embedded_subcircuit_library)]
        let source_matches = provenance.subcircuit_library.source_digest
            == env!("TOKAMAK_ZKEVM_SUBCIRCUIT_LIBRARY_SOURCE_DIGEST");
        #[cfg(not(tokamak_embedded_subcircuit_library))]
        let source_matches = provenance.subcircuit_library.package_version == version;
        if provenance.subcircuit_library.package_name != SUBCIRCUIT_LIBRARY_PACKAGE_NAME
            || library_compatibility != selected_compatibility
            || provenance.subcircuit_library.origin != origin
            || !source_matches
        {
            return Err(CrsError::Compatibility(
                "univariate CRS subcircuit-library package identity does not match the selected library"
                    .to_string(),
            ));
        }
    }
    Ok(provenance)
}

fn validate_univariate_payloads(
    files: &[(PathBuf, String, &'static str)],
) -> Result<Vec<Vec<u8>>, CrsError> {
    use rayon::prelude::*;
    let digests: Vec<_> = files
        .par_iter()
        .map(|(path, _, _label)| {
            #[cfg(feature = "timing")]
            let reading = crate::timing::SpanGuard::new("univariate.identity.read", _label, vec![]);
            let bytes = fs::read(path).map_err(|source| CrsError::Read {
                path: path.to_path_buf(),
                source,
            })?;
            #[cfg(feature = "timing")]
            drop(reading);
            #[cfg(feature = "timing")]
            let _hash = crate::timing::SpanGuard::new("univariate.identity.sha256", _label, vec![]);
            let digest = format!("{:x}", Sha256::digest(&bytes));
            Ok::<_, CrsError>((digest, bytes))
        })
        .collect();
    // Parallel work must not change the original ordered error precedence.
    let mut payloads = Vec::with_capacity(files.len());
    for (result, (_, expected, _)) in digests.into_iter().zip(files) {
        let (digest, bytes) = result?;
        if digest != *expected {
            return Err(CrsError::Compatibility(
                "univariate CRS file digest does not match crs_provenance.json".to_string(),
            ));
        }
        payloads.push(bytes);
    }
    Ok(payloads)
}

fn selected_library_package_version(library_dir: &Path) -> std::io::Result<String> {
    #[cfg(tokamak_embedded_subcircuit_library)]
    {
        let _ = library_dir;
        return Ok(SUBCIRCUIT_LIBRARY_BUILD_VERSION.to_string());
    }

    #[cfg(not(tokamak_embedded_subcircuit_library))]
    {
        let mut current = Some(library_dir);
        while let Some(directory) = current {
            let manifest_path = directory.join("package.json");
            if manifest_path.is_file() {
                let manifest: serde_json::Value =
                    read_json(&manifest_path, "subcircuit-library package manifest")?;
                let package_name = manifest
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        std::io::Error::other(format!(
                            "{} is missing package name",
                            manifest_path.display()
                        ))
                    })?;
                if package_name == SUBCIRCUIT_LIBRARY_PACKAGE_NAME {
                    let package_version = manifest
                        .get("version")
                        .and_then(serde_json::Value::as_str)
                        .ok_or_else(|| {
                            std::io::Error::other(format!(
                                "{} is missing package version",
                                manifest_path.display()
                            ))
                        })?;
                    return Ok(package_version.to_string());
                }
            }
            current = directory.parent();
        }

        Err(std::io::Error::other(format!(
            "cannot find a {} package manifest above subcircuit library {}",
            SUBCIRCUIT_LIBRARY_PACKAGE_NAME,
            library_dir.display()
        )))
    }
}

fn selected_subcircuit_library_package_identity(
) -> (crate::input_origin::SubcircuitLibraryOrigin, String) {
    #[cfg(tokamak_embedded_subcircuit_library)]
    let origin = crate::input_origin::SubcircuitLibraryOrigin::NpmSnapshot;
    #[cfg(not(tokamak_embedded_subcircuit_library))]
    let origin = crate::input_origin::SubcircuitLibraryOrigin::LocalQapCompiler;

    let package_version = option_env!("TOKAMAK_ZKEVM_SUBCIRCUIT_LIBRARY_PACKAGE_VERSION")
        .map(str::to_string)
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());
    (origin, package_version)
}

pub fn selected_subcircuit_library_provenance(
    library_dir: &Path,
) -> std::io::Result<SubcircuitLibraryProvenance> {
    let (origin, package_version) = selected_subcircuit_library_package_identity();
    let source_digest = match option_env!("TOKAMAK_ZKEVM_SUBCIRCUIT_LIBRARY_SOURCE_DIGEST") {
        Some(digest) => digest.to_string(),
        None => digest_runtime_subcircuit_library(library_dir)?,
    };
    Ok(SubcircuitLibraryProvenance {
        package_name: SUBCIRCUIT_LIBRARY_PACKAGE_NAME.to_string(),
        package_version,
        origin,
        source_digest,
    })
}

/// Hash the supplied circuit snapshot independently of build-time source selection.
pub fn digest_runtime_subcircuit_library(library_dir: &Path) -> std::io::Result<String> {
    let snapshot_root = library_dir.parent().ok_or_else(|| {
        std::io::Error::other(format!(
            "cannot derive subcircuit snapshot root from {}",
            library_dir.display()
        ))
    })?;
    let mut inputs = vec![(
        "subcircuits/circom/constants.circom".to_string(),
        snapshot_root.join("circom/constants.circom"),
    )];
    for file in [
        "frontendCfg.json",
        "setupParams.json",
        "subcircuitInfo.json",
    ] {
        inputs.push((
            format!("subcircuits/library/{file}"),
            library_dir.join(file),
        ));
    }
    for directory in ["json", "r1cs", "wasm"] {
        let absolute = library_dir.join(directory);
        for entry in fs::read_dir(&absolute).map_err(|error| {
            std::io::Error::new(
                error.kind(),
                format!("cannot read {}: {error}", absolute.display()),
            )
        })? {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                return Err(std::io::Error::other(format!(
                    "subcircuit source directory contains non-file entry {}",
                    entry.path().display()
                )));
            }
            let name = entry.file_name().into_string().map_err(|_| {
                std::io::Error::other("subcircuit source filename is not valid UTF-8")
            })?;
            inputs.push((
                format!("subcircuits/library/{directory}/{name}"),
                entry.path(),
            ));
        }
    }
    let contents = inputs
        .into_iter()
        .map(|(logical, path)| fs::read(&path).map(|bytes| (logical, bytes)))
        .collect::<std::io::Result<Vec<_>>>()?;
    crate::subcircuit_source_digest::digest_subcircuit_source_entries(
        contents
            .iter()
            .map(|(logical, bytes)| (logical.as_str(), bytes.as_slice())),
    )
    .map_err(std::io::Error::other)
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path, label: &str) -> std::io::Result<T> {
    let bytes = fs::read(path).map_err(|err| {
        std::io::Error::new(
            err.kind(),
            format!("cannot read {label} {}: {err}", path.display()),
        )
    })?;
    serde_json::from_slice(&bytes).map_err(|err| {
        std::io::Error::other(format!("cannot parse {label} {}: {err}", path.display()))
    })
}

#[cfg(tokamak_embedded_subcircuit_library)]
fn materialize_embedded_subcircuit_library() -> io::Result<PathBuf> {
    if let Some(path) = MATERIALIZED_PATH.get() {
        return Ok(path.clone());
    }

    let cache_root = cache_root_dir()?
        .join("tokamak-zk-evm")
        .join("subcircuit-library")
        .join(snapshot_directory_name());
    let library_root = cache_root.join("library");
    let sentinel = library_root.join("setupParams.json");
    if !sentinel.exists() {
        fs::create_dir_all(&cache_root)?;
        let staging_root = cache_root.join(format!(
            "staging-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or(Duration::from_secs(0))
                .as_nanos()
        ));
        let staging_library = staging_root.join("library");
        fs::create_dir_all(&staging_library)?;

        for file in EMBEDDED_SUBCIRCUIT_LIBRARY_FILES {
            let target_path = staging_library.join(file.relative_path);
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(target_path, file.bytes)?;
        }

        match fs::rename(&staging_library, &library_root) {
            Ok(_) => {
                let _ = fs::remove_dir_all(&staging_root);
            }
            Err(err) if library_root.exists() => {
                let _ = fs::remove_dir_all(&staging_root);
                if !sentinel.exists() {
                    return Err(err);
                }
            }
            Err(err) => {
                let _ = fs::remove_dir_all(&staging_root);
                return Err(err);
            }
        }
    }

    let _ = MATERIALIZED_PATH.set(library_root.clone());
    Ok(MATERIALIZED_PATH.get().cloned().unwrap_or(library_root))
}

#[cfg(tokamak_embedded_subcircuit_library)]
fn cache_root_dir() -> io::Result<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = env::var_os("HOME") {
            return Ok(PathBuf::from(home).join("Library").join("Caches"));
        }
    }

    if let Some(cache_home) = env::var_os("XDG_CACHE_HOME") {
        return Ok(PathBuf::from(cache_home));
    }

    if let Some(home) = env::var_os("HOME") {
        return Ok(PathBuf::from(home).join(".cache"));
    }

    Ok(env::temp_dir())
}

#[cfg(tokamak_embedded_subcircuit_library)]
fn snapshot_directory_name() -> String {
    let integrity_fragment: String = SUBCIRCUIT_LIBRARY_INTEGRITY
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .take(12)
        .collect();
    format!(
        "{}-{}",
        sanitize_component(SUBCIRCUIT_LIBRARY_BUILD_VERSION),
        if integrity_fragment.is_empty() {
            "snapshot".to_string()
        } else {
            integrity_fragment.to_ascii_lowercase()
        }
    )
}

#[cfg(tokamak_embedded_subcircuit_library)]
fn sanitize_component(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn univariate_identity_fixture() -> (tempfile::TempDir, serde_json::Value) {
        let dir = tempfile::tempdir().unwrap();
        let library = dir.path().join("library");
        fs::create_dir_all(dir.path().join("circom")).unwrap();
        fs::write(dir.path().join("circom/constants.circom"), b"").unwrap();
        for child in ["json", "r1cs", "wasm"] {
            fs::create_dir_all(library.join(child)).unwrap();
        }
        for file in [
            "frontendCfg.json",
            "setupParams.json",
            "subcircuitInfo.json",
        ] {
            fs::write(library.join(file), b"{}").unwrap();
        }
        for file in [
            "tau_sequence.rkyv",
            "prover_keys.rkyv",
            "verifier_keys.rkyv",
        ] {
            fs::write(dir.path().join(file), b"payload").unwrap();
        }
        let digest = format!("{:x}", Sha256::digest(b"payload"));
        let provenance = serde_json::json!({
            "documentKind": "crs",
            "generationMethod": "trustedSetup",
            "generatedAtUtc": "2026-09-11T00:00:00Z",
            "compatibleBackendVersion": compatibility_from_package_version(env!("CARGO_PKG_VERSION")).unwrap().to_string(),
            "phase1SourceProvenance": null,
            "ceremonyProtocolVersion": null,
            "ceremonyTranscriptSha256": null,
            "phase2ContributionCount": null,
            "releaseEligible": false,
            "protocolSchemaId": UNIVARIATE_CRS_SCHEMA_ID,
            "artifacts": {
                "tau_sequence.rkyv": digest,
                "prover_keys.rkyv": digest,
                "preprocess_keys.rkyv": digest,
                "verifier_keys.rkyv": digest,
            },
            "subcircuitLibrary": selected_subcircuit_library_provenance(&library).unwrap(),
        });
        (dir, provenance)
    }

    fn admit_univariate_identity(
        dir: &Path,
        provenance: &serde_json::Value,
        check_digests: bool,
    ) -> Result<Option<ValidatedUnivariateCrsBytes>, CrsError> {
        fs::write(
            dir.join(CRS_PROVENANCE_FILE_NAME),
            serde_json::to_vec(provenance).unwrap(),
        )
        .unwrap();
        validate_operational_univariate_crs_compatibility(
            &DevelopmentCrsProvenanceArg::default(),
            &dir.join("tau_sequence.rkyv"),
            dir,
            &dir.join("library"),
            check_digests,
        )
    }

    #[test]
    fn univariate_prove_identity_default_does_not_read_payloads_or_hash_library() {
        let (dir, provenance) = univariate_identity_fixture();
        // The embedded source digest is checked as metadata, not by hashing files.
        for file in [
            "tau_sequence.rkyv",
            "prover_keys.rkyv",
            "verifier_keys.rkyv",
        ] {
            fs::remove_file(dir.path().join(file)).unwrap();
        }
        fs::remove_file(dir.path().join("circom/constants.circom")).unwrap();
        assert!(admit_univariate_identity(dir.path(), &provenance, false)
            .unwrap()
            .is_none());
        // Missing consumed CRS files remain the responsibility of the subsequent reader.
        assert!(admit_univariate_identity(dir.path(), &provenance, true).is_err());
    }

    #[test]
    fn univariate_prove_identity_opt_in_checks_all_existing_digests() {
        let (dir, provenance) = univariate_identity_fixture();
        let validated = admit_univariate_identity(dir.path(), &provenance, true)
            .unwrap()
            .unwrap();
        assert_eq!(validated.tau, b"payload");
        assert_eq!(validated.prover_keys, b"payload");
        for field in [
            "tau_sequence.rkyv",
            "prover_keys.rkyv",
            "verifier_keys.rkyv",
        ] {
            let mut wrong = provenance.clone();
            wrong["artifacts"][field] = "0".repeat(64).into();
            assert!(admit_univariate_identity(dir.path(), &wrong, false)
                .unwrap()
                .is_none());
            assert!(
                matches!(admit_univariate_identity(dir.path(), &wrong, true),
                Err(CrsError::Compatibility(message)) if message.contains("file digest"))
            );
        }
        let mut wrong = provenance.clone();
        wrong["subcircuitLibrary"]["sourceDigest"] = format!("sha256:{}", "0".repeat(64)).into();
        #[cfg(not(tokamak_embedded_subcircuit_library))]
        assert!(admit_univariate_identity(dir.path(), &wrong, false)
            .unwrap()
            .is_none());
        #[cfg(tokamak_embedded_subcircuit_library)]
        assert!(admit_univariate_identity(dir.path(), &wrong, false).is_err());
        assert!(
            matches!(admit_univariate_identity(dir.path(), &wrong, true),
            Err(CrsError::Compatibility(message)) if message.contains("identity"))
        );
    }

    #[test]
    fn univariate_prove_identity_preserves_metadata_checks_in_both_modes() {
        let (dir, provenance) = univariate_identity_fixture();
        for check_digests in [false, true] {
            for (field, value) in [
                ("packageName", "wrong-package"),
                ("packageVersion", "99999.0.0"),
                (
                    "origin",
                    if provenance["subcircuitLibrary"]["origin"] == "localQapCompiler" {
                        "npmSnapshot"
                    } else {
                        "localQapCompiler"
                    },
                ),
            ] {
                let mut wrong = provenance.clone();
                wrong["subcircuitLibrary"][field] = value.into();
                assert!(admit_univariate_identity(dir.path(), &wrong, check_digests).is_err());
            }
            for (field, value) in [
                ("protocolSchemaId", "unsupported"),
                ("documentKind", "unsupported"),
                ("compatibleBackendVersion", "malformed"),
            ] {
                let mut wrong = provenance.clone();
                wrong[field] = value.into();
                assert!(admit_univariate_identity(dir.path(), &wrong, check_digests).is_err());
            }
        }
    }

    #[cfg(tokamak_embedded_subcircuit_library)]
    #[test]
    fn univariate_identity_accepts_same_source_from_earlier_patch() {
        let (dir, mut provenance) = univariate_identity_fixture();
        let version = provenance["subcircuitLibrary"]["packageVersion"]
            .as_str()
            .unwrap();
        let (compatibility, patch) = version.rsplit_once('.').unwrap();
        let patch = patch.parse::<u64>().unwrap();
        provenance["subcircuitLibrary"]["packageVersion"] =
            format!("{compatibility}.{}", if patch == 0 { 1 } else { patch - 1 }).into();
        for check_digests in [false, true] {
            assert!(admit_univariate_identity(dir.path(), &provenance, check_digests).is_ok());
        }
        provenance["subcircuitLibrary"]["sourceDigest"] =
            format!("sha256:{}", "0".repeat(64)).into();
        for check_digests in [false, true] {
            assert!(admit_univariate_identity(dir.path(), &provenance, check_digests).is_err());
        }
    }

    #[cfg(all(
        feature = "development-crs-bypass",
        not(tokamak_embedded_subcircuit_library)
    ))]
    #[test]
    fn univariate_prove_identity_explicit_digest_check_cannot_be_bypassed() {
        let dir = tempfile::tempdir().unwrap();
        let bypass = DevelopmentCrsProvenanceArg {
            allow_unverified_crs: true,
        };
        assert!(matches!(validate_operational_univariate_crs_compatibility(
            &bypass, dir.path(), dir.path(), dir.path(), true,
        ), Err(CrsError::Compatibility(message)) if message.contains("cannot be combined")));
        assert!(validate_operational_univariate_crs_compatibility(
            &bypass,
            dir.path(),
            dir.path(),
            dir.path(),
            false,
        )
        .unwrap()
        .is_none());
    }

    #[test]
    fn validated_payloads_retain_exact_bytes_after_path_changes() {
        use super::*;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("payload");
        fs::write(&path, b"validated original").unwrap();
        let expected = format!("{:x}", Sha256::digest(b"validated original"));
        let bytes = validate_univariate_payloads(&[(path.clone(), expected, "tau")]).unwrap();
        fs::write(&path, b"subsequent replacement").unwrap();
        assert_eq!(bytes[0], b"validated original");
        assert_ne!(bytes[0], fs::read(path).unwrap());
        assert!(backend_univariate_crs_interface::archive::from_bytes::<
            backend_univariate_crs_interface::TauSequenceRkyv,
            backend_univariate_crs_interface::archive::rancor::Error,
        >(&bytes[0])
        .is_err());
    }

    #[test]
    #[ignore = "release-only full-CRS comparison requiring PROVE_BENCH_KEYS"]
    fn compare_validated_read_reuse() {
        use super::*;
        use backend_univariate_crs_interface::{archive, ProverKeysRkyv, TauSequenceRkyv};
        assert!(!cfg!(debug_assertions));
        let dir = PathBuf::from(std::env::var("PROVE_BENCH_KEYS").unwrap());
        let files: Vec<_> = [
            "tau_sequence.rkyv",
            "prover_keys.rkyv",
            "verifier_keys.rkyv",
        ]
        .iter()
        .map(|name| {
            let path = dir.join(name);
            let digest = format!("{:x}", Sha256::digest(fs::read(&path).unwrap()));
            (path, digest, *name)
        })
        .collect();
        let mut reference = None;
        for trial in 0..4 {
            for reuse in if trial % 2 == 0 {
                [false, true]
            } else {
                [true, false]
            } {
                let start = std::time::Instant::now();
                let bytes = validate_univariate_payloads(&files).unwrap();
                let bytes = if reuse {
                    bytes
                } else {
                    drop(bytes);
                    vec![
                        fs::read(&files[0].0).unwrap(),
                        fs::read(&files[1].0).unwrap(),
                    ]
                };
                let tau = archive::from_bytes::<TauSequenceRkyv, archive::rancor::Error>(&bytes[0])
                    .unwrap();
                let keys = archive::from_bytes::<ProverKeysRkyv, archive::rancor::Error>(&bytes[1])
                    .unwrap();
                let seconds = start.elapsed().as_secs_f64();
                // Full decoded-output equality checks are outside the measured interval.
                let digests = [
                    format!(
                        "{:x}",
                        Sha256::digest(archive::to_bytes::<archive::rancor::Error>(&tau).unwrap())
                    ),
                    format!(
                        "{:x}",
                        Sha256::digest(archive::to_bytes::<archive::rancor::Error>(&keys).unwrap())
                    ),
                ];
                if let Some(expected) = &reference {
                    assert_eq!(&digests, expected);
                } else {
                    reference = Some(digests);
                }
                println!(
                    "{}",
                    serde_json::json!({"trial":trial,"warmup":trial==0,"reuse":reuse,"seconds":seconds,"decodedArchivesEqual":true})
                );
            }
        }
    }
    #[test]
    fn parallel_univariate_payloads_preserve_ordered_admission() {
        use super::*;
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("first");
        let second = dir.path().join("second");
        fs::write(&first, b"payload").unwrap();
        fs::write(&second, b"other").unwrap();
        let good = format!("{:x}", Sha256::digest(b"payload"));
        let other = format!("{:x}", Sha256::digest(b"other"));
        assert!(validate_univariate_payloads(&[
            (first.clone(), good.clone(), "tau"),
            (second.clone(), other, "keys")
        ])
        .is_ok());
        fs::remove_file(&second).unwrap();
        // A first-file mismatch wins over a later missing file, as before.
        assert!(matches!(
            validate_univariate_payloads(&[
                (first.clone(), "0".repeat(64), "tau"),
                (second.clone(), good.clone(), "keys")
            ]),
            Err(CrsError::Compatibility(_))
        ));
        assert!(
            matches!(validate_univariate_payloads(&[(first.clone(),good.clone(),"tau"),(second.clone(),good.clone(),"keys")]), Err(CrsError::Read {path,..}) if path==second)
        );
        fs::write(&first, b"corrupted").unwrap();
        assert!(matches!(
            validate_univariate_payloads(&[(first, "0".repeat(64), "tau")]),
            Err(CrsError::Compatibility(_))
        ));
    }

    #[test]
    #[ignore = "release-only full-CRS comparison requiring PROVE_BENCH_KEYS"]
    fn compare_parallel_univariate_hashes() {
        use super::*;
        assert!(!cfg!(debug_assertions));
        let dir = PathBuf::from(std::env::var("PROVE_BENCH_KEYS").unwrap());
        let files: Vec<_> = [
            "tau_sequence.rkyv",
            "prover_keys.rkyv",
            "verifier_keys.rkyv",
        ]
        .iter()
        .map(|name| {
            let path = dir.join(name);
            let digest = format!("{:x}", Sha256::digest(fs::read(&path).unwrap()));
            (path, digest, *name)
        })
        .collect();
        for trial in 0..4 {
            for parallel in if trial % 2 == 0 {
                [false, true]
            } else {
                [true, false]
            } {
                let start = std::time::Instant::now();
                if parallel {
                    validate_univariate_payloads(&files).unwrap();
                } else {
                    for (path, digest, _) in &files {
                        assert_eq!(
                            format!("{:x}", Sha256::digest(fs::read(path).unwrap())),
                            *digest
                        );
                    }
                }
                println!(
                    "{}",
                    serde_json::json!({"trial":trial,"warmup":trial==0,"parallel":parallel,"seconds":start.elapsed().as_secs_f64(),"digestsEqual":true})
                );
            }
        }
    }
    use super::{
        validate_crs_compatibility, validate_operational_crs_compatibility,
        DevelopmentCrsProvenanceArg,
    };
    use crate::crs_provenance::{CrsGenerationMethod, CrsProvenance, SubcircuitLibraryProvenance};
    use crate::input_origin::SubcircuitLibraryOrigin;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_ROOT_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    fn test_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "tokamak-zk-evm-crs-compatibility-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time must be after Unix epoch")
                .as_nanos(),
            TEST_ROOT_SEQUENCE.fetch_add(1, Ordering::Relaxed),
        ))
    }

    fn write_package_manifest(root: &std::path::Path, version: &str) {
        fs::write(
            root.join("package.json"),
            format!(r#"{{"name":"@tokamak-zk-evm/subcircuit-library","version":"{version}"}}"#),
        )
        .expect("must write package manifest");
    }

    fn write_provenance(
        crs_dir: &std::path::Path,
        release_eligible: bool,
        compatible_version: &str,
    ) {
        let provenance = CrsProvenance {
            document_kind: "crs".into(),
            protocol_schema_id: crate::univariate_crs::UNIVARIATE_CRS_SCHEMA_ID.into(),
            generation_method: CrsGenerationMethod::Mpc,
            release_eligible,
            generated_at_utc: "2026-08-24T00:00:00Z".to_string(),
            compatible_backend_version: compatible_version.to_string(),
            subcircuit_library: SubcircuitLibraryProvenance {
                package_name: "@tokamak-zk-evm/subcircuit-library".to_string(),
                package_version: format!("{compatible_version}.0"),
                origin: SubcircuitLibraryOrigin::LocalQapCompiler,
                source_digest:
                    "sha256:1111111111111111111111111111111111111111111111111111111111111111"
                        .to_string(),
            },
            phase1_source_provenance: None,
            ceremony_protocol_version: Some(
                crate::crs_provenance::CEREMONY_PROTOCOL_VERSION.to_string(),
            ),
            ceremony_transcript_sha256: Some("6".repeat(64)),
            phase2_contribution_count: Some(1),
            artifacts: [
                ("tau_sequence.rkyv".to_string(), "0".repeat(64)),
                ("prover_keys.rkyv".to_string(), "0".repeat(64)),
                ("preprocess_keys.rkyv".to_string(), "0".repeat(64)),
                ("verifier_keys.rkyv".to_string(), "0".repeat(64)),
            ]
            .into(),
        };
        fs::write(
            crs_dir.join(super::CRS_PROVENANCE_FILE_NAME),
            serde_json::to_vec(&provenance).expect("must serialize CRS provenance"),
        )
        .expect("must write CRS provenance");
    }

    fn compiled_backend_compatible_version() -> String {
        crate::compatibility::compatibility_from_package_version(env!("CARGO_PKG_VERSION"))
            .expect("the compiled backend package version must be canonical")
            .to_string()
    }

    fn compiled_backend_package_version() -> &'static str {
        env!("CARGO_PKG_VERSION")
    }

    #[test]
    fn rejects_crs_without_compatibility_version() {
        let root = test_root();
        let library_dir = root.join("subcircuits").join("library");
        let crs_dir = root.join("crs");
        fs::create_dir_all(&library_dir).expect("must create library directory");
        fs::create_dir_all(&crs_dir).expect("must create CRS directory");
        write_package_manifest(&root, compiled_backend_package_version());
        write_provenance(&crs_dir, false, &compiled_backend_compatible_version());
        let file = crs_dir.join(super::CRS_PROVENANCE_FILE_NAME);
        let mut value: serde_json::Value =
            serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .remove("compatibleBackendVersion");
        fs::write(&file, serde_json::to_vec(&value).unwrap()).unwrap();

        let error = validate_crs_compatibility(&crs_dir, &library_dir)
            .expect_err("CRS without a compatibility version must be rejected");
        assert!(error.to_string().contains("compatibleBackendVersion"));
        fs::remove_dir_all(root).expect("must remove test directory");
    }

    #[test]
    fn ignores_publication_eligibility_during_compatibility_validation() {
        let root = test_root();
        let library_dir = root.join("subcircuits").join("library");
        let crs_dir = root.join("crs");
        fs::create_dir_all(&library_dir).expect("must create library directory");
        fs::create_dir_all(&crs_dir).expect("must create CRS directory");
        write_package_manifest(&root, compiled_backend_package_version());

        write_provenance(&crs_dir, false, &compiled_backend_compatible_version());
        validate_crs_compatibility(&crs_dir, &library_dir)
            .expect("non-eligible CRS must be accepted by algorithm workflows");

        write_provenance(&crs_dir, true, &compiled_backend_compatible_version());
        validate_crs_compatibility(&crs_dir, &library_dir)
            .expect("release eligibility must not affect compatibility");
        fs::remove_dir_all(root).expect("must remove test directory");
    }

    #[test]
    fn validates_crs_against_the_compiled_backend_compatibility_class() {
        let root = test_root();
        let library_dir = root.join("subcircuits").join("library");
        let crs_dir = root.join("crs");
        fs::create_dir_all(&library_dir).expect("must create library directory");
        fs::create_dir_all(&crs_dir).expect("must create CRS directory");
        write_package_manifest(&root, compiled_backend_package_version());
        let compiled_version = compiled_backend_compatible_version();
        write_provenance(&crs_dir, true, &compiled_version);

        validate_crs_compatibility(&crs_dir, &library_dir)
            .expect("matching CRS and compiled backend compatibility classes must be accepted");

        let mut components = compiled_version.split('.').map(|component| {
            component
                .parse::<u64>()
                .expect("compatibility components are numeric")
        });
        let incompatible_version = format!(
            "{}.{}",
            components.next().expect("major component") + 1,
            components.next().expect("minor component")
        );
        write_provenance(&crs_dir, true, &incompatible_version);
        let error = validate_crs_compatibility(&crs_dir, &library_dir)
            .expect_err("a CRS from another backend release line must be rejected");
        assert!(error
            .to_string()
            .contains("compiled backend compatibility class"));
        fs::remove_dir_all(root).expect("must remove test directory");
    }

    #[test]
    fn accepts_every_canonical_final_mpc_phase1_variant_at_the_algorithm_boundary() {
        for fixture in [
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance.json"),
            include_str!("../../../common/contracts/fixtures/trusted-setup-crs-provenance.json"),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-null.json"),
        ] {
            let root = test_root();
            let library_dir = root.join("subcircuits").join("library");
            let crs_dir = root.join("crs");
            fs::create_dir_all(&library_dir).expect("must create library directory");
            fs::create_dir_all(&crs_dir).expect("must create CRS directory");
            write_package_manifest(&root, compiled_backend_package_version());
            let mut provenance: serde_json::Value =
                serde_json::from_str(fixture).expect("canonical fixture must be valid JSON");
            provenance["compatibleBackendVersion"] =
                serde_json::Value::String(compiled_backend_compatible_version());
            fs::write(
                crs_dir.join(super::CRS_PROVENANCE_FILE_NAME),
                serde_json::to_vec(&provenance).expect("adjusted fixture must serialize"),
            )
            .expect("must write canonical provenance fixture");

            validate_crs_compatibility(&crs_dir, &library_dir)
                .expect("canonical final MPC fixture must be accepted");
            fs::remove_dir_all(root).expect("must remove test directory");
        }
    }

    #[test]
    fn rejects_the_malformed_final_mpc_fixture_at_the_algorithm_boundary() {
        let root = test_root();
        let library_dir = root.join("subcircuits").join("library");
        let crs_dir = root.join("crs");
        fs::create_dir_all(&library_dir).expect("must create library directory");
        fs::create_dir_all(&crs_dir).expect("must create CRS directory");
        write_package_manifest(&root, compiled_backend_package_version());
        fs::write(
            crs_dir.join(super::CRS_PROVENANCE_FILE_NAME),
            include_str!(
                "../../../common/contracts/fixtures/final-mpc-crs-provenance-malformed.json"
            ),
        )
        .expect("must write malformed provenance fixture");

        assert!(validate_crs_compatibility(&crs_dir, &library_dir).is_err());
        fs::remove_dir_all(root).expect("must remove test directory");
    }

    #[test]
    fn rejects_noncanonical_crs_compatibility_versions() {
        let root = test_root();
        let library_dir = root.join("subcircuits").join("library");
        let crs_dir = root.join("crs");
        fs::create_dir_all(&library_dir).expect("must create library directory");
        fs::create_dir_all(&crs_dir).expect("must create CRS directory");
        write_package_manifest(&root, "2.1.5");
        fs::write(
            crs_dir.join(super::CRS_PROVENANCE_FILE_NAME),
            include_str!(
                "../../../common/contracts/fixtures/final-mpc-crs-provenance-leading-zero.json"
            ),
        )
        .expect("must write leading-zero provenance fixture");

        let error = validate_crs_compatibility(&crs_dir, &library_dir)
            .expect_err("noncanonical compatibility versions must be rejected");
        assert!(error
            .to_string()
            .contains("leading zeroes are not canonical"));
        fs::remove_dir_all(root).expect("must remove test directory");
    }

    #[test]
    fn rejects_semantically_invalid_final_mpc_fixtures_at_the_algorithm_boundary() {
        let fixtures = [
            include_str!(
                "../../../common/contracts/fixtures/final-mpc-crs-provenance-date-only.json"
            ),
            include_str!(
                "../../../common/contracts/fixtures/final-mpc-crs-provenance-invalid-digest.json"
            ),
            include_str!(
                "../../../common/contracts/fixtures/final-mpc-crs-provenance-empty-string.json"
            ),
            include_str!(
                "../../../common/contracts/fixtures/final-mpc-crs-provenance-invalid-origin.json"
            ),
        ];

        for fixture in fixtures {
            let root = test_root();
            let library_dir = root.join("subcircuits").join("library");
            let crs_dir = root.join("crs");
            fs::create_dir_all(&library_dir).expect("must create library directory");
            fs::create_dir_all(&crs_dir).expect("must create CRS directory");
            write_package_manifest(&root, compiled_backend_package_version());
            fs::write(crs_dir.join(super::CRS_PROVENANCE_FILE_NAME), fixture)
                .expect("must write semantically invalid provenance fixture");

            assert!(validate_crs_compatibility(&crs_dir, &library_dir).is_err());
            fs::remove_dir_all(root).expect("must remove test directory");
        }
    }

    #[test]
    fn rejects_retired_provenance_at_the_algorithm_boundary() {
        let root = test_root();
        let library_dir = root.join("subcircuits").join("library");
        let crs_dir = root.join("crs");
        fs::create_dir_all(&library_dir).expect("must create library directory");
        fs::create_dir_all(&crs_dir).expect("must create CRS directory");
        write_package_manifest(&root, compiled_backend_package_version());

        fs::write(
            crs_dir.join(super::CRS_PROVENANCE_FILE_NAME),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-legacy.json"),
        )
        .expect("must write legacy provenance");

        assert!(validate_crs_compatibility(&crs_dir, &library_dir).is_err());
        fs::remove_dir_all(root).expect("must remove test directory");
    }

    #[test]
    fn operational_validation_accepts_a_noneligible_crs_with_matching_compatibility() {
        let root = test_root();
        let library_dir = root.join("subcircuits").join("library");
        let crs_dir = root.join("crs");
        fs::create_dir_all(&library_dir).expect("must create library directory");
        fs::create_dir_all(&crs_dir).expect("must create CRS directory");
        write_package_manifest(&root, compiled_backend_package_version());
        write_provenance(&crs_dir, false, &compiled_backend_compatible_version());

        validate_operational_crs_compatibility(
            &DevelopmentCrsProvenanceArg::default(),
            &crs_dir,
            &library_dir,
        )
        .expect("non-eligible CRS must be accepted without a bypass");
        fs::remove_dir_all(root).expect("must remove test directory");
    }

    #[cfg(all(
        feature = "development-crs-bypass",
        not(tokamak_embedded_subcircuit_library)
    ))]
    #[test]
    fn development_opt_in_allows_a_development_only_crs() {
        #[derive(clap::Parser)]
        struct TestConfig {
            #[command(flatten)]
            development: DevelopmentCrsProvenanceArg,
        }

        let root = test_root();
        let library_dir = root.join("subcircuits").join("library");
        let crs_dir = root.join("crs");
        fs::create_dir_all(&library_dir).expect("must create library directory");
        fs::create_dir_all(&crs_dir).expect("must create CRS directory");
        write_provenance(&crs_dir, false, &compiled_backend_compatible_version());

        let config = <TestConfig as clap::Parser>::try_parse_from([
            "test-command",
            "--allow-unverified-crs",
        ])
        .expect("development opt-in must be accepted");
        assert!(config.development.allows_unverified_crs());
        validate_operational_crs_compatibility(&config.development, &crs_dir, &library_dir)
            .expect("development opt-in must bypass compatibility validation");
        fs::remove_dir_all(root).expect("must remove test directory");
    }
}
