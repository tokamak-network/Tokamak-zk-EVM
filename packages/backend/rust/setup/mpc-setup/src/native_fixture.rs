//! Opt-in native E2E key preparation, never compiled into the operator binary.
//! The generated development tau is not authenticated Filecoin phase 1 output.
use crate::{
    circuit_input::{self, Mode},
    phase2_engine::Engine,
    phase2_transcript::{Identity, Transcript},
};
use ark_ec::AffineRepr;
use backend_univariate_crs_interface::{archive, TauSequenceRkyv};
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use libs::{
    crs_provenance::{
        CrsGenerationMethod, CrsProvenance, CEREMONY_PROTOCOL_VERSION, CRS_DOCUMENT_KIND,
    },
    frontend_artifacts::normalized_library::NormalizedSubcircuitLibrary,
    r1cs::SubcircuitR1CS,
    univariate_crs::UNIVARIATE_CRS_SCHEMA_ID,
    univariate_setup::{generate_normalized, SetupCrs, SetupScalars},
};
use rand::SeedableRng;
use rayon::prelude::*;
use sha2::{Digest, Sha256};
use std::{path::PathBuf, time::Instant};

fn required(name: &str) -> PathBuf {
    std::env::var_os(name)
        .unwrap_or_else(|| panic!("set {name}"))
        .into()
}

