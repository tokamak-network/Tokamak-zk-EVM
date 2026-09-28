use backend_univariate_crs_interface::{
    archive, ArchivedPreprocessKeysRkyv, ArchivedProverKeysRkyv, ArchivedTauSequenceRkyv,
    ArchivedVerifierKeysRkyv,
};
use libs::crs_provenance::parse_crs_provenance;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

fn run(library: &Path, output: &Path, fixed: bool) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_trusted-setup"));
    command
        .arg("--subcircuit-library")
        .arg(library)
        .arg("--output")
        .arg(output);
    if fixed {
        command.arg("--fixed-tau");
    }
    let bundled =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../external-lib/mac/lib/backend");
    if std::env::var_os("ICICLE_BACKEND_INSTALL_DIR").is_none() && bundled.is_dir() {
        command.env("ICICLE_BACKEND_INSTALL_DIR", bundled);
    }
    command.output().expect("trusted setup must start")
}

fn successful(library: &Path, output: &Path, fixed: bool) {
    let result = run(library, output, fixed);
    assert!(
        result.status.success(),
        "stdout: {}\nstderr: {}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

fn aligned(path: &Path) -> archive::util::AlignedVec<16> {
    let mut bytes = archive::util::AlignedVec::new();
    bytes.extend_from_slice(&fs::read(path).unwrap());
    bytes
}

#[test]
fn one_command_activates_four_minimal_archives_and_matching_provenance() {
    let workspace = tempfile::tempdir().unwrap();
    let library = create_minimal_library(workspace.path());
    let active = workspace.path().join("active");
    successful(&library, &active, true);
    assert!(fs::symlink_metadata(&active)
        .unwrap()
        .file_type()
        .is_symlink());
    assert_eq!(fs::read_dir(&active).unwrap().count(), 5);
    let bytes = fs::read(active.join("crs_provenance.json")).unwrap();
    let provenance = parse_crs_provenance(&bytes).unwrap();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["releaseEligible"], false);
    assert_eq!(json["subcircuitLibrary"]["origin"], "localQapCompiler");
    assert!(json["subcircuitLibrary"]["packageVersion"].is_string());
    assert!(json.get("terminalCapacity").is_none());
    assert_eq!(json["documentKind"], "crs");
    assert_eq!(json["generationMethod"], "trustedSetup");
    assert_eq!(json["ceremonyTranscriptSha256"], serde_json::Value::Null);
    assert_eq!(json["phase2ContributionCount"], serde_json::Value::Null);
    for (name, digest) in &provenance.artifacts {
        assert_eq!(
            *digest,
            hex::encode(Sha256::digest(fs::read(active.join(name)).unwrap()))
        );
    }
    let library_contract = libs::frontend_artifacts::normalized_library::NormalizedSubcircuitLibrary::read_from_qap_path(&library).unwrap();
    let setup = &library_contract.setup;
    let shape = libs::univariate_crs::UnivariateCrsShape::from_normalized_setup(
        setup,
        library_contract.public.free_public_len(),
    )
    .unwrap();
    let tau = aligned(&active.join("tau_sequence.rkyv"));
    let tau = archive::access::<ArchivedTauSequenceRkyv, archive::rancor::Error>(&tau).unwrap();
    assert_eq!(tau.s0_g1.len(), 2 * shape.declared_capacity[1] + 1);
    assert_eq!(tau.tau_powers_g2.len(), shape.declared_capacity[1] + 1);
    let prover = aligned(&active.join("prover_keys.rkyv"));
    let prover =
        archive::access::<ArchivedProverKeysRkyv, archive::rancor::Error>(&prover).unwrap();
    assert_eq!(prover.free_public_queries.len(), 1);
    assert_eq!(
        prover.nonpublic_queries.len(),
        12 // Two placements, two compiled circuits, three retained nonpublic wires each.
    );
    let preprocess = aligned(&active.join("preprocess_keys.rkyv"));
    let preprocess =
        archive::access::<ArchivedPreprocessKeysRkyv, archive::rancor::Error>(&preprocess).unwrap();
    assert_eq!(preprocess.sc_g1.len(), shape.connection_domain_size);
    assert_eq!(preprocess.selection_g2.len(), setup.s * (setup.t - 1) + 1);
    assert_eq!(preprocess.fixed_public_queries.len(), 1);
    let verifier = aligned(&active.join("verifier_keys.rkyv"));
    archive::access::<ArchivedVerifierKeysRkyv, archive::rancor::Error>(&verifier).unwrap();

    let previous = fs::canonicalize(&active).unwrap();
    successful(&library, &active, true);
    assert_ne!(fs::canonicalize(&active).unwrap(), previous);
    assert!(
        !previous.exists(),
        "obsolete generation must be deleted after activation"
    );
    assert_eq!(
        fs::read_dir(workspace.path().join("generations"))
            .unwrap()
            .count(),
        1
    );
    let mut repeated =
        parse_crs_provenance(&fs::read(active.join("crs_provenance.json")).unwrap()).unwrap();
    // Fixed randomness preserves CRS identity, not the generation timestamp.
    repeated.generated_at_utc = provenance.generated_at_utc.clone();
    assert_eq!(repeated, provenance);
}

#[test]
fn invalid_library_preserves_active_generation_and_output_files_are_not_overwritten() {
    let workspace = tempfile::tempdir().unwrap();
    let library = create_minimal_library(workspace.path());
    let active = workspace.path().join("active");
    successful(&library, &active, true);
    let previous = fs::canonicalize(&active).unwrap();
    let previous_provenance = fs::read(active.join("crs_provenance.json")).unwrap();
    let params = library.join("setupParams.json");
    let original = fs::read(&params).unwrap();
    let mut invalid: serde_json::Value = serde_json::from_slice(&original).unwrap();
    invalid["n"] = 3.into();
    fs::write(&params, serde_json::to_vec(&invalid).unwrap()).unwrap();
    assert!(!run(&library, &active, true).status.success());
    assert_eq!(fs::canonicalize(&active).unwrap(), previous);
    assert_eq!(
        fs::read(active.join("crs_provenance.json")).unwrap(),
        previous_provenance
    );
    fs::write(params, original).unwrap();
    let occupied = workspace.path().join("occupied-file");
    fs::write(&occupied, b"preserve this file").unwrap();
    assert!(!run(&library, &occupied, true).status.success());
    assert_eq!(fs::read(occupied).unwrap(), b"preserve this file");
    assert_eq!(
        fs::read_dir(workspace.path().join("generations"))
            .unwrap()
            .count(),
        1
    );
}

#[test]
fn random_setup_changes_the_generation_and_uses_the_common_contract() {
    let workspace = tempfile::tempdir().unwrap();
    let library = create_minimal_library(workspace.path());
    let active = workspace.path().join("active");
    successful(&library, &active, false);
    let first = fs::read(active.join("tau_sequence.rkyv")).unwrap();
    successful(&library, &active, false);
    assert_ne!(first, fs::read(active.join("tau_sequence.rkyv")).unwrap());
    let json: serde_json::Value =
        serde_json::from_slice(&fs::read(active.join("crs_provenance.json")).unwrap()).unwrap();
    let mut invalid = json.clone();
    invalid["artifacts"]["preprocess_keys.rkyv"] = serde_json::json!("invalid");
    assert!(parse_crs_provenance(&serde_json::to_vec(&invalid).unwrap()).is_err());
    let mut missing = json.clone();
    missing["artifacts"]
        .as_object_mut()
        .unwrap()
        .remove("preprocess_keys.rkyv");
    assert!(parse_crs_provenance(&serde_json::to_vec(&missing).unwrap()).is_err());
    // The shared parser does not decide whether an artifact may be published.
    let mut eligible = json.clone();
    eligible["releaseEligible"] = serde_json::json!(true);
    assert!(parse_crs_provenance(&serde_json::to_vec(&eligible).unwrap()).is_ok());
}

#[test]
fn withdrawn_phase_commands_and_capacity_overrides_are_rejected() {
    for args in [
        vec!["phase-1"],
        vec!["phase-2"],
        vec!["--l0", "16"],
        vec!["--tau-sequence", "unused"],
    ] {
        let result = Command::new(env!("CARGO_BIN_EXE_trusted-setup"))
            .args(args)
            .output()
            .unwrap();
        assert!(!result.status.success());
    }
}

fn create_minimal_library(root: &Path) -> PathBuf {
    let snapshot = root.join("subcircuits");
    let library = snapshot.join("library");
    for directory in [
        snapshot.join("circom"),
        library.join("json"),
        library.join("r1cs"),
        library.join("wasm"),
    ] {
        fs::create_dir_all(directory).unwrap();
    }
    fs::write(
        snapshot.join("circom/constants.circom"),
        b"pragma circom 2.1.5;\n",
    )
    .unwrap();
    fs::write(library.join("frontendCfg.json"), b"{}").unwrap();
    fs::write(
        library.join("setupParams.json"),
        br#"{
          "n": 2,
          "m": 8,
          "m_b": 4,
          "t": 4,
          "s": 2,
          "publicWirePhases": [
            {"name":"free", "region":"free", "subcircuitIds":[0]},
            {"name":"fixed", "region":"fixed", "subcircuitIds":[1]}
          ]
        }"#,
    )
    .unwrap();
    fs::write(
        library.join("subcircuitInfo.json"),
        br#"[{
          "id":0, "name":"free-buffer", "Nwires":8, "NrealWires":4, "Nconsts":0,
          "Out_idx":[1,1], "In_idx":[2,1], "Wiring_idx":[0,3],
          "Public_idx":[1,1], "Internal_idx":[4,1],
          "bufferDirection":"out", "publicPhase":"free"
        },{
          "id":1, "name":"fixed-buffer", "Nwires":8, "NrealWires":4, "Nconsts":0,
          "Out_idx":[1,1], "In_idx":[2,1], "Wiring_idx":[0,3],
          "Public_idx":[1,1], "Internal_idx":[4,1],
          "bufferDirection":"out", "publicPhase":"fixed"
        }]"#,
    )
    .unwrap();
    for id in 0..2 {
        fs::write(
            library.join(format!("r1cs/subcircuit{id}.r1cs")),
            empty_r1cs(),
        )
        .unwrap();
    }
    library
}

fn empty_r1cs() -> Vec<u8> {
    let mut header = Vec::new();
    header.extend_from_slice(&32u32.to_le_bytes());
    header.extend_from_slice(&[0u8; 32]);
    header.extend_from_slice(&8u32.to_le_bytes());
    header.extend_from_slice(&0u32.to_le_bytes());
    header.extend_from_slice(&0u32.to_le_bytes());
    header.extend_from_slice(&0u32.to_le_bytes());
    header.extend_from_slice(&8u64.to_le_bytes());
    header.extend_from_slice(&0u32.to_le_bytes());

    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"r1cs");
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&2u32.to_le_bytes());
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&(header.len() as u64).to_le_bytes());
    bytes.extend_from_slice(&header);
    bytes.extend_from_slice(&2u32.to_le_bytes());
    bytes.extend_from_slice(&0u64.to_le_bytes());
    bytes
}
