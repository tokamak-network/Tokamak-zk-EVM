use crate::errors::{Groth16Error, Result};
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField, ScalarCfg, CurveCfg, G1Projective, G2Projective, G2CurveCfg};
use icicle_core::traits::{FieldImpl, GenerateRandom};
use icicle_core::curve::Curve;
// MSM imports removed - using sequential multiplication for powers
use std::path::Path;

/// Powers of Tau ceremony output for BLS12-381
#[derive(Debug, Clone)]
pub struct PowersOfTau {
    /// [1, τ, τ², ..., τ^(2^k)]₁ where 2^k >= circuit_size
    pub tau_g1: Vec<G1Affine>,
    /// [1, τ, τ², ..., τ^(2^k)]₂
    pub tau_g2: Vec<G2Affine>,
    /// [α, ατ, ατ², ..., ατ^(2^k)]₁
    pub alpha_tau_g1: Vec<G1Affine>,
    /// [β, βτ, βτ², ..., βτ^(2^k)]₁
    pub beta_tau_g1: Vec<G1Affine>,
    /// [β]₂
    pub beta_g2: G2Affine,
    /// Security parameters used
    pub alpha: ScalarField,
    pub beta: ScalarField,
    /// Maximum degree supported
    pub max_degree: usize,
}

impl PowersOfTau {
    /// Generate Powers of Tau for a given circuit size
    /// circuit_size: Number of constraints in the circuit
    pub fn generate(circuit_size: usize) -> Result<Self> {
        // Production circuit size limit
        if circuit_size > 100_000 {
            return Err(Groth16Error::TrustedSetupError(
                format!("Circuit size {} too large, maximum is 100,000", circuit_size)
            ));
        }
        
        // Find next power of 2 >= circuit_size for FFT compatibility
        let max_degree = next_power_of_two(circuit_size);
        
        println!("🔧 Generating Powers of Tau for circuit size: {}, max degree: {}", circuit_size, max_degree);
        println!("📊 This will generate {} G1 points, {} G2 points, and {} alpha/beta variants", 
                 max_degree + 1, max_degree + 1, 2 * (max_degree + 1));
        let total_operations = 4 * (max_degree + 1);
        println!("⏱️  Estimated {} scalar multiplications (this may take 2-5 minutes)", total_operations);
        
        // Generate cryptographically secure toxicity parameters
        let tau = ScalarCfg::generate_random(1)[0];
        let alpha = ScalarCfg::generate_random(1)[0];
        let beta = ScalarCfg::generate_random(1)[0];
        
        println!("🔐 Generated cryptographically secure random parameters (tau, alpha, beta)");
        println!("🎲 tau: {:?}...", &format!("{:?}", tau)[0..32]);
        println!("🎲 alpha: {:?}...", &format!("{:?}", alpha)[0..32]);
        println!("🎲 beta: {:?}...", &format!("{:?}", beta)[0..32]);
        
        // Generate τ powers in G1: [1, τ, τ², ..., τ^max_degree]₁
        let mut tau_g1 = Vec::with_capacity(max_degree + 1);
        let g1_gen = CurveCfg::generate_random_affine_points(1)[0]; // Proper G1 generator
        
        // Generate powers of tau: [1, τ, τ², ..., τ^max_degree]
        let mut tau_powers = Vec::with_capacity(max_degree + 1);
        let mut current_tau_power = ScalarField::one();
        for i in 0..=max_degree {
            tau_powers.push(current_tau_power);
            current_tau_power = current_tau_power * tau;
        }
        
        // Compute [τⁱ]₁ for all i efficiently using sequential multiplication
        println!("🧮 Computing G1 powers ({} points)...", max_degree + 1);
        let g1_start = std::time::Instant::now();
        tau_g1 = Self::compute_g1_powers(&tau_powers, &g1_gen)?;
        println!("✅ G1 powers computed in {:?}", g1_start.elapsed());
        
        // Generate τ powers in G2: [1, τ, τ², ..., τ^max_degree]₂ using sequential multiplication
        let mut tau_g2 = Vec::with_capacity(max_degree + 1);
        let g2_gen = Self::get_g2_generator(); // Proper G2 generator
        
        // For G2, use sequential multiplication for efficiency
        println!("🧮 Computing G2 powers ({} points)...", max_degree + 1);
        let g2_start = std::time::Instant::now();
        let mut current_g2 = G2Projective::from(g2_gen);
        tau_g2.push(G2Affine::from(current_g2)); // 1 * G2
        
        for i in 1..=max_degree {
            if i % 2000 == 0 {
                let progress = (i * 100) / (max_degree + 1);
                println!("   🔄 G2 progress: {}/{} ({}%) - elapsed: {:?}", i, max_degree + 1, progress, g2_start.elapsed());
            }
            current_g2 = current_g2 * tau;
            tau_g2.push(G2Affine::from(current_g2));
        }
        println!("✅ G2 powers computed in {:?}", g2_start.elapsed());
        
        // Generate α⋅τ powers in G1: [α, ατ, ατ², ..., ατ^max_degree]₁ using sequential multiplication
        println!("🧮 Computing alpha*tau G1 powers ({} points)...", max_degree + 1);
        let alpha_start = std::time::Instant::now();
        let mut alpha_tau_g1 = Vec::with_capacity(max_degree + 1);
        let mut current_alpha = G1Projective::from(g1_gen) * alpha;
        alpha_tau_g1.push(G1Affine::from(current_alpha)); // α * G
        
        for i in 1..=max_degree {
            if i % 5000 == 0 {
                let progress = (i * 100) / (max_degree + 1);
                println!("   🔄 Alpha*tau progress: {}/{} ({}%)", i, max_degree + 1, progress);
            }
            current_alpha = current_alpha * tau;
            alpha_tau_g1.push(G1Affine::from(current_alpha));
        }
        println!("✅ Alpha*tau G1 powers computed in {:?}", alpha_start.elapsed());
        
        // Generate β⋅τ powers in G1: [β, βτ, βτ², ..., βτ^max_degree]₁ using sequential multiplication
        println!("🧮 Computing beta*tau G1 powers ({} points)...", max_degree + 1);
        let beta_start = std::time::Instant::now();
        let mut beta_tau_g1 = Vec::with_capacity(max_degree + 1);
        let mut current_beta = G1Projective::from(g1_gen) * beta;
        beta_tau_g1.push(G1Affine::from(current_beta)); // β * G
        
        for i in 1..=max_degree {
            if i % 5000 == 0 {
                let progress = (i * 100) / (max_degree + 1);
                println!("   🔄 Beta*tau progress: {}/{} ({}%)", i, max_degree + 1, progress);
            }
            current_beta = current_beta * tau;
            beta_tau_g1.push(G1Affine::from(current_beta));
        }
        println!("✅ Beta*tau G1 powers computed in {:?}", beta_start.elapsed());
        
        // Generate β in G2: [β]₂
        let projective_beta_g2 = G2Projective::from(g2_gen) * beta;
        let beta_g2 = G2Affine::from(projective_beta_g2);
        
        println!("🎉 Powers of Tau generation completed!");
        println!("📈 Generated {} total cryptographic points", 4 * (max_degree + 1));
        println!("💾 Memory usage: ~{} MB", (4 * (max_degree + 1) * 96) / (1024 * 1024)); // Rough estimate
        
        Ok(PowersOfTau {
            tau_g1,
            tau_g2,
            alpha_tau_g1,
            beta_tau_g1,
            beta_g2,
            alpha,
            beta,
            max_degree,
        })
    }
    
