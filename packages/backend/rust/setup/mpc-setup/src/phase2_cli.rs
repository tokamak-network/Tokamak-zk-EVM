//! Resumable operations with contributor-local input authentication on every run.
use crate::{
    circuit_input::{self, Mode},
    filecoin_source,
    phase2_engine::Engine,
    phase2_transcript::{Identity, Transcript},
};
use backend_univariate_crs_interface::archive;
use clap::Parser;
use libs::crs_provenance::{
    CrsGenerationMethod, CrsProvenance, FilecoinSourceProvenance, Phase1SourceProvenance,
    CEREMONY_PROTOCOL_VERSION, CRS_DOCUMENT_KIND,
};
use libs::frontend_artifacts::normalized_library::NormalizedSubcircuitLibrary;
use libs::r1cs::SubcircuitR1CS;
use libs::univariate_crs::{UnivariateCrsShape, UNIVARIATE_CRS_SCHEMA_ID};
use libs::univariate_setup::SetupCrs;
use rayon::prelude::*;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::Instant;

#[derive(Parser)]
#[command(
    name = "mpc",
    about = "Tokamak phase 2 using independently authenticated Filecoin input"
)]
struct Args {
    /// Exact npm library version for --step init; defaults to the latest compatible release.
    #[arg(long)]
    library_version: Option<String>,
    /// Local QAP library directory; required for init-dev and development transcripts.
    #[arg(long, value_name = "PATH")]
    subcircuit_library: Option<PathBuf>,
    /// Original Filecoin challenge_19 acquired by this participant. Omit to
    /// download the pinned original. The full digest is checked on every run.
    #[arg(long)]
    filecoin_source: Option<PathBuf>,
    /// Select the MPC operation to run.
    #[arg(long, value_enum)]
    step: Step,
    /// Input transcript for contribute, verify or finalize.
    #[arg(long)]
    input: Option<PathBuf>,
    /// Output transcript or finalized CRS directory, depending on --step.
    #[arg(long)]
    output: Option<PathBuf>,
    /// Completed CRS directory to upload.
    #[arg(long)]
    crs_directory: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, clap::ValueEnum)]
enum Step {
    Init,
    InitDev,
    Contribute,
    Verify,
    Finalize,
    Upload,
}

enum Operation {
    Init { output: PathBuf },
    InitDev { output: PathBuf },
    Contribute { input: PathBuf, output: PathBuf },
    Verify { input: PathBuf },
    Finalize { input: PathBuf, output: PathBuf },
    Upload { crs_directory: PathBuf },
}

impl Args {
    fn operation(&self) -> Result<Operation, String> {
        let no_unexpected_paths = |allowed_input: bool,
                                   allowed_output: bool,
                                   allowed_crs_directory: bool|
         -> Result<(), String> {
            if self.input.is_some() && !allowed_input {
                return Err("--input is not used by this step".into());
            }
            if self.output.is_some() && !allowed_output {
                return Err("--output is not used by this step".into());
            }
            if self.crs_directory.is_some() && !allowed_crs_directory {
                return Err("--crs-directory is not used by this step".into());
            }
            Ok(())
        };
        match self.step {
            Step::Init => {
                no_unexpected_paths(false, true, false)?;
                Ok(Operation::Init {
                    output: self.output.clone().ok_or("init requires --output PATH")?,
                })
            }
            Step::InitDev => {
                no_unexpected_paths(false, true, false)?;
                Ok(Operation::InitDev {
                    output: self
                        .output
                        .clone()
                        .ok_or("init-dev requires --output PATH")?,
                })
            }
            Step::Contribute => {
                no_unexpected_paths(true, true, false)?;
                Ok(Operation::Contribute {
                    input: self
                        .input
                        .clone()
                        .ok_or("contribute requires --input PATH")?,
                    output: self
                        .output
                        .clone()
                        .ok_or("contribute requires --output PATH")?,
                })
            }
            Step::Verify => {
                no_unexpected_paths(true, false, false)?;
                Ok(Operation::Verify {
                    input: self.input.clone().ok_or("verify requires --input PATH")?,
                })
            }
            Step::Finalize => {
                no_unexpected_paths(true, true, false)?;
                Ok(Operation::Finalize {
                    input: self.input.clone().ok_or("finalize requires --input PATH")?,
                    output: self
                        .output
                        .clone()
                        .ok_or("finalize requires --output PATH")?,
                })
            }
            Step::Upload => {
                no_unexpected_paths(false, false, true)?;
                Ok(Operation::Upload {
                    crs_directory: self
                        .crs_directory
                        .clone()
                        .ok_or("upload requires --crs-directory PATH")?,
                })
            }
        }
    }
}

