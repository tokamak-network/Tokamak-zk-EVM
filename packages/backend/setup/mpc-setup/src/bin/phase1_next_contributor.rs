use chrono::Local;
use clap::Parser;
use mpc_setup::accumulator::Accumulator;
use mpc_setup::contributor::{get_device_info, ContributorInfo};
use mpc_setup::utils::{
    initialize_random_generator, prompt_user_input, Mode, Phase1Proof,
};
use std::fs;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,

    /// Mode of operation: testing, random, beacon
    #[arg(
        long,
        value_enum,
        value_name = "MODE",
        help = "Operation mode: testing | random | beacon"
    )]
    mode: Mode,
}

// cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode testing
// cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode random
// cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode beacon

fn main() {
    let config = Config::parse();
    let totalStart = Instant::now();

    let mut rng = initialize_random_generator(&config.mode);
    let mut contributor_name = String::new();
    let mut location = String::new();

    if matches!(config.mode, Mode::Random) {
        contributor_name = prompt_user_input("Enter your name :");
        location = prompt_user_input("Enter your location:");
    }
    let device = get_device_info();
    println!("device info: {:?}", device);

    println!("loading latest challenge and proof...");

    let latest_acc = Accumulator::read_from_json(&format!(
        "{}/phase1_latest_challenge.json",
        config.outfolder
    ))
    .expect("cannot read from phase1_latest_challenge.json");
    println!(
        "loaded latest challenge and proof in as {} seconds ",
        totalStart.elapsed().as_secs_f64()
    );

    println!("x_degree = {}", latest_acc.x.len());
    println!("y_degree = {}", latest_acc.y.len_g1());
    if latest_acc.compress {
        println!("Accumulator points will be written as compressed mode");
    } else {
        println!("Accumulator points will be written as uncompressed mode");
    }

    let mut previous_acc_hash = [0u8; 64];
    let mut previous_proof_hash = [0u8; 64];

    if latest_acc.contributor_index > 0 {
        println!(
            "previous contributor index: {}",
            latest_acc.contributor_index
        );
        println!("loading previous challenge and proof...");
        let prev_acc = Accumulator::read_from_json(&format!(
            "{}/phase1_acc_{}.json",
            config.outfolder,
            latest_acc.contributor_index - 1
        ))
        .expect("cannot previous accumulator read from file");
        let latest_proof =
            Phase1Proof::load_from_json(&format!("{}/phase1_latest_proof.json", config.outfolder))
                .expect("cannot proof read from file");
        println!("previous contributor's proof verification started.");

        let start = Instant::now();
        assert_eq!(
            prev_acc.verify(&latest_acc, &latest_proof),
            true,
            "verification failed"
        );
        println!("previous contributor's proof is verified.");
        println!(
            "Time elapsed for verification of the previous contribution: {:?}",
            start.elapsed().as_secs_f64()
        );

        previous_proof_hash = latest_proof.blake2b_hash();
        previous_acc_hash = latest_acc.blake2b_hash();
    } else {
        //first contributor
        println!("previous contributor is genesis");
        let g1 = latest_acc.g1.clone();
        let g2 = latest_acc.g2.clone();
        let acc_check = Accumulator::new(
            g1,
            g2,
            latest_acc.alpha.len(),
            latest_acc.x.len(),
            latest_acc.y.len_g1(),
            latest_acc.compress,
        );
        assert_eq!(
            latest_acc.hash(),
            acc_check.hash(),
            "genesis hash is not correct"
        );
        println!("genesis hash is verified.");
        previous_acc_hash = acc_check.blake2b_hash();
    }
    println!(
        "current contributor index: {}",
        latest_acc.contributor_index + 1
    );
    println!("computing new challenge and proof...");

    let start = Instant::now();
    let (new_acc, new_proof) = latest_acc.compute(&mut rng);
    println!("new accumulator along with proof is computed.");
    println!(
        "Time elapsed for computing the contribution: {:?}",
        start.elapsed().as_secs_f64()
    );

    fs::rename(
        &format!("{}/phase1_latest_challenge.json", config.outfolder),
        &format!(
            "{}/phase1_acc_{}.json",
            config.outfolder, latest_acc.contributor_index
        ),
    )
    .expect("cannot rename new_challenge.json");
    let _ = fs::rename(
        &format!("{}/phase1_latest_proof.json", config.outfolder),
        &format!(
            "{}/phase1_proof_{}.json",
            config.outfolder, latest_acc.contributor_index
        ),
    );

    new_acc
        .write_into_json(&format!(
            "{}/phase1_latest_challenge.json",
            config.outfolder
        ))
        .expect("cannot write new_challenge to file");
    new_proof
        .save_to_json(&format!("{}/phase1_latest_proof.json", config.outfolder))
        .expect("cannot write new_proof to file");

    if matches!(config.mode, Mode::Random) {
        let duration = totalStart.elapsed();
        println!("Time elapsed: {:?}", duration.as_secs());
        let current_date = Local::now().format("%Y-%m-%d").to_string();
        let cont = ContributorInfo {
            contributor_no: new_acc.contributor_index as u32,
            date: current_date,
            name: contributor_name,
            location,
            devices: get_device_info().to_string(),
            prev_acc_hash: hex::encode(previous_acc_hash),
            prev_proof_hash: hex::encode(previous_proof_hash),
            current_acc_hash: hex::encode(new_acc.blake2b_hash()),
            current_proof_hash: hex::encode(new_proof.blake2b_hash()),
            time_taken_seconds: duration.as_secs_f64(),
        };

        let fpath = &format!(
            "{}/phase1_contributor_{}.txt",
            config.outfolder, new_acc.contributor_index
        );
        let file = File::create(fpath).expect("cannot create file");

        let mut writer = BufWriter::new(file);
        writer
            .write_all(cont.to_string().as_bytes())
            .expect("cannot write to file");
    }
}
