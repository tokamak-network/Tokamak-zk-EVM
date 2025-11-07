use tokamak_groth16_prover::*;
use tokamak_groth16_trusted_setup::*;
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;

/// Comprehensive witness debugging tool
fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    println!("🔍 Tokamak Witness Debugging Tool");
    println!("=================================");
    
    // Load trusted setup
    println!("📂 Loading trusted setup...");
    let proving_key_path = "../trusted-setup/ceremony_output/proving_key.bin";
    let proving_key = ProvingKey::load_from_file(proving_key_path)?;
    println!("✅ Proving key loaded: {} variables, {} constraints", 
             proving_key.a_query.len(), 
             proving_key.verification_key.ic.len() - 1);
    
    // Create Merkle inputs
    println!("\n🌳 Creating Merkle inputs...");
    let circuit_inputs = create_debug_merkle_inputs();
    
    // Generate witness
    println!("\n📋 Generating witness...");
    let witness_generator = WitnessGenerator::new()?;
    
    // Compute expected Merkle root
    println!("   Computing expected Merkle root...");
    let expected_root = witness_generator.compute_expected_merkle_root(
        &circuit_inputs.storage_keys, 
        &circuit_inputs.storage_values
    )?;
    println!("   ✅ Expected root: 0x{}", hex::encode(&expected_root.to_bytes_le()[..8]));
    
    // Create inputs with computed root
    let mut adjusted_inputs = circuit_inputs;
    adjusted_inputs.merkle_root = expected_root;
    
    // Generate complete witness
    println!("   Generating complete witness...");
    let witness = witness_generator.generate_witness(&adjusted_inputs)?;
    println!("   ✅ Witness generated: {} variables", witness.full_assignment.len());
    
    // DETAILED CONSTRAINT VALIDATION
    println!("\n🔍 DETAILED CONSTRAINT ANALYSIS");
    println!("==============================");
    
    validate_all_constraints(&witness)?;
    
    // POLYNOMIAL EVALUATION ANALYSIS
    println!("\n📊 POLYNOMIAL EVALUATION ANALYSIS");
    println!("=================================");
    
    analyze_polynomial_evaluations(&witness)?;
    
    // FIELD ELEMENT ANALYSIS
    println!("\n🔢 FIELD ELEMENT ANALYSIS");
    println!("=========================");
    
    analyze_field_elements(&witness)?;
    
    // WITNESS STRUCTURE ANALYSIS
    println!("\n🏗️  WITNESS STRUCTURE ANALYSIS");
    println!("=============================");
    
    analyze_witness_structure(&witness)?;
    
    Ok(())
}

/// Create simple debug Merkle inputs
fn create_debug_merkle_inputs() -> CircuitInputs {
    let mut storage_keys = [ScalarField::zero(); 50];
    let mut storage_values = [ScalarField::zero(); 50];
    
    // Use very simple values for debugging
    let active_count = 4; // Reduced for easier debugging
    
    for i in 0..active_count {
        storage_keys[i] = ScalarField::from([(i + 1) as u32, 0, 0, 0, 0, 0, 0, 0]);
        storage_values[i] = ScalarField::from([(i + 10) as u32, 0, 0, 0, 0, 0, 0, 0]);
    }
    
    CircuitInputs {
        merkle_root: ScalarField::zero(), // Will be computed
        active_leaves: ScalarField::from([active_count as u32, 0, 0, 0, 0, 0, 0, 0]),
        channel_id: ScalarField::from([123u32, 0, 0, 0, 0, 0, 0, 0]),
        storage_keys,
        storage_values,
    }
}

