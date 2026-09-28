//! Backend-owned contract for `crs_provenance.json`.
//!
//! Generation methods supply values to one shared document shape. Protocol
//! identifiers select artifact sets; publication policy is enforced separately.

use crate::compatibility::{parse_compatible_backend_version, parse_package_version};
use crate::input_origin::SubcircuitLibraryOrigin;
use chrono::DateTime;
use rkyv::{Archive, Deserialize as RkyvDeserialize, Serialize as RkyvSerialize};
use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::sync::OnceLock;

pub const CRS_PROVENANCE_FILE_NAME: &str = "crs_provenance.json";
pub const CRS_DOCUMENT_KIND: &str = "crs";
pub const CEREMONY_PROTOCOL_VERSION: &str = "tokamak-filecoin-phase2";

const CRS_PROVENANCE_CONTRACT_SHA256: &str =
    "30edd06fb64175823d6db0e06f444a9cf27e8ee32a41ac78e824dc3a2ae5900d";
const SUPPORTED_SCHEMA_KEYWORDS: &[&str] = &[
    "additionalProperties",
    "const",
    "enum",
    "format",
    "minLength",
    "minimum",
    "oneOf",
    "pattern",
    "properties",
    "required",
    "type",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CrsGenerationMethod {
    TrustedSetup,
    Mpc,
}

#[derive(
    Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Archive, RkyvSerialize, RkyvDeserialize,
)]
#[archive(check_bytes)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FilecoinSourceProvenance {
    pub source_url: String,
    pub source_blake2b512: String,
}

#[derive(
    Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Archive, RkyvSerialize, RkyvDeserialize,
)]
#[archive(check_bytes)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum Phase1SourceProvenance {
    Filecoin(FilecoinSourceProvenance),
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubcircuitLibraryProvenance {
    pub package_name: String,
    pub package_version: String,
    pub origin: SubcircuitLibraryOrigin,
    pub source_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CrsProvenance {
    pub document_kind: String,
    pub protocol_schema_id: String,
    pub generation_method: CrsGenerationMethod,
    pub release_eligible: bool,
    pub generated_at_utc: String,
    pub compatible_backend_version: String,
    pub subcircuit_library: SubcircuitLibraryProvenance,
    #[serde(deserialize_with = "required_option")]
    pub phase1_source_provenance: Option<Phase1SourceProvenance>,
    #[serde(deserialize_with = "required_option")]
    pub ceremony_protocol_version: Option<String>,
    #[serde(deserialize_with = "required_option")]
    pub ceremony_transcript_sha256: Option<String>,
    #[serde(deserialize_with = "required_option")]
    pub phase2_contribution_count: Option<u64>,
    pub artifacts: BTreeMap<String, String>,
}

fn required_option<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    <Option<T> as Deserialize>::deserialize(deserializer)
}

impl CrsProvenance {
    pub fn require_protocol(&self, expected: &str) -> Result<(), String> {
        if self.protocol_schema_id != expected {
            return Err(format!(
                "CRS protocolSchemaId {} does not match {expected}",
                self.protocol_schema_id
            ));
        }
        Ok(())
    }
}

/// Writes one common document regardless of which setup algorithm produced it.
pub fn write_crs_provenance(
    output_dir: &std::path::Path,
    provenance: &CrsProvenance,
) -> std::io::Result<()> {
    validate_crs_provenance(provenance).map_err(std::io::Error::other)?;
    let bytes = serde_json::to_vec_pretty(provenance).map_err(std::io::Error::other)?;
    std::fs::write(output_dir.join(CRS_PROVENANCE_FILE_NAME), bytes)
}

/// Ensures that this Rust adapter still implements the checked-in backend
/// provenance contract. Any contract edit must deliberately update this
/// adapter, its fixtures, and its consumer validators.
pub fn ensure_crs_provenance_contract_definition() -> Result<(), String> {
    static VALIDATION: OnceLock<Result<(), String>> = OnceLock::new();
    VALIDATION
        .get_or_init(validate_crs_provenance_contract_definition)
        .clone()
}

