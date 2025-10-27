use crate::errors::{ProverError, Result};
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use serde::{Deserialize, Serialize};

/// Circuit inputs for Tokamak storage proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitInputs {
    // Public inputs
    pub merkle_root: ScalarField,
    pub active_leaves: ScalarField,  // ≤ 50
    pub channel_id: ScalarField,
    
    // Private inputs
    pub storage_keys: [ScalarField; 50],
    pub storage_values: [ScalarField; 50],
}

/// Complete circuit witness including public and private parts
#[derive(Debug, Clone)]
pub struct CircuitWitness {
    /// Public inputs: [merkle_root, active_leaves, channel_id]
    pub public_inputs: Vec<ScalarField>,
    /// Full witness assignment: [1, public_inputs..., private_witness...]
    pub full_assignment: Vec<ScalarField>,
}

/// Witness generator for Tokamak circuit
pub struct WitnessGenerator {
    // Poseidon constants will be loaded from circuit
    poseidon_constants: Vec<ScalarField>,
    mds_matrix: [[ScalarField; 5]; 5],
}

impl WitnessGenerator {
    /// Create new witness generator
    pub fn new() -> Result<Self> {
        // TODO: Load actual Poseidon constants from circuit
        // For now, create placeholder
        let poseidon_constants = vec![ScalarField::zero(); 320];
        let mds_matrix = [[ScalarField::zero(); 5]; 5];
        
        Ok(Self {
            poseidon_constants,
            mds_matrix,
        })
    }
    
    /// Generate complete witness from circuit inputs
    pub fn generate_witness(&self, inputs: &CircuitInputs) -> Result<CircuitWitness> {
        println!("Generating witness for Tokamak storage proof...");
        
        // Validate inputs
        self.validate_inputs(inputs)?;
        
        // 1. Compute Poseidon4 hashes for storage leaves
        let leaf_hashes = self.compute_storage_leaves(inputs)?;
        
        // 2. Pad to 64 leaves and compute Merkle tree
        let merkle_root = self.compute_merkle_tree(&leaf_hashes, inputs.active_leaves)?;
        
        // 3. Verify the computed root matches expected root
        if merkle_root != inputs.merkle_root {
            return Err(ProverError::ConstraintError(
                "Computed Merkle root doesn't match expected root".to_string()
            ));
        }
        
        // 4. Build full witness assignment
        let public_inputs = vec![
            inputs.merkle_root,
            inputs.active_leaves,
            inputs.channel_id,
        ];
        
        // TODO: Complete witness generation with all intermediate values
        // For now, create a placeholder with correct structure
        let mut full_assignment = vec![ScalarField::one()]; // w_0 = 1
        full_assignment.extend(&public_inputs);
        
        // Add private inputs
        full_assignment.extend_from_slice(&inputs.storage_keys);
        full_assignment.extend_from_slice(&inputs.storage_values);
        
        // Add intermediate computations (leaf hashes, merkle tree nodes)
        full_assignment.extend(&leaf_hashes);
        
        println!("Witness generation completed successfully");
        println!("  Public inputs: {}", public_inputs.len());
        println!("  Total witness size: {}", full_assignment.len());
        
        Ok(CircuitWitness {
            public_inputs,
            full_assignment,
        })
    }
    
    /// Validate circuit inputs
    fn validate_inputs(&self, inputs: &CircuitInputs) -> Result<()> {
        // Check active_leaves is within bounds
        let active_leaves_value = field_to_u32(inputs.active_leaves)?;
        if active_leaves_value > 50 {
            return Err(ProverError::InvalidInput(
                format!("Active leaves {} exceeds maximum of 50", active_leaves_value)
            ));
        }
        
        Ok(())
    }
    
    /// Compute Poseidon4 hash for each storage leaf
    fn compute_storage_leaves(&self, inputs: &CircuitInputs) -> Result<Vec<ScalarField>> {
        let mut leaf_hashes = Vec::with_capacity(50);
        
        for i in 0..50 {
            // Poseidon4(storage_key, storage_value, 0, 0)
            let hash = self.poseidon4_hash(&[
                inputs.storage_keys[i],
                inputs.storage_values[i],
                ScalarField::zero(),
                ScalarField::zero(),
            ])?;
            leaf_hashes.push(hash);
        }
        
        Ok(leaf_hashes)
    }
    
    /// Compute 3-level quaternary Merkle tree
    fn compute_merkle_tree(&self, leaves: &[ScalarField], active_leaves: ScalarField) -> Result<ScalarField> {
        // Pad to 64 leaves
        let mut padded_leaves = vec![ScalarField::zero(); 64];
        for i in 0..50 {
            padded_leaves[i] = leaves[i];
        }
        
        // Level 0: 64 leaves → 16 intermediate nodes
        let mut level0 = Vec::with_capacity(16);
        for i in 0..16 {
            let hash = self.poseidon4_hash(&[
                padded_leaves[i*4],
                padded_leaves[i*4 + 1],
                padded_leaves[i*4 + 2],
                padded_leaves[i*4 + 3],
            ])?;
            level0.push(hash);
        }
        
        // Level 1: 16 → 4 nodes
        let mut level1 = Vec::with_capacity(4);
        for i in 0..4 {
            let hash = self.poseidon4_hash(&[
                level0[i*4],
                level0[i*4 + 1],
                level0[i*4 + 2],
                level0[i*4 + 3],
            ])?;
            level1.push(hash);
        }
        
        // Level 2: 4 → 1 root
        let root = self.poseidon4_hash(&level1)?;
        
        Ok(root)
    }
    
    /// Compute Poseidon4 hash (placeholder implementation)
    fn poseidon4_hash(&self, inputs: &[ScalarField]) -> Result<ScalarField> {
        if inputs.len() != 4 {
            return Err(ProverError::InvalidInput(
                "Poseidon4 requires exactly 4 inputs".to_string()
            ));
        }
        
        // TODO: Implement actual Poseidon4 using constants from circuit
        // For now, return a simple combination as placeholder
        let result = inputs[0] + inputs[1] + inputs[2] + inputs[3];
        Ok(result)
    }
}

/// Convert ScalarField to u32 (for small values)
fn field_to_u32(field: ScalarField) -> Result<u32> {
    // TODO: Implement proper field to u32 conversion
    // For now, return placeholder
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_witness_generator_creation() {
        let generator = WitnessGenerator::new().unwrap();
        assert_eq!(generator.poseidon_constants.len(), 320);
    }
    
    #[test]
    fn test_circuit_inputs_validation() {
        let generator = WitnessGenerator::new().unwrap();
        
        let inputs = CircuitInputs {
            merkle_root: ScalarField::zero(),
            active_leaves: ScalarField::from(10u32),
            channel_id: ScalarField::from(12345u32),
            storage_keys: [ScalarField::zero(); 50],
            storage_values: [ScalarField::zero(); 50],
        };
        
        // This should pass validation
        assert!(generator.validate_inputs(&inputs).is_ok());
    }
}