/// Validate ALL constraints with detailed output
fn validate_all_constraints(witness: &CircuitWitness) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let r1cs = &witness.r1cs;
    let assignment = &witness.full_assignment;
    
    println!("   Circuit info:");
    println!("   - Variables: {}", r1cs.num_variables);
    println!("   - Public inputs: {}", r1cs.num_public_inputs);
    println!("   - Constraints: {}", r1cs.num_constraints);
    println!("   - Assignment length: {}", assignment.len());
    
    let mut satisfied = 0;
    let mut failed_constraints = Vec::new();
    
    for constraint_idx in 0..r1cs.num_constraints.min(1000) { // Limit for debug
        if constraint_idx >= r1cs.a_matrix.len() || 
           constraint_idx >= r1cs.b_matrix.len() || 
           constraint_idx >= r1cs.c_matrix.len() {
            println!("   ⚠️  Constraint {} out of bounds", constraint_idx);
            continue;
        }
        
        let a_row = &r1cs.a_matrix[constraint_idx];
        let b_row = &r1cs.b_matrix[constraint_idx];  
        let c_row = &r1cs.c_matrix[constraint_idx];
        
        let a_val = compute_linear_combination(a_row, assignment);
        let b_val = compute_linear_combination(b_row, assignment);
        let c_val = compute_linear_combination(c_row, assignment);
        
        let constraint_result = a_val * b_val - c_val;
        
        if constraint_result == ScalarField::zero() {
            satisfied += 1;
        } else {
            failed_constraints.push((constraint_idx, a_val, b_val, c_val, constraint_result));
            
            // Show details for first few failures
            if failed_constraints.len() <= 10 {
                println!("   ❌ Constraint {}: A*B - C ≠ 0", constraint_idx);
                println!("      A = {:?}", field_to_hex_short(&a_val));
                println!("      B = {:?}", field_to_hex_short(&b_val));
                println!("      C = {:?}", field_to_hex_short(&c_val));
                println!("      A*B = {:?}", field_to_hex_short(&(a_val * b_val)));
                println!("      Result = {:?}", field_to_hex_short(&constraint_result));
                println!("      A row: {} terms", a_row.len());
                println!("      B row: {} terms", b_row.len());
                println!("      C row: {} terms", c_row.len());
            }
        }
    }
    
    println!("\n   📊 CONSTRAINT VALIDATION SUMMARY:");
    println!("   ================================");
    println!("   ✅ Satisfied: {}", satisfied);
    println!("   ❌ Failed: {}", failed_constraints.len());
    println!("   📈 Success rate: {:.2}%", 
             (satisfied as f64 / (satisfied + failed_constraints.len()) as f64) * 100.0);
    
    if !failed_constraints.is_empty() {
        println!("\n   🔍 FAILURE ANALYSIS:");
        analyze_constraint_failures(&failed_constraints, witness)?;
    }
    
    Ok(())
}

/// Analyze why constraints are failing
fn analyze_constraint_failures(
    failures: &[(usize, ScalarField, ScalarField, ScalarField, ScalarField)],
    witness: &CircuitWitness
) -> std::result::Result<(), Box<dyn std::error::Error>> {
    println!("   - First failure at constraint: {}", failures[0].0);
    println!("   - Last failure at constraint: {}", failures.last().unwrap().0);
    
    // Check for patterns in failures
    let mut zero_a_count = 0;
    let mut zero_b_count = 0;
    let mut zero_c_count = 0;
    let mut large_result_count = 0;
    
    for (_, a, b, c, result) in failures.iter().take(100) {
        if *a == ScalarField::zero() { zero_a_count += 1; }
        if *b == ScalarField::zero() { zero_b_count += 1; }
        if *c == ScalarField::zero() { zero_c_count += 1; }
        
        // Check if result is "large" (indicating significant computation error)
        let result_bytes = result.to_bytes_le();
        if result_bytes[4..].iter().any(|&b| b != 0) {
            large_result_count += 1;
        }
    }
    
    println!("   - Constraints with A=0: {}", zero_a_count);
    println!("   - Constraints with B=0: {}", zero_b_count);
    println!("   - Constraints with C=0: {}", zero_c_count);
    println!("   - Constraints with large errors: {}", large_result_count);
    
    Ok(())
}