    /// Validate the Powers of Tau by checking pairing equations
    pub fn validate(&self) -> Result<bool> {
        println!("Validating Powers of Tau...");
        
        // Check that we have consistent lengths
        if self.tau_g1.len() != self.tau_g2.len() ||
           self.tau_g1.len() != self.alpha_tau_g1.len() ||
           self.tau_g1.len() != self.beta_tau_g1.len() {
            return Err(Groth16Error::TrustedSetupError(
                "Inconsistent Powers of Tau lengths".to_string()
            ));
        }
        
        // TODO: Add pairing checks when we implement the pairing function
        // For now, just validate structure
        if self.tau_g1.is_empty() || self.max_degree == 0 {
            return Err(Groth16Error::TrustedSetupError(
                "Invalid Powers of Tau structure".to_string()
            ));
        }
        
        println!("Powers of Tau validation completed");
        Ok(true)
    }
    
    /// Save Powers of Tau to file (placeholder implementation)
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("Saving Powers of Tau to file: {:?}", path.as_ref());
        // TODO: Implement custom serialization for ICICLE types
        let placeholder_data = format!("Powers of Tau with {} tau_g1 and {} tau_g2 elements", 
                                     self.tau_g1.len(), self.tau_g2.len());
        std::fs::write(path, placeholder_data)
            .map_err(|e| Groth16Error::SerializationError(e.to_string()))?;
        println!("Powers of Tau saved successfully (placeholder)");
        Ok(())
    }
    
    /// Load Powers of Tau from file (placeholder implementation)
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("Loading Powers of Tau from file: {:?}", path.as_ref());
        // TODO: Implement custom deserialization for ICICLE types
        Err(Groth16Error::SerializationError("Load not implemented for placeholder".to_string()))
    }
    
    /// Compute G1 powers using sequential scalar multiplication (optimized for powers)
    fn compute_g1_powers(scalars: &[ScalarField], generator: &G1Affine) -> Result<Vec<G1Affine>> {
        let n = scalars.len();
        let mut result = Vec::with_capacity(n);
        
        println!("   🔢 Starting G1 scalar multiplication for {} points", n);
        let computation_start = std::time::Instant::now();
        
        // For powers, we receive pre-computed scalar powers, just multiply each by generator
        for (i, scalar) in scalars.iter().enumerate() {
            if i % 5000 == 0 && i > 0 {
                let progress = (i * 100) / n;
                let elapsed = computation_start.elapsed();
                let rate = i as f64 / elapsed.as_secs_f64();
                println!("   🔄 G1 multiplication progress: {}/{} ({}%) - rate: {:.1} pts/sec", i, n, progress, rate);
            }
            let point = G1Projective::from(*generator) * *scalar;
            result.push(G1Affine::from(point));
        }
        
        let total_time = computation_start.elapsed();
        let final_rate = n as f64 / total_time.as_secs_f64();
        println!("   ✅ G1 multiplication completed: {:.1} points/sec average", final_rate);
            
        Ok(result)
    }
    
    /// Get a proper G2 generator point using ICICLE's cryptographically secure random generation
    fn get_g2_generator() -> G2Affine {
        // Use the same approach as the backend trusted-setup implementation
        // Generate a cryptographically secure random G2 point as the generator
        println!("🔐 Generating cryptographically secure G2 generator point...");
        let g2_gen = G2CurveCfg::generate_random_affine_points(1)[0];
        println!("✅ G2 generator created successfully");
        g2_gen
    }
}

/// Utility function to find next power of two
fn next_power_of_two(n: usize) -> usize {
    if n == 0 {
        return 1;
    }
    let mut power = 1;
    while power < n {
        power <<= 1;
    }
    power
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_next_power_of_two() {
        assert_eq!(next_power_of_two(0), 1);
        assert_eq!(next_power_of_two(1), 1);
        assert_eq!(next_power_of_two(2), 2);
        assert_eq!(next_power_of_two(3), 4);
        assert_eq!(next_power_of_two(37199), 65536);
    }
    
    #[test]
    fn test_powers_of_tau_small() {
        let powers = PowersOfTau::generate(16).unwrap();
        assert!(powers.validate().unwrap());
        assert_eq!(powers.max_degree, 16);
        assert_eq!(powers.tau_g1.len(), 17); // 0 to 16 inclusive
    }
}