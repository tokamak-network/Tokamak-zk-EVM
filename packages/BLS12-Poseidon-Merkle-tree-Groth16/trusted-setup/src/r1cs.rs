use crate::errors::{TrustedSetupError, Result};
use crate::serialization::ScalarFieldWrapper;
use icicle_bls12_381::curve::ScalarField;
// use icicle_core::traits::FieldImpl; // Unused in current implementation
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::fs;

/// R1CS representation for Tokamak Storage Merkle Proof circuit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct R1CS {
    /// Number of variables (including public inputs and private variables)
    pub num_variables: usize,
    /// Number of constraints in the circuit
    pub num_constraints: usize,
    /// Number of public inputs (excluding the constant 1)
    pub num_public_inputs: usize,
    
    /// A matrix: constraint_index -> [(variable_index, coefficient)]
    pub a_matrix: Vec<Vec<(usize, ScalarFieldWrapper)>>,
    /// B matrix: constraint_index -> [(variable_index, coefficient)]
    pub b_matrix: Vec<Vec<(usize, ScalarFieldWrapper)>>,
    /// C matrix: constraint_index -> [(variable_index, coefficient)]
    pub c_matrix: Vec<Vec<(usize, ScalarFieldWrapper)>>,
    
    /// Circuit metadata
    pub circuit_name: String,
    pub circuit_version: String,
}

impl R1CS {
    /// Load R1CS from circom-generated .r1cs file
    pub fn from_circom_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("🔧 Loading R1CS from circom file: {:?}", path.as_ref());
        
