use clap::Parser;
use mpc_setup::{run_dusk_backed_mpc_setup, DuskBackedMpcSetupConfig};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Subcircuit library directory produced by the QAP compiler
    #[arg(long, value_name = "PATH")]
    subcircuit_library: String,

    /// Intermediate ceremony artifact directory, also used for dusk.response
    #[arg(long, value_name = "PATH")]
    intermediate: String,

    /// Final output directory for trusted-setup-compatible setup artifacts
    #[arg(long, value_name = "PATH")]
    output: String,

    /// Optional contributor name recorded in contributor metadata files
    #[arg(long, default_value = "")]
    contributor_name: String,

    /// Optional contributor location recorded in contributor metadata files
    #[arg(long, default_value = "")]
    location: String,

    /// Optional seed input consumed once by the wrapper and derived per phase
    #[arg(long)]
    seed_input: Option<String>,

    /// Use deterministic beacon mode instead of the default random mode
    #[arg(long, default_value_t = false)]
    beacon_mode: bool,
}

fn main() {
    let config = Config::parse();
    run_dusk_backed_mpc_setup(&DuskBackedMpcSetupConfig {
        subcircuit_library: config.subcircuit_library,
        intermediate: config.intermediate,
        output: config.output.clone(),
        beacon_mode: config.beacon_mode,
        contributor_name: config.contributor_name,
        location: config.location,
        seed_input: config.seed_input,
    });

    println!(
        "Dusk-backed single-contributor MPC setup completed. Downstream preprocess/prove/verify can now use {}",
        config.output
    );
}
