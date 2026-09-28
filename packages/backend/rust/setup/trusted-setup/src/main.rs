use clap::Parser;
use libs::cli::render_error;
use libs::subcircuit_library::{try_resolve_subcircuit_library_path, SubcircuitLibraryArg};
use std::process::ExitCode;
use trusted_setup::{run_trusted_setup, TrustedSetupConfig, TrustedSetupError};

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Generate a complete development-only CRS in one invocation"
)]
struct Config {
    #[command(flatten)]
    subcircuit_library: SubcircuitLibraryArg,
    #[arg(long, value_name = "PATH")]
    output: String,
    /// Use deterministic development generators and scalars. Never for release.
    #[arg(long, default_value_t = false)]
    fixed_tau: bool,
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => render_error(&error),
    }
}

fn run() -> Result<(), TrustedSetupError> {
    let args = Config::parse();
    libs::utils::try_check_device()?;
    let qap = try_resolve_subcircuit_library_path(args.subcircuit_library.as_deref())?;
    run_trusted_setup(&TrustedSetupConfig {
        qap_path: &qap.to_string_lossy(),
        output_path: &args.output,
        fixed_tau: args.fixed_tau,
    })
}
