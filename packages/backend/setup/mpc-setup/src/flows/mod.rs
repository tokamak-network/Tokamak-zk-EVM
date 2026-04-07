use std::fs;
use std::path::{Path, PathBuf};

use libs::iotools::SetupParams;

pub mod phase1_initialize;
pub mod phase1_next_contributor;
pub mod phase2_gen_files;
pub mod phase2_next_contributor;
pub mod phase2_prepare;

#[derive(Debug, Clone)]
pub struct NativeMpcSetupConfig {
    pub subcircuit_library: String,
    pub intermediate: String,
    pub output: String,
    pub beacon_mode: bool,
}

#[derive(Debug, Clone)]
pub struct DuskBackedMpcSetupConfig {
    pub subcircuit_library: String,
    pub intermediate: String,
    pub output: String,
    pub beacon_mode: bool,
}

pub fn run_native_mpc_setup(config: &NativeMpcSetupConfig) {
    ensure_directory(&config.output);
    ensure_directory(&config.intermediate);
    let qap_path = canonicalize_existing_path(&config.subcircuit_library);
    let s_max = load_s_max(&qap_path);

    phase1_initialize::run(&phase1_initialize::Phase1InitializeConfig {
        qap_path: qap_path.clone(),
        s_max,
        blockhash: None,
        setup_params_file: "setupParams.json".to_string(),
        outfolder: config.intermediate.clone(),
        beacon_mode: config.beacon_mode,
    });

    phase1_next_contributor::run(&phase1_next_contributor::Phase1NextContributorConfig {
        outfolder: config.intermediate.clone(),
        beacon_mode: config.beacon_mode,
        contributor_index: 1,
    })
    .expect("phase1_next_contributor failed");

    phase2_prepare::run(&phase2_prepare::Phase2PrepareConfig {
        qap_path: qap_path.clone(),
        outfolder: config.intermediate.clone(),
        contributor_index: 1,
        is_checking: false,
        part_no: 0,
        total_part: 1,
        merge_parts: false,
        beacon_mode: config.beacon_mode,
        phase1_source_mode: phase2_prepare::Phase1SourceMode::Native,
        dusk_raw_file: None,
        y_hex: None,
    });

    phase2_next_contributor::run(&phase2_next_contributor::Phase2NextContributorConfig {
        outfolder: config.intermediate.clone(),
        beacon_mode: config.beacon_mode,
        contributor_index: 1,
    });

    phase2_gen_files::run(&phase2_gen_files::Phase2GenFilesConfig {
        intermediate: config.intermediate.clone(),
        output: config.output.clone(),
        contributor_index: 1,
    });
}

pub fn run_dusk_backed_mpc_setup(config: &DuskBackedMpcSetupConfig) {
    ensure_directory(&config.output);
    ensure_directory(&config.intermediate);
    let qap_path = canonicalize_existing_path(&config.subcircuit_library);
    let dusk_raw_file = format!("{}/dusk.response", config.intermediate);

    phase2_prepare::run(&phase2_prepare::Phase2PrepareConfig {
        qap_path,
        outfolder: config.intermediate.clone(),
        contributor_index: 0,
        is_checking: false,
        part_no: 0,
        total_part: 1,
        merge_parts: false,
        beacon_mode: config.beacon_mode,
        phase1_source_mode: phase2_prepare::Phase1SourceMode::DuskGroth16,
        dusk_raw_file: Some(dusk_raw_file),
        y_hex: None,
    });

    phase2_next_contributor::run(&phase2_next_contributor::Phase2NextContributorConfig {
        outfolder: config.intermediate.clone(),
        beacon_mode: config.beacon_mode,
        contributor_index: 1,
    });

    phase2_gen_files::run(&phase2_gen_files::Phase2GenFilesConfig {
        intermediate: config.intermediate.clone(),
        output: config.output.clone(),
        contributor_index: 1,
    });
}

fn canonicalize_existing_path(path: &str) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| panic!("cannot resolve path {}", path))
}

fn load_s_max(qap_path: &Path) -> usize {
    let setup_params_path = qap_path.join("setupParams.json");
    SetupParams::read_from_json(setup_params_path)
        .expect("cannot read setup parameters")
        .s_max
}

fn ensure_directory(path: &str) {
    fs::create_dir_all(path).expect("cannot create wrapper output directory");
}
