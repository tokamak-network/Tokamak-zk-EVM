use tokamak_groth16_trusted_setup::{PowersOfTau, R1CS, CircuitSetup, Result};
use std::time::Instant;

fn main() -> Result<()> {
    println!("🎆 === Tokamak Groth16 Trusted Setup Demo (Production Scale) ===");
    println!("📊 This will generate a complete trusted setup for the 50-participant circuit");
    println!("⏱️  Expected total time: 3-8 minutes (depending on hardware)\n");
    
    // Step 1: Generate Powers of Tau
    println!("🔥 Step 1: Generating Powers of Tau...");
    let total_start = Instant::now();
    let start = Instant::now();
    
    let circuit_size = 37199; // Production circuit size from main_optimized.circom
    let powers_of_tau = PowersOfTau::generate(circuit_size)?;
    
    println!("✅ Powers of Tau generated in: {:?}", start.elapsed());
    println!("📊 Summary:");
    println!("   - Max degree: {}", powers_of_tau.max_degree);
    println!("   - G1 powers: {}", powers_of_tau.tau_g1.len());
    println!("   - G2 powers: {}", powers_of_tau.tau_g2.len());
    println!("   - Alpha-tau G1 powers: {}", powers_of_tau.alpha_tau_g1.len());
    println!("   - Beta-tau G1 powers: {}", powers_of_tau.beta_tau_g1.len());
    println!();
    
    // Step 2: Validate Powers of Tau
    println!("🔍 Step 2: Validating Powers of Tau...");
    let validation_start = Instant::now();
    powers_of_tau.validate()?;
    println!("✅ Powers of Tau validation passed in {:?}", validation_start.elapsed());
    println!();
    
    // Step 3: Save Powers of Tau
    println!("💾 Step 3: Saving Powers of Tau...");
    let save_start = Instant::now();
    powers_of_tau.save_to_file("output/powers_of_tau.bin")?;
    println!("✅ Powers of Tau saved to: output/powers_of_tau.bin in {:?}", save_start.elapsed());
    println!();
    
    // Step 4: Load and verify R1CS (if available)
    println!("📁 Step 4: Loading R1CS from compiled circuit...");
    let r1cs_path = "../build/main_optimized.r1cs";
    
    match R1CS::load_from_file(r1cs_path) {
        Ok(r1cs) => {
            println!("✅ R1CS loaded successfully!");
            println!("📊 Circuit analysis:");
            println!("   - Variables: {}", r1cs.num_variables);
            println!("   - Public inputs: {}", r1cs.num_public_inputs);
            println!("   - Constraints: {}", r1cs.num_constraints);
            println!("   - Private variables: {}", r1cs.num_variables - r1cs.num_public_inputs - 1);
            println!();
            
            // Step 5: Generate proving and verification keys
            println!("🔑 Step 5: Generating proving and verification keys...");
            let keygen_start = Instant::now();
            
            let (proving_key, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers_of_tau)?;
            
            println!("✅ Keys generated in: {:?}", keygen_start.elapsed());
            println!("🔑 Proving key structure:");
            println!("   - A query length: {}", proving_key.a_query.len());
            println!("   - B G1 query length: {}", proving_key.b_g1_query.len());
            println!("   - B G2 query length: {}", proving_key.b_g2_query.len());
            println!("   - H query length: {}", proving_key.h_query.len());
            println!("   - L query length: {}", proving_key.l_query.len());
            
            println!("🔍 Verification key structure:");
            println!("   - IC length: {}", verification_key.ic.len());
            println!();
            
            // Step 6: Save keys
            println!("💾 Step 6: Saving keys to files...");
            let file_start = Instant::now();
            
            proving_key.save_to_file("output/proving_key.bin")?;
            verification_key.save_to_file("output/verification_key.bin")?;
            
            // Export verification key as JSON for inspection
            verification_key.save_to_json("output/verification_key.json")?;
            
            println!("✅ Keys saved in {:?}:", file_start.elapsed());
            println!("   - output/proving_key.bin (binary format)");
            println!("   - output/verification_key.bin (binary format)");
            println!("   - output/verification_key.json (human-readable)");
            println!();
            
            println!("🎉 === TRUSTED SETUP COMPLETED SUCCESSFULLY! ===");
            println!("⏱️  Total time: {:?}", total_start.elapsed());
            println!("💾 Output files ready for production use");
            println!("🔗 Next: Deploy verification key to your Solidity verifier contract");
        }
        Err(e) => {
            println!("⚠️  Could not load R1CS file: {}", e);
            println!("📄 Make sure to compile the circuit first:");
            println!("   cd ../circuits && npm run compile-full");
            println!("🔄 Powers of Tau generation completed, but circuit-specific setup requires R1CS");
            println!("⏱️  Total time: {:?}", total_start.elapsed());
        }
    }
    
    Ok(())
}