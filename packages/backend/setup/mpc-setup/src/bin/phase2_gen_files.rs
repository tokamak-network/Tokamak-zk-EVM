use clap::Parser;
use libs::iotools::{SigmaPreprocessRkyv, SigmaRkyv, SigmaVerifyRkyv};
use mpc_setup::sigma::SigmaV2;
use mpc_setup::utils::prompt_user_input;
use std::env;
use std::fs;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,
}
//cargo run --release --bin phase2_gen_files -- --outfolder ./setup/mpc-setup/output
fn main() {
    let base_path = env::current_dir().unwrap();
    let start = std::time::Instant::now();
    let config = Config::parse();
    let contributor_index = prompt_user_input("enter last contributor index (uint > 0) :")
        .parse::<usize>()
        .expect("Please enter a valid number");

    let latest_acc = load_phase2_accumulator(&config.outfolder, contributor_index);

    let sigma = latest_acc.sigma;
    let output_dir = base_path.join(&config.outfolder);
    fs::create_dir_all(&output_dir).expect("cannot create output directory");

    println!("Writing the sigma into rkyv (zero-copy)...");
    println!(
        "{}",
        base_path
            .join(format!("{}/sigma_preprocess.rkyv", &config.outfolder))
            .display()
    );
    let sigma_rkyv = SigmaRkyv::from_sigma(&sigma);
    let bytes = rkyv::to_bytes::<_, 256>(&sigma_rkyv).expect("cannot serialize combined sigma");
    fs::write(output_dir.join("combined_sigma.rkyv"), bytes)
        .expect("cannot write combined_sigma.rkyv");

    println!("Writing sigma_preprocess into rkyv...");
    let sigma_preprocess_rkyv = SigmaPreprocessRkyv::from_sigma(&sigma);
    let bytes = rkyv::to_bytes::<_, 256>(&sigma_preprocess_rkyv)
        .expect("cannot serialize sigma_preprocess");
    fs::write(output_dir.join("sigma_preprocess.rkyv"), bytes)
        .expect("cannot write sigma_preprocess.rkyv");

    println!("Writing sigma_verify into rkyv...");
    let sigma_verify_rkyv = SigmaVerifyRkyv::from_sigma(&sigma);
    let bytes =
        rkyv::to_bytes::<_, 256>(&sigma_verify_rkyv).expect("cannot serialize sigma_verify");
    fs::write(output_dir.join("sigma_verify.rkyv"), bytes).expect("cannot write sigma_verify.rkyv");

    let lap = start.elapsed();
    println!("The sigma writing time: {:.6} seconds", lap.as_secs_f64());
}

fn load_phase2_accumulator(outfolder: &str, contributor_index: usize) -> SigmaV2 {
    SigmaV2::read_phase2_acc(&format!(
        "{}/phase2_acc_{}.json",
        outfolder, contributor_index
    ))
    .unwrap()
}
