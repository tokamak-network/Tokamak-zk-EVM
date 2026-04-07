use clap::Parser;
use libs::iotools::SetupParams;
use mpc_setup::QAP_COMPILER_PATH_PREFIX;
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

    /// Setup parameter JSON file under the QAP compiler library directory
    #[arg(long, default_value = "setupParams.json", value_name = "SETUP_PARAMS_FILE")]
    setup_params_file: String,

    /// Whether phase-1 accumulator JSON uses compressed curve-point encoding
    #[arg(long, default_value_t = false)]
    compress: bool,
}

fn main() {
    let config = Config::parse();
    ensure_directory(&config.outfolder);

    let s_max = load_s_max(&config.setup_params_file);

    run_mpc_bin(
        "phase1_initialize",
        &[
            "--s-max".to_string(),
            s_max.to_string(),
            "--mode".to_string(),
            "testing".to_string(),
            "--setup-params-file".to_string(),
            config.setup_params_file.clone(),
            "--outfolder".to_string(),
            config.outfolder.clone(),
            "--compress".to_string(),
            config.compress.to_string(),
        ],
        None,
    );

    run_mpc_bin(
        "phase2_prepare",
        &[
            "--outfolder".to_string(),
            config.outfolder.clone(),
            "--mode".to_string(),
            "testing".to_string(),
            "--phase1-source-mode".to_string(),
            "native".to_string(),
        ],
        Some("0\n"),
    );

    run_mpc_bin(
        "phase2_gen_files",
        &["--outfolder".to_string(), config.outfolder.clone()],
        Some("0\n"),
    );

    println!(
        "Native single-contributor MPC setup completed. Downstream preprocess/prove/verify can now use {}",
        config.outfolder
    );
}

fn backend_root() -> PathBuf {
    env::current_dir().expect("cannot resolve current backend working directory")
}

fn load_s_max(setup_params_file: &str) -> usize {
    let setup_params_path = backend_root()
        .join(QAP_COMPILER_PATH_PREFIX)
        .join(setup_params_file);
    SetupParams::read_from_json(setup_params_path).expect("cannot read setup parameters").s_max
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
