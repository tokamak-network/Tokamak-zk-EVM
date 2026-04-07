use clap::Parser;
use libs::iotools::SetupParams;
use mpc_setup::testing_mode_enabled;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Subcircuit library directory produced by the QAP compiler
    #[arg(long, value_name = "PATH")]
    subcircuit_library: String,

    /// Intermediate ceremony artifact directory
    #[arg(long, value_name = "PATH")]
    intermediate: String,

    /// Final output directory for trusted-setup-compatible setup artifacts
    #[arg(long, value_name = "PATH")]
    output: String,

    /// Use deterministic beacon mode instead of the default random mode
    #[arg(long, default_value_t = false)]
    beacon_mode: bool,
}

fn main() {
    let config = Config::parse();
    ensure_directory(&config.output);
    ensure_directory(&config.intermediate);
    let qap_path = canonicalize_existing_path(&config.subcircuit_library);

    let s_max = load_s_max(&qap_path);

    run_mpc_bin(
        "phase1_initialize",
        &[
            "--s-max".to_string(),
            s_max.to_string(),
            "--setup-params-file".to_string(),
            "setupParams.json".to_string(),
            "--outfolder".to_string(),
            config.intermediate.clone(),
        ],
        None,
        &qap_path,
        config.beacon_mode,
    );

    run_mpc_bin(
        "phase1_next_contributor",
        &["--outfolder".to_string(), config.intermediate.clone()],
        scripted_input_for_mode(1),
        &qap_path,
        config.beacon_mode,
    );

    run_mpc_bin(
        "phase2_prepare",
        &[
            "--outfolder".to_string(),
            config.intermediate.clone(),
            "--phase1-source-mode".to_string(),
            "native".to_string(),
        ],
        Some("1\n"),
        &qap_path,
        config.beacon_mode,
    );

    run_mpc_bin(
        "phase2_next_contributor",
        &["--outfolder".to_string(), config.intermediate.clone()],
        scripted_input_for_mode(1),
        &qap_path,
        config.beacon_mode,
    );

    run_mpc_bin(
        "phase2_gen_files",
        &[
            "--intermediate".to_string(),
            config.intermediate.clone(),
            "--output".to_string(),
            config.output.clone(),
        ],
        Some("1\n"),
        &qap_path,
        config.beacon_mode,
    );

    println!(
        "Native single-contributor MPC setup completed. Downstream preprocess/prove/verify can now use {}",
        config.output
    );
}

fn backend_root() -> PathBuf {
    env::current_dir().expect("cannot resolve current backend working directory")
}

fn canonicalize_existing_path(path: &str) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| panic!("cannot resolve path {}", path))
}

fn load_s_max(qap_path: &Path) -> usize {
    let setup_params_path = qap_path.join("setupParams.json");
    SetupParams::read_from_json(setup_params_path)
        .expect("cannot read setup parameters")
        .s_max
}

fn ensure_directory(path: &str) {
    fs::create_dir_all(path).expect("cannot create orchestrator output directory");
}

fn scripted_input_for_mode(contributor_index: usize) -> Option<&'static str> {
    if testing_mode_enabled() {
        match contributor_index {
            1 => Some("1\n"),
            _ => None,
        }
    } else {
        None
    }
}

fn run_mpc_bin(
    bin_name: &str,
    args: &[String],
    stdin_input: Option<&str>,
    qap_path: &Path,
    beacon_mode: bool,
) {
    println!("Running {bin_name}...");
    let mut command = Command::new("cargo");
    command
        .current_dir(backend_root())
        .env("TOKAMAK_QAP_PATH", qap_path)
        .arg("run")
        .arg("--release")
        .arg("-q")
        .arg("-p")
        .arg("mpc-setup");
    if testing_mode_enabled() {
        command.arg("--features").arg("testing-mode");
    }
    command.arg("--bin").arg(bin_name).arg("--");
    command.args(args);
    if beacon_mode {
        command.arg("--beacon-mode");
    }

    if stdin_input.is_some() {
        command.stdin(Stdio::piped());
    }

    let mut child = command
        .spawn()
        .unwrap_or_else(|_| panic!("cannot spawn cargo for {bin_name}"));

    if let Some(input) = stdin_input {
        let mut stdin = child.stdin.take().expect("stdin pipe is unavailable");
        stdin
            .write_all(input.as_bytes())
            .unwrap_or_else(|_| panic!("cannot write scripted stdin to {bin_name}"));
    }

    let status = child
        .wait()
        .unwrap_or_else(|_| panic!("cannot wait for {bin_name}"));
    assert!(status.success(), "{bin_name} failed with status {status}");
}