pub fn run() -> Result<(), String> {
    execute(Args::parse())
}

fn execute(args: Args) -> Result<(), String> {
    let operation = args.operation()?;
    if let Operation::Upload { crs_directory } = &operation {
        if args.library_version.is_some()
            || args.subcircuit_library.is_some()
            || args.filecoin_source.is_some()
        {
            return Err(
                "upload accepts only --step upload and --crs-directory; setup inputs are not used"
                    .into(),
            );
        }
        let mut snapshot = crate::publication::read_finalized_snapshot(crs_directory)?;
        let mut drive = crate::drive::GoogleDrive::connect()?;
        let root = drive.root.clone();
        let url = crate::publication::upload(&mut drive, &root, &mut snapshot)?;
        println!("[mpc] upload complete: {url}");
        return Ok(());
    }
    let (mode, library_version) = mode_and_library_version_for_run(&args, &operation)?;
    let all = Instant::now();
    let started = Instant::now();
    let directory = tempfile::Builder::new()
        .prefix("tokamak-mpc-input-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    let (path, library) = circuit_input::prepare(
        mode,
        library_version.as_deref(),
        args.subcircuit_library.as_deref(),
        directory.path(),
    )?;
    let normalized_library =
        NormalizedSubcircuitLibrary::read_from_qap_path(&path).map_err(|e| {
            format!(
                "circuit library {} is incompatible with the current protocol: {e}",
                library.package_version
            )
        })?;
    let shape = UnivariateCrsShape::from_normalized_setup(
        &normalized_library.setup,
        normalized_library.public.free_public_len(),
    )
    .map_err(|e| format!("circuit library is incompatible with the current protocol: {e}"))?;
    let r1cs = normalized_library
        .subcircuits
        .par_iter()
        .enumerate()
        .map(|(k, info)| {
            if info.id != k {
                return Err("circuit catalog ID/order mismatch".into());
            }
            SubcircuitR1CS::from_normalized_r1cs_sparse_only(
                path.join(format!("r1cs/subcircuit{k}.r1cs")),
                &normalized_library.setup,
                info,
            )
            .map_err(|e| e.to_string())
        })
        .collect::<Result<Vec<_>, String>>()?;
    let circuits = r1cs
        .iter()
        .zip(normalized_library.subcircuits.iter())
        .map(|(r, i)| r.as_normalized_univariate_subcircuit(i))
        .collect::<Vec<_>>();
    println!(
        "[mpc] {} input {} in {:.6}s",
        mode.name(),
        library.package_version,
        started.elapsed().as_secs_f64()
    );

    // There is no branch accepting a tau artifact, subset digest, verification
    // receipt or previous participant's source check. No share is sampled yet.
    let started = Instant::now();
    println!(
        "[mpc] authenticating Filecoin source (producer revision {})",
        filecoin_source::SOURCE_REVISION
    );
    let tau = match args.filecoin_source {
        Some(path) => filecoin_source::prepare_local(&path, &shape),
        None => filecoin_source::prepare_download(&shape),
    }
    .map_err(|e| e.to_string())?;
    println!(
        "[mpc] original source authentication and derivation in {:.6}s",
        started.elapsed().as_secs_f64()
    );
    let identity = Identity {
        mode,
        version: library.package_version.clone(),
        library_digest: hex::decode(
            library
                .source_digest
                .strip_prefix("sha256:")
                .ok_or("invalid circuit source digest")?,
        )
        .map_err(|e| e.to_string())?
        .try_into()
        .map_err(|_| "invalid circuit source digest length")?,
        tau_digest: Sha256::digest(
            archive::to_bytes::<archive::rancor::Error>(&tau).map_err(|e| e.to_string())?,
        )
        .into(),
    };
    let started = Instant::now();
    let engine = Engine::initialize(&normalized_library, &circuits, &tau)?;
    println!(
        "[mpc] encoded-power initialization in {:.6}s",
        started.elapsed().as_secs_f64()
    );
    let started = Instant::now();
    let input = match &operation {
        Operation::Init { .. } | Operation::InitDev { .. } => None,
        Operation::Contribute { input, .. }
        | Operation::Verify { input }
        | Operation::Finalize { input, .. } => Some(input),
        Operation::Upload { .. } => unreachable!("upload handled before MPC setup"),
    };
    let transcript = if let Some(input) = input {
        Transcript::read(
            std::fs::read(input).map_err(|e| e.to_string())?,
            &engine,
            &identity,
        )?
    } else {
        Transcript::initialize(&engine, &identity)?
    };
    println!(
        "[mpc] verified {} contributions in {:.6}s",
        transcript.contributions(),
        started.elapsed().as_secs_f64()
    );
    let started = Instant::now();
    match operation {
        Operation::Init { output } | Operation::InitDev { output } => {
            transcript.write_new(&output)?
        }
        Operation::Contribute { output, .. } => {
            transcript
                .contribute(&mut rand::rngs::OsRng)?
                .write_new(&output)?;
        }
        Operation::Verify { .. } => {}
        Operation::Finalize { output, .. } => {
            if transcript.contributions() == 0 {
                return Err("finalization requires a verified participant contribution".into());
            }
            let (prover, preprocess, verifier) =
                transcript.state().final_keys(&tau, &normalized_library)?;
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
                release_eligible: mode == Mode::Publish,
                generated_at_utc: chrono::Utc::now().to_rfc3339(),
                compatible_backend_version:
                    libs::compatibility::compatibility_from_package_version(env!(
                        "CARGO_PKG_VERSION"
                    ))
                    .map_err(|e| e.to_string())?
                    .to_string(),
                subcircuit_library: library,
                phase1_source_provenance: Some(Phase1SourceProvenance::Filecoin(
                    FilecoinSourceProvenance {
                        source_url: filecoin_source::SOURCE_URL.into(),
                        source_blake2b512: filecoin_source::SOURCE_DIGEST.into(),
                    },
                )),
                ceremony_protocol_version: Some(CEREMONY_PROTOCOL_VERSION.into()),
                ceremony_transcript_sha256: Some(transcript.file_digest()),
                phase2_contribution_count: Some(transcript.contributions() as u64),
                artifacts: Default::default(),
            };
            let release_eligible = mode == Mode::Publish;
            crate::publication::finalize(&output, &crs, provenance, release_eligible)?;
            if release_eligible {
                println!(
                    "[mpc] finalized release-eligible CRS at {}; run the upload operation to send it to Google Drive",
                    output.display()
                );
            } else {
                println!("[mpc] finalized local CRS; releaseEligible=false, no upload requested");
            }
        }
        Operation::Upload { .. } => unreachable!("upload handled before MPC setup"),
    }
    println!(
        "[mpc] operation/output in {:.6}s; total {:.6}s",
        started.elapsed().as_secs_f64(),
        all.elapsed().as_secs_f64()
    );
    Ok(())
}