/// Returns the exact root-level files that a common CRS archive must
/// contain. The checked-in backend JSON contract is the single shape authority.
pub fn crs_archive_root_file_names() -> Result<Vec<String>, String> {
    ensure_crs_provenance_contract_definition()?;
    let contract: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../common/contracts/crs-provenance-contract.json"
    ))
    .map_err(|error| error.to_string())?;
    artifact_file_names_from_contract(&contract)
}

fn validate_crs_provenance_contract_definition() -> Result<(), String> {
    let bytes = include_bytes!("../../../common/contracts/crs-provenance-contract.json");
    let actual_digest = format!("{:x}", Sha256::digest(bytes));
    if actual_digest != CRS_PROVENANCE_CONTRACT_SHA256 {
        return Err(format!(
            "CRS provenance contract changed (expected SHA-256 {CRS_PROVENANCE_CONTRACT_SHA256}, got {actual_digest}); update the Rust adapter, fixtures, and consumer validators"
        ));
    }

    let contract: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|error| format!("CRS provenance contract is invalid JSON: {error}"))?;
    let schema = contract
        .get("schema")
        .ok_or("CRS provenance contract is missing schema")?;
    validate_supported_schema_keywords(schema, "schema")?;
    artifact_file_names_from_contract(&contract)?;
    Ok(())
}

fn artifact_file_names_from_contract(contract: &serde_json::Value) -> Result<Vec<String>, String> {
    let values = contract
        .get("rootFiles")
        .and_then(serde_json::Value::as_array)
        .ok_or("CRS contract is missing rootFiles")?;
    if values.is_empty() {
        return Err("CRS artifact set must not be empty".into());
    }
    let mut names = Vec::new();
    for value in values {
        let name = value
            .as_str()
            .ok_or("CRS artifact filename must be a string")?;
        if !is_root_file_name(name) || names.iter().any(|n| n == name) {
            return Err(format!(
                "invalid or repeated CRS artifact filename {name:?}"
            ));
        }
        names.push(name.to_string());
    }
    if !names.iter().any(|name| name == CRS_PROVENANCE_FILE_NAME) {
        return Err("CRS rootFiles must include crs_provenance.json".into());
    }
    Ok(names)
}

fn is_root_file_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains(&['/', '\\', '\0'][..])
}

fn validate_supported_schema_keywords(
    schema: &serde_json::Value,
    path: &str,
) -> Result<(), String> {
    let object = schema
        .as_object()
        .ok_or_else(|| format!("CRS provenance contract {path} schema must be an object"))?;
    for key in object.keys() {
        if !SUPPORTED_SCHEMA_KEYWORDS.contains(&key.as_str()) {
            return Err(format!(
                "CRS provenance contract {path} uses unsupported schema keyword {key}"
            ));
        }
    }
    if let Some(one_of) = object.get("oneOf") {
        for (index, candidate) in one_of
            .as_array()
            .ok_or_else(|| format!("CRS provenance contract {path}.oneOf must be an array"))?
            .iter()
            .enumerate()
        {
            validate_supported_schema_keywords(candidate, &format!("{path}.oneOf[{index}]"))?;
        }
    }
    if let Some(properties) = object.get("properties") {
        for (field, child) in properties
            .as_object()
            .ok_or_else(|| format!("CRS provenance contract {path}.properties must be an object"))?
        {
            validate_supported_schema_keywords(child, &format!("{path}.properties.{field}"))?;
        }
    }
    Ok(())
}

/// Parses the backend-owned common CRS document, not an algorithm-specific variant.
pub fn parse_crs_provenance(bytes: &[u8]) -> Result<CrsProvenance, String> {
    ensure_crs_provenance_contract_definition()?;
    let provenance: CrsProvenance = serde_json::from_slice(bytes)
        .map_err(|error| format!("invalid CRS provenance JSON: {error}"))?;
    validate_crs_provenance(&provenance)?;
    Ok(provenance)
}

