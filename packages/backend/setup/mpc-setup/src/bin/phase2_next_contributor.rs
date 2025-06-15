use clap::Parser;
use icicle_core::traits::Arithmetic;
use libs::group_structures::{G1serde, G2serde};
use mpc_setup::sigma::{AaccExt, SigmaV2, HASH_BYTES_LEN};
use mpc_setup::utils::{check_pok, consistent, hash_sigma, initialize_random_generator, pok, prompt_user_input, ro, Mode, Phase1Proof, RandomGenerator};
use mpc_setup::{impl_read_from_json, impl_write_into_json};
use rayon::iter::IndexedParallelIterator;
use rayon::iter::ParallelIterator;
use rayon::prelude::{IntoParallelRefIterator, IntoParallelRefMutIterator};
use serde::de::{Deserializer, Error, Visitor};
use serde::ser::{SerializeStruct, Serializer};
use serde::{Deserialize, Serialize};
use serde_json::{from_reader, to_writer_pretty};
use std::env;
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Write};
use std::ops::Mul;
use std::path::PathBuf;
use std::time::Instant;
use blake2::{Blake2b, Digest};
use chrono::Local;
use thiserror::Error;
 use mpc_setup::contributor::{get_device_info, ContributorInfo};

impl_read_from_json!(Phase2Proof);
impl_write_into_json!(Phase2Proof);
const CONTRIBUTOR_FILE_FORMAT: &str = "phase2_contributor_{}.txt";

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
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
// cargo run --release --bin phase2_next_contributor -- --outfolder ./setup/mpc-setup/output --mode random
fn main() {
    let config = Config::parse();
    let contributor_index = prompt_user_input("enter your contributor index (uint > 0) :")
        .parse::<usize>()
        .expect("Please enter a valid number");
    let mut name = String::new();
    let mut location = String::new();
    if matches!(config.mode, Mode::Random) {
        name = prompt_user_input("Enter your name :");
        location = prompt_user_input("Enter location :");
    }
    let start = Instant::now();
    let mut rng = initialize_random_generator(&config.mode);

    let latest_acc = load_phase2_accumulator(&config.outfolder, contributor_index - 1);

    println!("loading current challenge and proof...");
    println!(
        "latest contributor index: {}",
        latest_acc.contributor_index
    );

    let mut previous_hashes = vec![];
    previous_hashes.push(latest_acc.blake2b_hash());
    if latest_acc.contributor_index > 0 {
        verify_latest_contribution(&config.outfolder, &latest_acc);

        let proof_file_str = &format!(
            "{}/phase2_proof_{}.json",
            config.outfolder,
            latest_acc.contributor_index-1
        );
        let prev_proof = Phase2Proof::read_from_json(proof_file_str)
            .expect(format!("cannot read proof file: {}", proof_file_str).as_str());
        previous_hashes.push(prev_proof.blake2b_hash());
        
    } else {
        println!("previous contributor is genesis");
        previous_hashes.push([0u8;HASH_BYTES_LEN]);
    }

    println!("computing new challenge and proof...");
    let (new_acc, new_proof) = compute_new_sigma(&mut rng, &latest_acc);

    assert_eq!(
        new_proof.verify(&latest_acc, &new_acc),
        true,
        "new proof verification failed"
    );

    verify_and_save_results(&config.outfolder, &latest_acc, &new_acc, &new_proof);
    save_contributor_info(&previous_hashes,&start,&config,&new_acc,&new_proof,name,location).expect("cannot contribution info into file");
    println!("Time elapsed: {:?}", start.elapsed().as_secs_f64());
    println!("thanks for your contribution...");
}
fn save_contributor_info(previous_hashes : &Vec<[u8;HASH_BYTES_LEN]>, start_time :&Instant, config: &Config, acc: &SigmaV2, proof: &Phase2Proof, name :String, location: String) -> Result<(), ContributorError> {
    let info = create_contributor_info(previous_hashes,start_time,acc, proof,name, location);
    let file_path = format!(
        "{}/{}",
        config.outfolder,
        CONTRIBUTOR_FILE_FORMAT.replace("{}", &acc.contributor_index.to_string())
    );

    let file = File::create(file_path)?;
    let mut writer = BufWriter::new(file);
    writer.write_all(info.to_string().as_bytes())?;

    Ok(())
}

