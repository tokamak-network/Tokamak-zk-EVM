use clap::Parser;
use mpc_setup::sigma::SigmaV2;
use mpc_setup::utils::{prompt_user_input, Mode};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    /// Output folder path (must exist and be writeable)
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,

}
//cargo run --release --bin phase2_gen_files -- --outfolder ./setup/mpc-setup/output
fn main() {
    let start = std::time::Instant::now();
    let config = Config::parse();
    let contributor_index = prompt_user_input("enter last contributor index (uint > 0) :")
        .parse::<usize>()
        .expect("Please enter a valid number");

    let latest_acc = load_phase2_accumulator(&config.outfolder, contributor_index);

    let sigma = latest_acc.sigma;

    println!("Writing the sigma into JSON...");
    sigma.write_into_json(&format!("{}/combined_sigma.json", &config.outfolder)).unwrap();

    // // Writing the sigma into rust code
  //  println!("Writing the sigma into a rust code...");
   // sigma.write_into_rust_code(&format!("{}/combined_sigma.rs", &config.outfolder)).unwrap();
    println!("Writing the sigma preprocess into json...");
    sigma.write_into_json_for_preprocess(&format!("{}/sigma_preprocess.json", &config.outfolder)).unwrap();

    println!("Writing the sigma verify into json...");
    sigma.write_into_json_for_verify(&format!("{}/sigma_verify.json", &config.outfolder)).unwrap();

    let lap = start.elapsed();
    println!("The sigma writing time: {:.6} seconds", lap.as_secs_f64());
}
fn load_phase2_accumulator(outfolder: &str, contributor_index: usize) -> SigmaV2 {
    SigmaV2::read_from_json(&format!(
        "{}/phase2_acc_{}.json",
        outfolder, contributor_index
    ))
        .unwrap()
}
