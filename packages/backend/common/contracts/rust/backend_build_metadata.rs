//! Backend-owned contract for backend runtime build metadata.
//!
//! Only the production preprocess, prove, and verify binaries write this
//! document. It is build identity metadata for the CLI installer, not CRS
//! provenance and not a compatibility input for cryptographic workflows.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

// This contract is compiled both by backend runtime crates and by Cargo build
// scripts. Keep version parsing owned by the repository-level policy without
// depending on either compilation context's module layout.
#[path = "../../../../../versioning/compatibility.rs"]
#[allow(dead_code)]
mod version_policy;

pub const BACKEND_BUILD_METADATA_FILE_PREFIX: &str = "build-metadata-";
pub const BACKEND_BUILD_METADATA_FILE_SUFFIX: &str = ".json";
pub const BACKEND_RUNTIME_PACKAGE_NAMES: [&str; 3] = ["preprocess", "prove", "verify"];
pub const SUBCIRCUIT_LIBRARY_PACKAGE_NAME: &str = "@tokamak-zk-evm/subcircuit-library";
pub const SUBCIRCUIT_LIBRARY_RUNTIME_MODE: &str = "bundled";

const SUPPORTED_SCHEMA_KEYWORDS: &[&str] = &[
    "additionalProperties",
    "const",
    "enum",
    "pattern",
    "properties",
    "required",
    "type",
];

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackendBuildMetadata {
    pub dependencies: BackendBuildMetadataDependencies,
    pub package_name: String,
    pub package_version: String,
    pub compatible_backend_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackendBuildMetadataDependencies {
    pub subcircuit_library: SubcircuitLibraryBuildMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubcircuitLibraryBuildMetadata {
    pub build_version: String,
    pub declared_range: String,
    pub package_name: String,
    pub runtime_mode: String,
    pub source_digest: String,
}

impl BackendBuildMetadata {
    pub fn new(
        package_name: &str,
        package_version: &str,
        compatible_backend_version: &str,
        subcircuit_library_build_version: &str,
        subcircuit_library_source_digest: &str,
    ) -> Result<Self, String> {
        ensure_backend_build_metadata_contract_definition()?;
        ensure_runtime_package(package_name)?;
        for (field, value) in [
            ("packageVersion", package_version),
            ("compatibleBackendVersion", compatible_backend_version),
            (
                "dependencies.subcircuitLibrary.buildVersion",
                subcircuit_library_build_version,
            ),
        ] {
            if value.is_empty() {
                return Err(format!("backend build metadata {field} must not be empty"));
            }
        }
        validate_canonical_versions(
            package_version,
            compatible_backend_version,
            subcircuit_library_build_version,
        )?;
        super::subcircuit_source_digest::validate_source_digest(subcircuit_library_source_digest)?;
        Ok(Self {
            dependencies: BackendBuildMetadataDependencies {
                subcircuit_library: SubcircuitLibraryBuildMetadata {
                    build_version: subcircuit_library_build_version.to_string(),
                    declared_range: subcircuit_library_build_version.to_string(),
                    package_name: SUBCIRCUIT_LIBRARY_PACKAGE_NAME.to_string(),
                    runtime_mode: SUBCIRCUIT_LIBRARY_RUNTIME_MODE.to_string(),
                    source_digest: subcircuit_library_source_digest.to_string(),
                },
            },
            package_name: package_name.to_string(),
            package_version: package_version.to_string(),
            compatible_backend_version: compatible_backend_version.to_string(),
        })
    }
}

fn validate_canonical_versions(
    package_version: &str,
    compatible_backend_version: &str,
    subcircuit_library_build_version: &str,
) -> Result<(), String> {
    version_policy::parse_package_version(package_version)
        .map_err(|error| format!("backend build metadata packageVersion {error}"))?;
    version_policy::parse_compatible_backend_version(compatible_backend_version)
        .map_err(|error| format!("backend build metadata compatibleBackendVersion {error}"))?;
    version_policy::parse_package_version(subcircuit_library_build_version).map_err(|error| {
        format!("backend build metadata dependencies.subcircuitLibrary.buildVersion {error}")
    })?;
    Ok(())
}

/// Ensures that the Rust metadata producer still implements the checked-in
/// backend-owned JSON contract before it emits a production metadata file.
pub fn ensure_backend_build_metadata_contract_definition() -> Result<(), String> {
    static VALIDATION: OnceLock<Result<(), String>> = OnceLock::new();
    VALIDATION
        .get_or_init(validate_backend_build_metadata_contract_definition)
        .clone()
}

fn validate_backend_build_metadata_contract_definition() -> Result<(), String> {
    let contract: serde_json::Value =
        serde_json::from_str(include_str!("../backend-build-metadata-contract.json"))
            .map_err(|error| format!("backend build-metadata contract is invalid JSON: {error}"))?;
    if contract.get("fileNamePattern")
        != Some(&serde_json::json!(
            "build-metadata-{backendPackageName}.json"
        ))
    {
        return Err(
            "backend build-metadata contract has an unsupported fileNamePattern".to_string(),
        );
    }
    if contract.get("backendPackageNames")
        != Some(&serde_json::json!(["preprocess", "prove", "verify"]))
    {
        return Err(
            "backend build-metadata contract has unsupported runtime package names".to_string(),
        );
    }
    let schema = contract
        .get("schema")
        .ok_or_else(|| "backend build-metadata contract is missing schema".to_string())?;
    validate_supported_schema_keywords(schema, "schema")?;
    if schema != &expected_schema() {
        return Err(
            "backend build-metadata contract schema differs from the Rust producer contract"
                .to_string(),
        );
    }
    Ok(())
}

fn expected_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["dependencies", "packageName", "packageVersion", "compatibleBackendVersion"],
        "properties": {
            "dependencies": {
                "type": "object",
                "additionalProperties": false,
                "required": ["subcircuitLibrary"],
                "properties": {
                    "subcircuitLibrary": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["buildVersion", "declaredRange", "packageName", "runtimeMode", "sourceDigest"],
                        "properties": {
                            "buildVersion": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
                            "declaredRange": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
                            "packageName": { "const": "@tokamak-zk-evm/subcircuit-library" },
                            "runtimeMode": { "const": "bundled" },
                            "sourceDigest": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" }
                        }
                    }
                }
            },
            "packageName": { "enum": ["preprocess", "prove", "verify"] },
            "packageVersion": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
            "compatibleBackendVersion": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+$" }
        }
    })
}

