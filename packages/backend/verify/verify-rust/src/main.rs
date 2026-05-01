use clap::Parser;
use libs::subcircuit_library::{resolve_subcircuit_library_path, SubcircuitLibraryArg};
use libs::utils::check_device;
#[cfg(feature = "testing-mode")]
use prove::Proof4Test;
use verify::{Verifier, VerifyInputPaths};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    #[command(flatten)]
    subcircuit_library: SubcircuitLibraryArg,

    /// CRS output directory containing sigma_verify.json
    #[arg(long, value_name = "PATH")]
    crs: String,

    /// Synthesizer output directory containing verification inputs
    #[arg(long, value_name = "PATH")]
    synthesizer_stat: String,

    /// Preprocess output directory containing preprocess.json
    #[arg(long, value_name = "PATH")]
    preprocess: String,

    /// Proof output directory containing proof.json
    #[arg(long, value_name = "PATH")]
    proof: String,
}

fn main() {
    let config = Config::parse();
    let qap_path = resolve_subcircuit_library_path(&config.subcircuit_library.subcircuit_library)
        .to_string_lossy()
        .into_owned();

    let paths = VerifyInputPaths {
        qap_path: &qap_path,
        synthesizer_path: &config.synthesizer_stat,
        setup_path: &config.crs,
        preprocess_path: &config.preprocess,
        proof_path: &config.proof,
    };

    check_device();

    println!("Verifier initialization...");
    let verifier = Verifier::init(&paths);

    println!("Verifying the proof...");
    let res_snark = verifier.verify_snark();
    println!("{}", res_snark);

    #[cfg(feature = "testing-mode")]
    {
        use std::path::PathBuf;
        let test_proof_path = PathBuf::from(paths.proof_path).join("proof4_test.json");
        let proof4_test = Proof4Test::read_from_json(test_proof_path).unwrap();
        println!(
            "Verification arithmetic: {}",
            verifier.verify_arith(&proof4_test)
        );
        println!("Verification copy: {}", verifier.verify_copy(&proof4_test));
        println!(
            "Verification binding: {}",
            verifier.verify_binding(&proof4_test)
        );
    }
}
