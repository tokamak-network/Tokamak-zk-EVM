use clap::Parser;
use mpc_setup::sigma::SigmaV2;
use mpc_setup::utils::{check_outfolder_writable, list_files_map, Phase2Proof};
use std::collections::HashMap;
use std::io;
use std::path::PathBuf;
use std::time::Instant;

const PHASE2_ACC_PREFIX: &str = "phase2_acc_";
const PHASE2_PROOF_PREFIX: &str = "phase2_proof_";

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,
}

const ERROR_PREV_ACC_NOT_FOUND: &str = "Previous phase2 accumulator is not found";

//cargo run --release --bin phase2_batch_verify -- --outfolder ./setup/mpc-setup/output
fn main() {
    let config = Config::parse();
    let total_start_time = Instant::now();

    if let Err(e) = check_outfolder_writable(&config.outfolder) {
        eprintln!(
            "Error: output folder '{}' is not accessible: {}",
            config.outfolder, e
        );
        std::process::exit(1);
    }

    let phase2_files = match list_files_map(&config.outfolder) {
        Ok(files) => files,
        Err(e) => {
            eprintln!("Failed to create file list: {}", e);
            std::process::exit(1);
        }
    };

    let contributor_count = phase2_files
        .keys()
        .filter(|key| key.starts_with(PHASE2_ACC_PREFIX))
        .count();

    println!("Number of contributors: {}", contributor_count);

    println!("loading accumulator and proof files...");

    let mut current_acc = SigmaV2::read_from_json(
        phase2_files
            .get(&format!("{}{}", PHASE2_ACC_PREFIX, 0))
            .expect("Initial accumulator not found")
            .to_str()
            .unwrap(),
    )
        .expect("Failed to load initial accumulator");

    for i in 1..contributor_count {
        match verify_contribution(&phase2_files, i) {
            Ok((acc, elapsed)) => {
                current_acc = acc;
                println!(
                    "Verified contributor {}, elapsed time: {} seconds",
                    i, elapsed
                );
            }
            Err(e) => {
                eprintln!("Verification error: {}", e);
                std::process::exit(1);
            }
        }
    }

    println!(
        "Total execution time: {} seconds",
        total_start_time.elapsed().as_secs_f64()
    );
}
fn get_file_path(
    files: &HashMap<String, PathBuf>,
    prefix: &str,
    index: usize,
) -> io::Result<String> {
    files
        .get(&format!("{}{}", prefix, index))
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, ERROR_PREV_ACC_NOT_FOUND))
        .map(|path| path.to_str().unwrap().to_string())
}

fn verify_contribution(
    phase2_files: &HashMap<String, PathBuf>,
    contributor_index: usize,
) -> io::Result<(SigmaV2, f64)> {
    let start_time = Instant::now();
    println!(
        "the accumulator with contributor index ={} is loading  ...",
        contributor_index - 1
    );

    let prev_acc: SigmaV2 = SigmaV2::read_from_json(&get_file_path(
        phase2_files,
        PHASE2_ACC_PREFIX,
        contributor_index - 1,
    )?)?;
    println!(
        "the accumulator with contributor index ={} is loading  ...",
        contributor_index
    );

    let current_acc: SigmaV2 = SigmaV2::read_from_json(&get_file_path(
        phase2_files,
        PHASE2_ACC_PREFIX,
        contributor_index,
    )?)?;

    let current_proof: Phase2Proof = Phase2Proof::read_from_json(&get_file_path(
        phase2_files,
        PHASE2_PROOF_PREFIX,
        contributor_index,
    )?)?;
    println!("verification is starting..");
    if !current_proof.verify(&prev_acc, &current_acc) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Verification failed for contributor {}", contributor_index),
        ));
    }
    println!("verification is successful..");
    Ok((current_acc, start_time.elapsed().as_secs_f64()))
}
