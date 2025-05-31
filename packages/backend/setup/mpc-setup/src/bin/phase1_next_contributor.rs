use clap::Parser;
use mpc_setup::accumulator::Accumulator;
use mpc_setup::utils::{check_outfolder_writable, initialize_random_generator, Mode, Phase1Proof};
use std::fs;
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

    // Validate outfolder
    if let Err(e) = check_outfolder_writable(&config.outfolder) {
        eprintln!(
            "Error: output folder '{}' is not accessible: {}",
            config.outfolder, e
        );
        std::process::exit(1);
    }

    let totalStart = Instant::now();

    let mut rng = initialize_random_generator(config.mode);

    let latest_acc = Accumulator::load_from_json(&format!(
        "{}/phase1_latest_challenge.json",
        config.outfolder
    ))
    .expect("cannot read from phase1_latest_challenge.json");
    println!("loading latest challenge and proof...");

    if latest_acc.contributor_index > 0 {
        println!(
            "previous contributor index: {}",
            latest_acc.contributor_index
        );
        let prev_acc = Accumulator::load_from_json(&format!(
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
        );
        assert_eq!(
            latest_acc.hash(),
            acc_check.hash(),
            "genesis hash is not correct"
        );
        println!("genesis hash is verified.");
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
        .save_to_json(&format!(
            "{}/phase1_latest_challenge.json",
            config.outfolder
        ))
        .expect("cannot write new_challenge to file");
    new_proof
        .save_to_json(&format!("{}/phase1_latest_proof.json", config.outfolder))
        .expect("cannot write new_proof to file");

    let duration = totalStart.elapsed();
    println!("Time elapsed: {:?}", duration.as_secs());
}
