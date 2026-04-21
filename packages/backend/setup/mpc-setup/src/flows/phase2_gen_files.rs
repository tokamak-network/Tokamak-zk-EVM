use crate::sigma::{FinalCrsProvenance, SigmaV2};
use crate::utils::StepTimer;
use chrono::Utc;
use libs::iotools::write_final_crs_artifacts;
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
    let digests =
        write_final_crs_artifacts(&output_dir, &sigma).expect("cannot write final CRS artifacts");
    timer.log_step("write final CRS artifacts");

    let provenance = FinalCrsProvenance {
        generated_at_utc: Utc::now().to_rfc3339(),
        backend_version: env!("CARGO_PKG_VERSION").to_string(),
        phase1_source_provenance: latest_acc.phase1_source_provenance,
        combined_sigma_sha256: digests.combined_sigma_sha256,
        sigma_preprocess_sha256: digests.sigma_preprocess_sha256,
        sigma_verify_sha256: digests.sigma_verify_sha256,
        published_folder_url: None,
        published_archive_name: None,
    };
    let bytes = serde_json::to_vec_pretty(&provenance).expect("cannot serialize CRS provenance");
    fs::write(output_dir.join("crs_provenance.json"), bytes)
        .expect("cannot write crs_provenance.json");
    timer.log_step("write CRS provenance");

    let lap = start.elapsed();
    println!("The sigma writing time: {:.6} seconds", lap.as_secs_f64());
    timer.log_total();
}

fn load_phase2_accumulator(outfolder: &str, contributor_index: usize) -> SigmaV2 {
    SigmaV2::read_phase2_acc(&format!(
        "{}/phase2_acc_{}.rkyv",
        outfolder, contributor_index
    ))
    .unwrap()
}
