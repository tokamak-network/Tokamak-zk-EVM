use clap::Parser;
use libs::subcircuit_library::resolve_subcircuit_library_path;
use mpc_setup::{run_native_mpc_setup, NativeMpcSetupConfig};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Subcircuit library directory produced by the QAP compiler
    #[cfg(not(tokamak_embedded_subcircuit_library))]
    #[arg(long, value_name = "PATH")]
    subcircuit_library: String,

    /// Intermediate ceremony artifact directory
    #[arg(long, value_name = "PATH")]
    intermediate: String,

    /// Final output directory for trusted-setup-compatible setup artifacts
    #[arg(long, value_name = "PATH")]
    output: String,

    /// Optional seed input consumed once by the wrapper and derived per phase
    #[arg(long)]
    seed_input: Option<String>,

    /// Use deterministic beacon mode instead of the default random mode
    #[arg(long, default_value_t = false)]
    beacon_mode: bool,
}

fn main() {
    let config = Config::parse();
    let qap_path = resolve_subcircuit_library_path(subcircuit_library_arg(&config))
        .to_string_lossy()
        .into_owned();
    run_native_mpc_setup(&NativeMpcSetupConfig {
        qap_path,
        intermediate: config.intermediate,
        output: config.output.clone(),
        beacon_mode: config.beacon_mode,
        seed_input: config.seed_input,
    });

    println!(
        "Native single-contributor MPC setup completed. Downstream preprocess/prove/verify can now use {}",
        config.output
    );
}

#[cfg(not(tokamak_embedded_subcircuit_library))]
fn subcircuit_library_arg(config: &Config) -> Option<&str> {
    Some(&config.subcircuit_library)
}

#[cfg(tokamak_embedded_subcircuit_library)]
fn subcircuit_library_arg(_: &Config) -> Option<&str> {
    None
}
