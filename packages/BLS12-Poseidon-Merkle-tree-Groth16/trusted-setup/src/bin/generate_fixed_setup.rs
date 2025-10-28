use tokamak_groth16_trusted_setup::{R1CS, ProductionSetup, Result};

fn main() -> Result<()> {
    println!("🔧 === Generate Fixed Circuit Trusted Setup ===");
    println!("🎯 This tool generates a trusted setup for the fixed Tokamak circuit");
    println!();
    
    // Load the fixed R1CS
    let r1cs_path = "../build/main_optimized.r1cs";
    println!("📂 Loading R1CS from: {}", r1cs_path);
    
    let r1cs = R1CS::load_from_file(r1cs_path)?;
    println!("✅ R1CS loaded successfully");
    println!("   - Variables: {}", r1cs.num_variables);
    println!("   - Public inputs: {}", r1cs.num_public_inputs);
    println!("   - Constraints: {}", r1cs.num_constraints);
    println!();
    
    // Generate and save the trusted setup
    let output_dir = "output";
    println!("🏗️  Generating trusted setup for the fixed circuit...");
    println!("📁 Output directory: {}", output_dir);
    println!();
    
    let production_setup = ProductionSetup::generate_and_save_minimal_ceremony(output_dir, &r1cs)?;
    
    println!();
    println!("🎉 === Trusted Setup Generation Complete ===");
    println!("🔒 Security level: {:?}", production_setup.validation.security_level);
    println!("💡 Usage: {:?}", production_setup.setup_info.recommended_usage);
    println!();
    println!("📋 Summary:");
    println!("   - The trusted setup is now available in: {}/", output_dir);
    println!("   - All future prover runs will use this same setup");
    println!("   - The setup is compatible with the fixed circuit");
    println!();
    println!("⚠️  Important Notes:");
    println!("   - This is a demo setup suitable for development/testing");
    println!("   - For production use, generate a proper ceremony with larger parameters");
    println!("   - The same setup must be used by all participants");
    println!();
    
    Ok(())
}