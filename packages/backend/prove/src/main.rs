use clap::Parser;
use libs::subcircuit_library::{resolve_subcircuit_library_path, SubcircuitLibraryArg};
use libs::utils::check_device;
use prove::{Proof, ProveInputPaths, Prover, TranscriptManager};
use std::path::PathBuf;
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Config {
    #[command(flatten)]
    subcircuit_library: SubcircuitLibraryArg,

    /// CRS output directory containing proof setup artifacts
    #[arg(long, value_name = "PATH")]
    crs: String,

    /// Synthesizer output directory containing proving inputs
    #[arg(long, value_name = "PATH")]
    synthesizer_stat: String,

    /// Output directory for proof.json
    #[arg(long, value_name = "PATH")]
    output: String,
}

fn main() {
    let total_start = Instant::now();
    let config = Config::parse();
    let qap_path = resolve_subcircuit_library_path(config.subcircuit_library.as_deref())
        .to_string_lossy()
        .into_owned();

    let paths = ProveInputPaths {
        qap_path: &qap_path,
        synthesizer_path: &config.synthesizer_stat,
        setup_path: &config.crs,
        output_path: &config.output,
    };

    check_device();

    println!("Prover initialization...");
    let (mut prover, binding) = Prover::init(&paths);

    let mut manager = TranscriptManager::new();

    println!("Running prove0...");
    let proof0 = prover.prove0();
    let thetas = proof0.verify0_with_manager(&mut manager);

    println!("Running prove1...");
    let proof1 = prover.prove1(&thetas);
    let kappa0 = proof1.verify1_with_manager(&mut manager);

    println!("Running prove2...");
    let proof2 = prover.prove2(&thetas, kappa0);
    let (chi, zeta) = proof2.verify2_with_manager(&mut manager);

    println!("Running prove3...");
    let proof3 = prover.prove3(chi, zeta);
    let kappa1 = proof3.verify3_with_manager(&mut manager);

    println!("Running prove4...");
    let (proof4, proof4_test) = prover.prove4(&proof3, &thetas, kappa0, chi, zeta, kappa1);
    #[cfg(not(feature = "testing-mode"))]
    let _ = &proof4_test;

    let proof = Proof {
        binding,
        proof0,
        proof1,
        proof2,
        proof3,
        proof4,
    };

    println!("Writing the proof into JSON (formatted for Solidity verifier)...");
    let formatted_proof = proof.convert_format_for_solidity_verifier();
    let output_path = PathBuf::from(paths.output_path).join("proof.json");
    formatted_proof.write_into_json(output_path).unwrap();

    #[cfg(feature = "testing-mode")]
    {
        let test_output_path = PathBuf::from(paths.output_path).join("proof4_test.json");
        proof4_test.write_into_json(test_output_path).unwrap();

        println!("kappa1: {}", kappa1.to_string());
        println!("chi: {}", chi.to_string());
    }

    let total_elapsed_secs = total_start.elapsed().as_secs_f64();
    println!(
        "Prove completed. Total elapsed time: {:.3}s ({:.0} ms)",
        total_elapsed_secs,
        total_elapsed_secs * 1000.0
    );
}
