use clap::Parser;
use libs::subcircuit_library::{DevelopmentCrsProvenanceArg, SubcircuitLibraryArg};
use preprocess::{preprocess, PreprocessDevice, PreprocessError, PreprocessInputPaths};
use std::{path::PathBuf, process::ExitCode};

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Admit a circuit and encode its binary verifier preprocess"
)]
struct Config {
    #[command(flatten)]
    subcircuit_library: SubcircuitLibraryArg,
    #[command(flatten)]
    development_crs_provenance: DevelopmentCrsProvenanceArg,
    /// CRS directory containing preprocess_keys.rkyv and crs_provenance.json
    #[arg(long, value_name = "PATH")]
    keys: PathBuf,
    /// Synthesizer directory containing selector, permutation and instance JSON
    #[arg(long, value_name = "PATH")]
    synthesizer_stat: PathBuf,
    /// Output directory for the common binary verifier preprocess
    #[arg(long, value_name = "PATH")]
    output: PathBuf,
    /// CPU uses arkworks; CUDA requires an installed ICICLE CUDA backend
    #[arg(long, value_enum, default_value_t = PreprocessDevice::Cpu)]
    device: PreprocessDevice,
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
    match run(Config::parse()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => libs::cli::render_error(&error),
    }
}

fn run(config: Config) -> Result<(), PreprocessError> {
    let started = std::time::Instant::now();
    let library = libs::subcircuit_library::try_resolve_subcircuit_library_path(
        config.subcircuit_library.as_deref(),
    )?;
    if config.development_crs_provenance.allows_unverified_crs() {
        eprintln!(
            "WARNING: skipping CRS provenance compatibility validation for local development"
        );
    } else {
        libs::subcircuit_library::read_univariate_crs_identity(&config.keys)?;
    }
    let output = preprocess(
        &PreprocessInputPaths {
            qap_path: &library,
            synthesizer_path: &config.synthesizer_stat,
            keys_path: &config.keys,
            output_path: &config.output,
        },
        config.device,
    )?;
    println!("Preprocess saved to {}", output.display());
    println!(
        "Total preprocess time: {:.6} s",
        started.elapsed().as_secs_f64()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn device_choice_is_explicit_and_independent_of_input_origin() {
        let mut args = vec![
            "preprocess",
            "--keys",
            "crs",
            "--synthesizer-stat",
            "fixture",
            "--output",
            "out",
        ];
        #[cfg(not(tokamak_embedded_subcircuit_library))]
        args.extend(["--subcircuit-library", "qap"]);
        assert_eq!(
            Config::try_parse_from(&args).unwrap().device,
            PreprocessDevice::Cpu
        );
        assert_eq!(
            Config::try_parse_from(args.iter().copied().chain(["--device", "cuda"]))
                .unwrap()
                .device,
            PreprocessDevice::Cuda
        );
        assert!(Config::try_parse_from(args.iter().copied().chain(["--device", "auto"])).is_err());
        assert!(
            Config::try_parse_from(args.iter().copied().chain(["--tau-sequence", "old"])).is_err()
        );
    }
}
