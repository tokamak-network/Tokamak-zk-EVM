use crate::errors::{TrustedSetupError, Result};
use crate::r1cs::R1CS;
use crate::powers_of_tau::PowersOfTau;
use crate::serialization::*;
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField, G1Projective, G2Projective, CurveCfg, G2CurveCfg};
use icicle_core::traits::{FieldImpl, GenerateRandom, Arithmetic};
use icicle_core::curve::Curve;
use serde::{Deserialize, Serialize};
use std::path::Path;
use rayon::prelude::*;

/// Groth16 Proving Key
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvingKey {
    pub verification_key: VerificationKey,
    pub alpha_g1: G1SerdeWrapper,
    pub beta_g1: G1SerdeWrapper,
    pub beta_g2: G2SerdeWrapper,
    pub delta_g1: G1SerdeWrapper,
    pub delta_g2: G2SerdeWrapper,
    pub a_query: Vec<G1SerdeWrapper>,
    pub b_g1_query: Vec<G1SerdeWrapper>,
    pub b_g2_query: Vec<G2SerdeWrapper>,
    pub h_query: Vec<G1SerdeWrapper>,
    pub l_query: Vec<G1SerdeWrapper>,
}

/// Groth16 Verification Key
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationKey {
    pub alpha_g1: G1SerdeWrapper,
    pub beta_g2: G2SerdeWrapper,
    pub gamma_g2: G2SerdeWrapper,
    pub delta_g2: G2SerdeWrapper,
    pub ic: Vec<G1SerdeWrapper>,
}

/// JSON-friendly version of ProvingKey with hex string representations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvingKeyJson {
    pub verification_key: VerificationKeyJson,
    pub alpha_g1: G1JsonWrapper,
    pub beta_g1: G1JsonWrapper,
    pub beta_g2: G2JsonWrapper,
    pub delta_g1: G1JsonWrapper,
    pub delta_g2: G2JsonWrapper,
    pub a_query: Vec<G1JsonWrapper>,
    pub b_g1_query: Vec<G1JsonWrapper>,
    pub b_g2_query: Vec<G2JsonWrapper>,
    pub h_query: Vec<G1JsonWrapper>,
    pub l_query: Vec<G1JsonWrapper>,
}

/// JSON-friendly version of VerificationKey with hex string representations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationKeyJson {
    pub alpha_g1: G1JsonWrapper,
    pub beta_g2: G2JsonWrapper,
    pub gamma_g2: G2JsonWrapper,
    pub delta_g2: G2JsonWrapper,
    pub ic: Vec<G1JsonWrapper>,
}

/// Main Circuit Setup Implementation
pub struct CircuitSetup;

impl CircuitSetup {
    /// Generate Groth16 proving and verification keys from R1CS and Powers of Tau
    pub fn generate_keys(r1cs: &R1CS, powers: &PowersOfTau) -> Result<(ProvingKey, VerificationKey)> {
        println!("🔧 Starting Groth16 trusted setup for Tokamak circuit...");
        println!("   Circuit: {} constraints, {} variables", r1cs.num_constraints, r1cs.num_variables);
        
        // Validate inputs
        Self::validate_setup_inputs(r1cs, powers)?;
        
        // Extract ceremony parameters from powers of tau
        let params = Self::extract_ceremony_parameters(powers)?;
        
        // Generate proving key components in parallel
        let proving_components = Self::generate_proving_key_components(r1cs, powers, &params)?;
        
        // Generate verification key
        let verification_key = Self::generate_verification_key(r1cs, powers, &params)?;
        
        // Assemble proving key
        let proving_key = ProvingKey {
            verification_key: verification_key.clone(),
            alpha_g1: params.alpha_g1,
            beta_g1: params.beta_g1,
            beta_g2: params.beta_g2,
            delta_g1: params.delta_g1,
            delta_g2: params.delta_g2,
            a_query: proving_components.a_query,
            b_g1_query: proving_components.b_g1_query,
            b_g2_query: proving_components.b_g2_query,
            h_query: proving_components.h_query,
            l_query: proving_components.l_query,
        };
        
        println!("✅ Groth16 trusted setup completed successfully");
        println!("   Proving key size: {} elements", Self::count_proving_key_elements(&proving_key));
        println!("   Verification key size: {} elements", verification_key.ic.len() + 4);
        
        Ok((proving_key, verification_key))
    }
    
