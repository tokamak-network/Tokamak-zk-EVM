use std::path::PathBuf;
use std::process;
use tokamak_groth16_verifier::{ArkworksGroth16Verifier, Result};

fn main() {
    if let Err(e) = run() {
        eprintln!("Error: {}", e);
        process::exit(1);
    }
}

fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    
    if args.len() != 4 {
        eprintln!("Usage: {} <verification_key.bin> <proof.json> <public_inputs.json>", args[0]);
        eprintln!();
        eprintln!("Pure Arkworks Groth16 verifier for Tokamak storage Merkle proofs.");
        eprintln!("This verifier eliminates ICICLE dependencies and field conversion issues.");
        eprintln!("Returns 1 if the proof is valid, 0 if invalid.");
        eprintln!();
        eprintln!("Arguments:");
        eprintln!("  verification_key.bin  - Path to the verification key file");
        eprintln!("  proof.json           - Path to the proof file");
        eprintln!("  public_inputs.json   - Path to the public inputs file");
        eprintln!();
        eprintln!("Example:");
        eprintln!("  {} ../trusted-setup/ceremony_output/verification_key.bin \\", args[0]);
        eprintln!("             ../prover/output/merkle_proof.json \\");
        eprintln!("             ../prover/output/merkle_public_inputs.json");
        process::exit(1);
    }

    let vk_path = PathBuf::from(&args[1]);
    let proof_path = PathBuf::from(&args[2]);
    let inputs_path = PathBuf::from(&args[3]);

    // Verify files exist
    if !vk_path.exists() {
        eprintln!("Verification key file not found: {}", vk_path.display());
        process::exit(1);
    }
    if !proof_path.exists() {
        eprintln!("Proof file not found: {}", proof_path.display());
        process::exit(1);
    }
    if !inputs_path.exists() {
        eprintln!("Public inputs file not found: {}", inputs_path.display());
        process::exit(1);
    }

    println!("🔍 Pure Arkworks Groth16 Proof Verifier");
    println!("=======================================");
    println!("Verification key: {}", vk_path.display());
    println!("Proof file:       {}", proof_path.display());
    println!("Public inputs:    {}", inputs_path.display());
    println!();
    println!("✨ Using pure Arkworks arithmetic (no ICICLE field conversions)");
    println!();

    // Load verifier
    println!("📖 Loading verification key...");
    let verifier = ArkworksGroth16Verifier::from_file(&vk_path)?;
    println!("✅ Verification key loaded successfully");

    // Verify proof
    println!("🔐 Verifying proof...");
    let result = verifier.verify_from_files(&proof_path, &inputs_path)?;

    if result == 1 {
        println!("✅ PROOF VERIFICATION SUCCESSFUL");
        println!("   The proof is valid and the statement is true.");
        println!("   🎯 Randomization alignment between prover and verifier confirmed!");
    } else {
        println!("❌ PROOF VERIFICATION FAILED");
        println!("   The proof is invalid or the statement is false.");
        println!("   🔍 This may indicate randomization misalignment or other issues.");
    }

    println!();
    println!("Result: {}", result);
    
    // Exit with the verification result
    process::exit(if result == 1 { 0 } else { 1 });
}