pub fn validate_crs_provenance(provenance: &CrsProvenance) -> Result<(), String> {
    ensure_crs_provenance_contract_definition()?;
    if provenance.document_kind != CRS_DOCUMENT_KIND {
        return Err("documentKind must equal crs".into());
    }
    validate_rfc3339(&provenance.generated_at_utc, "generatedAtUtc")?;
    parse_compatible_backend_version(&provenance.compatible_backend_version)
        .map_err(|error| format!("compatibleBackendVersion {error}"))?;
    validate_non_empty(
        &provenance.subcircuit_library.package_name,
        "subcircuitLibrary.packageName",
    )?;
    parse_package_version(&provenance.subcircuit_library.package_version)
        .map_err(|error| format!("subcircuitLibrary.packageVersion {error}"))?;
    crate::subcircuit_source_digest::validate_source_digest(
        &provenance.subcircuit_library.source_digest,
    )?;
    provenance.require_protocol(crate::univariate_crs::UNIVARIATE_CRS_SCHEMA_ID)?;
    let names = crs_archive_root_file_names()?;
    if provenance.artifacts.len() + 1 != names.len() {
        return Err("artifacts must contain exactly the protocol's CRS payload files".into());
    }
    for name in names
        .iter()
        .filter(|name| name.as_str() != CRS_PROVENANCE_FILE_NAME)
    {
        let digest = provenance
            .artifacts
            .get(name)
            .ok_or_else(|| format!("artifacts is missing {name}"))?;
        validate_sha256(digest, &format!("artifacts.{name}"))?;
    }
    if let Some(version) = &provenance.ceremony_protocol_version {
        if version != CEREMONY_PROTOCOL_VERSION {
            return Err(format!(
                "ceremonyProtocolVersion must equal {CEREMONY_PROTOCOL_VERSION}"
            ));
        }
    }
    if let Some(digest) = &provenance.ceremony_transcript_sha256 {
        validate_sha256(digest, "ceremonyTranscriptSha256")?;
    }
    match (
        provenance.generation_method,
        provenance.phase2_contribution_count,
    ) {
        (CrsGenerationMethod::Mpc, Some(count)) if count > 0 => {}
        (CrsGenerationMethod::Mpc, _) => {
            return Err("MPC provenance must record a positive phase2ContributionCount".into())
        }
        (CrsGenerationMethod::TrustedSetup, None) => {}
        (CrsGenerationMethod::TrustedSetup, Some(_)) => {
            return Err("trusted-setup provenance must not record phase2ContributionCount".into())
        }
    }

    if let Some(Phase1SourceProvenance::Filecoin(source)) = &provenance.phase1_source_provenance {
        validate_non_empty(
            &source.source_url,
            "phase1SourceProvenance.filecoin.sourceUrl",
        )?;
        if source.source_blake2b512.len() != 128
            || !source
                .source_blake2b512
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err("phase1SourceProvenance.filecoin.sourceBlake2b512 must be 128 lowercase hexadecimal characters".into());
        }
    }
    Ok(())
}

fn validate_rfc3339(value: &str, field: &str) -> Result<(), String> {
    DateTime::parse_from_rfc3339(value)
        .map(|_| ())
        .map_err(|error| format!("{field} must be an RFC 3339 date-time: {error}"))
}

fn validate_non_empty(value: &str, field: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!("{field} must not be empty"));
    }
    Ok(())
}

