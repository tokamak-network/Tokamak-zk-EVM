use crate::errors::{VerifierError, Result};
use tokamak_groth16_trusted_setup::VerificationKey;
use tokamak_groth16_prover::Groth16Proof;
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField};
use icicle_core::msm::{self, MSMConfig};
use icicle_runtime::memory::HostSlice;
use ark_bls12_381::{Bls12_381, G1Affine as ArkG1Affine, G2Affine as ArkG2Affine};
use ark_ec::pairing::{Pairing, PairingOutput};
use std::path::Path;

/// Groth16 Verifier
pub struct Groth16Verifier {
    verification_key: VerificationKey,
}

impl Groth16Verifier {
    /// Create new verifier with verification key
    pub fn new(verification_key: VerificationKey) -> Self {
        Self { verification_key }
    }
    
    /// Load verifier from verification key file
    pub fn from_file<P: AsRef<Path>>(verification_key_path: P) -> Result<Self> {
        let verification_key = VerificationKey::load_from_file(verification_key_path)?;
        Ok(Self::new(verification_key))
    }
    
    /// Verify a Groth16 proof
    pub fn verify(
        &self,
        proof: &Groth16Proof,
        public_inputs: &[ScalarField],
    ) -> Result<bool> {
        println!("Starting Groth16 proof verification...");
        
        // Validate inputs
        self.validate_proof(proof)?;
        self.validate_public_inputs(public_inputs)?;
        
        // 1. Compute vk_x = IC[0] + Σ(public_input[i] * IC[i+1])
        let vk_x = self.compute_public_input_commitment(public_inputs)?;
        
        // 2. Verify pairing equation: e(A, B) = e(α, β) * e(vk_x, γ) * e(C, δ)
        let is_valid = self.verify_pairing_equation(proof, vk_x)?;
        
        if is_valid {
            println!("Proof verification: ✓ VALID");
        } else {
            println!("Proof verification: ✗ INVALID");
        }
        
        Ok(is_valid)
    }
    
