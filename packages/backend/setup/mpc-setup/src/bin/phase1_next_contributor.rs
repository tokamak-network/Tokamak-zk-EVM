use std::env;
use chrono::Local;
use clap::Parser;
use mpc_setup::accumulator::Accumulator;
use mpc_setup::contributor::{get_device_info, ContributorInfo};
use mpc_setup::sigma::AaccExt;
use mpc_setup::utils::{initialize_random_generator, load_gpu_if_possible, prompt_user_input, Mode, Phase1Proof};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::time::Instant;
use thiserror::Error;

const HASH_SIZE: usize = 64;
const ACC_FILE_FORMAT: &str = "phase1_acc_{}.json";
const PROOF_FILE_FORMAT: &str = "phase1_proof_{}.json";
const CONTRIBUTOR_FILE_FORMAT: &str = "phase1_contributor_{}.txt";

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    #[arg(long, value_name = "OUTFOLDER")]
    outfolder: String,

    #[arg(long, value_enum, value_name = "MODE")]
    mode: Mode,
}

// cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode testing
// cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode random
// cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode beacon
#[tokio::main]
async fn main() -> Result<(), ContributorError> {
    
    let config = Config::parse();

    let use_gpu: bool = env::var("USE_GPU")
        .ok()
        .and_then(|v| v.parse::<bool>().ok())
        .unwrap_or(false); // default to false
    let mut is_gpu_enabled = false;
    if use_gpu {
        is_gpu_enabled = load_gpu_if_possible()
    }
    
    let contributor_index = prompt_user_input("enter your contributor index (uint > 0) :")
        .parse::<u32>()
        .expect("Please enter a valid number");

    verify_existence_of_contributor_files(&config, contributor_index)?;

    let mut session = ContributorSession::new(config, contributor_index);
    session.run().await?;

    Ok(())
}
struct AccumulatorHashes {
    acc_hash: [u8; HASH_SIZE],
    proof_hash: [u8; HASH_SIZE],
}

impl Default for AccumulatorHashes {
    fn default() -> Self {
        Self {
            acc_hash: [0u8; HASH_SIZE],
            proof_hash: [0u8; HASH_SIZE],
        }
    }
}

#[derive(Error, Debug)]
pub enum VerificationError {
    #[error("Contributor index must be greater than 0")]
    InvalidIndex,
    #[error("File does not exist: {0}")]
    MissingFile(PathBuf),
    #[error("Invalid output folder: {0}")]
    InvalidFolder(String),
}

#[derive(Error, Debug)]
pub enum ContributorError {
    #[error("Verification error: {0}")]
    Verification(#[from] VerificationError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Accumulator validation failed: {0}")]
    AccumulatorValidation(String),
}

struct ContributorSession {
    config: Config,
    contributor_index: u32,
    start_time: Instant,
    previous_hashes: AccumulatorHashes,
}

impl ContributorSession {
    fn new(config: Config, contributor_index: u32) -> Self {
        Self {
            config,
            contributor_index,
            start_time: Instant::now(),
            previous_hashes: AccumulatorHashes::default(),
        }
    }

    async fn run(&mut self) -> Result<(), ContributorError> {
        let mut rng = initialize_random_generator(&self.config.mode);

        let mut name = String::new();
        let mut location = String::new();
        
        
        if matches!(self.config.mode, Mode::Random) {
              name = prompt_user_input("Enter your name :");
              location = prompt_user_input("Enter location :");
        }

        let latest_acc = self.load_and_verify_accumulator()?;
        let (new_acc, new_proof) = self.compute_contribution(&latest_acc, &mut rng)?;
        self.save_results(&new_acc, &new_proof, name, location)?;
        println!("thanks for your contribution...");

        Ok(())
    }

    fn load_and_verify_accumulator(&mut self) -> Result<Accumulator, ContributorError> {
        println!("Loading latest accumulator...");
        let latest_acc = self.load_latest_accumulator()?;

        if latest_acc.contributor_index > 0 {
            self.verify_previous_contribution(&latest_acc)?;
        } else {
            self.verify_genesis(&latest_acc)?;
        }

        Ok(latest_acc)
    }

    fn verify_genesis(&mut self, latest_acc: &Accumulator) -> Result<(), ContributorError> {
        println!("Verifying genesis accumulator...");
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

        if latest_acc.hash() != acc_check.hash() {
            return Err(ContributorError::AccumulatorValidation("Genesis hash verification failed".into()));
        }

        println!("Genesis hash verified");
        self.previous_hashes.acc_hash = acc_check.blake2b_hash();
        Ok(())
    }

    fn load_latest_accumulator(&self) -> Result<Accumulator, ContributorError> {
        let path = format!(
            "{}/{}",
            self.config.outfolder,
            ACC_FILE_FORMAT.replace("{}", &(self.contributor_index - 1).to_string())
        );
        Accumulator::read_from_json(&path)
            .map_err(ContributorError::Io)
    }

    fn load_previous_accumulator(&self, latest_acc: &Accumulator) -> Result<Accumulator, ContributorError> {
        let path = format!(
            "{}/{}",
            self.config.outfolder,
            ACC_FILE_FORMAT.replace("{}", &(latest_acc.contributor_index - 1).to_string())
        );
        Accumulator::read_from_json(&path)
            .map_err(ContributorError::Io)
    }