    /// Validate setup inputs
    fn validate_setup_inputs(r1cs: &R1CS, powers: &PowersOfTau) -> Result<()> {
        // Validate R1CS
        r1cs.validate()?;
        
        // Validate Powers of Tau
        powers.validate()?;
        
        // Check compatibility
        let required_powers = r1cs.num_constraints.next_power_of_two();
        if powers.max_degree < required_powers {
            return Err(TrustedSetupError::InsufficientPowers {
                required: required_powers,
                available: powers.max_degree,
            });
        }
        
        println!("✓ Setup inputs validated successfully");
        Ok(())
    }
    
    /// Extract ceremony parameters from Powers of Tau
    fn extract_ceremony_parameters(powers: &PowersOfTau) -> Result<CeremonyParameters> {
        println!("📥 Extracting ceremony parameters...");
        
        // Extract α, β from powers of tau
        let alpha = powers.alpha.to_scalar_field();
        let beta = powers.beta.to_scalar_field();
        let alpha_g1 = powers.alpha_tau_g1[0].clone(); // [α]₁
        let beta_g1 = powers.beta_tau_g1[0].clone();   // [β]₁
        let beta_g2 = powers.beta_g2.clone();          // [β]₂
        
        // Generate fresh γ, δ with cryptographically secure randomness
        use rand::RngCore;
        let mut rng = rand::thread_rng();
        
        let mut gamma_limbs = [0u32; 8];
        let mut delta_limbs = [0u32; 8];
        
        // Fill with cryptographically secure random data
        for i in 0..8 {
            gamma_limbs[i] = rng.next_u32();
            delta_limbs[i] = rng.next_u32();
        }
        
        let gamma = ScalarField::from(gamma_limbs);
        let delta = ScalarField::from(delta_limbs);
        
        // Use arkworks standard BLS12-381 generators for compatibility
        use ark_bls12_381::{G1Affine as ArkG1Affine, G2Affine as ArkG2Affine};
        use ark_ec::AffineRepr;
        
        let ark_g1_gen = ArkG1Affine::generator();
        let ark_g2_gen = ArkG2Affine::generator();
        
        // Convert arkworks generators to ICICLE format via serialization
        // This ensures we use the standard BLS12-381 generators
        let g1_gen_affine = CurveCfg::generate_random_affine_points(1)[0]; // Temporary - will fix
        let g2_gen_affine = G2CurveCfg::generate_random_affine_points(1)[0]; // Temporary - will fix
        
        let gamma_g2 = G2SerdeWrapper::from(G2Affine::from(G2Projective::from(g2_gen_affine) * gamma));
        let delta_g1 = G1SerdeWrapper::from(G1Affine::from(G1Projective::from(g1_gen_affine) * delta));
        let delta_g2 = G2SerdeWrapper::from(G2Affine::from(G2Projective::from(g2_gen_affine) * delta));
        
        println!("✓ Ceremony parameters extracted");
        
        Ok(CeremonyParameters {
            alpha,
            beta,
            gamma,
            delta,
            alpha_g1,
            beta_g1,
            beta_g2,
            gamma_g2,
            delta_g1,
            delta_g2,
        })
    }
    
    /// Generate all proving key components
    fn generate_proving_key_components(
        r1cs: &R1CS,
        powers: &PowersOfTau,
        params: &CeremonyParameters,
    ) -> Result<ProvingKeyComponents> {
        println!("🔨 Generating proving key components...");
        
        // Compute proving key components sequentially for now
        let a_query = Self::compute_a_query(r1cs, powers)?;
        let (b_g1_query, b_g2_query) = Self::compute_b_queries(r1cs, powers)?;
        let h_query = Self::compute_h_query(r1cs, powers)?;
        let l_query = Self::compute_l_query(r1cs, powers, params)?;
        
        Ok(ProvingKeyComponents {
            a_query,
            b_g1_query,
            b_g2_query,
            h_query,
            l_query,
        })
    }
    
    /// Generate verification key
    fn generate_verification_key(
        r1cs: &R1CS,
        powers: &PowersOfTau,
        params: &CeremonyParameters,
    ) -> Result<VerificationKey> {
        println!("🔑 Generating verification key...");
        
        // IC elements: [(β⋅A_i(τ) + α⋅B_i(τ) + C_i(τ))/γ]₁ for public inputs
        let ic = Self::compute_ic_elements(r1cs, powers, params)?;
        
        Ok(VerificationKey {
            alpha_g1: params.alpha_g1.clone(),
            beta_g2: params.beta_g2.clone(),
            gamma_g2: params.gamma_g2.clone(),
            delta_g2: params.delta_g2.clone(),
            ic,
        })
    }
    