    /// Validate proof structure
    fn validate_proof(&self, proof: &Groth16Proof) -> Result<()> {
        // Check that proof elements are not zero (which would be invalid)
        if proof.a == G1Affine::zero() || 
           proof.b == G2Affine::zero() || 
           proof.c == G1Affine::zero() {
            return Err(VerifierError::InvalidProof(
                "Proof contains zero elements".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Validate public inputs
    fn validate_public_inputs(&self, public_inputs: &[ScalarField]) -> Result<()> {
        let expected_count = self.verification_key.ic.len() - 1; // -1 for constant term
        
        if public_inputs.len() != expected_count {
            return Err(VerifierError::InvalidPublicInputs(
                format!("Expected {} public inputs, got {}", expected_count, public_inputs.len())
            ));
        }
        
        // For Tokamak circuit, we expect exactly 3 public inputs
        if public_inputs.len() != 3 {
            return Err(VerifierError::InvalidPublicInputs(
                format!("Tokamak circuit expects 3 public inputs (merkle_root, active_leaves, channel_id), got {}", public_inputs.len())
            ));
        }
        
        Ok(())
    }
    
    /// Compute public input commitment: IC[0] + Σ(public_input[i] * IC[i+1])
    fn compute_public_input_commitment(&self, public_inputs: &[ScalarField]) -> Result<G1Affine> {
        println!("Computing public input commitment...");
        
        // Prepare scalars: [1, public_input[0], public_input[1], ...]
        let mut scalars = vec![ScalarField::one()];
        scalars.extend_from_slice(public_inputs);
        
        // Prepare points: IC vector
        let points: Vec<G1Affine> = self.verification_key.ic.clone();
        
        if scalars.len() != points.len() {
            return Err(VerifierError::VerificationError(
                "Mismatch between public inputs and IC vector length".to_string()
            ));
        }
        
        // Compute MSM: Σ(scalar[i] * point[i])
        let mut result = vec![icicle_bls12_381::curve::G1Projective::zero(); 1];
        
        msm::msm(
            HostSlice::from_slice(&scalars),
            HostSlice::from_slice(&points),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut result)
        ).map_err(|e| VerifierError::VerificationError(
            format!("MSM computation failed: {:?}", e)
        ))?;
        
        Ok(G1Affine::from(result[0]))
    }
    
    /// Verify the pairing equation: e(A, B) = e(α, β) * e(vk_x, γ) * e(C, δ)
    fn verify_pairing_equation(&self, proof: &Groth16Proof, vk_x: G1Affine) -> Result<bool> {
        println!("Verifying pairing equation...");
        
        // Convert ICICLE points to Arkworks for pairing
        let a_ark = icicle_g1_to_ark(&proof.a);
        let b_ark = icicle_g2_to_ark(&proof.b);
        let c_ark = icicle_g1_to_ark(&proof.c);
        let vk_x_ark = icicle_g1_to_ark(&vk_x);
        
        let alpha_ark = icicle_g1_to_ark(&self.verification_key.alpha_g1);
        let beta_ark = icicle_g2_to_ark(&self.verification_key.beta_g2);
        let gamma_ark = icicle_g2_to_ark(&self.verification_key.gamma_g2);
        let delta_ark = icicle_g2_to_ark(&self.verification_key.delta_g2);
        
        // Compute LHS: e(A, B)
        let lhs = Bls12_381::pairing(a_ark, b_ark);
        
        // Compute RHS: e(α, β) * e(vk_x, γ) * e(C, δ)
        let e1 = Bls12_381::pairing(alpha_ark, beta_ark);
        let e2 = Bls12_381::pairing(vk_x_ark, gamma_ark);
        let e3 = Bls12_381::pairing(c_ark, delta_ark);
        
        let rhs = e1 * e2 * e3;
        
        // Check if LHS == RHS
        Ok(lhs == rhs)
    }
    
    /// Get verification key reference
    pub fn verification_key(&self) -> &VerificationKey {
        &self.verification_key
    }
}

/// Convert ICICLE G1Affine to Arkworks G1Affine
fn icicle_g1_to_ark(point: &G1Affine) -> ArkG1Affine {
    let x_bytes = point.x.to_bytes_le();
    let y_bytes = point.y.to_bytes_le();
    
    let x = ark_bls12_381::Fq::from_random_bytes(&x_bytes)
        .expect("Failed to convert x coordinate");
    let y = ark_bls12_381::Fq::from_random_bytes(&y_bytes)
        .expect("Failed to convert y coordinate");
    
    ArkG1Affine::new_unchecked(x, y)
}

/// Convert ICICLE G2Affine to Arkworks G2Affine  
fn icicle_g2_to_ark(point: &G2Affine) -> ArkG2Affine {
    let x_bytes = point.x.to_bytes_le();
    let y_bytes = point.y.to_bytes_le();
    
    let x = ark_bls12_381::Fq2::from_random_bytes(&x_bytes)
        .expect("Failed to convert x coordinate");
    let y = ark_bls12_381::Fq2::from_random_bytes(&y_bytes)
        .expect("Failed to convert y coordinate");
    
    ArkG2Affine::new_unchecked(x, y)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokamak_groth16_trusted_setup::{PowersOfTau, R1CS, CircuitSetup};
    
    #[test]
    fn test_verifier_creation() {
        // Create mock verification key
        let powers = PowersOfTau::generate(128).unwrap();
        let r1cs = R1CS {
            num_variables: 100,
            num_public_inputs: 3,
            num_constraints: 80,
            a_matrix: vec![vec![]; 80],
            b_matrix: vec![vec![]; 80],
            c_matrix: vec![vec![]; 80],
        };
        
        let (_, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers).unwrap();
        let verifier = Groth16Verifier::new(verification_key);
        
        // Verifier should be created successfully
        assert_eq!(verifier.verification_key.ic.len(), 4); // 3 public inputs + 1 constant
    }
    
    #[test]
    fn test_public_input_validation() {
        let powers = PowersOfTau::generate(128).unwrap();
        let r1cs = R1CS {
            num_variables: 100,
            num_public_inputs: 3,
            num_constraints: 80,
            a_matrix: vec![vec![]; 80],
            b_matrix: vec![vec![]; 80],
            c_matrix: vec![vec![]; 80],
        };
        
        let (_, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers).unwrap();
        let verifier = Groth16Verifier::new(verification_key);
        
        // Valid public inputs
        let valid_inputs = vec![
            ScalarField::zero(), // merkle_root
            ScalarField::from(10u32), // active_leaves  
            ScalarField::from(12345u32), // channel_id
        ];
        assert!(verifier.validate_public_inputs(&valid_inputs).is_ok());
        
        // Invalid: wrong number of inputs
        let invalid_inputs = vec![ScalarField::zero()]; // Only 1 input
        assert!(verifier.validate_public_inputs(&invalid_inputs).is_err());
    }
}