fn create_contributor_info(previous_hashes : &Vec<[u8;HASH_BYTES_LEN]>, start_time :&Instant,acc: &SigmaV2, proof: &Phase2Proof, name : String, location: String) -> ContributorInfo {
    println!("Total time elapsed: {:?}", start_time.elapsed().as_secs_f64());
    ContributorInfo {
        contributor_no: acc.contributor_index as u32,
        date: Local::now().format("%Y-%m-%d").to_string(),
        name,
        location,
        devices: get_device_info().to_string(),
        prev_acc_hash: hex::encode(previous_hashes[0]),
        prev_proof_hash: hex::encode(previous_hashes[1]),
        current_acc_hash: hex::encode(acc.blake2b_hash()),
        current_proof_hash: hex::encode(proof.blake2b_hash()),
        time_taken_seconds: start_time.elapsed().as_secs_f64(),
    }
}

fn verify_latest_contribution(outfolder: &str, latest_sigma: &SigmaV2) {
    let prev_sigma = load_phase2_accumulator(outfolder, latest_sigma.contributor_index - 1);

    let proof_file_str = &format!(
        "{}/phase2_proof_{}.json",
        outfolder,
        latest_sigma.contributor_index
    );
    let latest_proof = Phase2Proof::read_from_json(proof_file_str)
    .expect(format!("cannot read proof file: {}", proof_file_str).as_str());

    println!("verification of latest proof is started...");
    assert!(
        latest_proof.verify(&prev_sigma, &latest_sigma),
        "proof verification failed"
    );
    println!("verification of latest proof is succeeded...");
}

fn load_phase2_accumulator(outfolder: &str, contributor_index: usize) -> SigmaV2 {
    SigmaV2::read_from_json(&format!(
        "{}/phase2_acc_{}.json",
        outfolder, contributor_index
    ))
    .unwrap()
}