#[test]
#[ignore = "prepares full local-QAP test MPC keys for native E2E"]
fn prepare_native_e2e_keys() {
    #[cfg(feature = "timing")]
    struct PrintTiming;
    #[cfg(feature = "timing")]
    impl Drop for PrintTiming {
        fn drop(&mut self) {
            for event in libs::timing::take_events() {
                println!("[mpc-timing] {}", serde_json::to_string(&event).unwrap());
            }
        }
    }
    #[cfg(feature = "timing")]
    let _timing = PrintTiming;
    let output = required("MPC_TEST_OUTPUT");
    assert!(!output.exists(), "use a new test output directory");
    let all = Instant::now();
    let temporary = tempfile::tempdir().unwrap();
    let local_library = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../frontend/qap-compiler/subcircuits/library");
    let (path, library) = circuit_input::prepare(
        Mode::Development,
        None,
        Some(&local_library),
        temporary.path(),
    )
    .unwrap();
    let normalized_library = NormalizedSubcircuitLibrary::read_from_qap_path(&path).unwrap();
    let r1cs = normalized_library
        .subcircuits
        .par_iter()
        .enumerate()
        .map(|(k, info)| {
            assert_eq!(info.id, k);
            SubcircuitR1CS::from_normalized_r1cs_sparse_only(
                path.join(format!("r1cs/subcircuit{k}.r1cs")),
                &normalized_library.setup,
                info,
            )
            .unwrap()
        })
        .collect::<Vec<_>>();
    let circuits = r1cs
        .iter()
        .zip(normalized_library.subcircuits.iter())
        .map(|(r, i)| r.as_normalized_univariate_subcircuit(i))
        .collect::<Vec<_>>();
    println!("[test-mpc] preparing standard-generator synthetic tau");
    let g1_record = crate::phase2_engine::encode_g1(ark_bls12_381::G1Affine::generator());
    let g2_record = crate::phase2_engine::encode_g2(ark_bls12_381::G2Affine::generator());
    let mut g1 = icicle_bls12_381::curve::G1Affine::zero();
    g1.x = FieldImpl::from_bytes_le(&g1_record.x);
    g1.y = FieldImpl::from_bytes_le(&g1_record.y);
    let mut g2 = icicle_bls12_381::curve::G2Affine::zero();
    g2.x = FieldImpl::from_bytes_le(&g2_record.x);
    g2.y = FieldImpl::from_bytes_le(&g2_record.y);
    let scalars = SetupScalars {
        tau: ScalarField::from_u32(7),
        xi: ScalarField::from_u32(11),
        psi: ScalarField::from_u32(13),
        delta: ScalarField::one(),
        weights: vec![ScalarField::one(); normalized_library.setup.m],
    };
    // Reuse the test oracle's public API for tau only. Its other keys are
    // immediately discarded, not passed to native consumers or persisted.
    let tau: TauSequenceRkyv =
        generate_normalized(&normalized_library, &circuits, &scalars, g1, g2)
            .unwrap()
            .tau;
    let tau_bytes = archive::to_bytes::<archive::rancor::Error>(&tau).unwrap();
    assert_eq!(
        tau.s0_g1[0],
        crate::phase2_engine::encode_g1(ark_bls12_381::G1Affine::generator()),
        "test tau must use the Filecoin-standard G1 generator"
    );
    assert_eq!(
        tau.tau_powers_g2[0],
        crate::phase2_engine::encode_g2(ark_bls12_381::G2Affine::generator()),
        "test tau must use the Filecoin-standard G2 generator"
    );
    let identity = Identity {
        mode: Mode::Development,
        version: library.package_version.clone(),
        library_digest: hex::decode(library.source_digest.strip_prefix("sha256:").unwrap())
            .unwrap()
            .try_into()
            .unwrap(),
        tau_digest: Sha256::digest(&tau_bytes).into(),
    };
    drop(tau_bytes);
    println!(
        "[test-mpc] generated synthetic tau; local QAP {}; input preparation {:.3}s",
        library.source_digest,
        all.elapsed().as_secs_f64()
    );
    let started = Instant::now();
    println!("[test-mpc] starting encoded-power initialization");
    let engine = Engine::initialize(&normalized_library, &circuits, &tau).unwrap();
    println!(
        "[test-mpc] initialization {:.3}s; packed={} weighted={}",
        started.elapsed().as_secs_f64(),
        engine.initial().packed.len(),
        engine.initial().weighted.len()
    );
    let mut transcript = Transcript::initialize(&engine, &identity).unwrap();
    for seed in [1u8, 2] {
        let started = Instant::now();
        println!("[test-mpc] starting contribution {seed}, including new-record verification");
        let mut rng = rand_chacha::ChaCha20Rng::from_seed([seed; 32]);
        transcript = transcript.contribute(&mut rng).unwrap();
        println!(
            "[test-mpc] contribution {seed} verified in {:.3}s",
            started.elapsed().as_secs_f64()
        );
    }
    assert_eq!(transcript.contributions(), 2);
    assert_eq!(engine.state_check_count(), 2);
    let started = Instant::now();
    println!("[test-mpc] starting verified final-key projection");
    let (prover, preprocess, verifier) = transcript
        .state()
        .final_keys(&tau, &normalized_library)
        .unwrap();
    assert_eq!(engine.state_check_count(), 2);
    let crs = SetupCrs {
        tau,
        prover,
        preprocess,
        verifier,
    };
    let provenance = CrsProvenance {
        document_kind: CRS_DOCUMENT_KIND.into(),
        protocol_schema_id: UNIVARIATE_CRS_SCHEMA_ID.into(),
        generation_method: CrsGenerationMethod::Mpc,
        release_eligible: false,
        generated_at_utc: chrono::Utc::now().to_rfc3339(),
        compatible_backend_version: libs::compatibility::compatibility_from_package_version(env!(
            "CARGO_PKG_VERSION"
        ))
        .unwrap()
        .to_string(),
        subcircuit_library: library,
        // No Filecoin source was consumed or authenticated by this fixture.
        phase1_source_provenance: None,
        ceremony_protocol_version: Some(CEREMONY_PROTOCOL_VERSION.into()),
        ceremony_transcript_sha256: Some(transcript.file_digest()),
        phase2_contribution_count: Some(transcript.contributions() as u64),
        artifacts: Default::default(),
    };
    crate::publication::finalize(&output, &crs, provenance, false).unwrap();
    println!("[test-mpc] final projection/archive {:.3}s; output {}; total {:.3}s; TEST ONLY, NOT FILECOIN QUALIFICATION", started.elapsed().as_secs_f64(), output.display(), all.elapsed().as_secs_f64());
}