fn validate_sha256(value: &str, field: &str) -> Result<(), String> {
    if value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Ok(());
    }
    Err(format!(
        "{field} must be a lower-case 64-character SHA-256 digest"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn common_contract_and_artifact_sets_are_valid() {
        ensure_crs_provenance_contract_definition().unwrap();
        assert_eq!(crs_archive_root_file_names().unwrap().len(), 5);
        assert!(validate_supported_schema_keywords(
            &serde_json::json!({"unsupported":true}),
            "test"
        )
        .is_err());
    }

    #[test]
    fn canonical_sources_share_one_parser_and_round_trip() {
        for fixture in [
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance.json"),
            include_str!("../../../common/contracts/fixtures/trusted-setup-crs-provenance.json"),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-null.json"),
        ] {
            let original: serde_json::Value = serde_json::from_str(fixture).unwrap();
            let p = parse_crs_provenance(fixture.as_bytes()).unwrap();
            assert_eq!(serde_json::to_value(&p).unwrap(), original);
            let mut trusted = p.clone();
            trusted.generation_method = CrsGenerationMethod::TrustedSetup;
            trusted.release_eligible = false;
            trusted.phase1_source_provenance = None;
            trusted.ceremony_protocol_version = None;
            trusted.ceremony_transcript_sha256 = None;
            trusted.phase2_contribution_count = None;
            let encoded = serde_json::to_value(&trusted).unwrap();
            assert_eq!(
                original.as_object().unwrap().keys().collect::<Vec<_>>(),
                encoded.as_object().unwrap().keys().collect::<Vec<_>>()
            );
            assert_eq!(
                parse_crs_provenance(&serde_json::to_vec(&trusted).unwrap()).unwrap(),
                trusted
            );
            // Eligibility is not an algorithm-consumer gate.
            trusted.release_eligible = true;
            assert!(parse_crs_provenance(&serde_json::to_vec(&trusted).unwrap()).is_ok());
        }
    }

    #[test]
    fn common_shape_requires_all_fields_and_exact_artifact_names() {
        let value: serde_json::Value = serde_json::from_str(include_str!(
            "../../../common/contracts/fixtures/final-mpc-crs-provenance.json"
        ))
        .unwrap();
        for field in value.as_object().unwrap().keys() {
            let mut missing = value.clone();
            missing.as_object_mut().unwrap().remove(field);
            assert!(
                parse_crs_provenance(&serde_json::to_vec(&missing).unwrap()).is_err(),
                "{field}"
            );
        }
        for name in value["artifacts"].as_object().unwrap().keys() {
            let mut wrong = value.clone();
            let digest = wrong["artifacts"]
                .as_object_mut()
                .unwrap()
                .remove(name)
                .unwrap();
            wrong["artifacts"]["unexpected.rkyv"] = digest;
            assert!(parse_crs_provenance(&serde_json::to_vec(&wrong).unwrap()).is_err());
        }
    }

    #[test]
    fn contribution_count_is_required_for_mpc_and_absent_for_trusted_setup() {
        let bytes =
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance.json");
        let mut mpc: serde_json::Value = serde_json::from_str(bytes).unwrap();
        mpc["phase2ContributionCount"] = serde_json::json!(0);
        assert!(parse_crs_provenance(&serde_json::to_vec(&mpc).unwrap()).is_err());

        mpc["phase2ContributionCount"] = serde_json::Value::Null;
        assert!(parse_crs_provenance(&serde_json::to_vec(&mpc).unwrap()).is_err());

        mpc["phase2ContributionCount"] = serde_json::json!(1);
        mpc["generationMethod"] = serde_json::json!("trustedSetup");
        assert!(parse_crs_provenance(&serde_json::to_vec(&mpc).unwrap()).is_err());
    }

    #[test]
    fn malformed_contract_fixtures_are_rejected() {
        for fixture in [
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-malformed.json"),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-legacy.json"),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-missing-source-digest.json"),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-leading-zero.json"),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-date-only.json"),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-invalid-digest.json"),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-empty-string.json"),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-invalid-phase1.json"),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-invalid-origin.json"),
            include_str!("../../../common/contracts/fixtures/final-mpc-crs-provenance-invalid-source-digest.json"),
        ] {
            assert!(parse_crs_provenance(fixture.as_bytes()).is_err(), "{fixture}");
        }
    }
}