    fn load_latest_proof(&self) -> Result<Phase1Proof, ContributorError> {
        let path = format!(
            "{}/{}",
            self.config.outfolder,
            PROOF_FILE_FORMAT.replace("{}", &(self.contributor_index - 1).to_string())
        );
        Phase1Proof::load_from_json(&path)
            .map_err(ContributorError::Io)
    }

    fn verify_previous_contribution(&mut self, latest_acc: &Accumulator) -> Result<(), ContributorError> {
        println!("Verifying previous contribution...");

        let prev_acc = self.load_previous_accumulator(latest_acc)?;
        let latest_proof = self.load_latest_proof()?;

        let start = Instant::now();
        if !prev_acc.verify(latest_acc, &latest_proof) {
            return Err(ContributorError::AccumulatorValidation("Verification failed".into()));
        }

        println!("Previous contribution verified in {} seconds", start.elapsed().as_secs_f64());

        self.previous_hashes.proof_hash = latest_proof.blake2b_hash();
        self.previous_hashes.acc_hash = latest_acc.blake2b_hash();

        Ok(())
    }

    fn compute_contribution(
        &self,
        latest_acc: &Accumulator,
        rng: &mut mpc_setup::utils::RandomGenerator,
    ) -> Result<(Accumulator, Phase1Proof), ContributorError> {
        println!("Computing new challenge and proof...");
        let start = Instant::now();

        let (new_acc, new_proof) = latest_acc.compute(rng);

        println!(
            "Computation completed in {} seconds",
            start.elapsed().as_secs_f64()
        );

        Ok((new_acc, new_proof))
    }

    fn save_results(&self, new_acc: &Accumulator, new_proof: &Phase1Proof, name : String, location:String) -> Result<(), ContributorError> {
        self.save_accumulator(new_acc)?;
        self.save_proof(new_proof)?;

        self.save_contributor_info(new_acc, new_proof,name, location)?;

        Ok(())
    }

    fn save_accumulator(&self, acc: &Accumulator) -> Result<(), ContributorError> {
        let path = format!(
            "{}/{}",
            self.config.outfolder,
            ACC_FILE_FORMAT.replace("{}", &self.contributor_index.to_string())
        );
        acc.write_into_json(&path).map_err(ContributorError::Io)
    }

    fn save_proof(&self, proof: &Phase1Proof) -> Result<(), ContributorError> {
        let path = format!(
            "{}/{}",
            self.config.outfolder,
            PROOF_FILE_FORMAT.replace("{}", &self.contributor_index.to_string())
        );
        proof.save_to_json(&path).map_err(ContributorError::Io)
    }

    fn save_contributor_info(&self, acc: &Accumulator, proof: &Phase1Proof, name :String, location: String) -> Result<(), ContributorError> {
        let info = self.create_contributor_info(acc, proof,name, location);
        let file_path = format!(
            "{}/{}",
            self.config.outfolder,
            CONTRIBUTOR_FILE_FORMAT.replace("{}", &acc.contributor_index.to_string())
        );

        let file = File::create(file_path)?;
        let mut writer = BufWriter::new(file);
        writer.write_all(info.to_string().as_bytes())?;

        Ok(())
    }

    fn create_contributor_info(&self, acc: &Accumulator, proof: &Phase1Proof, name : String, location: String) -> ContributorInfo {
        println!("Total time elapsed: {:?}", self.start_time.elapsed().as_secs_f64());
        ContributorInfo {
            contributor_no: acc.contributor_index as u32,
            date: Local::now().format("%Y-%m-%d").to_string(),
            name,
            location,
            devices: get_device_info().to_string(),
            prev_acc_hash: hex::encode(self.previous_hashes.acc_hash),
            prev_proof_hash: hex::encode(self.previous_hashes.proof_hash),
            current_acc_hash: hex::encode(acc.blake2b_hash()),
            current_proof_hash: hex::encode(proof.blake2b_hash()),
            time_taken_seconds: self.start_time.elapsed().as_secs_f64(),
        }
    }
}

fn verify_existence_of_contributor_files(
    config: &Config,
    contributor_index: u32,
) -> Result<(), VerificationError> {
    if contributor_index == 0 {
        return Err(VerificationError::InvalidIndex);
    }

    let out_folder = PathBuf::from(&config.outfolder);
    if !out_folder.exists() || !out_folder.is_dir() {
        return Err(VerificationError::InvalidFolder(config.outfolder.clone()));
    }

    if contributor_index == 1 {
        let genesis_file = out_folder.join(ACC_FILE_FORMAT.replace("{}", "0"));
        if !genesis_file.exists() {
            return Err(VerificationError::MissingFile(genesis_file));
        }
        return Ok(());
    }

    let check_file = |index: u32, format: &str| {
        let file_path = out_folder.join(format.replace("{}", &index.to_string()));
        if !file_path.exists() {
            return Err(VerificationError::MissingFile(file_path));
        }
        Ok(())
    };

    check_file(contributor_index - 1, ACC_FILE_FORMAT)?;
    check_file(contributor_index - 1, PROOF_FILE_FORMAT)?;
    check_file(contributor_index - 2, ACC_FILE_FORMAT)?;

    Ok(())
}
