use std::{env, process, time::Instant};

use icicle_runtime::Device;
use libs::utils::check_device;
use prove::Proof4Test;
use verify::{KeccakVerificationResult, Verifier, VerifyInputPaths};

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
    let mut timer = Instant::now();
    let verifier = Verifier::init(&paths);
    let mut lap = timer.elapsed();
    println!("Verifier init time: {:.6} seconds", lap.as_secs_f64());

    println!("Verifying the proof...");
    timer = Instant::now();
    // let res_keccak = verifier.verify_keccak256();
    let res_snark = verifier.verify_snark();
    lap = timer.elapsed();
    println!("Verification time: {:.6} seconds", lap.as_secs_f64());
    // println!("{}", res_snark && res_keccak == KeccakVerificationResult::True );
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