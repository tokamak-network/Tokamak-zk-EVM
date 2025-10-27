use tokamak_groth16_trusted_setup::{PowersOfTau, R1CS, CircuitSetup, Result};

fn main() -> Result<()> {
    println!("=== Quick Trusted Setup Test ===\n");
    
    // Test with smaller circuit size for demonstration
    let circuit_size = 1000; // Much smaller for quick testing
    
    println!("Step 1: Generating Powers of Tau for {} constraints...", circuit_size);
    let powers_of_tau = PowersOfTau::generate(circuit_size)?;
    println!("✅ Powers of Tau generated successfully");
    println!("   - G1 powers: {}", powers_of_tau.tau_g1.len());
    println!("   - G2 powers: {}", powers_of_tau.tau_g2.len());
    
    println!("\nStep 2: Validating Powers of Tau...");
    powers_of_tau.validate()?;
    println!("✅ Powers of Tau validation passed");
    
    println!("\nStep 3: Creating mock R1CS for testing...");
    let r1cs = R1CS {
        num_variables: 50,
        num_public_inputs: 3,
        num_constraints: 40,
        a_matrix: vec![vec![]; 40],
        b_matrix: vec![vec![]; 40],
        c_matrix: vec![vec![]; 40],
    };
    println!("✅ Mock R1CS created:");
    println!("   - Variables: {}", r1cs.num_variables);
    println!("   - Public inputs: {}", r1cs.num_public_inputs);
    println!("   - Constraints: {}", r1cs.num_constraints);
    
    println!("\nStep 4: Generating proving and verification keys...");
    let (proving_key, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers_of_tau)?;
    println!("✅ Keys generated successfully");
    println!("   - Proving key queries: A={}, B_G1={}, B_G2={}, H={}, L={}", 
             proving_key.a_query.len(),
             proving_key.b_g1_query.len(), 
             proving_key.b_g2_query.len(),
             proving_key.h_query.len(),
             proving_key.l_query.len());
    println!("   - Verification key IC length: {}", verification_key.ic.len());
    
    println!("\nStep 5: Saving outputs...");
    powers_of_tau.save_to_file("quick_powers_of_tau.bin")?;
    proving_key.save_to_file("quick_proving_key.bin")?;
    verification_key.save_to_file("quick_verification_key.bin")?;
    verification_key.save_to_json("quick_verification_key.json")?;
    
    println!("✅ Files saved:");
    println!("   - quick_powers_of_tau.bin");
    println!("   - quick_proving_key.bin");
    println!("   - quick_verification_key.bin");
    println!("   - quick_verification_key.json");
    
    println!("\n🎉 Quick trusted setup test completed successfully!");
    println!("\nThe system demonstrates:");
    println!("✅ Cryptographically secure random generation");
    println!("✅ ICICLE BLS12-381 curve operations");
    println!("✅ MSM-accelerated Powers of Tau computation");
    println!("✅ Proper Groth16 key generation");
    println!("✅ JSON export for integration");
    
    Ok(())
}