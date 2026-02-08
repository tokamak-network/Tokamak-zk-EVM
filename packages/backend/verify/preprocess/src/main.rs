use std::{env, process};
use std::path::PathBuf;

use libs::iotools::SigmaPreprocessRkyv;
use memmap2::Mmap;
use std::fs::File;
use libs::iotools::{Instance, Permutation, SetupParams};
use libs::utils::check_device;
use preprocess::{Preprocess, PreprocessInputPaths};

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() != 5 {
        eprintln!(
            "Usage: {} <QAP_PATH> <SYNTHESIZER_PATH> <SETUP_PATH> <OUT_PATH> ",
            args[0]
        );
        process::exit(1);
    }

    let paths = PreprocessInputPaths {
        qap_path: &args[1],
        synthesizer_path: &args[2],
        setup_path: &args[3],
        output_path: &args[4],
    };

    check_device();

    let setup_path = PathBuf::from(paths.qap_path).join("setupParams.json");
    let setup_params = SetupParams::read_from_json(setup_path).unwrap();
    let sigma_path = PathBuf::from(paths.setup_path).join("sigma_preprocess.rkyv");
    let file = File::open(&sigma_path)
        .expect("No reference string is found. Run the Setup first (expected sigma_preprocess.rkyv).");
    let mmap = unsafe { Mmap::map(&file).expect("Failed to map sigma_preprocess.rkyv") };
    let sigma = rkyv::check_archived_root::<SigmaPreprocessRkyv>(&mmap)
        .expect("Invalid sigma_preprocess.rkyv archive");

    // Load permutation (copy constraints of the variables)
    let permutation_path = PathBuf::from(paths.synthesizer_path).join("permutation.json");
    let permutation_raw = Permutation::read_box_from_json(permutation_path).unwrap();
    // Generate preprocess
    let preprocess = Preprocess::gen(&sigma, &permutation_raw, &setup_params);
    // let output_path = "verify/preprocess/output/preprocess.json";
    // preprocess.write_into_json(&output_path).unwrap();
    let formatted_preprocess = preprocess.convert_format_for_solidity_verifier();
    let output_path = PathBuf::from(paths.output_path).join("preprocess.json");
    formatted_preprocess.write_into_json(output_path).unwrap();
}
