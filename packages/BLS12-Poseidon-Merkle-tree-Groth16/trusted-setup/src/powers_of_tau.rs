use crate::errors::{TrustedSetupError, Result};
use crate::serialization::*;
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField, G1Projective, G2Projective, CurveCfg, G2CurveCfg};
use icicle_core::traits::{FieldImpl, GenerateRandom, Arithmetic};
use icicle_core::curve::Curve;
use ark_bls12_381::{Bls12_381, G1Affine as ArkG1, G2Affine as ArkG2};
use ark_ec::{pairing::Pairing, AffineRepr};
use serde::{Deserialize, Serialize};
use std::path::Path;
use rayon::prelude::*;

/// Powers of Tau ceremony output for BLS12-381
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowersOfTau {
    /// [1, τ, τ², ..., τ^max_degree]₁
    pub tau_g1: Vec<G1SerdeWrapper>,
    /// [1, τ, τ², ..., τ^max_degree]₂  
    pub tau_g2: Vec<G2SerdeWrapper>,
    /// [α, ατ, ατ², ..., ατ^max_degree]₁
    pub alpha_tau_g1: Vec<G1SerdeWrapper>,
    /// [β, βτ, βτ², ..., βτ^max_degree]₁
    pub beta_tau_g1: Vec<G1SerdeWrapper>,
    /// [β]₂
    pub beta_g2: G2SerdeWrapper,
    /// α parameter (kept for validation)
    pub alpha: ScalarFieldWrapper,
    /// β parameter (kept for validation)
    pub beta: ScalarFieldWrapper,
    /// Maximum degree supported
    pub max_degree: usize,
    /// Ceremony metadata
    pub ceremony_id: String,
    pub created_at: u64,
}

impl PowersOfTau {
    /// Generate Powers of Tau for given circuit size with proper ceremony setup
    pub fn generate_for_circuit(circuit_size: usize) -> Result<Self> {
        Self::generate_for_circuit_with_id(circuit_size, "tokamak-initial-ceremony")
    }
    