fn mode_and_library_version_for_run(
    args: &Args,
    operation: &Operation,
) -> Result<(Mode, Option<String>), String> {
    if args.library_version.is_some() && !matches!(operation, Operation::Init { .. }) {
        return Err("--library-version is only accepted with --step init".into());
    }
    match operation {
        Operation::Init { .. } => {
            Mode::Publish.validate(
                args.library_version.as_deref(),
                args.subcircuit_library.as_deref(),
            )?;
            Ok((Mode::Publish, args.library_version.clone()))
        }
        Operation::InitDev { .. } => {
            Mode::Development.validate(
                args.library_version.as_deref(),
                args.subcircuit_library.as_deref(),
            )?;
            Ok((Mode::Development, None))
        }
        Operation::Contribute { input, .. }
        | Operation::Verify { input }
        | Operation::Finalize { input, .. } => {
            match Transcript::library_version_from_file(input)? {
                Some(version) => {
                    Mode::Publish.validate(Some(&version), args.subcircuit_library.as_deref())?;
                    Ok((Mode::Publish, Some(version)))
                }
                None => {
                    Mode::Development.validate(None, args.subcircuit_library.as_deref())?;
                    Ok((Mode::Development, None))
                }
            }
        }
        Operation::Upload { .. } => unreachable!("upload handled before MPC setup"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(step: Step, input: Option<PathBuf>, output: Option<PathBuf>) -> Args {
        Args {
            library_version: None,
            subcircuit_library: None,
            filecoin_source: None,
            step,
            input,
            output,
            crs_directory: None,
        }
    }

    #[test]
    fn command_surface_uses_init_variants_and_no_mode_flag() {
        for (step, extra) in [
            ("init", vec!["--output", "init.mpc"]),
            (
                "init-dev",
                vec!["--subcircuit-library", "library", "--output", "init.mpc"],
            ),
            (
                "contribute",
                vec!["--input", "init.mpc", "--output", "next.mpc"],
            ),
            ("verify", vec!["--input", "final.mpc"]),
            ("finalize", vec!["--input", "final.mpc", "--output", "crs"]),
            ("upload", vec!["--crs-directory", "crs"]),
        ] {
            let mut argv = vec!["mpc", "--step", step];
            argv.extend(extra);
            assert!(Args::try_parse_from(argv).is_ok(), "{step}");
        }
        assert!(Args::try_parse_from(["mpc", "--mode", "publish", "--step", "init"]).is_err());
        assert!(Args::try_parse_from(["mpc", "init", "--output", "init.mpc"]).is_err());
    }

    #[test]
    fn each_step_requires_only_its_own_path_arguments() {
        let valid = [
            args(Step::Init, None, Some("init.mpc".into())),
            args(Step::InitDev, None, Some("init.mpc".into())),
            args(
                Step::Contribute,
                Some("input.mpc".into()),
                Some("output.mpc".into()),
            ),
            args(Step::Verify, Some("input.mpc".into()), None),
            args(Step::Finalize, Some("input.mpc".into()), Some("crs".into())),
        ];
        for args in valid {
            assert!(args.operation().is_ok(), "{:?}", args.step);
        }
        assert!(args(Step::Contribute, None, Some("output.mpc".into()))
            .operation()
            .is_err());
        assert!(args(Step::Finalize, Some("input.mpc".into()), None)
            .operation()
            .is_err());
        assert!(args(Step::Verify, None, None).operation().is_err());
        assert!(args(
            Step::Verify,
            Some("input.mpc".into()),
            Some("unexpected".into())
        )
        .operation()
        .is_err());
        let mut upload = args(Step::Upload, None, None);
        upload.crs_directory = Some("crs".into());
        assert!(upload.operation().is_ok());
        upload.output = Some("unexpected".into());
        assert!(upload.operation().is_err());
    }

    #[test]
    fn init_step_selects_the_mode_and_library_source() {
        let publish = args(Step::Init, None, Some("init.mpc".into()));
        assert_eq!(
            mode_and_library_version_for_run(&publish, &publish.operation().unwrap()).unwrap(),
            (Mode::Publish, None)
        );
        let mut pinned = publish;
        pinned.library_version = Some(env!("CARGO_PKG_VERSION").into());
        assert_eq!(
            mode_and_library_version_for_run(&pinned, &pinned.operation().unwrap()).unwrap(),
            (Mode::Publish, Some(env!("CARGO_PKG_VERSION").into()))
        );

        let mut development = args(Step::InitDev, None, Some("init.mpc".into()));
        development.subcircuit_library = Some("library".into());
        assert_eq!(
            mode_and_library_version_for_run(&development, &development.operation().unwrap())
                .unwrap(),
            (Mode::Development, None)
        );
        development.library_version = Some(env!("CARGO_PKG_VERSION").into());
        assert!(
            mode_and_library_version_for_run(&development, &development.operation().unwrap())
                .is_err()
        );
        assert!(mode_and_library_version_for_run(
            &args(Step::InitDev, None, Some("init.mpc".into())),
            &args(Step::InitDev, None, Some("init.mpc".into()))
                .operation()
                .unwrap()
        )
        .is_err());
    }

    #[test]
    fn later_steps_infer_source_mode_from_the_transcript_header() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("initial.mpc");
        let version = env!("CARGO_PKG_VERSION");
        let mut publish_header = b"TOKAMAK_MPC_PHASE2_TRANSCRIPT_V1\0".to_vec();
        publish_header.extend([1, 1]);
        publish_header.extend_from_slice(&(version.len() as u16).to_be_bytes());
        publish_header.extend_from_slice(version.as_bytes());
        std::fs::write(&input, publish_header).unwrap();

        let mut publish = args(
            Step::Contribute,
            Some(input.clone()),
            Some(dir.path().join("next.mpc")),
        );
        let operation = publish.operation().unwrap();
        assert_eq!(
            mode_and_library_version_for_run(&publish, &operation).unwrap(),
            (Mode::Publish, Some(version.to_owned()))
        );
        let finalize = args(
            Step::Finalize,
            Some(input.clone()),
            Some(dir.path().join("crs")),
        );
        assert_eq!(
            mode_and_library_version_for_run(&finalize, &finalize.operation().unwrap()).unwrap(),
            (Mode::Publish, Some(version.to_owned()))
        );
        let verify = args(Step::Verify, Some(input.clone()), None);
        assert_eq!(
            mode_and_library_version_for_run(&verify, &verify.operation().unwrap()).unwrap(),
            (Mode::Publish, Some(version.to_owned()))
        );
        let mut version_override = verify;
        version_override.library_version = Some(version.into());
        assert!(mode_and_library_version_for_run(
            &version_override,
            &version_override.operation().unwrap()
        )
        .unwrap_err()
        .contains("only accepted with --step init"));
        publish.library_version = Some(version.into());
        assert!(mode_and_library_version_for_run(&publish, &operation)
            .unwrap_err()
            .contains("only accepted with --step init"));

        let dev_input = dir.path().join("development.mpc");
        std::fs::write(&dev_input, b"TOKAMAK_MPC_PHASE2_TRANSCRIPT_V1\0\x01\x00").unwrap();
        let mut development = args(
            Step::Contribute,
            Some(dev_input),
            Some(dir.path().join("development-next.mpc")),
        );
        development.subcircuit_library = Some("local-library".into());
        assert_eq!(
            mode_and_library_version_for_run(&development, &development.operation().unwrap())
                .unwrap(),
            (Mode::Development, None)
        );
        let mut dev_verify = args(Step::Verify, development.input.clone(), None);
        dev_verify.subcircuit_library = Some("local-library".into());
        assert_eq!(
            mode_and_library_version_for_run(&dev_verify, &dev_verify.operation().unwrap())
                .unwrap(),
            (Mode::Development, None)
        );
        development.subcircuit_library = None;
        assert!(
            mode_and_library_version_for_run(&development, &development.operation().unwrap())
                .is_err()
        );
    }

    #[test]
    fn upload_does_not_take_mode_or_ceremony_inputs() {
        let dir = tempfile::tempdir().unwrap();
        let mut args = args(Step::Upload, None, None);
        args.crs_directory = Some(dir.path().join("missing-crs"));
        args.filecoin_source = Some(dir.path().join("unused-source"));
        let error = execute(args).unwrap_err();
        assert!(error.contains("setup inputs are not used"));
    }
}
