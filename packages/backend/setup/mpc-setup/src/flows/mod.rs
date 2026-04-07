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
    pub contributor_name: String,
    pub location: String,
    pub blockhash: Option<String>,
    pub seed_input: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DuskBackedMpcSetupConfig {
    pub subcircuit_library: String,
    pub intermediate: String,
    pub output: String,
    pub beacon_mode: bool,
    pub contributor_name: String,
    pub location: String,
    pub seed_input: Option<String>,
}

pub fn run_native_mpc_setup(config: &NativeMpcSetupConfig) {
    ensure_directory(&config.output);
    ensure_directory(&config.intermediate);
    let qap_path = canonicalize_existing_path(&config.subcircuit_library);
    let s_max = load_s_max(&qap_path);

    phase1_initialize::run(&phase1_initialize::Phase1InitializeConfig {
        qap_path: qap_path.clone(),
        s_max,
        blockhash: config.blockhash.clone(),
        setup_params_file: "setupParams.json".to_string(),
        outfolder: config.intermediate.clone(),
        beacon_mode: config.beacon_mode,
        contributor_name: config.contributor_name.clone(),
        location: config.location.clone(),
    });

    phase1_next_contributor::run(&phase1_next_contributor::Phase1NextContributorConfig {
        outfolder: config.intermediate.clone(),
        beacon_mode: config.beacon_mode,
        contributor_index: 1,
        contributor_name: config.contributor_name.clone(),
        location: config.location.clone(),
        random_seed_input: derive_stage_seed_input(config.seed_input.as_deref(), "phase1-next"),
    })
    .expect("phase1_next_contributor failed");

    run_single_contributor_phase2(
        &config.intermediate,
        &config.output,
        config.beacon_mode,
        config.contributor_name.clone(),
        config.location.clone(),
        Phase2SourceConfig::Native {
            qap_path: qap_path.clone(),
        },
        config.seed_input.as_deref(),
    );
}

pub fn run_dusk_backed_mpc_setup(config: &DuskBackedMpcSetupConfig) {
    ensure_directory(&config.output);
    ensure_directory(&config.intermediate);
    let qap_path = canonicalize_existing_path(&config.subcircuit_library);
    let dusk_raw_file = format!("{}/dusk.response", config.intermediate);

    run_single_contributor_phase2(
        &config.intermediate,
        &config.output,
        config.beacon_mode,
        config.contributor_name.clone(),
        config.location.clone(),
        Phase2SourceConfig::DuskGroth16 {
            qap_path,
            dusk_raw_file,
        },
        config.seed_input.as_deref(),
    );
}

enum Phase2SourceConfig {
    Native {
        qap_path: PathBuf,
    },
    DuskGroth16 {
        qap_path: PathBuf,
        dusk_raw_file: String,
    },
}

fn run_single_contributor_phase2(
    intermediate: &str,
    output: &str,
    beacon_mode: bool,
    contributor_name: String,
    location: String,
    source: Phase2SourceConfig,
    master_seed_input: Option<&str>,
) {
    let (qap_path, phase1_source_mode, dusk_raw_file, prepare_contributor_index) = match source {
        Phase2SourceConfig::Native { qap_path } => {
            (qap_path, phase2_prepare::Phase1SourceMode::Native, None, 1)
        }
        Phase2SourceConfig::DuskGroth16 {
            qap_path,
            dusk_raw_file,
        } => (
            qap_path,
            phase2_prepare::Phase1SourceMode::DuskGroth16,
            Some(dusk_raw_file),
            0,
        ),
    };

    phase2_prepare::run(&phase2_prepare::Phase2PrepareConfig {
        qap_path,
        outfolder: intermediate.to_string(),
        contributor_index: prepare_contributor_index,
        is_checking: false,
        part_no: 0,
        total_part: 1,
        merge_parts: false,
        beacon_mode,
        phase1_source_mode,
        dusk_raw_file,
        y_hex: None,
        random_seed_input: derive_stage_seed_input(master_seed_input, "phase2-prepare"),
    });

    phase2_next_contributor::run(&phase2_next_contributor::Phase2NextContributorConfig {
        outfolder: intermediate.to_string(),
        beacon_mode,
        contributor_index: 1,
        contributor_name,
        location,
        random_seed_input: derive_stage_seed_input(master_seed_input, "phase2-next"),
    });

    phase2_gen_files::run(&phase2_gen_files::Phase2GenFilesConfig {
        intermediate: intermediate.to_string(),
        output: output.to_string(),
        contributor_index: 1,
    });
}

fn derive_stage_seed_input(master_seed_input: Option<&str>, stage: &str) -> Option<String> {
    master_seed_input.map(|seed| format!("{seed}:{stage}"))
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
