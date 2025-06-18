extern crate memmap;

use crate::Mode::Testing;
use chrono::Local;
use clap::Parser;
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use libs::iotools::SetupParams;
use mpc_setup::accumulator::Accumulator;
use mpc_setup::contributor::{get_device_info, ContributorInfo};
use mpc_setup::conversions::{icicle_g1_generator, icicle_g2_generator};
use mpc_setup::utils::{prompt_user_input, Mode};
use std::cmp::max;
use std::env;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::ops::Mul;
use std::time::Instant;
use mpc_setup::sigma::AaccExt;

pub mod drive;

const BLOCKHASH_LENGTH: usize = 64;
const HASH_BYTES: usize = 32;
const POWER_ALPHA_LENGTH: usize = 4;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Maximum value in y dimension
    #[arg(long, value_name = "S_MAX")]
    s_max: usize,

    /// Enable compression (true for compressed, false for uncompressed)
    #[arg(
        long,
        value_name = "COMPRESS",
        help = "Enable compressed serialization (true or false)"
    )]
    compress: String,

    /// Bitcoin blockhash as a hex string (64 characters)
    #[arg(
        long,
        value_name = "BLOCKHASH",
        help = "Optional Hex-encoded 32-byte Bitcoin block hash (64 characters)"
    )]
    blockhash: Option<String>,

    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "SETUP_PARAMS_FILE")]
    setup_params_file: String,

    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,

    /// Mode of operation: testing, random, deterministic
    #[arg(
        long,
        value_enum,
        value_name = "MODE",
        help = "Operation mode: testing | random | deterministic"
    )]
    mode: Mode,
}

//curl http://localhost:7878/?state=a6fd0ebe973ecd09b59ae3d7c10e0402f0ab3ba98bf9b5f462188e38804672f9&code=4/0AUJR-x4BoWJZIxcgk_vMDooaffimYPVGYa-VEDUQnb3c7err_SVF5AnbalchNYpkJyGTlQ&scope=https://www.googleapis.com/auth/drive.metadata.readonly%20https://www.googleapis.com/auth/drive.file
//docker exec -it 0f1d390ea076 /bin/bash
//  --blockhash aabbccddeeff11223344556677889900aabbccddeeff11223344556677889900 \
/*
cargo run --release --bin phase1_initialize -- --s-max 128 --mode testing --setup-params-file setupParams.json  --outfolder ./setup/mpc-setup/output --compress false

 cargo run --release --bin phase1_initialize -- \
  --s-max 64 \
  --mode random \
  --setup-params-file setupParams.json  \
  --outfolder ./setup/mpc-setup/output \
  --compress true
*/

#[tokio::main]
async fn main() {
    let config = Config::parse();
    let (contributor_name, location) = if matches!(config.mode, Mode::Random) {
        (
            prompt_user_input("Enter your name :"),
            prompt_user_input("Enter location :"),
        )
    } else {
        (String::new(), String::new())
    };

    println!("device info: {:?}", get_device_info());
    println!("Current directory: {:?}", env::current_dir().unwrap());

    let setup_params =
        SetupParams::from_path(&config.setup_params_file).expect("cannot SetupParams read file");
    let x_degree = 2 * max(setup_params.n, setup_params.l_D - setup_params.l);
    let y_degree = 2 * config.s_max;

    println!("Parsed config: {:?}", config);
    println!("x_degree = {}", x_degree);
    println!("y_degree = {}", y_degree);
    let scalar = initialize_scalar(&config.mode, config.blockhash.as_ref())
        .expect("cannot initialize scalar");
    let start = Instant::now();

    let g1 = icicle_g1_generator().mul(scalar);
    let g2 = icicle_g2_generator().mul(scalar);
    let compress_mode = config.compress.parse::<bool>().unwrap();

    let genesis_acc = Accumulator::new(
        g1,
        g2,
        POWER_ALPHA_LENGTH,
        x_degree,
        y_degree,
        compress_mode,
    );

    let outfile = format!(
        "{}/phase1_acc_{}.json",
        config.outfolder, genesis_acc.contributor_index
    );
    genesis_acc
        .write_into_json(&outfile)
        .expect("cannot write to file");


    let fpath = format!(
        "{}/phase1_contributor_{}.txt",
        config.outfolder, genesis_acc.contributor_index
    );
    save_contributor_info(
        &genesis_acc,
        start.elapsed(),
        &contributor_name,
        &location,
        fpath
    )
        .expect("cannot write to file");
    println!("Time elapsed: {:?}", start.elapsed().as_secs_f64());
    println!("Thanks for your contribution...");
}

fn initialize_scalar(mode: &Mode, blockhash: Option<&String>) -> Result<ScalarField, String> {
    match mode {
        Testing => Ok(ScalarField::from_u32(1)),
        _ => {
            let blockhash_str = match blockhash {
                Some(hash) => hash.trim_start_matches("0x").to_string(),
                None => prompt_user_input("Enter blockhash (64 hex characters):")
                    .trim_start_matches("0x")
                    .to_string(),
            };

            validate_blockhash(&blockhash_str)?;
            let hash = hex::decode(&blockhash_str).map_err(|_| "Invalid hex encoding")?;
            Ok(ScalarField::from_bytes_le(hash.as_ref()) - ScalarField::from_u32(0))
        }
    }
}

fn validate_blockhash(hash: &str) -> Result<(), String> {
    if hash.len() != BLOCKHASH_LENGTH || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Blockhash must be a 64-character hex string".to_string());
    }
    Ok(())
}

fn save_contributor_info(
    acc: &Accumulator,
    duration: std::time::Duration,
    contributor_name: &str,
    location: &str,
    fpath: String
) -> std::io::Result<()> {
    let current_date = Local::now().format("%Y-%m-%d").to_string();
    let contributor_info = ContributorInfo {
        contributor_no: acc.contributor_index as u32,
        date: current_date,
        name: contributor_name.to_string(),
        location: location.to_string(),
        devices: get_device_info().to_string(),
        prev_acc_hash: hex::encode([0u8; HASH_BYTES]),
        prev_proof_hash: hex::encode([0u8; HASH_BYTES]),
        current_acc_hash: hex::encode(acc.blake2b_hash()),
        current_proof_hash: hex::encode([0u8; HASH_BYTES]),
        time_taken_seconds: duration.as_secs_f64(),
    };

    let file = File::create(fpath)?;
    let mut writer = BufWriter::new(file);
    writer.write_all(contributor_info.to_string().as_bytes())
}
