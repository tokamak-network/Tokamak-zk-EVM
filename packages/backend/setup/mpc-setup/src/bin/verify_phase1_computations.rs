use clap::Parser;
use mpc_setup::accumulator::Accumulator;
use mpc_setup::utils::{check_outfolder_writable, list_files_map, Phase1Proof};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::PathBuf;
use std::time::Instant;
use std::io;

const PHASE1_ACC_PREFIX: &str = "phase1_acc_";
const PHASE1_PROOF_PREFIX: &str = "phase1_proof_";
const LATEST_CHALLENGE_KEY: &str = "phase1_latest_challenge";
const LATEST_PROOF_KEY: &str = "phase1_latest_proof";

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,
}

const ERROR_PREV_ACC_NOT_FOUND: &str = "Previous phase1 accumulator is not found";
const ERROR_CURR_ACC_NOT_FOUND: &str = "Current phase1 accumulator is not found";
const ERROR_PROOF_NOT_FOUND: &str = "Phase1 proof is not found";

//cargo run --release --bin verify_phase1_computations -- --outfolder ./setup/mpc-setup/output
fn main() {
    let config = Config::parse();
    let total_start_time = Instant::now();

    if let Err(e) = check_outfolder_writable(&config.outfolder) {
        eprintln!("Error: output folder '{}' is not accessible: {}", config.outfolder, e);
        std::process::exit(1);
    }

    let phase1_files = match list_files_map(&config.outfolder) {
        Ok(files) => files,
        Err(e) => {
            eprintln!("Failed to create file list: {}", e);
            std::process::exit(1);
        }
    };

    let contributor_count = phase1_files
        .keys()
        .filter(|key| key.starts_with(PHASE1_ACC_PREFIX))
        .count();

    println!("Number of contributors: {}", contributor_count);
    
    println!("loading accumulator and proof files...");

    let mut current_acc = Accumulator::read_from_json(
        phase1_files
            .get(&format!("{}{}", PHASE1_ACC_PREFIX, 0))
            .expect("Initial accumulator not found")
            .to_str()
            .unwrap(),
    )
        .expect("Failed to load initial accumulator");

    for i in 1..contributor_count {
        match verify_contribution(&phase1_files, i) {
            Ok((acc, elapsed)) => {
                current_acc = acc;
                println!("Verified contributor {}, elapsed time: {} seconds", i, elapsed);
            }
            Err(e) => {
                eprintln!("Verification error: {}", e);
                std::process::exit(1);
            }
        }
    }

    // Final verification
    let latest_acc = Accumulator::read_from_json(
        phase1_files
            .get(LATEST_CHALLENGE_KEY)
            .expect("Latest challenge not found")
            .to_str()
            .unwrap(),
    )
        .expect("Failed to load latest challenge");

    let latest_proof = Phase1Proof::load_from_json(
        phase1_files
            .get(LATEST_PROOF_KEY)
            .expect("Latest proof not found")
            .to_str()
            .unwrap(),
    )
        .expect("Failed to load latest proof");

    assert!(current_acc.verify(&latest_acc, &latest_proof), "Final verification failed");

    println!("Total execution time: {} seconds", total_start_time.elapsed().as_secs_f64());
}
fn get_file_path(files: &HashMap<String, PathBuf>, prefix: &str, index: usize) -> io::Result<String> {
    files
        .get(&format!("{}{}", prefix, index))
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, ERROR_PREV_ACC_NOT_FOUND))
        .map(|path| path.to_str().unwrap().to_string())
}

fn load_json_file<T>(path: &str) -> io::Result<T>
where
    T: for<'de> serde::Deserialize<'de>,
{
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut json_str = String::new();
    reader.read_to_string(&mut json_str)?;
    serde_json::from_str(&json_str)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))
}

fn verify_contribution(
    phase1_files: &HashMap<String, PathBuf>,
    contributor_index: usize,
) -> io::Result<(Accumulator, f64)> {
    let start_time = Instant::now();
    println!("another accumulator is loading  ...");

    let prev_acc: Accumulator = load_json_file(
        &get_file_path(phase1_files, PHASE1_ACC_PREFIX, contributor_index - 1)?
    )?;
    println!("another accumulator is loading  ...");

    let current_acc: Accumulator = load_json_file(
        &get_file_path(phase1_files, PHASE1_ACC_PREFIX, contributor_index)?
    )?;

    let current_proof: Phase1Proof = load_json_file(
        &get_file_path(phase1_files, PHASE1_PROOF_PREFIX, contributor_index)?
    )?;

    if !prev_acc.verify(&current_acc, &current_proof) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Verification failed for contributor {}", contributor_index),
        ));
    }

    Ok((current_acc, start_time.elapsed().as_secs_f64()))
}


