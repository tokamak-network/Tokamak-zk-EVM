//! Metadata alone must not admit missing publication payloads.
use std::process::Command;

#[test]
fn workflow_rejects_missing_payloads_even_when_the_manifest_claims_eligibility() {
    let mut value: serde_json::Value = serde_json::from_str(include_str!(
        "../../../common/contracts/fixtures/final-mpc-crs-provenance.json"
    ))
    .unwrap();
    let directory = tempfile::tempdir().unwrap();
    for eligible in [false, true] {
        value["releaseEligible"] = eligible.into();
        std::fs::write(
            directory.path().join("crs_provenance.json"),
            serde_json::to_vec(&value).unwrap(),
        )
        .unwrap();
        let output = Command::new(env!("CARGO_BIN_EXE_check_crs_publication"))
            .arg(directory.path())
            .output()
            .unwrap();
        assert!(!output.status.success());
        assert!(String::from_utf8_lossy(&output.stderr).contains("publication admission failed"));
    }
}
