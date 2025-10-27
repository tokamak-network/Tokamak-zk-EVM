use crate::errors::{ProverError, Result};
use crate::witness::{CircuitWitness, CircuitInputs};
use tokamak_groth16_trusted_setup::{ProvingKey, VerificationKey};
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField};
use icicle_core::traits::{FieldImpl, GenerateRandom};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

/// Groth16 proof structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Groth16Proof {
    /// [A]₁
    pub a: G1Affine,
    /// [B]₂  
    pub b: G2Affine,
    /// [C]₁
    pub c: G1Affine,
}

/// Groth16 Prover
pub struct Groth16Prover {
    proving_key: ProvingKey,
}

impl Groth16Prover {
    /// Create new prover with proving key
    pub fn new(proving_key: ProvingKey) -> Self {
        Self { proving_key }
    }
    
    /// Load prover from proving key file
    pub fn from_file<P: AsRef<Path>>(proving_key_path: P) -> Result<Self> {
        let proving_key = ProvingKey::load_from_file(proving_key_path)?;
        Ok(Self::new(proving_key))
    }
    
    /// Generate proof from circuit inputs
    pub fn prove(&self, inputs: &CircuitInputs) -> Result<Groth16Proof> {
        println!("Starting Groth16 proof generation...");
        
        // 1. Generate witness
        let witness_generator = crate::witness::WitnessGenerator::new()?;
        let witness = witness_generator.generate_witness(inputs)?;
        
        // 2. Generate proof from witness
        self.prove_with_witness(&witness)
    }
    
    /// Generate proof from pre-computed witness
    pub fn prove_with_witness(&self, witness: &CircuitWitness) -> Result<Groth16Proof> {
        println!("Generating proof from witness...");
        
        // Generate random values for zero-knowledge
        let r = ScalarField::generate_random(1)[0];
        let s = ScalarField::generate_random(1)[0];
        
        println!("Generated randomness (r, s)");
        
        // 1. Compute A commitment
        let a = self.compute_a_commitment(witness, r)?;
        
        // 2. Compute B commitment  
        let b = self.compute_b_commitment(witness, s)?;
        
        // 3. Compute C commitment
        let c = self.compute_c_commitment(witness, r, s)?;
        
        println!("Proof generation completed successfully");
        
        Ok(Groth16Proof { a, b, c })
    }
    
    /// Compute A = α + Σ(a_i · A_i(τ)) + r·δ
    fn compute_a_commitment(&self, witness: &CircuitWitness, r: ScalarField) -> Result<G1Affine> {
        println!("Computing A commitment...");
        
        // TODO: Implement MSM for A commitment
        // For now, return placeholder
        let mut result = self.proving_key.alpha_g1;
        result = G1Affine::from(result.to_projective() + (self.proving_key.delta_g1.to_projective() * r));
        
        Ok(result)
    }
    
    /// Compute B = β + Σ(a_i · B_i(τ)) + s·δ
    fn compute_b_commitment(&self, witness: &CircuitWitness, s: ScalarField) -> Result<G2Affine> {
        println!("Computing B commitment...");
        
        // TODO: Implement MSM for B commitment
        // For now, return placeholder
        let mut result = self.proving_key.beta_g2;
        result = G2Affine::from(result.to_projective() + (self.proving_key.delta_g2.to_projective() * s));
        
        Ok(result)
    }
    
    /// Compute C = (Σ(a_i · C_i(τ)) + h(τ)·t(τ) + s·A + r·B - rs·δ) / δ
    fn compute_c_commitment(&self, witness: &CircuitWitness, r: ScalarField, s: ScalarField) -> Result<G1Affine> {
        println!("Computing C commitment...");
        
        // TODO: Implement full C commitment computation
        // This involves:
        // 1. Computing h(x) polynomial
        // 2. Evaluating h(τ) using H query
        // 3. Computing final C value
        
        // For now, return placeholder
        Ok(G1Affine::zero())
    }
    
    /// Save proof to file
    pub fn save_proof<P: AsRef<Path>>(proof: &Groth16Proof, path: P) -> Result<()> {
        println!("Saving proof to file: {:?}", path.as_ref());
        let file = File::create(path)?;
        bincode::serialize_into(file, proof)
            .map_err(|e| ProverError::SerializationError(e.to_string()))?;
        println!("Proof saved successfully");
        Ok(())
    }
    
    /// Load proof from file
    pub fn load_proof<P: AsRef<Path>>(path: P) -> Result<Groth16Proof> {
        println!("Loading proof from file: {:?}", path.as_ref());
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let proof = bincode::deserialize_from(reader)
            .map_err(|e| ProverError::SerializationError(e.to_string()))?;
        println!("Proof loaded successfully");
        Ok(proof)
    }
    
    /// Export proof as JSON
    pub fn proof_to_json(proof: &Groth16Proof) -> Result<String> {
        let json_proof = serde_json::json!({
            "a": {
                "x": format!("{:?}", proof.a.x),
                "y": format!("{:?}", proof.a.y),
            },
            "b": {
                "x": [
                    format!("{:?}", proof.b.x.c0), 
                    format!("{:?}", proof.b.x.c1)
                ],
                "y": [
                    format!("{:?}", proof.b.y.c0),
                    format!("{:?}", proof.b.y.c1)
                ],
            },
            "c": {
                "x": format!("{:?}", proof.c.x),
                "y": format!("{:?}", proof.c.y),
            }
        });
        
        serde_json::to_string_pretty(&json_proof)
            .map_err(|e| ProverError::SerializationError(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokamak_groth16_trusted_setup::{PowersOfTau, R1CS, CircuitSetup};
    
    #[test]
    fn test_proof_serialization() {
        let proof = Groth16Proof {
            a: G1Affine::zero(),
            b: G2Affine::zero(), 
            c: G1Affine::zero(),
        };
        
        let json = Groth16Prover::proof_to_json(&proof).unwrap();
        assert!(json.contains("\"a\""));
        assert!(json.contains("\"b\""));
        assert!(json.contains("\"c\""));
    }
    
    #[test] 
    fn test_prover_creation() {
        // Create mock proving key
        let powers = PowersOfTau::generate(128).unwrap();
        let r1cs = R1CS {
            num_variables: 100,
            num_public_inputs: 3,
            num_constraints: 80,
            a_matrix: vec![vec![]; 80],
            b_matrix: vec![vec![]; 80],
            c_matrix: vec![vec![]; 80],
        };
        
        let (proving_key, _) = CircuitSetup::generate_keys(&r1cs, &powers).unwrap();
        let prover = Groth16Prover::new(proving_key);
        
        // Prover should be created successfully
        assert_eq!(prover.proving_key.a_query.len(), 100);
    }
}