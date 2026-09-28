//! Operational metadata/payload checks, not ceremony verification or upload authority.
//! MPC finalization verifies the original source and transcript before marking a CRS eligible.
//! Algorithm consumers do not use this gate.
use crate::compatibility::compatibility_from_package_version;
use crate::crs_provenance::{
    parse_crs_provenance, CrsGenerationMethod, CrsProvenance, Phase1SourceProvenance,
    CEREMONY_PROTOCOL_VERSION, CRS_PROVENANCE_FILE_NAME,
};
use crate::input_origin::SubcircuitLibraryOrigin;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::Path;

pub fn admit_final_crs_publication(output_directory: &Path) -> Result<CrsProvenance, String> {
    let bytes = std::fs::read(output_directory.join(CRS_PROVENANCE_FILE_NAME))
        .map_err(|e| e.to_string())?;
    let provenance = parse_crs_provenance(&bytes)?;
    validate_publication_metadata(&provenance)?;
    for (name, expected) in &provenance.artifacts {
        let mut file =
            std::fs::File::open(output_directory.join(name)).map_err(|e| format!("{name}: {e}"))?;
        let mut hash = Sha256::new();
        let mut buffer = vec![0u8; 1024 * 1024];
        loop {
            let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
            if count == 0 {
                break;
            }
            hash.update(&buffer[..count]);
        }
        if format!("{:x}", hash.finalize()) != *expected {
            return Err(format!("publication payload hash mismatch: {name}"));
        }
    }
    Ok(provenance)
}

/// Checks claimed operational eligibility only; does not verify a transcript.
pub fn validate_publication_metadata(provenance: &CrsProvenance) -> Result<(), String> {
    crate::crs_provenance::validate_crs_provenance(provenance)?;
    if !provenance.release_eligible
        || provenance.generation_method != CrsGenerationMethod::Mpc
        || provenance.subcircuit_library.origin != SubcircuitLibraryOrigin::NpmSnapshot
        || provenance.subcircuit_library.package_name != "@tokamak-zk-evm/subcircuit-library"
        || !matches!(
            provenance.phase1_source_provenance,
            Some(Phase1SourceProvenance::Filecoin(_))
        )
        || provenance.ceremony_protocol_version.as_deref() != Some(CEREMONY_PROTOCOL_VERSION)
        || provenance.ceremony_transcript_sha256.is_none()
    {
        return Err("CRS publication requires eligible npm-backed Filecoin MPC metadata".into());
    }
    if compatibility_from_package_version(&provenance.subcircuit_library.package_version)
        .map_err(|e| e.to_string())?
        .to_string()
        != provenance.compatible_backend_version
    {
        return Err("publication library/backend compatibility mismatch".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn eligibility_alone_does_not_admit_missing_payloads() {
        let mut value: serde_json::Value = serde_json::from_str(include_str!(
            "../../../common/contracts/fixtures/final-mpc-crs-provenance.json"
        ))
        .unwrap();
        let directory = tempfile::tempdir().unwrap();
        for eligible in [false, true] {
            value["releaseEligible"] = eligible.into();
            std::fs::write(
                directory.path().join(CRS_PROVENANCE_FILE_NAME),
                serde_json::to_vec(&value).unwrap(),
            )
            .unwrap();
            assert!(admit_final_crs_publication(directory.path()).is_err());
        }
    }
}