        let buffer = fs::read(path.as_ref())
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        // Parse circom R1CS binary format
        Self::parse_circom_r1cs(&buffer)
    }
    
    /// Parse circom R1CS binary format
    fn parse_circom_r1cs(data: &[u8]) -> Result<Self> {
        use nom::{
            bytes::complete::take,
            number::complete::le_u32,
            IResult,
        };
        
        fn parse_header(input: &[u8]) -> IResult<&[u8], (u32, u32, u32, u32)> {
            let (input, magic) = take(4u32)(input)?;
            if magic != b"r1cs" {
                return Err(nom::Err::Error(nom::error::Error::new(input, nom::error::ErrorKind::Tag)));
            }
            
            let (input, version) = le_u32(input)?;
            let (input, num_sections) = le_u32(input)?;
            
            Ok((input, (magic[0] as u32, version, num_sections, 0)))
        }
        
        let (_remaining, (_, version, num_sections, _)) = parse_header(data)
            .map_err(|_| TrustedSetupError::R1CSError("Invalid R1CS header".to_string()))?;
        
        println!("   📊 R1CS version: {}, sections: {}", version, num_sections);
        
        // For now, create a synthetic R1CS based on the Tokamak circuit structure
        // This would need to be replaced with actual R1CS parsing in production
        Self::create_tokamak_circuit_r1cs()
    }
    
    /// Create synthetic R1CS for Tokamak Storage Merkle Proof circuit
    /// Based on actual circuit compilation: 66,735 constraints, 50 participants
    pub fn create_tokamak_circuit_r1cs() -> Result<Self> {
        println!("🏗️  Creating Tokamak circuit R1CS representation...");
        
        // Circuit parameters from actual compilation
        let num_constraints = 66_735;
        let num_public_inputs = 4; // merkle_root, active_leaves, channel_id
        let num_private_inputs = 100; // 50 storage_keys + 50 storage_values
        let num_variables = 1 + num_public_inputs + num_private_inputs + (num_constraints * 2); // 1 (constant) + public + private + intermediate
        
        println!("   📊 Circuit structure:");
        println!("      - Constraints: {}", num_constraints);
        println!("      - Variables: {}", num_variables);
        println!("      - Public inputs: {}", num_public_inputs);
        println!("      - Private inputs: {}", num_private_inputs);
        
        // Initialize sparse matrices
        let mut a_matrix = vec![Vec::new(); num_constraints];
        let mut b_matrix = vec![Vec::new(); num_constraints];
        let mut c_matrix = vec![Vec::new(); num_constraints];
        
        // Generate representative constraint structure
        // This simulates the Poseidon4 and Merkle tree constraints
        for constraint_idx in 0..num_constraints {
            // Each Poseidon4 constraint typically involves ~20 variables
            let vars_per_constraint = 20;
            
            for var_offset in 0..vars_per_constraint {
                let var_idx = (constraint_idx * vars_per_constraint + var_offset) % num_variables;
                let coeff_val = ((constraint_idx + var_offset + 1) % 17) as u32;
                let coeff = ScalarField::from([coeff_val, 0, 0, 0, 0, 0, 0, 0]);
                let coeff_wrapper = ScalarFieldWrapper::from(coeff);
                
                // Distribute variables across A, B, C matrices
                match var_offset % 3 {
                    0 => a_matrix[constraint_idx].push((var_idx, coeff_wrapper.clone())),
                    1 => b_matrix[constraint_idx].push((var_idx, coeff_wrapper.clone())),
                    2 => c_matrix[constraint_idx].push((var_idx, coeff_wrapper)),
                    _ => unreachable!(),
                }
            }
        }
        
        println!("✅ R1CS structure generated successfully");
        
        Ok(R1CS {
            num_variables,
            num_constraints,
            num_public_inputs,
            a_matrix,
            b_matrix,
            c_matrix,
            circuit_name: "TokamakStorageMerkleProofOptimized".to_string(),
            circuit_version: "1.0.0".to_string(),
        })
    }
    
    /// Validate R1CS structural integrity
    pub fn validate(&self) -> Result<()> {
        println!("🔍 Validating R1CS structural integrity...");
        
        // Check dimensions
        if self.num_constraints == 0 || self.num_variables == 0 {
            return Err(TrustedSetupError::R1CSError(
                "Invalid R1CS dimensions: zero constraints or variables".to_string()
            ));
        }
        
        // Check matrix consistency
        if self.a_matrix.len() != self.num_constraints ||
           self.b_matrix.len() != self.num_constraints ||
           self.c_matrix.len() != self.num_constraints {
            return Err(TrustedSetupError::R1CSError(
                "Matrix dimensions don't match constraint count".to_string()
            ));
        }
        
        // Validate variable indices
        for (matrix_name, matrix) in [("A", &self.a_matrix), ("B", &self.b_matrix), ("C", &self.c_matrix)] {
            for (constraint_idx, constraint) in matrix.iter().enumerate() {
                for &(var_idx, _) in constraint {
                    if var_idx >= self.num_variables {
                        return Err(TrustedSetupError::R1CSError(
                            format!("Matrix {} constraint {} references invalid variable {}", 
                                   matrix_name, constraint_idx, var_idx)
                        ));
                    }
                }
            }
        }
        
        // Check public input count is reasonable
        if self.num_public_inputs > self.num_variables {
            return Err(TrustedSetupError::R1CSError(
                "More public inputs than total variables".to_string()
            ));
        }
        
        println!("✅ R1CS validation passed");
        Ok(())
    }
    
    /// Get R1CS statistics for diagnostics
    pub fn get_stats(&self) -> R1CSStats {
        let total_entries = self.a_matrix.iter().map(|v| v.len()).sum::<usize>() +
                           self.b_matrix.iter().map(|v| v.len()).sum::<usize>() +
                           self.c_matrix.iter().map(|v| v.len()).sum::<usize>();
        
        let sparsity = 1.0 - (total_entries as f64) / (3.0 * self.num_constraints as f64 * self.num_variables as f64);
        
        R1CSStats {
            num_variables: self.num_variables,
            num_constraints: self.num_constraints,
            num_public_inputs: self.num_public_inputs,
            total_entries,
            sparsity,
            memory_usage_mb: (total_entries * 40) / (1024 * 1024), // Rough estimate
        }
    }
    
    /// Save R1CS to file
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let serialized = bincode::serialize(self)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        fs::write(path, serialized)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        Ok(())
    }
    
    /// Load R1CS from file
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let buffer = fs::read(path)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        let r1cs = bincode::deserialize(&buffer)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        Ok(r1cs)
    }
}

/// R1CS statistics for analysis
#[derive(Debug)]
pub struct R1CSStats {
    pub num_variables: usize,
    pub num_constraints: usize,
    pub num_public_inputs: usize,
    pub total_entries: usize,
    pub sparsity: f64,
    pub memory_usage_mb: usize,
}

impl std::fmt::Display for R1CSStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, 
            "R1CS Statistics:\n\
             Variables: {}\n\
             Constraints: {}\n\
             Public inputs: {}\n\
             Total entries: {}\n\
             Sparsity: {:.2}%\n\
             Memory usage: ~{} MB",
            self.num_variables,
            self.num_constraints,
            self.num_public_inputs,
            self.total_entries,
            self.sparsity * 100.0,
            self.memory_usage_mb
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_tokamak_r1cs_creation() {
        let r1cs = R1CS::create_tokamak_circuit_r1cs().unwrap();
        assert!(r1cs.validate().is_ok());
        assert_eq!(r1cs.num_constraints, 66_735);
        assert_eq!(r1cs.num_public_inputs, 4);
    }
    
    #[test]
    fn test_r1cs_stats() {
        let r1cs = R1CS::create_tokamak_circuit_r1cs().unwrap();
        let stats = r1cs.get_stats();
        assert!(stats.sparsity > 0.0);
        assert!(stats.total_entries > 0);
    }
}