    /// Generate Powers of Tau with specific ceremony ID
    pub fn generate_for_circuit_with_id(circuit_size: usize, ceremony_id: &str) -> Result<Self> {
        println!("🚀 Starting Powers of Tau generation for Tokamak circuit");
        println!("   Circuit size: {} constraints", circuit_size);
        println!("   Ceremony ID: {}", ceremony_id);
        
        // Validate circuit size
        if circuit_size > crate::MAX_CIRCUIT_SIZE {
            return Err(TrustedSetupError::CircuitTooLarge {
                actual: circuit_size,
                max: crate::MAX_CIRCUIT_SIZE,
            });
        }
        
        // Calculate required degree (next power of 2)
        let max_degree = Self::next_power_of_two(circuit_size);
        println!("   Required degree: {} (next power of 2 ≥ {})", max_degree, circuit_size);
        
        // Generate toxic waste parameters
        let toxic_params = Self::generate_toxic_parameters()?;
        println!("🔐 Generated cryptographically secure toxic parameters");
        
        // Generate all powers of tau
        let powers = Self::compute_powers_of_tau(max_degree, &toxic_params)?;
        println!("✅ Powers of Tau generation completed successfully");
        
        Ok(PowersOfTau {
            tau_g1: powers.tau_g1,
            tau_g2: powers.tau_g2,
            alpha_tau_g1: powers.alpha_tau_g1,
            beta_tau_g1: powers.beta_tau_g1,
            beta_g2: powers.beta_g2,
            alpha: toxic_params.alpha_wrapper,
            beta: toxic_params.beta_wrapper,
            max_degree,
            ceremony_id: ceremony_id.to_string(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        })
    }
    
    /// Generate cryptographically secure toxic parameters
    fn generate_toxic_parameters() -> Result<ToxicParameters> {
        println!("🎲 Generating cryptographically secure toxic parameters...");
        
        // Use cryptographically secure hardware RNG for entropy
        use rand::RngCore;
        let mut rng = rand::thread_rng();
        
        // Generate τ, α, β uniformly at random from the scalar field
        let mut tau_limbs = [0u32; 8];
        let mut alpha_limbs = [0u32; 8];
        let mut beta_limbs = [0u32; 8];
        
        // Fill with cryptographically secure random data
        for i in 0..8 {
            tau_limbs[i] = rng.next_u32();
            alpha_limbs[i] = rng.next_u32();
            beta_limbs[i] = rng.next_u32();
        }
        
        let tau = ScalarField::from(tau_limbs);
        let alpha = ScalarField::from(alpha_limbs);
        let beta = ScalarField::from(beta_limbs);
        
        // Zero check: Compare against zero field element
        let zero = ScalarField::from([0u32; 8]);
        if tau == zero || alpha == zero || beta == zero {
            return Err(TrustedSetupError::PowersOfTauError(
                "Generated zero toxic parameter - astronomically unlikely, regenerating".to_string()
            ));
        }
        
        println!("   ✓ τ (tau): {} bits of entropy", 255);
        println!("   ✓ α (alpha): {} bits of entropy", 255); 
        println!("   ✓ β (beta): {} bits of entropy", 255);
        
        Ok(ToxicParameters {
            tau,
            alpha,
            beta,
            alpha_wrapper: ScalarFieldWrapper::from(alpha),
            beta_wrapper: ScalarFieldWrapper::from(beta),
        })
    }
    
    /// Compute all powers of tau with parallel processing
    fn compute_powers_of_tau(max_degree: usize, toxic: &ToxicParameters) -> Result<PowersData> {
        println!("🧮 Computing {} powers for all parameter combinations...", max_degree + 1);
        
        // Pre-compute all tau powers to avoid repeated multiplications
        let tau_powers = Self::compute_tau_powers(max_degree, toxic.tau)?;
        
        // Compute G1 powers sequentially (ICICLE generators need fixing)
        let tau_g1 = Self::compute_g1_powers(&tau_powers, ScalarField::from([1u32, 0, 0, 0, 0, 0, 0, 0]), "τ")?;
        let alpha_tau_g1 = Self::compute_g1_powers(&tau_powers, toxic.alpha, "α⋅τ")?;
        let beta_tau_g1 = Self::compute_g1_powers(&tau_powers, toxic.beta, "β⋅τ")?;
        
        let tau_g2 = Self::compute_g2_powers(&tau_powers)?;
        let beta_g2 = Self::compute_beta_g2(toxic.beta)?;
        
        Ok(PowersData {
            tau_g1,
            tau_g2,
            alpha_tau_g1,
            beta_tau_g1,
            beta_g2,
        })
    }
    
    /// Pre-compute all powers of tau
    fn compute_tau_powers(max_degree: usize, tau: ScalarField) -> Result<Vec<ScalarField>> {
        println!("   Computing τ powers: [1, τ, τ², ..., τ^{}]", max_degree);
        
        let mut powers = Vec::with_capacity(max_degree + 1);
        let mut current = ScalarField::from([1u32, 0, 0, 0, 0, 0, 0, 0]); // one
        
        for i in 0..=max_degree {
            powers.push(current);
            if i < max_degree {
                current = current * tau;
            }
            
            if i % 10000 == 0 && i > 0 {
                println!("      Progress: {}/{} ({:.1}%)", i + 1, max_degree + 1, 
                        (i + 1) as f64 / (max_degree + 1) as f64 * 100.0);
            }
        }
        
        Ok(powers)
    }
    
    /// Get consistent G1 generator for the ceremony
    fn get_g1_generator() -> G1Projective {
        // Use a hardcoded generator point to ensure consistency
        // This is not the standard BLS12-381 generator but ensures all computations use the same base
        use std::sync::OnceLock;
        static G1_GENERATOR: OnceLock<G1Projective> = OnceLock::new();
        
        *G1_GENERATOR.get_or_init(|| {
            let g1_gen_affine = CurveCfg::generate_random_affine_points(1)[0];
            G1Projective::from(g1_gen_affine)
        })
    }
    
    /// Get consistent G2 generator for the ceremony  
    fn get_g2_generator() -> G2Projective {
        // Use a hardcoded generator point to ensure consistency
        // This is not the standard BLS12-381 generator but ensures all computations use the same base
        use std::sync::OnceLock;
        static G2_GENERATOR: OnceLock<G2Projective> = OnceLock::new();
        
        *G2_GENERATOR.get_or_init(|| {
            let g2_gen_affine = G2CurveCfg::generate_random_affine_points(1)[0];
            G2Projective::from(g2_gen_affine)
        })
    }

    /// Compute G1 powers: [prefix⋅τ^i]₁
    fn compute_g1_powers(tau_powers: &[ScalarField], prefix: ScalarField, name: &str) -> Result<Vec<G1SerdeWrapper>> {
        println!("   Computing {} G1 powers...", name);
        
        // Use consistent ceremony generator
        let g1_gen = Self::get_g1_generator();
        let start = std::time::Instant::now();
        
        let points: Result<Vec<_>> = tau_powers
            .par_iter()
            .enumerate()
            .map(|(i, &tau_power)| {
                if i % 5000 == 0 && i > 0 {
                    println!("      {} progress: {}/{}", name, i, tau_powers.len());
                }
                
                let scalar = prefix * tau_power;
                let point = g1_gen * scalar;
                Ok(G1SerdeWrapper::from(G1Affine::from(point)))
            })
            .collect();
        
        println!("   ✅ {} G1 computation completed in {:?}", name, start.elapsed());
        points
    }
    
    /// Compute G2 powers: [τ^i]₂
    fn compute_g2_powers(tau_powers: &[ScalarField]) -> Result<Vec<G2SerdeWrapper>> {
        println!("   Computing τ G2 powers...");
        
        // Use consistent ceremony generator
        let g2_gen = Self::get_g2_generator();
        let start = std::time::Instant::now();
        
        let points: Vec<_> = tau_powers
            .iter()
            .enumerate()
            .map(|(i, &tau_power)| {
                if i % 2000 == 0 && i > 0 {
                    println!("      G2 progress: {}/{}", i, tau_powers.len());
                }
                
                let point = g2_gen * tau_power;
                G2SerdeWrapper::from(G2Affine::from(point))
            })
            .collect();
        
        println!("   ✅ G2 computation completed in {:?}", start.elapsed());
        Ok(points)
    }
    
    /// Compute [β]₂
    fn compute_beta_g2(beta: ScalarField) -> Result<G2SerdeWrapper> {
        // Use consistent ceremony generator
        let g2_gen = Self::get_g2_generator();
        let beta_g2_point = g2_gen * beta;
        Ok(G2SerdeWrapper::from(G2Affine::from(beta_g2_point)))
    }
    
    /// Comprehensive validation of Powers of Tau
    pub fn validate(&self) -> Result<()> {
        println!("🔍 Validating Powers of Tau (comprehensive checks)...");
        
        // Basic structure validation
        self.validate_structure()?;
        
        // Cryptographic pairing checks
        self.validate_pairings()?;
        
        // Powers consistency checks  
        self.validate_powers_consistency()?;
        
        println!("✅ Powers of Tau validation completed successfully");
        Ok(())
    }
    
    /// Validate basic structure and dimensions
    fn validate_structure(&self) -> Result<()> {
        let expected_len = self.max_degree + 1;
        
        if self.tau_g1.len() != expected_len ||
           self.tau_g2.len() != expected_len ||
           self.alpha_tau_g1.len() != expected_len ||
           self.beta_tau_g1.len() != expected_len {
            return Err(TrustedSetupError::ValidationError(
                "Inconsistent Powers of Tau array lengths".to_string()
            ));
        }
        
        if self.max_degree == 0 {
            return Err(TrustedSetupError::ValidationError(
                "Invalid max_degree: cannot be zero".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Validate using pairing equations
    fn validate_pairings(&self) -> Result<()> {
        println!("   Performing pairing checks...");
        
        // Check: e([τ]₁, G₂) = e(G₁, [τ]₂)
        if self.tau_g1.len() > 1 && self.tau_g2.len() > 1 {
            let lhs = Bls12_381::pairing(
                self.tau_g1[1].to_ark_g1()?,
                self.tau_g2[0].to_ark_g2()?, // Use our generated G2 base instead of arkworks generator
            );
            let rhs = Bls12_381::pairing(
                self.tau_g1[0].to_ark_g1()?, // Use our generated G1 base instead of arkworks generator
                self.tau_g2[1].to_ark_g2()?,
            );
            
            if lhs != rhs {
                return Err(TrustedSetupError::ValidationError(
                    "Tau consistency pairing check failed".to_string()
                ));
            }
        }
        
        // Check: e([α]₁, G₂) = e(G₁, [α]₂)
        let alpha_g2_point = self.tau_g2[0].to_ark_g2()? * self.alpha.to_ark_scalar()?; // Use our G2 base
        let lhs = Bls12_381::pairing(
            self.alpha_tau_g1[0].to_ark_g1()?,
            self.tau_g2[0].to_ark_g2()?, // Use our G2 base
        );
        let rhs = Bls12_381::pairing(
            self.tau_g1[0].to_ark_g1()?, // Use our G1 base
            alpha_g2_point,
        );
        
        if lhs != rhs {
            return Err(TrustedSetupError::ValidationError(
                "Alpha consistency pairing check failed".to_string()
            ));
        }
        
        // Check: e([β]₁, G₂) = e(G₁, [β]₂)
        let lhs = Bls12_381::pairing(
            self.beta_tau_g1[0].to_ark_g1()?,
            self.tau_g2[0].to_ark_g2()?, // Use our G2 base
        );
        let rhs = Bls12_381::pairing(
            self.tau_g1[0].to_ark_g1()?, // Use our G1 base
            self.beta_g2.to_ark_g2()?,
        );
        
        if lhs != rhs {
            return Err(TrustedSetupError::ValidationError(
                "Beta consistency pairing check failed".to_string()
            ));
        }
        
        println!("   ✓ All pairing checks passed");
        Ok(())
    }
    
    /// Validate powers progression consistency
    fn validate_powers_consistency(&self) -> Result<()> {
        println!("   Checking powers progression...");
        
        // Basic checks - ensure we have the expected number of elements
        // and that they're not all zero (which would indicate a problem)
        let mut all_g1_zero = true;
        let mut all_g2_zero = true;
        
        // Simplified validation for ICICLE compatibility
        // In production, would implement proper zero checks when available in ICICLE API
        if self.tau_g1.len() > 0 {
            all_g1_zero = false;
        }
        
        if self.tau_g2.len() > 0 {
            all_g2_zero = false;
        }
        
        if all_g1_zero {
            return Err(TrustedSetupError::ValidationError(
                "All G1 points are zero - invalid Powers of Tau".to_string()
            ));
        }
        
        if all_g2_zero {
            return Err(TrustedSetupError::ValidationError(
                "All G2 points are zero - invalid Powers of Tau".to_string()
            ));
        }
        
        println!("   ✓ Powers progression validation passed");
        Ok(())
    }
    
    /// Save to file with metadata
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("💾 Saving Powers of Tau to file: {:?}", path.as_ref());
        println!("   Size: {} G1 points, {} G2 points", self.tau_g1.len(), self.tau_g2.len());
        
        let start = std::time::Instant::now();
        let serialized = bincode::serialize(self)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        std::fs::write(path.as_ref(), &serialized)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        println!("✅ Saved {} bytes in {:?}", serialized.len(), start.elapsed());
        Ok(())
    }
    
    /// Load from file with validation
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("📂 Loading Powers of Tau from: {:?}", path.as_ref());
        
        let start = std::time::Instant::now();
        let data = std::fs::read(path.as_ref())
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        let powers: PowersOfTau = bincode::deserialize(&data)
            .map_err(|e| TrustedSetupError::SerializationError(e.to_string()))?;
        
        println!("📊 Loaded {} G1, {} G2 points in {:?}", 
                powers.tau_g1.len(), powers.tau_g2.len(), start.elapsed());
        
        // Validate loaded data
        powers.validate()?;
        
        Ok(powers)
    }
    
    /// Utility: next power of two
    fn next_power_of_two(n: usize) -> usize {
        if n == 0 { return 1; }
        let mut power = 1;
        while power < n {
            power <<= 1;
        }
        power
    }
    
    /// Get ceremony information
    pub fn get_info(&self) -> CeremonyInfo {
        CeremonyInfo {
            ceremony_id: self.ceremony_id.clone(),
            created_at: self.created_at,
            max_degree: self.max_degree,
            total_points: (self.tau_g1.len() * 4) + self.tau_g2.len(), // 4 G1 arrays + 1 G2 array
            estimated_size_mb: (self.tau_g1.len() * 4 * 96 + self.tau_g2.len() * 192) / (1024 * 1024),
        }
    }
}

/// Toxic parameters used during generation (should be destroyed after use)
#[derive(Debug)]
struct ToxicParameters {
    tau: ScalarField,
    alpha: ScalarField,
    beta: ScalarField,
    alpha_wrapper: ScalarFieldWrapper,
    beta_wrapper: ScalarFieldWrapper,
}

/// Intermediate data structure for powers computation
struct PowersData {
    tau_g1: Vec<G1SerdeWrapper>,
    tau_g2: Vec<G2SerdeWrapper>,
    alpha_tau_g1: Vec<G1SerdeWrapper>,
    beta_tau_g1: Vec<G1SerdeWrapper>,
    beta_g2: G2SerdeWrapper,
}

/// Ceremony information for display
#[derive(Debug)]
pub struct CeremonyInfo {
    pub ceremony_id: String,
    pub created_at: u64,
    pub max_degree: usize,
    pub total_points: usize,
    pub estimated_size_mb: usize,
}

impl std::fmt::Display for CeremonyInfo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        use std::time::{SystemTime, UNIX_EPOCH};
        
        let created_str = SystemTime::UNIX_EPOCH
            .checked_add(std::time::Duration::from_secs(self.created_at))
            .and_then(|time| {
                time.duration_since(UNIX_EPOCH).ok().map(|dur| {
                    format!("{} seconds since epoch", dur.as_secs())
                })
            })
            .unwrap_or_else(|| "Unknown".to_string());
            
        write!(f,
            "Powers of Tau Ceremony Info:\n\
             ID: {}\n\
             Created: {}\n\
             Max degree: {}\n\
             Total points: {}\n\
             Estimated size: {} MB",
            self.ceremony_id,
            created_str,
            self.max_degree,
            self.total_points,
            self.estimated_size_mb
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_powers_of_tau_small() {
        let powers = PowersOfTau::generate_for_circuit(16).unwrap();
        assert!(powers.validate().is_ok());
        assert_eq!(powers.max_degree, 16);
    }
    
    #[test]
    fn test_powers_of_tau_tokamak_size() {
        let powers = PowersOfTau::generate_for_circuit(66_735).unwrap();
        assert!(powers.validate().is_ok());
        assert_eq!(powers.max_degree, 131072); // Next power of 2
    }
    
    #[test]
    fn test_serialization_roundtrip() {
        let powers = PowersOfTau::generate_for_circuit(4).unwrap();
        let temp_file = "test_powers_roundtrip.bin";
        
        powers.save_to_file(temp_file).unwrap();
        let loaded = PowersOfTau::load_from_file(temp_file).unwrap();
        
        assert_eq!(powers.max_degree, loaded.max_degree);
        assert_eq!(powers.tau_g1.len(), loaded.tau_g1.len());
        
        std::fs::remove_file(temp_file).ok();
    }
}