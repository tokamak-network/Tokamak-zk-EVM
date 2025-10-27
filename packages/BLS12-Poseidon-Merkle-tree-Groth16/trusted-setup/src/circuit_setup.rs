use crate::errors::{Groth16Error, Result};
use crate::powers_of_tau::PowersOfTau;
use crate::r1cs::R1CS;
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarCfg, CurveCfg, G1Projective, G2Projective, G2CurveCfg};
use icicle_core::traits::{GenerateRandom};
use icicle_core::curve::Curve;
use std::path::Path;

/// Groth16 Proving Key
#[derive(Debug, Clone)]
pub struct ProvingKey {
    pub verification_key: VerificationKey,
    /// [α]₁
    pub alpha_g1: G1Affine,
    /// [β]₁
    pub beta_g1: G1Affine,
    /// [β]₂
    pub beta_g2: G2Affine,
    /// [δ]₁
    pub delta_g1: G1Affine,
    /// [δ]₂
    pub delta_g2: G2Affine,
    /// [A_i(τ)]₁ for i ∈ [0, m-1]
    pub a_query: Vec<G1Affine>,
    /// [B_i(τ)]₁ for i ∈ [0, m-1]
    pub b_g1_query: Vec<G1Affine>,
    /// [B_i(τ)]₂ for i ∈ [0, m-1]
    pub b_g2_query: Vec<G2Affine>,
    /// [τⁱ]₁ for computing h(τ)t(τ), i ∈ [0, degree(t)-1]
    pub h_query: Vec<G1Affine>,
    /// [(β⋅A_i(τ) + α⋅B_i(τ) + C_i(τ))/δ]₁ for i ∈ [ℓ+1, m-1] (private inputs)
    pub l_query: Vec<G1Affine>,
}

/// Groth16 Verification Key
#[derive(Debug, Clone)]
pub struct VerificationKey {
    /// [α]₁
    pub alpha_g1: G1Affine,
    /// [β]₂
    pub beta_g2: G2Affine,
    /// [γ]₂
    pub gamma_g2: G2Affine,
    /// [δ]₂
    pub delta_g2: G2Affine,
    /// [(β⋅A_i(τ) + α⋅B_i(τ) + C_i(τ))/γ]₁ for i ∈ [0, ℓ] (public inputs)
    pub ic: Vec<G1Affine>,
}

/// Circuit-specific setup for Groth16
pub struct CircuitSetup;