fn verify_and_save_results(
    outfolder: &str,
    latest_sigma: &SigmaV2,
    new_sigma: &SigmaV2,
    new_proof: &Phase2Proof,
) {
    assert!(
        new_proof.verify(latest_sigma, new_sigma),
        "proof verification failed"
    );

    SigmaV2::write_into_json(
        new_sigma,
        &format!(
            "{}/phase2_acc_{}.json",
            outfolder, new_sigma.contributor_index
        ),
    )
    .expect("cannot write new combined_sigma to file");

    Phase2Proof::write_into_json(
        new_proof,
        &format!(
            "{}/phase2_proof_{}.json",
            outfolder, new_sigma.contributor_index
        ),
    )
    .expect("cannot write new_proof to file");
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Phase2Proof {
    pub contributor_index: usize,
    pub v: Vec<u8>,
    pub delta_t_g1: G1serde,
    pub gamma_t_g1: G1serde,
    pub eta_t_g1: G1serde,
    pub pok_delta: G2serde,
    pub pok_gamma: G2serde,
    pub pok_eta: G2serde,
    pub delta_t_g2: G2serde,
    pub gamma_t_g2: G2serde,
    pub eta_t_g2: G2serde,
}

impl Phase2Proof {
    pub fn blake2b_hash(&self) -> [u8; HASH_BYTES_LEN] {
        // Serialize without the hash field
        let serialized = bincode::serialize(&self).expect("Serialization failed for Accumulator");

        let hash = Blake2b::digest(&serialized);

        let mut result = [0u8; HASH_BYTES_LEN];
        result.copy_from_slice(&hash[..HASH_BYTES_LEN]);
        result
    }
    pub fn verify(&self, sigma_old: &SigmaV2, sigma_cur: &SigmaV2) -> bool {
        let v = hash_sigma(&sigma_old);

        assert_eq!(sigma_old.sigma.G, sigma_cur.sigma.G);
        assert_eq!(sigma_old.sigma.H, sigma_cur.sigma.H);

        assert_eq!(
            check_pok(&self.delta_t_g1, &sigma_cur.sigma.G, self.pok_delta, &v),
            true
        );
        assert_eq!(
            check_pok(&self.gamma_t_g1, &sigma_cur.sigma.G, self.pok_gamma, &v),
            true
        );
        assert_eq!(
            check_pok(&self.eta_t_g1, &sigma_cur.sigma.G, self.pok_eta, &v),
            true
        );

        let ro_tGamma = ro(&self.gamma_t_g1, &v);
        let ro_tEta = ro(&self.eta_t_g1, &v);
        let ro_tDelta = ro(&self.delta_t_g1, &v);

        assert_eq!(
            consistent(
                &[sigma_old.gamma, sigma_cur.gamma],
                &[],
                &[ro_tGamma, self.pok_gamma]
            ),
            true
        );
        assert_eq!(
            consistent(
                &[sigma_old.sigma.sigma_1.eta, sigma_cur.sigma.sigma_1.eta],
                &[],
                &[ro_tEta, self.pok_eta]
            ),
            true
        );
        assert_eq!(
            consistent(
                &[sigma_old.sigma.sigma_1.delta, sigma_cur.sigma.sigma_1.delta],
                &[],
                &[ro_tDelta, self.pok_delta]
            ),
            true
        );

        assert_eq!(
            consistent(
                &[sigma_old.gamma, sigma_cur.gamma],
                &[],
                &[sigma_old.sigma.sigma_2.gamma, sigma_cur.sigma.sigma_2.gamma]
            ),
            true
        );
        assert_eq!(
            consistent(
                &[sigma_old.sigma.sigma_1.eta, sigma_cur.sigma.sigma_1.eta],
                &[],
                &[sigma_old.sigma.sigma_2.eta, sigma_cur.sigma.sigma_2.eta]
            ),
            true
        );
        assert_eq!(
            consistent(
                &[sigma_old.sigma.sigma_1.delta, sigma_cur.sigma.sigma_1.delta],
                &[],
                &[sigma_old.sigma.sigma_2.delta, sigma_cur.sigma.sigma_2.delta]
            ),
            true
        );

        let consistent_all = sigma_cur
            .sigma
            .sigma_1
            .gamma_inv_o_inst
            .par_iter()
            .zip(sigma_old.sigma.sigma_1.gamma_inv_o_inst.par_iter())
            .all(|(cur, prev)| {
                consistent(&[*cur, *prev], &[], &[sigma_cur.sigma.H, self.gamma_t_g2])
            });
        assert_eq!(consistent_all, true);
        println!("consistent_all for gamma_inv_o_inst: {}", consistent_all);

        let consistent_all = sigma_cur
            .sigma
            .sigma_1
            .delta_inv_alpha4_xj_tx
            .par_iter()
            .zip(sigma_old.sigma.sigma_1.delta_inv_alpha4_xj_tx.par_iter())
            .all(|(cur, prev)| {
                consistent(&[*cur, *prev], &[], &[sigma_cur.sigma.H, self.delta_t_g2])
            });
        assert_eq!(consistent_all, true);

        println!(
            "consistent_all for delta_inv_alpha4_xj_tx: {}",
            consistent_all
        );
        let consistent_all = sigma_cur
            .sigma
            .sigma_1
            .delta_inv_alphak_xh_tx
            .par_iter()
            .zip(sigma_old.sigma.sigma_1.delta_inv_alphak_xh_tx.par_iter())
            .all(|(cur_inner, old_inner)| {
                cur_inner
                    .par_iter()
                    .zip(old_inner.par_iter())
                    .all(|(cur, prev)| {
                        consistent(&[*cur, *prev], &[], &[sigma_cur.sigma.H, self.delta_t_g2])
                    })
            });
        assert_eq!(consistent_all, true);
        println!(
            "consistent_all for delta_inv_alphak_xh_tx: {}",
            consistent_all
        );

        let consistent_all = sigma_cur
            .sigma
            .sigma_1
            .delta_inv_alphak_yi_ty
            .par_iter()
            .zip(sigma_old.sigma.sigma_1.delta_inv_alphak_yi_ty.par_iter())
            .all(|(cur_inner, old_inner)| {
                cur_inner
                    .par_iter()
                    .zip(old_inner.par_iter())
                    .all(|(cur, prev)| {
                        consistent(&[*cur, *prev], &[], &[sigma_cur.sigma.H, self.delta_t_g2])
                    })
            });
        assert_eq!(consistent_all, true);
        println!(
            "consistent_all for delta_inv_alphak_yi_ty: {}",
            consistent_all
        );

        let consistent_all = sigma_cur
            .sigma
            .sigma_1
            .eta_inv_li_o_inter_alpha4_kj
            .par_iter()
            .zip(
                sigma_old
                    .sigma
                    .sigma_1
                    .eta_inv_li_o_inter_alpha4_kj
                    .par_iter(),
            )
            .all(|(cur_inner, old_inner)| {
                cur_inner
                    .par_iter()
                    .zip(old_inner.par_iter())
                    .all(|(cur, prev)| {
                        consistent(&[*cur, *prev], &[], &[sigma_cur.sigma.H, self.eta_t_g2])
                    })
            });

        assert_eq!(consistent_all, true);
        println!(
            "consistent_all for eta_inv_li_o_inter_alpha4_kj: {}",
            consistent_all
        );

        let consistent_all = sigma_cur
            .sigma
            .sigma_1
            .delta_inv_li_o_prv
            .par_iter()
            .zip(sigma_old.sigma.sigma_1.delta_inv_li_o_prv.par_iter())
            .all(|(cur_inner, old_inner)| {
                cur_inner
                    .par_iter()
                    .zip(old_inner.par_iter())
                    .all(|(cur, prev)| {
                        consistent(&[*cur, *prev], &[], &[sigma_cur.sigma.H, self.delta_t_g2])
                    })
            });
        assert_eq!(consistent_all, true);
        true
    }
}
fn compute_new_sigma(rng: &mut RandomGenerator, sigma_old: &SigmaV2) -> (SigmaV2, Phase2Proof) {
    let mut sigma_new = sigma_old.clone();
    sigma_new.contributor_index = sigma_old.contributor_index + 1;
    let delta = rng.next_random();
    let gamma = rng.next_random();
    let eta = rng.next_random();

    let delta_inv = delta.inv();
    let gamma_inv = gamma.inv();
    let eta_inv = eta.inv();

    let v = hash_sigma(&sigma_old);
    let phase2Proof = Phase2Proof {
        contributor_index: sigma_new.contributor_index,
        v: v.to_vec(),
        delta_t_g1: sigma_old.sigma.G.mul(delta),
        gamma_t_g1: sigma_old.sigma.G.mul(gamma),
        eta_t_g1: sigma_old.sigma.G.mul(eta),
        pok_delta: pok(&sigma_old.sigma.G, delta, &v),
        pok_gamma: pok(&sigma_old.sigma.G, gamma, &v),
        pok_eta: pok(&sigma_old.sigma.G, eta, &v),
        delta_t_g2: sigma_old.sigma.H.mul(delta),
        gamma_t_g2: sigma_old.sigma.H.mul(gamma),
        eta_t_g2: sigma_old.sigma.H.mul(eta),
    };

    sigma_new.sigma.sigma_1.delta = sigma_old.sigma.sigma_1.delta.mul(delta);
    sigma_new.gamma = sigma_old.gamma.mul(gamma);
    sigma_new.sigma.sigma_1.eta = sigma_old.sigma.sigma_1.eta.mul(eta);

    sigma_new.sigma.sigma_2.delta = sigma_old.sigma.sigma_2.delta.mul(delta);
    sigma_new.sigma.sigma_2.gamma = sigma_old.sigma.sigma_2.gamma.mul(gamma);
    sigma_new.sigma.sigma_2.eta = sigma_old.sigma.sigma_2.eta.mul(eta);

    sigma_new
        .sigma
        .sigma_1
        .gamma_inv_o_inst
        .par_iter_mut()
        .for_each(|n| *n = n.mul(gamma_inv));

    sigma_new
        .sigma
        .sigma_1
        .eta_inv_li_o_inter_alpha4_kj
        .par_iter_mut()
        .for_each(|inner_box| {
            inner_box.par_iter_mut().for_each(|g| *g = g.mul(eta_inv));
        });
    sigma_new
        .sigma
        .sigma_1
        .delta_inv_li_o_prv
        .par_iter_mut()
        .for_each(|inner_box| {
            inner_box.par_iter_mut().for_each(|g| *g = g.mul(delta_inv));
        });

    sigma_new
        .sigma
        .sigma_1
        .delta_inv_alphak_xh_tx
        .par_iter_mut()
        .for_each(|inner_box| {
            inner_box.par_iter_mut().for_each(|g| *g = g.mul(delta_inv));
        });

    sigma_new
        .sigma
        .sigma_1
        .delta_inv_alphak_yi_ty
        .par_iter_mut()
        .for_each(|inner_box| {
            inner_box.par_iter_mut().for_each(|g| *g = g.mul(delta_inv));
        });

    sigma_new
        .sigma
        .sigma_1
        .delta_inv_alpha4_xj_tx
        .par_iter_mut()
        .for_each(|n| *n = n.mul(delta_inv));

    (sigma_new, phase2Proof)
}
