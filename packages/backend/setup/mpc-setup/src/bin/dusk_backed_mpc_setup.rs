use clap::Parser;
use libs::subcircuit_library::{resolve_subcircuit_library_path, SubcircuitLibraryArg};
use mpc_setup::{run_dusk_backed_mpc_setup, DuskBackedMpcSetupConfig};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    #[command(flatten)]
    subcircuit_library: SubcircuitLibraryArg,

    /// Intermediate ceremony artifact directory, also used for dusk.response
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
    let qap_path = resolve_subcircuit_library_path(config.subcircuit_library.as_deref())
        .to_string_lossy()
        .into_owned();
    run_dusk_backed_mpc_setup(&DuskBackedMpcSetupConfig {
        qap_path,
        intermediate: config.intermediate,
        output: config.output.clone(),
        beacon_mode: config.beacon_mode,
        seed_input: config.seed_input,
    });

    println!(
        "Dusk-backed single-contributor MPC setup completed. Downstream preprocess/prove/verify can now use {}",
        config.output
    );
}
