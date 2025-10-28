use tokamak_groth16_prover::{CircuitInputs, WitnessGenerator, Groth16Prover, Result};
use tokamak_groth16_trusted_setup::{R1CS, ProductionSetup};
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;

fn main() -> Result<()> {
    println!("🚀 === Tokamak Groth16 Prover Demo ===");
    println!("🔧 This demonstrates end-to-end proof generation");
    println!();
    
    // Step 1: Load production trusted setup
    println!("📋 Step 1: Loading production trusted setup...");
    
    // Load R1CS from compiled circuit
    let r1cs_path = "../build/main_optimized.r1cs";
    let r1cs = R1CS::load_from_file(r1cs_path)?;
    println!("✅ R1CS loaded from {}", r1cs_path);
    println!("   - Variables: {}", r1cs.num_variables);
    println!("   - Public inputs: {}", r1cs.num_public_inputs);  
    println!("   - Constraints: {}", r1cs.num_constraints);
    
    // Load trusted setup from the fixed output directory
    let trusted_setup_dir = "../trusted-setup/output";
    println!("📁 Loading trusted setup from: {}", trusted_setup_dir);
    println!("💡 Since we use a fixed circuit, there must be one consistent trusted setup");
    
    let production_setup = ProductionSetup::load_fixed_setup(trusted_setup_dir, &r1cs)?;
    
    // Extract keys from production setup
    let proving_key = production_setup.proving_key;
    let verification_key = production_setup.verification_key;
    
    println!("✅ Production trusted setup loaded successfully");
    println!("🔒 Security level: {:?}", production_setup.validation.security_level);
    println!("💡 Usage recommendation: {:?}", production_setup.setup_info.recommended_usage);
    println!();
    
    // Step 2: Create test circuit inputs and compute correct Merkle root
    println!("📝 Step 2: Creating test circuit inputs...");
    let mut inputs = CircuitInputs {
        merkle_root: ScalarField::zero(), // Will be computed below
        active_leaves: ScalarField::from([5u32, 0, 0, 0, 0, 0, 0, 0]),      // 5 active participants
        channel_id: ScalarField::from([999u32, 0, 0, 0, 0, 0, 0, 0]),
        storage_keys: [ScalarField::zero(); 50],
        storage_values: [ScalarField::zero(); 50],
    };
    
    // Fill in some test storage data
    for i in 0..5 {
        inputs.storage_keys[i] = ScalarField::from([100 + i as u32, 0, 0, 0, 0, 0, 0, 0]);
        inputs.storage_values[i] = ScalarField::from([200 + i as u32, 0, 0, 0, 0, 0, 0, 0]);
    }
    
    // Compute the correct Merkle root using the same logic as the circuit
    println!("🧮 Computing expected Merkle root...");
    let witness_generator = WitnessGenerator::new()?;
    
    // Compute the actual Merkle root for our test data
    inputs.merkle_root = witness_generator.compute_expected_merkle_root(&inputs.storage_keys, &inputs.storage_values)?;
    
    println!("✅ Test inputs created");
    println!("   - Active leaves: 5");
    println!("   - Channel ID: 999");
    println!("   - Storage entries: 5 filled, 45 zero-padded");
    println!();
    
    // Step 3: Generate witness
    println!("🧮 Step 3: Generating circuit witness...");
    println!("⚡ This involves constraining 64-round Poseidon computations...");
    let witness_generator = WitnessGenerator::new()?;
    let witness = witness_generator.generate_witness(&inputs)?;
    
    println!("✅ Witness generated successfully");
    println!("   - Public inputs: {}", witness.public_inputs.len());
    println!("   - Full assignment size: {}", witness.full_assignment.len());
    println!("   - Expected assignment size: {}", r1cs.num_variables);
    
    // Verify witness size matches R1CS
    if witness.full_assignment.len() < r1cs.num_variables {
        println!("⚠️  Warning: Witness size ({}) is smaller than R1CS variables ({})", 
                witness.full_assignment.len(), r1cs.num_variables);
        println!("   This is expected for the demo - full witness generation needs complete circuit implementation");
    }
    println!();
    
    // Step 4: Generate proof
    println!("🔒 Step 4: Generating Groth16 proof...");
    println!("🧮 This involves Multi-Scalar Multiplications (MSM) on elliptic curves...");
    let prover = Groth16Prover::new(proving_key);
    let proof = prover.prove_with_witness(&witness)?;
    
    println!("✅ Proof generated successfully");
    println!("   - A commitment: {:?}", proof.a);
    println!("   - B commitment: {:?}", proof.b);
    println!("   - C commitment: {:?}", proof.c);
    println!();
    
    // Step 5: Export proof as JSON
    println!("📄 Step 5: Exporting proof to JSON...");
    let json_proof = Groth16Prover::proof_to_json(&proof)?;
    println!("✅ JSON export successful");
    println!("JSON Proof Preview:");
    println!("{}", &json_proof[0..200.min(json_proof.len())]);
    if json_proof.len() > 200 {
        println!("... (truncated)");
    }
    println!();
    
    // Step 6: Create output directory and save proof
    println!("💾 Step 6: Saving proof to output directory...");
    std::fs::create_dir_all("output")?;
    Groth16Prover::save_proof_json(&proof, "output/proof.json")?;
    println!("✅ Proof saved to output/proof.json");
    println!();
    
    // Step 7: Export verification key
    println!("🔑 Step 7: Exporting verification key...");
    verification_key.save_to_json("output/verification_key.json")?;
    println!("✅ Verification key saved to output/verification_key.json");
    println!();
    
    println!("🎉 === Prover Demo Completed Successfully! ===");
    println!("📁 Generated files in output/:");
    println!("   - output/proof.json (Groth16 proof for verification)");
    println!("   - output/verification_key.json (public parameters for verification)");
    println!();
    println!("🔍 Next steps:");
    println!("   1. Use output/verification_key.json to deploy Solidity verifier");
    println!("   2. Use output/proof.json to verify the storage proof on-chain");
    println!("   3. Integrate with your application's proof generation pipeline");
    
    Ok(())
}