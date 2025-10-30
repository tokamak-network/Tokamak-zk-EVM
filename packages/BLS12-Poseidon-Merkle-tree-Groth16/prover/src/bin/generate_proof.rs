use tokamak_groth16_prover::*;
use tokamak_groth16_trusted_setup::*;
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;

/// Simple proof generation example
fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    println!("🚀 Tokamak Groth16 Proof Generation Example");
    println!("==========================================");
    
    // Step 1: Create simple test R1CS
    println!("🔧 Creating test circuit...");
    let r1cs = create_test_r1cs();
    
    // Step 2: Generate trusted setup  
    println!("🔑 Generating trusted setup...");
    let powers = PowersOfTau::generate_for_circuit(16)?;
    let (proving_key, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers)?;
    
    // Step 3: Create test witness
    println!("📋 Creating test witness...");
    let witness = create_test_witness(&r1cs);
    
    // Step 4: Generate proof
    println!("🔐 Generating Groth16 proof...");
    let prover = Groth16Prover::new(proving_key);
    let proof = prover.prove_with_witness(&witness)?;
    
    // Step 5: Export proof
    println!("💾 Exporting proof...");
    let proof_json = Groth16Prover::proof_to_json(&proof)?;
    std::fs::write("proof.json", proof_json)?;
    
    // Step 6: Export verification key
    verification_key.save_to_json("verification_key.json")?;
    
    println!("✅ Proof generation completed successfully!");
    println!("📁 Files created:");
    println!("   - proof.json");
    println!("   - verification_key.json");
    
    Ok(())
}

/// Create simple test R1CS: x^2 = y
fn create_test_r1cs() -> R1CS {
    R1CS {
        num_variables: 3,           // [1, x, y] 
        num_public_inputs: 1,       // x is public
        num_constraints: 1,         // x * x = y
        a_matrix: vec![
            vec![(1, ScalarFieldWrapper::from(ScalarField::one()))] // x
        ],
        b_matrix: vec![
            vec![(1, ScalarFieldWrapper::from(ScalarField::one()))] // x
        ],
        c_matrix: vec![
            vec![(2, ScalarFieldWrapper::from(ScalarField::one()))] // y
        ],
        circuit_name: "SquareTest".to_string(),
        circuit_version: "1.0.0".to_string(),
    }
}

/// Create test witness: x=5, y=25 (5^2 = 25)
fn create_test_witness(r1cs: &R1CS) -> CircuitWitness {
    let x = ScalarField::from([5u32, 0, 0, 0, 0, 0, 0, 0]);  // x = 5
    let y = ScalarField::from([25u32, 0, 0, 0, 0, 0, 0, 0]); // y = 25
    
    CircuitWitness {
        public_inputs: vec![x],                     // x is public
        full_assignment: vec![
            ScalarField::one(),                     // w_0 = 1 (constant)  
            x,                                      // w_1 = x (public)
            y,                                      // w_2 = y (private)
        ],
        r1cs: r1cs.clone(),
    }
}