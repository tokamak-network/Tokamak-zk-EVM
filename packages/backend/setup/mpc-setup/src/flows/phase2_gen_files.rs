use crate::sigma::{FinalCrsProvenance, SigmaV2};
use crate::utils::StepTimer;
use libs::iotools::{SigmaPreprocessRkyv, SigmaRkyv, SigmaVerifyRkyv};
use sha2::{Digest, Sha256};
use std::env;
use std::fs;

#[derive(Debug, Clone)]
pub struct Phase2GenFilesConfig {
    pub intermediate: String,
    pub output: String,
    pub contributor_index: usize,
}

pub fn run(config: &Phase2GenFilesConfig) {
    let mut timer = StepTimer::new("phase2_gen_files");
    let base_path = env::current_dir().unwrap();
    let start = std::time::Instant::now();
    let latest_acc = load_phase2_accumulator(&config.intermediate, config.contributor_index);
    timer.log_step("load latest phase-2 accumulator");

    let sigma = latest_acc.sigma;
    let output_dir = base_path.join(&config.output);
    fs::create_dir_all(&output_dir).expect("cannot create output directory");
    timer.log_step("prepare output directory");

    println!("Writing the sigma into rkyv (zero-copy)...");
    println!(
        "{}",
        base_path
            .join(format!("{}/sigma_preprocess.rkyv", &config.output))
            .display()
    );
    let sigma_rkyv = SigmaRkyv::from_sigma(&sigma);
    let bytes = rkyv::to_bytes::<_, 256>(&sigma_rkyv).expect("cannot serialize combined sigma");
    let combined_sigma_path = output_dir.join("combined_sigma.rkyv");
    fs::write(&combined_sigma_path, &bytes).expect("cannot write combined_sigma.rkyv");
    let combined_sigma_sha256 = sha256_hex(&bytes);
    timer.log_step("write combined sigma");

    println!("Writing sigma_preprocess into rkyv...");
    let sigma_preprocess_rkyv = SigmaPreprocessRkyv::from_sigma(&sigma);
    let bytes = rkyv::to_bytes::<_, 256>(&sigma_preprocess_rkyv)
        .expect("cannot serialize sigma_preprocess");
    let sigma_preprocess_path = output_dir.join("sigma_preprocess.rkyv");
    fs::write(&sigma_preprocess_path, &bytes).expect("cannot write sigma_preprocess.rkyv");
    let sigma_preprocess_sha256 = sha256_hex(&bytes);
    timer.log_step("write sigma preprocess");

    println!("Writing sigma_verify into rkyv...");
    let sigma_verify_rkyv = SigmaVerifyRkyv::from_sigma(&sigma);
    let bytes =
        rkyv::to_bytes::<_, 256>(&sigma_verify_rkyv).expect("cannot serialize sigma_verify");
    let sigma_verify_path = output_dir.join("sigma_verify.rkyv");
    fs::write(&sigma_verify_path, &bytes).expect("cannot write sigma_verify.rkyv");
    let sigma_verify_sha256 = sha256_hex(&bytes);
    timer.log_step("write sigma verify");

    let provenance = FinalCrsProvenance {
        phase1_source_provenance: latest_acc.phase1_source_provenance,
        combined_sigma_sha256,
        sigma_preprocess_sha256,
        sigma_verify_sha256,
    };
    let bytes = serde_json::to_vec_pretty(&provenance).expect("cannot serialize CRS provenance");
    fs::write(output_dir.join("crs_provenance.json"), bytes)
        .expect("cannot write crs_provenance.json");
    timer.log_step("write CRS provenance");

    let lap = start.elapsed();
    println!("The sigma writing time: {:.6} seconds", lap.as_secs_f64());
    timer.log_total();
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn load_phase2_accumulator(outfolder: &str, contributor_index: usize) -> SigmaV2 {
    SigmaV2::read_phase2_acc(&format!(
        "{}/phase2_acc_{}.rkyv",
        outfolder, contributor_index
    ))
    .unwrap()
}
