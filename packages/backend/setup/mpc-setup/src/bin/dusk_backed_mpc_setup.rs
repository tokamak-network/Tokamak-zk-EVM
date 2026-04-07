use clap::Parser;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// QAP compiler library directory
    qap_path: String,

    /// Output folder path for single-contributor MPC setup artifacts
    outfolder: String,

    /// Optional local path for the Dusk Groth16 raw PoT response file
    #[arg(long, value_name = "DUSK_RAW_FILE")]
    dusk_raw_file: Option<String>,

    /// Phase-2 y sampling mode
    #[arg(long, value_name = "MODE", default_value = "random")]
    phase2_mode: String,
}

fn main() {
    let config = Config::parse();
    ensure_directory(&config.outfolder);
    let qap_path = canonicalize_existing_path(&config.qap_path);

    let dusk_raw_file = config
        .dusk_raw_file
        .unwrap_or_else(|| format!("{}/dusk.response", config.outfolder));

    run_mpc_bin(
        "phase2_prepare",
        &[
            "--outfolder".to_string(),
            config.outfolder.clone(),
            "--mode".to_string(),
            config.phase2_mode.clone(),
            "--phase1-source-mode".to_string(),
            "dusk-groth16".to_string(),
            "--dusk-raw-file".to_string(),
            dusk_raw_file.clone(),
        ],
        None,
        &qap_path,
    );

    run_mpc_bin(
        "phase2_next_contributor",
        &[
            "--outfolder".to_string(),
            config.outfolder.clone(),
            "--mode".to_string(),
            config.phase2_mode.clone(),
        ],
        scripted_input_for_mode(&config.phase2_mode, 1),
        &qap_path,
    );

    run_mpc_bin(
        "phase2_gen_files",
        &["--outfolder".to_string(), config.outfolder.clone()],
        Some("1\n"),
        &qap_path,
    );

    println!(
        "Dusk-backed single-contributor MPC setup completed. Downstream preprocess/prove/verify can now use {}",
        config.outfolder
    );
}

fn backend_root() -> PathBuf {
    env::current_dir().expect("cannot resolve current backend working directory")
}

fn canonicalize_existing_path(path: &str) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| panic!("cannot resolve path {}", path))
}

fn ensure_directory(path: &str) {
    fs::create_dir_all(path).expect("cannot create orchestrator output directory");
}

fn scripted_input_for_mode(mode: &str, contributor_index: usize) -> Option<&'static str> {
    if mode == "testing" {
        match contributor_index {
            1 => Some("1\n"),
            _ => None,
        }
    } else {
        None
    }
}

fn run_mpc_bin(bin_name: &str, args: &[String], stdin_input: Option<&str>, qap_path: &Path) {
    println!("Running {bin_name}...");
    let mut command = Command::new("cargo");
    command
        .current_dir(backend_root())
        .env("TOKAMAK_QAP_PATH", qap_path)
        .arg("run")
        .arg("--release")
        .arg("-q")
        .arg("-p")
        .arg("mpc-setup")
        .arg("--bin")
        .arg(bin_name)
        .arg("--");
    command.args(args);

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
