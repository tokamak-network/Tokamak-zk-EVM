use clap::Parser;
use libs::cli::render_error;
use libs::errors::DeviceError;
use libs::subcircuit_library::{
    try_resolve_subcircuit_library_path, validate_operational_univariate_crs_compatibility,
    DevelopmentCrsProvenanceArg, SubcircuitLibraryArg,
};
use prove::univariate_cli::ProverDevice;
use prove::{univariate_cli, ProveError, ProveInputPaths};
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Arithmetic engine: CPU uses arkworks; CUDA explicitly selects ICICLE
    #[arg(long, value_enum, default_value = "cpu")]
    device: ProverDevice,
    #[command(flatten)]
    subcircuit_library: SubcircuitLibraryArg,

    #[command(flatten)]
    development_crs_provenance: DevelopmentCrsProvenanceArg,

    /// Check CRS file SHA-256 digests and the subcircuit-library source digest
    #[arg(long)]
    check_digests: bool,

    /// Trusted-setup tau_sequence.rkyv file
    #[arg(long, value_name = "FILE")]
    tau_sequence: String,

    /// Trusted-setup output directory containing prover_keys.rkyv
    #[arg(long, value_name = "PATH")]
    keys: String,

    /// Synthesizer output directory containing selector, permutation, instance, and witnesses
    #[arg(long, value_name = "PATH")]
    synthesizer_stat: String,

    /// Output directory for univariate_proof.bin
    #[arg(long, value_name = "PATH")]
    output: String,
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

fn run() -> Result<(), ProveError> {
    let total_start = Instant::now();
    let config = Config::parse();
    #[cfg(feature = "timing")]
    let ingress = prove::timing::SpanGuard::new("univariate.identity", "input", vec![]);
    let qap_library_path =
        try_resolve_subcircuit_library_path(config.subcircuit_library.as_deref())?;
    let validated_crs = validate_operational_univariate_crs_compatibility(
        &config.development_crs_provenance,
        PathBuf::from(&config.tau_sequence).as_path(),
        PathBuf::from(&config.keys).as_path(),
        qap_library_path.as_path(),
        config.check_digests,
    )?;
    let qap_path = qap_library_path.to_string_lossy().into_owned();

    let paths = ProveInputPaths {
        qap_path: &qap_path,
        synthesizer_path: &config.synthesizer_stat,
        tau_sequence_path: &config.tau_sequence,
        keys_path: &config.keys,
        output_path: &config.output,
    };

    if matches!(config.device, ProverDevice::Cuda) {
        let failure = |e: String| DeviceError::Initialization {
            device: "CUDA",
            reason: e,
        };
        icicle_runtime::load_backend_from_env_or_default().map_err(|e| failure(e.to_string()))?;
        let cuda = icicle_runtime::Device::new("CUDA", 0);
        if !icicle_runtime::is_device_available(&cuda) {
            return Err(failure("CUDA was requested but is unavailable".into()).into());
        }
        icicle_runtime::set_device(&cuda).map_err(|e| failure(e.to_string()))?;
    }
    #[cfg(feature = "timing")]
    drop(ingress);

    println!("Running univariate prove: {:?}", config.device);
    univariate_cli::prove_with_validated_crs(&paths, config.device, validated_crs)?;

    let total_elapsed_secs = total_start.elapsed().as_secs_f64();
    println!(
        "Univariate prove completed. Total elapsed time: {:.3}s ({:.0} ms)",
        total_elapsed_secs,
        total_elapsed_secs * 1000.0
    );
    #[cfg(feature = "timing")]
    {
        prove::timing::record("univariate.total", "total", total_start.elapsed(), vec![]);
        println!(
            "TIMING_JSON {}",
            serde_json::to_string(&prove::timing::take_events())
                .expect("timing events must serialize")
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_is_default_and_cuda_requires_explicit_selection() {
        let mut args = vec![
            "prove",
            "--tau-sequence",
            "tau",
            "--keys",
            "keys",
            "--synthesizer-stat",
            "fixture",
            "--output",
            "output",
        ];
        if cfg!(feature = "local-development-subcircuit-library") {
            args.extend(["--subcircuit-library", "library"]);
        }
        assert!(matches!(
            Config::try_parse_from(&args).unwrap().device,
            ProverDevice::Cpu
        ));
        assert!(!Config::try_parse_from(&args).unwrap().check_digests);
        assert!(
            Config::try_parse_from(args.iter().copied().chain(["--check-digests"]))
                .unwrap()
                .check_digests
        );
        let cuda = args.iter().copied().chain(["--device", "cuda"]);
        assert!(matches!(
            Config::try_parse_from(cuda).unwrap().device,
            ProverDevice::Cuda
        ));
        assert!(Config::try_parse_from(args.into_iter().chain(["--device", "metal"])).is_err());
    }
}