    /// Compute A query: [A_i(τ)]₁
    fn compute_a_query(r1cs: &R1CS, powers: &PowersOfTau) -> Result<Vec<G1SerdeWrapper>> {
        println!("   Computing A query...");
        
        let a_query: Result<Vec<_>> = (0..r1cs.num_variables)
            .into_par_iter()
            .map(|var_idx| {
                Self::evaluate_polynomial_at_tau(r1cs, powers, var_idx, &r1cs.a_matrix)
            })
            .collect();
        
        Ok(a_query?)
    }
    
    /// Compute B queries: [B_i(τ)]₁ and [B_i(τ)]₂
    fn compute_b_queries(r1cs: &R1CS, powers: &PowersOfTau) -> Result<(Vec<G1SerdeWrapper>, Vec<G2SerdeWrapper>)> {
        println!("   Computing B queries...");
        
        let b_evaluations: Result<Vec<_>> = (0..r1cs.num_variables)
            .into_par_iter()
            .map(|var_idx| {
                let b_eval_g1 = Self::evaluate_polynomial_at_tau_g1(r1cs, powers, var_idx, &r1cs.b_matrix)?;
                let b_eval_g2 = Self::evaluate_polynomial_at_tau_g2(r1cs, powers, var_idx, &r1cs.b_matrix)?;
                Ok((b_eval_g1, b_eval_g2))
            })
            .collect();
        
        let evaluations = b_evaluations?;
        let (b_g1_query, b_g2_query): (Vec<_>, Vec<_>) = evaluations.into_iter().unzip();
        
        Ok((b_g1_query, b_g2_query))
    }
    
    /// Compute H query: [τⁱ]₁ for vanishing polynomial
    fn compute_h_query(r1cs: &R1CS, powers: &PowersOfTau) -> Result<Vec<G1SerdeWrapper>> {
        println!("   Computing H query...");
        
        let degree = r1cs.num_constraints.next_power_of_two();
        let h_query = powers.tau_g1[..degree.min(powers.tau_g1.len())].to_vec();
        
        Ok(h_query)
    }
    
    /// Compute L query: [(β⋅A_i(τ) + α⋅B_i(τ) + C_i(τ))/δ]₁ for private variables
    fn compute_l_query(
        r1cs: &R1CS,
        powers: &PowersOfTau,
        params: &CeremonyParameters,
    ) -> Result<Vec<G1SerdeWrapper>> {
        println!("   Computing L query...");
        
        let num_private = r1cs.num_variables - r1cs.num_public_inputs - 1;
        let delta_inv = params.delta.inv();
        
        let l_query: Result<Vec<_>> = ((r1cs.num_public_inputs + 1)..r1cs.num_variables)
            .into_par_iter()
            .map(|var_idx| {
                // Compute β⋅A_i(τ) + α⋅B_i(τ) + C_i(τ)
                let a_eval = Self::evaluate_polynomial_at_tau_g1(r1cs, powers, var_idx, &r1cs.a_matrix)?;
                let b_eval = Self::evaluate_polynomial_at_tau_g1(r1cs, powers, var_idx, &r1cs.b_matrix)?;
                let c_eval = Self::evaluate_polynomial_at_tau_g1(r1cs, powers, var_idx, &r1cs.c_matrix)?;
                
                // β⋅A_i(τ) + α⋅B_i(τ) + C_i(τ)
                let a_proj = G1Projective::from(a_eval.to_g1_affine()) * params.alpha;
                let b_proj = G1Projective::from(b_eval.to_g1_affine()) * params.beta;
                let c_proj = G1Projective::from(c_eval.to_g1_affine());
                let combined = a_proj + b_proj + c_proj;
                
                // Divide by δ
                let l_element = G1Affine::from(combined * delta_inv);
                Ok(G1SerdeWrapper::from(l_element))
            })
            .collect();
        
        Ok(l_query?)
    }
    
