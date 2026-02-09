use std::{env, process};

use libs::utils::check_device;
#[cfg(feature = "testing-mode")]
use prove::Proof4Test;
use verify::{Verifier, VerifyInputPaths};

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() != 6 {
        eprintln!(
            "Usage: {} <QAP_PATH> <SYNTHESIZER_PATH> <SETUP_PATH> <PREPROCESS_PATH> <PROOF_PATH> ",
            args[0]
        );
        process::exit(1);
    }

    let paths = VerifyInputPaths {
        qap_path: &args[1],
        synthesizer_path: &args[2],
        setup_path: &args[3],
        preprocess_path: &args[4],
        proof_path: &args[5],
    };

    check_device();
    
    println!("Verifier initialization...");
    let verifier = Verifier::init(&paths);

    println!("Verifying the proof...");
    let res_snark = verifier.verify_snark();
    println!("{}", res_snark );

    #[cfg(feature = "testing-mode")] {
        use std::path::PathBuf;
        let test_proof_path = PathBuf::from(paths.proof_path).join("proof4_test.json");
        let proof4_test = Proof4Test::read_from_json(test_proof_path).unwrap();
        println!("Verification arithmetic: {}", verifier.verify_arith(&proof4_test) );
        println!("Verification copy: {}", verifier.verify_copy(&proof4_test) );
        println!("Verification binding: {}", verifier.verify_binding(&proof4_test) );
    }
}