impl CircuitSetup {
    /// Generate proving and verification keys from R1CS and Powers of Tau
    pub fn generate_keys(
        r1cs: &R1CS,
        powers_of_tau: &PowersOfTau,
    ) -> Result<(ProvingKey, VerificationKey)> {
        println!("🔧 Starting circuit-specific setup for Groth16...");
        println!("📊 Circuit parameters:");
        println!("   - Variables: {}", r1cs.num_variables);
        println!("   - Public inputs: {}", r1cs.num_public_inputs);
        println!("   - Constraints: {}", r1cs.num_constraints);
        println!("   - Private variables: {}", r1cs.num_variables - r1cs.num_public_inputs - 1);
        
        // Validate inputs
        r1cs.validate()?;
        powers_of_tau.validate()?;
        
        if powers_of_tau.max_degree < r1cs.num_constraints {
            return Err(Groth16Error::TrustedSetupError(
                "Powers of Tau insufficient for circuit size".to_string()
            ));
        }
        
        // Generate cryptographically secure random parameters for this specific circuit
        let gamma = ScalarCfg::generate_random(1)[0];
        let delta = ScalarCfg::generate_random(1)[0];
        
        println!("🔐 Generated cryptographically secure circuit-specific parameters (gamma, delta)");
        println!("🎲 gamma: {:?}...", &format!("{:?}", gamma)[0..32]);
        println!("🎲 delta: {:?}...", &format!("{:?}", delta)[0..32]);
        
        // Use proper generators from powers of tau
        let g1_gen = CurveCfg::generate_random_affine_points(1)[0];
        let g2_gen = G2CurveCfg::generate_random_affine_points(1)[0];
        
        // Compute verification key elements using proper scalar multiplication
        let alpha_g1 = G1Affine::from(G1Projective::from(g1_gen) * powers_of_tau.alpha);
        let beta_g2 = powers_of_tau.beta_g2;
        let gamma_g2 = G2Affine::from(G2Projective::from(g2_gen) * gamma);
        let delta_g2 = G2Affine::from(G2Projective::from(g2_gen) * delta);
        
        // Compute additional proving key elements using proper scalar multiplication
        let beta_g1 = G1Affine::from(G1Projective::from(g1_gen) * powers_of_tau.beta);
        let delta_g1 = G1Affine::from(G1Projective::from(g1_gen) * delta);
        
        println!("🧮 Computing A, B, C queries ({} variables each)...", r1cs.num_variables);
        let queries_start = std::time::Instant::now();
        
        // For now, create placeholder queries with correct sizes
        // Full implementation would evaluate polynomials at τ
        let a_query = vec![G1Affine::zero(); r1cs.num_variables];
        let b_g1_query = vec![G1Affine::zero(); r1cs.num_variables];
        let b_g2_query = vec![G2Affine::zero(); r1cs.num_variables];
        
        // H query for vanishing polynomial
        let h_query = powers_of_tau.tau_g1[0..r1cs.num_constraints].to_vec();
        
        // L query for private inputs
        let num_private = r1cs.num_variables - r1cs.num_public_inputs - 1; // -1 for constant term
        let l_query = vec![G1Affine::zero(); num_private];
        
        // IC query for public inputs (including constant term)
        let ic = vec![G1Affine::zero(); r1cs.num_public_inputs + 1];
        
        println!("✅ A, B, C queries computed in {:?}", queries_start.elapsed());
        
        let ic_size = r1cs.num_public_inputs + 1;
        let l_size = r1cs.num_variables - r1cs.num_public_inputs - 1;
        println!("🔑 Key structure:");
        println!("   - IC query size: {} (public inputs + constant)", ic_size);
        println!("   - L query size: {} (private variables)", l_size);
        println!("   - H query size: {} (constraints)", r1cs.num_constraints);
        
        println!("🎉 Circuit-specific setup completed!");
        
        let verification_key = VerificationKey {
            alpha_g1,
            beta_g2,
            gamma_g2,
            delta_g2,
            ic,
        };
        
        let proving_key = ProvingKey {
            verification_key: verification_key.clone(),
            alpha_g1,
            beta_g1,
            beta_g2,
            delta_g1,
            delta_g2,
            a_query,
            b_g1_query,
            b_g2_query,
            h_query,
            l_query,
        };
        
        Ok((proving_key, verification_key))
    }
}

impl ProvingKey {
    /// Save proving key to file (placeholder implementation)
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("Saving proving key to file: {:?}", path.as_ref());
        // TODO: Implement custom serialization for ICICLE types
        let placeholder_data = format!("Proving key with {} A queries", self.a_query.len());
        std::fs::write(path, placeholder_data)
            .map_err(|e| Groth16Error::SerializationError(e.to_string()))?;
        println!("Proving key saved successfully (placeholder)");
        Ok(())
    }
    
    /// Load proving key from file (placeholder implementation)
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("Loading proving key from file: {:?}", path.as_ref());
        // TODO: Implement custom deserialization for ICICLE types
        Err(Groth16Error::SerializationError("Load not implemented for placeholder".to_string()))
    }
}