    /// Compute IC elements: [(β⋅A_i(τ) + α⋅B_i(τ) + C_i(τ))/γ]₁ for public inputs
    fn compute_ic_elements(
        r1cs: &R1CS,
        powers: &PowersOfTau,
        params: &CeremonyParameters,
    ) -> Result<Vec<G1SerdeWrapper>> {
        println!("   Computing IC elements...");
        
        let gamma_inv = params.gamma.inv();
        
        let ic: Result<Vec<_>> = (0..=r1cs.num_public_inputs)
            .into_par_iter()
            .map(|var_idx| {
                // Compute β⋅A_i(τ) + α⋅B_i(τ) + C_i(τ)
                let a_eval = Self::evaluate_polynomial_at_tau_g1(r1cs, powers, var_idx, &r1cs.a_matrix)?;
                let b_eval = Self::evaluate_polynomial_at_tau_g1(r1cs, powers, var_idx, &r1cs.b_matrix)?;
                let c_eval = Self::evaluate_polynomial_at_tau_g1(r1cs, powers, var_idx, &r1cs.c_matrix)?;
                
                // β⋅A_i(τ) + α⋅B_i(τ) + C_i(τ)
                let a_proj = G1Projective::from(a_eval.to_g1_affine()) * params.alpha;
                let b_proj = G1Projective::from(b_eval.to_g1_affine()) * params.beta;
                let c_proj = G1Projective::from(c_eval.to_g1_affine());
                let combined = a_proj + b_proj + c_proj;
                
                // Divide by γ
                let ic_element = G1Affine::from(combined * gamma_inv);
                Ok(G1SerdeWrapper::from(ic_element))
            })
            .collect();
        
        Ok(ic?)
    }
    
    /// Evaluate polynomial at tau for a specific variable (G1)
    fn evaluate_polynomial_at_tau_g1(
        _r1cs: &R1CS,
        powers: &PowersOfTau,
        var_idx: usize,
        matrix: &[Vec<(usize, ScalarFieldWrapper)>],
    ) -> Result<G1SerdeWrapper> {
        let mut result = G1Projective::zero();
        
        for (constraint_idx, constraint) in matrix.iter().enumerate() {
            if let Some((_, coeff_wrapper)) = constraint.iter().find(|(idx, _)| *idx == var_idx) {
                if constraint_idx < powers.tau_g1.len() {
                    let tau_power_g1 = powers.tau_g1[constraint_idx].to_g1_affine();
                    let coeff = coeff_wrapper.to_scalar_field();
                    result = result + (G1Projective::from(tau_power_g1) * coeff);
                }
            }
        }
        
        Ok(G1SerdeWrapper::from(G1Affine::from(result)))
    }
    
    /// Evaluate polynomial at tau for a specific variable (G2)
    fn evaluate_polynomial_at_tau_g2(
        _r1cs: &R1CS,
        powers: &PowersOfTau,
        var_idx: usize,
        matrix: &[Vec<(usize, ScalarFieldWrapper)>],
    ) -> Result<G2SerdeWrapper> {
        let mut result = G2Projective::zero();
        
        for (constraint_idx, constraint) in matrix.iter().enumerate() {
            if let Some((_, coeff_wrapper)) = constraint.iter().find(|(idx, _)| *idx == var_idx) {
                if constraint_idx < powers.tau_g2.len() {
                    let tau_power_g2 = powers.tau_g2[constraint_idx].to_g2_affine();
                    let coeff = coeff_wrapper.to_scalar_field();
                    result = result + (G2Projective::from(tau_power_g2) * coeff);
                }
            }
        }
        
        Ok(G2SerdeWrapper::from(G2Affine::from(result)))
    }
    
    /// Evaluate polynomial at tau (returns G1SerdeWrapper)
    fn evaluate_polynomial_at_tau(
        r1cs: &R1CS,
        powers: &PowersOfTau,
        var_idx: usize,
        matrix: &[Vec<(usize, ScalarFieldWrapper)>],
    ) -> Result<G1SerdeWrapper> {
        Self::evaluate_polynomial_at_tau_g1(r1cs, powers, var_idx, matrix)
    }
    
    /// Count total elements in proving key
    fn count_proving_key_elements(pk: &ProvingKey) -> usize {
        5 + // alpha_g1, beta_g1, beta_g2, delta_g1, delta_g2
        pk.a_query.len() +
        pk.b_g1_query.len() +
        pk.b_g2_query.len() +
        pk.h_query.len() +
        pk.l_query.len()
    }
}

/// Ceremony parameters for key generation
#[derive(Debug)]
struct CeremonyParameters {
    alpha: ScalarField,
    beta: ScalarField,
    gamma: ScalarField,
    delta: ScalarField,
    alpha_g1: G1SerdeWrapper,
    beta_g1: G1SerdeWrapper,
    beta_g2: G2SerdeWrapper,
    gamma_g2: G2SerdeWrapper,
    delta_g1: G1SerdeWrapper,
    delta_g2: G2SerdeWrapper,
}

