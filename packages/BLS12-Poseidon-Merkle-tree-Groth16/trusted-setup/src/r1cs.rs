use crate::errors::{Groth16Error, Result};
use icicle_bls12_381::curve::ScalarField;
use std::fs::File;
use std::io::Read;
use std::path::Path;

/// R1CS constraint system representation
#[derive(Debug, Clone)]
pub struct R1CS {
    /// Number of variables (including 1, public inputs, and private variables)
    pub num_variables: usize,
    /// Number of public inputs
    pub num_public_inputs: usize,
    /// Number of constraints
    pub num_constraints: usize,
    /// A matrix: constraints × variables
    pub a_matrix: Vec<Vec<(usize, ScalarField)>>, // Sparse representation
    /// B matrix: constraints × variables  
    pub b_matrix: Vec<Vec<(usize, ScalarField)>>,
    /// C matrix: constraints × variables
    pub c_matrix: Vec<Vec<(usize, ScalarField)>>,
}

impl R1CS {
    /// Load R1CS from circom-generated .r1cs file
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("Loading R1CS from file: {:?}", path.as_ref());
        
        let mut file = File::open(path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        
        // Use the proper R1CS parser
        crate::utils::R1CSParser::parse_r1cs_file(&buffer)
    }
    
    /// Validate R1CS structure
    pub fn validate(&self) -> Result<()> {
        if self.a_matrix.len() != self.num_constraints ||
           self.b_matrix.len() != self.num_constraints ||
           self.c_matrix.len() != self.num_constraints {
            return Err(Groth16Error::ConstraintError(
                "Matrix dimensions don't match constraint count".to_string()
            ));
        }
        
        if self.num_public_inputs >= self.num_variables {
            return Err(Groth16Error::ConstraintError(
                "Public inputs must be less than total variables".to_string()
            ));
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_r1cs_validation() {
        let r1cs = R1CS {
            num_variables: 100,
            num_public_inputs: 3,
            num_constraints: 50,
            a_matrix: vec![vec![]; 50],
            b_matrix: vec![vec![]; 50],
            c_matrix: vec![vec![]; 50],
        };
        
        assert!(r1cs.validate().is_ok());
    }
    
    #[test]
    fn test_r1cs_validation_failures() {
        // Test mismatched matrix sizes
        let r1cs = R1CS {
            num_variables: 100,
            num_public_inputs: 3,
            num_constraints: 80,
            a_matrix: vec![vec![]; 70], // Wrong size
            b_matrix: vec![vec![]; 80],
            c_matrix: vec![vec![]; 80],
        };
        
        assert!(r1cs.validate().is_err());
        
        // Test public inputs >= variables
        let r1cs = R1CS {
            num_variables: 10,
            num_public_inputs: 15, // Too many
            num_constraints: 80,
            a_matrix: vec![vec![]; 80],
            b_matrix: vec![vec![]; 80],
            c_matrix: vec![vec![]; 80],
        };
        
        assert!(r1cs.validate().is_err());
    }
}