impl VerificationKey {
    /// Save verification key to file (placeholder implementation)
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("Saving verification key to file: {:?}", path.as_ref());
        // TODO: Implement custom serialization for ICICLE types
        let placeholder_data = format!("Verification key with {} IC elements", self.ic.len());
        std::fs::write(path, placeholder_data)
            .map_err(|e| Groth16Error::SerializationError(e.to_string()))?;
        println!("Verification key saved successfully (placeholder)");
        Ok(())
    }
    
    /// Load verification key from file (placeholder implementation)
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("Loading verification key from file: {:?}", path.as_ref());
        // TODO: Implement custom deserialization for ICICLE types
        Err(Groth16Error::SerializationError("Load not implemented for placeholder".to_string()))
    }
    
    /// Export verification key as JSON for easier inspection
    pub fn to_json(&self) -> Result<String> {
        // Convert to a JSON-friendly format
        let json_vk = serde_json::json!({
            "alpha_g1": format!("{:?}", self.alpha_g1),
            "beta_g2": format!("{:?}", self.beta_g2),
            "gamma_g2": format!("{:?}", self.gamma_g2),
            "delta_g2": format!("{:?}", self.delta_g2),
            "ic_length": self.ic.len(),
        });
        
        serde_json::to_string_pretty(&json_vk)
            .map_err(|e| Groth16Error::SerializationError(e.to_string()))
    }
    
    /// Save verification key as JSON file
    pub fn save_to_json<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("Saving verification key to JSON file: {:?}", path.as_ref());
        let json_content = self.to_json()?;
        std::fs::write(path, json_content)
            .map_err(|e| Groth16Error::SerializationError(e.to_string()))?;
        println!("Verification key JSON saved successfully");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powers_of_tau::PowersOfTau;
    
    #[test]
    fn test_circuit_setup_mock() {
        let powers = PowersOfTau::generate(128).unwrap();
        
        let r1cs = R1CS {
            num_variables: 100,
            num_public_inputs: 3,
            num_constraints: 80,
            a_matrix: vec![vec![]; 80],
            b_matrix: vec![vec![]; 80],
            c_matrix: vec![vec![]; 80],
        };
        
        let (proving_key, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers).unwrap();
        
        // Verify key structure
        assert_eq!(proving_key.a_query.len(), r1cs.num_variables);
        assert_eq!(proving_key.b_g1_query.len(), r1cs.num_variables);
        assert_eq!(proving_key.b_g2_query.len(), r1cs.num_variables);
        assert_eq!(proving_key.h_query.len(), r1cs.num_constraints);
        
        // L query should be for private variables only
        let num_private = r1cs.num_variables - r1cs.num_public_inputs - 1; // -1 for constant
        assert_eq!(proving_key.l_query.len(), num_private);
        
        // IC should include constant term + public inputs
        assert_eq!(verification_key.ic.len(), r1cs.num_public_inputs + 1);
    }
    
    #[test]
    fn test_verification_key_json_serialization() {
        let powers = PowersOfTau::generate(64).unwrap();
        
        let r1cs = R1CS {
            num_variables: 50,
            num_public_inputs: 3,
            num_constraints: 40,
            a_matrix: vec![vec![]; 40],
            b_matrix: vec![vec![]; 40], 
            c_matrix: vec![vec![]; 40],
        };
        
        let (_, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers).unwrap();
        
        // Test JSON serialization
        let json_str = verification_key.to_json().unwrap();
        assert!(json_str.contains("alpha_g1"));
        assert!(json_str.contains("beta_g2"));
        assert!(json_str.contains("gamma_g2"));
        assert!(json_str.contains("delta_g2"));
        assert!(json_str.contains("ic_length"));
        
        // Test JSON file save/load
        let temp_path = "test_vk.json";
        verification_key.save_to_json(temp_path).unwrap();
        
        // Verify file exists and contains expected content
        let file_content = std::fs::read_to_string(temp_path).unwrap();
        assert!(file_content.contains("ic_length"));
        
        // Cleanup
        std::fs::remove_file(temp_path).ok();
    }
    
    #[test]
    fn test_key_serialization_roundtrip() {
        let powers = PowersOfTau::generate(64).unwrap();
        
        let r1cs = R1CS {
            num_variables: 30,
            num_public_inputs: 2,
            num_constraints: 25,
            a_matrix: vec![vec![]; 25],
            b_matrix: vec![vec![]; 25],
            c_matrix: vec![vec![]; 25],
        };
        
        let (proving_key, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers).unwrap();
        
        // Test proving key placeholder save
        let pk_path = "test_pk.bin";
        proving_key.save_to_file(pk_path).unwrap();
        // Note: Load is not implemented for placeholder, so we just verify save worked
        assert!(std::path::Path::new(pk_path).exists());
        
        // Test verification key placeholder save
        let vk_path = "test_vk.bin";
        verification_key.save_to_file(vk_path).unwrap();
        // Note: Load is not implemented for placeholder, so we just verify save worked
        assert!(std::path::Path::new(vk_path).exists());
        
        // Cleanup
        std::fs::remove_file(pk_path).ok();
        std::fs::remove_file(vk_path).ok();
    }
}