/// Analyze polynomial evaluations
fn analyze_polynomial_evaluations(witness: &CircuitWitness) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let r1cs = &witness.r1cs;
    let assignment = &witness.full_assignment;
    
    println!("   Computing constraint polynomial evaluations...");
    
    let mut p_evaluations = Vec::new();
    let mut zero_count = 0;
    let mut nonzero_count = 0;
    
    for constraint_idx in 0..r1cs.num_constraints.min(100) {
        if constraint_idx >= r1cs.a_matrix.len() || 
           constraint_idx >= r1cs.b_matrix.len() || 
           constraint_idx >= r1cs.c_matrix.len() {
            continue;
        }
        
        let a_val = compute_linear_combination(&r1cs.a_matrix[constraint_idx], assignment);
        let b_val = compute_linear_combination(&r1cs.b_matrix[constraint_idx], assignment);
        let c_val = compute_linear_combination(&r1cs.c_matrix[constraint_idx], assignment);
        
        let p_val = a_val * b_val - c_val;
        p_evaluations.push(p_val);
        
        if p_val == ScalarField::zero() {
            zero_count += 1;
        } else {
            nonzero_count += 1;
        }
    }
    
    println!("   📊 P(x) evaluations:");
    println!("   - Zero evaluations: {}", zero_count);
    println!("   - Non-zero evaluations: {}", nonzero_count);
    println!("   - Total analyzed: {}", p_evaluations.len());
    
    if nonzero_count > 0 {
        println!("   ⚠️  NON-ZERO P(x) VALUES DETECTED!");
        println!("   This indicates constraint violations!");
        
        // Show first few non-zero values
        let mut shown = 0;
        for (i, &p_val) in p_evaluations.iter().enumerate() {
            if p_val != ScalarField::zero() && shown < 5 {
                println!("   P[{}] = {:?}", i, field_to_hex_short(&p_val));
                shown += 1;
            }
        }
    }
    
    Ok(())
}

/// Analyze field elements for sanity
fn analyze_field_elements(witness: &CircuitWitness) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let assignment = &witness.full_assignment;
    
    println!("   Analyzing field element distribution...");
    
    let mut zero_count = 0;
    let mut one_count = 0;
    let mut small_count = 0; // < 1000
    let mut large_count = 0;
    
    for (i, &val) in assignment.iter().enumerate().take(20) {
        let bytes = val.to_bytes_le();
        let val_u32 = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        
        if val == ScalarField::zero() {
            zero_count += 1;
        } else if val == ScalarField::one() {
            one_count += 1;
        } else if val_u32 < 1000 {
            small_count += 1;
        } else {
            large_count += 1;
        }
        
        if i < 10 {
            println!("   w[{}] = {:?} ({})", i, field_to_hex_short(&val), val_u32);
        }
    }
    
    println!("   📊 Field element distribution (first 20):");
    println!("   - Zero: {}", zero_count);
    println!("   - One: {}", one_count);
    println!("   - Small (<1000): {}", small_count);
    println!("   - Large (≥1000): {}", large_count);
    
    Ok(())
}

/// Analyze witness structure
fn analyze_witness_structure(witness: &CircuitWitness) -> std::result::Result<(), Box<dyn std::error::Error>> {
    println!("   📋 Public inputs: {}", witness.public_inputs.len());
    for (i, &input) in witness.public_inputs.iter().enumerate() {
        println!("   pub[{}] = {:?}", i, field_to_hex_short(&input));
    }
    
    println!("   📋 Full assignment length: {}", witness.full_assignment.len());
    println!("   📋 R1CS variables: {}", witness.r1cs.num_variables);
    
    if witness.full_assignment.len() != witness.r1cs.num_variables {
        println!("   ⚠️  ASSIGNMENT LENGTH MISMATCH!");
    }
    
    // Check first/last elements
    if !witness.full_assignment.is_empty() {
        println!("   First element: {:?}", field_to_hex_short(&witness.full_assignment[0]));
        println!("   Last element: {:?}", field_to_hex_short(&witness.full_assignment[witness.full_assignment.len()-1]));
    }
    
    Ok(())
}

// Helper functions
fn compute_linear_combination(coeffs: &[(usize, ScalarFieldWrapper)], assignment: &[ScalarField]) -> ScalarField {
    let mut result = ScalarField::zero();
    for (var_idx, coeff_wrapper) in coeffs {
        if *var_idx < assignment.len() {
            result = result + (coeff_wrapper.to_scalar_field() * assignment[*var_idx]);
        }
    }
    result
}

fn field_to_hex_short(field: &ScalarField) -> String {
    let bytes = field.to_bytes_le();
    format!("0x{}", hex::encode(&bytes[..4]))
}