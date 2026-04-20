use clap::Parser;
use std::fs::File;
use std::path::PathBuf;

use libs::iotools::SigmaPreprocessRkyv;
use libs::iotools::{Instance, Permutation};
use libs::subcircuit_library::{resolve_subcircuit_library_path, SubcircuitLibraryArg};
use libs::utils::{check_device, load_setup_params_from_qap_path};
use memmap2::Mmap;
use preprocess::{Preprocess, PreprocessInputPaths};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    #[command(flatten)]
    subcircuit_library: SubcircuitLibraryArg,

    /// CRS output directory containing sigma_preprocess.rkyv
    #[arg(long, value_name = "PATH")]
    crs: String,

    /// Synthesizer output directory containing instance and permutation JSON files
    #[arg(long, value_name = "PATH")]
    synthesizer_stat: String,

    /// Output directory for preprocess.json
    #[arg(long, value_name = "PATH")]
    output: String,
}

fn main() {
    let config = Config::parse();
    let qap_path = resolve_subcircuit_library_path(config.subcircuit_library.as_deref())
        .to_string_lossy()
        .into_owned();

    let paths = PreprocessInputPaths {
        qap_path: &qap_path,
        synthesizer_path: &config.synthesizer_stat,
        setup_path: &config.crs,
        output_path: &config.output,
    };

    check_device();

    let setup_params = load_setup_params_from_qap_path(paths.qap_path);
    let sigma_path = PathBuf::from(paths.setup_path).join("sigma_preprocess.rkyv");
    let file = File::open(&sigma_path).expect(
        "No reference string is found. Run the Setup first (expected sigma_preprocess.rkyv).",
    );
    let mmap = unsafe { Mmap::map(&file).expect("Failed to map sigma_preprocess.rkyv") };
    let sigma = rkyv::check_archived_root::<SigmaPreprocessRkyv>(&mmap)
        .expect("Invalid sigma_preprocess.rkyv archive");

    let permutation_path = PathBuf::from(paths.synthesizer_path).join("permutation.json");
    let permutation_raw = Permutation::read_box_from_json(permutation_path).unwrap();
    let instance_path = PathBuf::from(paths.synthesizer_path).join("instance.json");
    let instance = Instance::read_from_json(instance_path).unwrap();
    let preprocess = Preprocess::gen(&sigma, &permutation_raw, &instance, &setup_params);
    let formatted_preprocess = preprocess.convert_format_for_solidity_verifier();
    let output_path = PathBuf::from(paths.output_path).join("preprocess.json");
    formatted_preprocess.write_into_json(output_path).unwrap();
}
