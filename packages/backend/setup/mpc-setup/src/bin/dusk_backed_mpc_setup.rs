use clap::Parser;
use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Output folder path for single-contributor MPC setup artifacts
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,

    /// Optional local path for the Dusk Groth16 raw PoT response file
    #[arg(long, value_name = "DUSK_RAW_FILE")]
    dusk_raw_file: Option<String>,
}

fn main() {
    let config = Config::parse();
    ensure_directory(&config.outfolder);

    let dusk_raw_file = config
        .dusk_raw_file
        .unwrap_or_else(|| format!("{}/dusk.response", config.outfolder));

    run_mpc_bin(
        "phase2_prepare",
        &[
            "--outfolder".to_string(),
            config.outfolder.clone(),
            "--mode".to_string(),
            "testing".to_string(),
            "--phase1-source-mode".to_string(),
            "dusk-groth16".to_string(),
            "--dusk-raw-file".to_string(),
            dusk_raw_file.clone(),
        ],
        None,
    );

    run_mpc_bin(
        "phase2_gen_files",
        &["--outfolder".to_string(), config.outfolder.clone()],
        Some("0\n"),
    );

    println!(
        "Dusk-backed single-contributor MPC setup completed. Downstream preprocess/prove/verify can now use {}",
        config.outfolder
    );
}

fn backend_root() -> PathBuf {
    env::current_dir().expect("cannot resolve current backend working directory")
}

fn ensure_directory(path: &str) {
    fs::create_dir_all(path).expect("cannot create orchestrator output directory");
}

fn run_mpc_bin(bin_name: &str, args: &[String], stdin_input: Option<&str>) {
    println!("Running {bin_name}...");
    let mut command = Command::new("cargo");
    command
        .current_dir(backend_root())
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
