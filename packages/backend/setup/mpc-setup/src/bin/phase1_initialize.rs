extern crate memmap;

use crate::Mode::Testing;
use clap::{Parser, ValueEnum};
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use libs::iotools::SetupParams;
use mpc_setup::accumulator::Accumulator;
use mpc_setup::conversions::{icicle_g1_generator, icicle_g2_generator};
use mpc_setup::utils::RandomStrategy::SystemRandom;
use mpc_setup::utils::{
    check_outfolder_writable, compute5, verify5, Mode, PairSerde, RandomGenerator, SerialSerde,
};
use std::cmp::max;
use std::ops::Mul;
use std::time::Instant;

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

/*
cargo run --release --bin phase1_initialize -- \
  --s-max 128 \
  --mode testing \
  --setup-params-file setupParams.json  \
  --outfolder ./setup/mpc-setup/output \
  --compress true

  cargo run --release --bin phase1_initialize -- \
  --s-max 64 \
  --blockhash aabbccddeeff11223344556677889900aabbccddeeff11223344556677889900 \
  --mode random \
  --setup-params-file setupParams.json  \
  --outfolder ./setup/mpc-setup/output \
  --compress true
*/
fn main() {
    let config = Config::parse();

    let setup_params = SetupParams::from_path(&config.setup_params_file).unwrap();
    let m_i = setup_params.l_D - setup_params.l;
    let x_degree = 2 * max(setup_params.n, m_i);
    let y_degree = 2 * config.s_max;
    println!("Parsed config: {:?}", config);
    println!("x_degree = {}", x_degree);
    println!("y_degree = {}", y_degree);
    if config.compress.parse::<bool>().unwrap() {
        println!("Accumulator points will be written as compressed mode");
    } else {
        println!("Accumulator points will be written as uncompressed mode");
    }

    let mut scalar: ScalarField = ScalarField::from_u32(1);

    match config.mode {
        Testing => {
            println!("Running testing mode");
            scalar = ScalarField::from_u32(1);
        }
        _ => {
            // Optional: Validate blockhash length
            let blockhash = config.blockhash.unwrap();
            println!("blockhash = {}", blockhash);
            if blockhash.len() != 64 || !blockhash.chars().all(|c| c.is_ascii_hexdigit()) {
                eprintln!("Error: blockhash must be a 64-character hex string.");
                std::process::exit(1);
            }
            let hash = hex::decode(&blockhash).unwrap();
            scalar = ScalarField::from_bytes_le(hash.as_ref()) - ScalarField::from_u32(0);
        }
    }

    let start = Instant::now();
    let power_alpha_length: usize = 4;
    let g1 = icicle_g1_generator().mul(scalar);
    let g2 = icicle_g2_generator().mul(scalar);

    let compress_mod = config.compress.parse::<bool>().unwrap();

    let acc = Accumulator::new(g1, g2, power_alpha_length, x_degree, y_degree, compress_mod);
    println!("Time elapsed: {:?}", start.elapsed().as_secs_f64());

    let outfile = format!("{}/phase1_latest_challenge.json", config.outfolder);
    acc.write_into_json(outfile.as_ref())
        .expect("cannot write to file");
}

fn test_compute5() {
    let rng = &mut RandomGenerator::new(SystemRandom, [0u8; 32]);
    let start = Instant::now();
    //initialize
    let g1 = icicle_g1_generator();
    let g2 = icicle_g2_generator();

    let alpha_degree: usize = 4; //alpha
    let x_degree: usize = 64; //x^i
    let y_degree: usize = 128; //y^k

    let v = [34u8; 32];
    let mut prev_alpha = vec![PairSerde::new(g1.clone(), g2.clone()); alpha_degree];
    let mut prev_x = vec![PairSerde::new(g1.clone(), g2.clone()); x_degree];
    let mut prev_y = SerialSerde::new(g1, g2, y_degree);
    let mut prev_xy = vec![g1; x_degree * y_degree];
    let mut prev_alphax = vec![g1; alpha_degree * x_degree];
    let mut prev_alphay = vec![g1; alpha_degree * y_degree];

    let mut prev_alphaxy = vec![g1; alpha_degree * x_degree * y_degree];

    // first participant
    let (cur_alphaxy, cur_xy, cur_alphax, cur_alphay, cur_alpha, cur_x, cur_y, proof5) = compute5(
        rng,
        &g1,
        &g2,
        &prev_alphaxy,
        &prev_xy,
        &prev_alphax,
        &prev_alphay,
        &prev_alpha,
        &prev_x,
        &prev_y,
        &v,
    );

    assert_eq!(
        verify5(
            &g1,
            &g2,
            &prev_alpha,
            &prev_x,
            &prev_y,
            &cur_alphaxy,
            &cur_xy,
            &cur_alphax,
            &cur_alphay,
            &cur_alpha,
            &cur_x,
            &cur_y,
            &proof5
        ),
        true,
    );

    println!("proof is verified.");
    prev_alpha = cur_alpha;
    prev_x = cur_x;
    prev_y = cur_y;
    prev_xy = cur_xy;
    prev_alphaxy = cur_alphaxy;
    prev_alphax = cur_alphax;
    prev_alphay = cur_alphay;

    // second participant
    let (_cur_alphaxy, _cur_xy, _cur_alphax, _cur_alphay, _cur_alpha, _cur_x, _cur_y, _proof5) =
        compute5(
            rng,
            &g1,
            &g2,
            &prev_alphaxy,
            &prev_xy,
            &prev_alphax,
            &prev_alphay,
            &prev_alpha,
            &prev_x,
            &prev_y,
            &v,
        );

    let duration = start.elapsed();

    println!("Time elapsed: {:?}", duration.as_secs());
}