fn validate_supported_schema_keywords(
    schema: &serde_json::Value,
    path: &str,
) -> Result<(), String> {
    let object = schema
        .as_object()
        .ok_or_else(|| format!("backend build-metadata contract {path} must be an object"))?;
    for key in object.keys() {
        if !SUPPORTED_SCHEMA_KEYWORDS.contains(&key.as_str()) {
            return Err(format!(
                "backend build-metadata contract {path} uses unsupported schema keyword {key}"
            ));
        }
    }
    if let Some(properties) = object.get("properties") {
        for (field, child) in properties.as_object().ok_or_else(|| {
            format!("backend build-metadata contract {path}.properties must be an object")
        })? {
            validate_supported_schema_keywords(child, &format!("{path}.properties.{field}"))?;
        }
    }
    Ok(())
}

pub fn ensure_runtime_package(package_name: &str) -> Result<(), String> {
    if BACKEND_RUNTIME_PACKAGE_NAMES.contains(&package_name) {
        return Ok(());
    }
    Err(format!(
        "backend build metadata is defined only for {}; received {package_name}",
        BACKEND_RUNTIME_PACKAGE_NAMES.join(", ")
    ))
}

pub fn metadata_file_name(package_name: &str) -> Result<String, String> {
    ensure_runtime_package(package_name)?;
    Ok(format!(
        "{BACKEND_BUILD_METADATA_FILE_PREFIX}{package_name}{BACKEND_BUILD_METADATA_FILE_SUFFIX}"
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        ensure_backend_build_metadata_contract_definition, metadata_file_name,
        validate_supported_schema_keywords, BackendBuildMetadata,
    };
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Contract {
        file_name_pattern: String,
        backend_package_names: Vec<String>,
        schema: serde_json::Value,
    }

    #[test]
    fn conforms_to_the_backend_metadata_contract() {
        let contract: Contract =
            serde_json::from_str(include_str!("../backend-build-metadata-contract.json"))
                .expect("backend build metadata contract must be valid JSON");
        assert_eq!(
            contract.file_name_pattern,
            "build-metadata-{backendPackageName}.json"
        );
        assert_eq!(
            contract.backend_package_names,
            ["preprocess", "prove", "verify"]
        );
        assert!(contract.schema.is_object());
        ensure_backend_build_metadata_contract_definition()
            .expect("Rust metadata producer must implement the checked-in contract");
    }

    #[test]
    fn rejects_unsupported_metadata_schema_keywords() {
        assert!(validate_supported_schema_keywords(
            &serde_json::json!({ "type": "string", "unsupportedKeyword": true }),
            "test"
        )
        .is_err());
    }

    #[test]
    fn accepts_the_canonical_fixture_and_rejects_the_invalid_fixture() {
        let fixture: BackendBuildMetadata = serde_json::from_str(include_str!(
            "../fixtures/backend-build-metadata-valid.json"
        ))
        .expect("canonical backend build metadata fixture must satisfy the contract");
        assert_eq!(fixture.package_name, "prove");
        assert!(serde_json::from_str::<BackendBuildMetadata>(include_str!(
            "../fixtures/backend-build-metadata-invalid.json"
        ))
        .is_err());
        assert!(serde_json::from_str::<BackendBuildMetadata>(include_str!(
            "../fixtures/backend-build-metadata-missing-source-digest.json"
        ))
        .is_err());
        let invalid_digest: BackendBuildMetadata = serde_json::from_str(include_str!(
            "../fixtures/backend-build-metadata-invalid-source-digest.json"
        ))
        .expect("schema pattern semantics are validated by the producer constructor");
        assert!(BackendBuildMetadata::new(
            &invalid_digest.package_name,
            &invalid_digest.package_version,
            &invalid_digest.compatible_backend_version,
            &invalid_digest.dependencies.subcircuit_library.build_version,
            &invalid_digest.dependencies.subcircuit_library.source_digest,
        )
        .is_err());
    }

    #[test]
    fn production_writer_round_trips_the_canonical_contract_fixture() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../fixtures/backend-build-metadata-valid.json"
        ))
        .expect("canonical metadata fixture must be valid JSON");
        let metadata = BackendBuildMetadata::new(
            "prove",
            "2.1.5",
            "2.1",
            "2.1.5",
            "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        )
        .expect("canonical production metadata must be constructible");
        assert_eq!(
            serde_json::to_value(metadata).expect("metadata must serialize"),
            fixture
        );
    }

    #[test]
    fn writer_reuses_the_repository_canonical_version_policy() {
        let digest = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
        assert!(BackendBuildMetadata::new("prove", "02.1.5", "2.1", "2.1.5", digest).is_err());
        assert!(BackendBuildMetadata::new("prove", "2.1.5", "02.1", "2.1.5", digest).is_err());
        assert!(BackendBuildMetadata::new("prove", "2.1.5", "2.1", "2.01.5", digest).is_err());
        assert!(BackendBuildMetadata::new("prove", "2.1.5", "2.1", "2.1.5", "1111").is_err());
    }

    #[test]
    fn limits_metadata_to_runtime_consumers() {
        assert_eq!(
            metadata_file_name("verify").unwrap(),
            "build-metadata-verify.json"
        );
        assert!(metadata_file_name("trusted-setup").is_err());
        assert!(BackendBuildMetadata::new(
            "trusted-setup",
            "2.1.5",
            "2.1",
            "2.1.5",
            "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        )
        .is_err());
    }
}
