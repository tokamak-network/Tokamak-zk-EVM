extern crate memmap;

use crate::Mode::Testing;
use clap::{Parser, ValueEnum};
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use mpc_setup::accumulator::Accumulator;
use mpc_setup::conversions::{icicle_g1_generator, icicle_g2_generator};
use mpc_setup::utils::RandomStrategy::SystemRandom;
use mpc_setup::utils::{check_outfolder_writable, compute5, verify5, Mode, PairSerde, RandomGenerator, SerialSerde};
use std::ops::Mul;
use std::time::Instant;

 
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Maximum value in x dimension
    #[arg(long, value_name = "SMAX_X")]
    smax_x: usize,

    /// Maximum value in y dimension
    #[arg(long, value_name = "SMAX_Y")]
    smax_y: usize,

    /// Bitcoin blockhash as a hex string (64 characters)
    #[arg(
        long,
        value_name = "BLOCKHASH",
        help = "Hex-encoded 32-byte Bitcoin block hash (64 characters)"
    )]
    blockhash: String,

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
  --smax-x 4096 \
  --smax-y 128 \
  --blockhash aabbccddeeff11223344556677889900aabbccddeeff11223344556677889900 \
  --mode random \
  --outfolder ./setup/mpc-setup/output
*/
fn main() {
    let config = Config::parse();

    // Validate outfolder
    if let Err(e) = check_outfolder_writable(&config.outfolder) {
        eprintln!(
            "Error: output folder '{}' is not accessible: {}",
            config.outfolder, e
        );
        std::process::exit(1);
    }

    // Optional: Validate blockhash length
    if config.blockhash.len() != 64 || !config.blockhash.chars().all(|c| c.is_ascii_hexdigit()) {
        eprintln!("Error: blockhash must be a 64-character hex string.");
        std::process::exit(1);
    }

    println!("Parsed config: {:?}", config);
    println!("Got power_x_length = {}", config.smax_x);
    println!("Got power_y_length = {}", config.smax_y);
    println!("Got blockhash = {}", config.blockhash);

    let blockhash = hex::decode(config.blockhash).unwrap();
    let mut scalar: ScalarField = ScalarField::from_bytes_le(blockhash.as_ref());

    match config.mode {
        Testing => {
            println!("it is in testing mode");
            scalar = ScalarField::from_u32(1);
        }
        _ => (),
    }

    let start = Instant::now();
    let power_alpha_length: usize = 4;
    let g1 = icicle_g1_generator().mul(scalar);
    let g2 = icicle_g2_generator().mul(scalar);

    let acc = Accumulator::new(g1, g2, power_alpha_length, config.smax_x, config.smax_y);
    println!("Time elapsed: {:?}", start.elapsed().as_secs_f64());

    let outfile = format!("{}/phase1_latest_challenge.json", config.outfolder);
    acc.save_to_json(outfile.as_ref())
        .expect("cannot write to file");
}

fn test_compute5() {
    let rng = &mut RandomGenerator::new(SystemRandom, [0u8; 32]);
    let start = Instant::now();
    //initialize
    let g1 = icicle_g1_generator();
    let g2 = icicle_g2_generator();

    let s_max0: usize = 4; //alpha
    let s_max1: usize = 64; //x^i
    let s_max2: usize = 128; //y^k

    let v = [34u8; 32];
    let mut prev_alpha = vec![PairSerde::new(g1.clone(), g2.clone()); s_max0];
    let mut prev_x = vec![PairSerde::new(g1.clone(), g2.clone()); s_max1];
    let mut prev_y = SerialSerde::new(g1, g2, s_max2);
    let mut prev_xy = vec![g1; s_max1 * s_max2];
    let mut prev_alphax = vec![g1; s_max0 * s_max1];
    let mut prev_alphay = vec![g1; s_max0 * s_max2];

    let mut prev_alphaxy = vec![g1; s_max0 * s_max1 * s_max2];

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