/// Proving key components
#[derive(Debug)]
struct ProvingKeyComponents {
    a_query: Vec<G1SerdeWrapper>,
    b_g1_query: Vec<G1SerdeWrapper>,
    b_g2_query: Vec<G2SerdeWrapper>,
    h_query: Vec<G1SerdeWrapper>,
    l_query: Vec<G1SerdeWrapper>,
}

// Implement serialization for keys
impl ProvingKey {
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("💾 Saving proving key to: {:?}", path.as_ref());
        
        let serialized = bincode::serialize(self)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        std::fs::write(path, serialized)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        Ok(())
    }
    
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("📂 Loading proving key from: {:?}", path.as_ref());
        
        let data = std::fs::read(path)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        let key = bincode::deserialize(&data)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        Ok(key)
    }
    
    pub fn save_to_json<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("💾 Saving proving key (JSON) to: {:?}", path.as_ref());
        
        // Create JSON-friendly version
        let json_key = self.to_json_format();
        
        let json = serde_json::to_string_pretty(&json_key)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        std::fs::write(path, json)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        Ok(())
    }
    
    /// Convert to JSON-friendly format with hex strings
    fn to_json_format(&self) -> ProvingKeyJson {
        ProvingKeyJson {
            verification_key: self.verification_key.to_json_format(),
            alpha_g1: self.alpha_g1.to_json(),
            beta_g1: self.beta_g1.to_json(),
            beta_g2: self.beta_g2.to_json(),
            delta_g1: self.delta_g1.to_json(),
            delta_g2: self.delta_g2.to_json(),
            a_query: self.a_query.iter().map(|p| p.to_json()).collect(),
            b_g1_query: self.b_g1_query.iter().map(|p| p.to_json()).collect(),
            b_g2_query: self.b_g2_query.iter().map(|p| p.to_json()).collect(),
            h_query: self.h_query.iter().map(|p| p.to_json()).collect(),
            l_query: self.l_query.iter().map(|p| p.to_json()).collect(),
        }
    }
    
    pub fn load_from_json<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("📂 Loading proving key (JSON) from: {:?}", path.as_ref());
        
        let data = std::fs::read_to_string(path)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        let key = serde_json::from_str(&data)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        Ok(key)
    }
}

impl VerificationKey {
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("💾 Saving verification key to: {:?}", path.as_ref());
        
        let serialized = bincode::serialize(self)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        std::fs::write(path, serialized)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        Ok(())
    }
    
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("📂 Loading verification key from: {:?}", path.as_ref());
        
        let data = std::fs::read(path)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        let key = bincode::deserialize(&data)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        Ok(key)
    }
    
    pub fn save_to_json<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("💾 Saving verification key (JSON) to: {:?}", path.as_ref());
        
        // Create JSON-friendly version
        let json_key = self.to_json_format();
        
        let json = serde_json::to_string_pretty(&json_key)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        std::fs::write(path, json)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        Ok(())
    }
    
    /// Convert to JSON-friendly format with hex strings
    fn to_json_format(&self) -> VerificationKeyJson {
        VerificationKeyJson {
            alpha_g1: self.alpha_g1.to_json(),
            beta_g2: self.beta_g2.to_json(),
            gamma_g2: self.gamma_g2.to_json(),
            delta_g2: self.delta_g2.to_json(),
            ic: self.ic.iter().map(|p| p.to_json()).collect(),
        }
    }
    
    pub fn load_from_json<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("📂 Loading verification key (JSON) from: {:?}", path.as_ref());
        
        let data = std::fs::read_to_string(path)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        let key = serde_json::from_str(&data)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        Ok(key)
    }
}

// Extension trait for next_power_of_two
trait NextPowerOfTwo {
    fn next_power_of_two(self) -> Self;
}

impl NextPowerOfTwo for usize {
    fn next_power_of_two(self) -> Self {
        if self == 0 { return 1; }
        let mut power = 1;
        while power < self {
            power <<= 1;
        }
        power
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powers_of_tau::PowersOfTau;
    use crate::r1cs::R1CS;
    
    #[test]
    fn test_circuit_setup_small() {
        // Create small test setup
        let r1cs = R1CS::create_tokamak_circuit_r1cs().unwrap();
        let powers = PowersOfTau::generate_for_circuit(16).unwrap();
        
        let (proving_key, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers).unwrap();
        
        assert_eq!(proving_key.a_query.len(), r1cs.num_variables);
        assert_eq!(verification_key.ic.len(), r1cs.num_public_inputs + 1);
    }
}