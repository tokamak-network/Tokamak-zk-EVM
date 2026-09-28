use clap::Parser;
use libs::cli::render_error;
use std::{path::PathBuf, process::ExitCode};
use verify::{
    univariate_cli::{self, OnlineVerifyInputPaths},
    VerifyError,
};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Admitted univariate_verifier_preprocess.bin emitted by preprocess
    #[arg(long, value_name = "FILE")]
    preprocess: PathBuf,

    /// Public instance.json emitted by the synthesizer
    #[arg(long, value_name = "FILE")]
    instance: PathBuf,

    /// univariate_proof.bin emitted by prove
    #[arg(long, value_name = "FILE")]
    proof: PathBuf,

    /// Report elapsed input loading and verification time on stderr
    #[arg(long)]
    timing: bool,

    /// Emit only the versioned machine-readable verification result on stdout
    #[arg(long, hide = true)]
    verification_result_json: bool,
}

fn main() -> ExitCode {
    match libs::cli::print_backend_build_identity_if_requested(
        env!("CARGO_PKG_NAME"),
        env!("CARGO_PKG_VERSION"),
        option_env!("TOKAMAK_ZKEVM_COMPATIBLE_BACKEND_VERSION"),
        option_env!("TOKAMAK_ZKEVM_SUBCIRCUIT_LIBRARY_PACKAGE_VERSION"),
        option_env!("TOKAMAK_ZKEVM_SUBCIRCUIT_LIBRARY_SOURCE_DIGEST"),
    ) {
        Ok(true) => return ExitCode::SUCCESS,
        Ok(false) => {}
        Err(error) => {
            eprintln!("error: {error}");
            return ExitCode::FAILURE;
        }
    }
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => render_error(&error),
    }
}

fn run() -> Result<(), VerifyError> {
    let config = Config::parse();
    let verification_result_json = config.verification_result_json;
    let paths = OnlineVerifyInputPaths {
        preprocess_path: &config.preprocess,
        instance_path: &config.instance,
        proof_path: &config.proof,
    };

    if !verification_result_json {
        println!("Verifying the proof...");
    }
    let start = std::time::Instant::now();
    let res_snark = univariate_cli::verify(&paths)?;
    if config.timing {
        eprintln!(
            "verify total (input + verification): {:.6} s",
            start.elapsed().as_secs_f64()
        );
    }
    if verification_result_json {
        libs::cli::print_verification_result(res_snark)
            .map_err(|reason| VerifyError::MachineResult { reason })?;
    } else {
        println!("{}", res_snark);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn online_cli_has_no_circuit_admission_or_legacy_config_arguments() {
        let args = [
            "verify",
            "--preprocess",
            "preprocess.bin",
            "--instance",
            "instance.json",
            "--proof",
            "proof.bin",
        ];
        assert!(Config::try_parse_from(args).is_ok());
        for flag in [
            "--verifier-keys",
            "--verifier-config",
            "--subcircuit-library",
            "--tau-sequence",
        ] {
            assert!(Config::try_parse_from(args.into_iter().chain([flag, "unused"])).is_err());
        }
    }
}
