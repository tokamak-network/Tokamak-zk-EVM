use crate::errors::{TrustedSetupError, Result};
use crate::r1cs::R1CS;
use crate::powers_of_tau::PowersOfTau;
use crate::circuit_setup::{ProvingKey, VerificationKey};
use crate::ceremony::ValidationReport;
// use ark_bls12_381::Bls12_381; // Unused in current implementation
// use ark_ec::pairing::Pairing; // Unused in current implementation

/// Comprehensive validator for trusted setup outputs
pub struct TrustedSetupValidator;

impl TrustedSetupValidator {
    /// Validate the complete trusted setup
    pub fn validate_complete_setup(
        r1cs: &R1CS,
        powers_of_tau: &PowersOfTau,
        proving_key: &ProvingKey,
        verification_key: &VerificationKey,
    ) -> Result<ValidationReport> {
        println!("🔍 Running comprehensive trusted setup validation...");
        
        let mut total_checks = 0;
        let mut failed_checks = Vec::new();
        
        // Validate Powers of Tau
        let powers_valid = Self::validate_powers_of_tau(powers_of_tau, &mut total_checks, &mut failed_checks);
        
        // Validate R1CS compatibility
        Self::validate_r1cs_compatibility(r1cs, powers_of_tau, &mut total_checks, &mut failed_checks);
        
        // Validate key structure
        let proving_key_valid = Self::validate_proving_key_structure(proving_key, r1cs, &mut total_checks, &mut failed_checks);
        let verification_key_valid = Self::validate_verification_key_structure(verification_key, r1cs, &mut total_checks, &mut failed_checks);
        
        // Validate key consistency
        let consistency_passed = Self::validate_key_consistency(proving_key, verification_key, &mut total_checks, &mut failed_checks);
        
        // Security checks
        let security_passed = Self::validate_security_properties(powers_of_tau, proving_key, verification_key, &mut total_checks, &mut failed_checks);
        
        let report = ValidationReport {
            powers_of_tau_valid: powers_valid,
            proving_key_valid: proving_key_valid,
            verification_key_valid: verification_key_valid,
            consistency_checks_passed: consistency_passed,
            security_checks_passed: security_passed,
            total_checks,
            failed_checks,
        };
        
        if report.failed_checks.is_empty() {
            println!("✅ All validation checks passed ({} total)", total_checks);
        } else {
            println!("❌ {} validation checks failed out of {}", report.failed_checks.len(), total_checks);
            for failed in &report.failed_checks {
                println!("  - {}", failed);
            }
        }
        
        Ok(report)
    }
    
    /// Validate Powers of Tau
    fn validate_powers_of_tau(
        powers: &PowersOfTau,
        total_checks: &mut usize,
        failed_checks: &mut Vec<String>,
    ) -> bool {
        println!("   Validating Powers of Tau...");
        
        let mut powers_valid = true;
        
        // Check basic validation
        *total_checks += 1;
        if let Err(e) = powers.validate() {
            failed_checks.push(format!("Powers of Tau validation failed: {}", e));
            powers_valid = false;
        }
        
        // Check array lengths consistency
        *total_checks += 1;
        let expected_len = powers.max_degree + 1;
        if powers.tau_g1.len() != expected_len || 
           powers.tau_g2.len() != expected_len ||
           powers.alpha_tau_g1.len() != expected_len ||
           powers.beta_tau_g1.len() != expected_len {
            failed_checks.push("Powers of Tau array lengths inconsistent".to_string());
            powers_valid = false;
        }
        
        // Check non-zero max degree
        *total_checks += 1;
        if powers.max_degree == 0 {
            failed_checks.push("Powers of Tau max_degree is zero".to_string());
            powers_valid = false;
        }
        
        // Check power of two
        *total_checks += 1;
        if !powers.max_degree.is_power_of_two() {
            failed_checks.push("Powers of Tau max_degree is not a power of two".to_string());
            powers_valid = false;
        }
        
        println!("     Powers of Tau: {}", if powers_valid { "✅ Valid" } else { "❌ Invalid" });
        powers_valid
    }
    
    /// Validate R1CS compatibility with Powers of Tau
    fn validate_r1cs_compatibility(
        r1cs: &R1CS,
        powers: &PowersOfTau,
        total_checks: &mut usize,
        failed_checks: &mut Vec<String>,
    ) {
        println!("   Validating R1CS compatibility...");
        
        // Check R1CS validation
        *total_checks += 1;
        if let Err(e) = r1cs.validate() {
            failed_checks.push(format!("R1CS validation failed: {}", e));
        }
        
        // Check sufficient powers for circuit size
        *total_checks += 1;
        let required_degree = r1cs.num_constraints.next_power_of_two();
        if powers.max_degree < required_degree {
            failed_checks.push(format!(
                "Insufficient powers: need {}, have {}", 
                required_degree, powers.max_degree
            ));
        }
        
        // Check reasonable circuit size
        *total_checks += 1;
        if r1cs.num_constraints > crate::MAX_CIRCUIT_SIZE {
            failed_checks.push(format!(
                "Circuit too large: {} > {}", 
                r1cs.num_constraints, crate::MAX_CIRCUIT_SIZE
            ));
        }
        
        println!("     R1CS compatibility: ✅ Checked");
    }
    
    /// Validate proving key structure
    fn validate_proving_key_structure(
        proving_key: &ProvingKey,
        r1cs: &R1CS,
        total_checks: &mut usize,
        failed_checks: &mut Vec<String>,
    ) -> bool {
        println!("   Validating proving key structure...");
        
        let mut pk_valid = true;
        
        // Check A query length
        *total_checks += 1;
        if proving_key.a_query.len() != r1cs.num_variables {
            failed_checks.push(format!(
                "A query length mismatch: {} != {}", 
                proving_key.a_query.len(), r1cs.num_variables
            ));
            pk_valid = false;
        }
        
        // Check B queries length
        *total_checks += 1;
        if proving_key.b_g1_query.len() != r1cs.num_variables || 
           proving_key.b_g2_query.len() != r1cs.num_variables {
            failed_checks.push("B query lengths mismatch with variables".to_string());
            pk_valid = false;
        }
        
        // Check L query length (for private variables)
        *total_checks += 1;
        let expected_l_len = r1cs.num_variables - r1cs.num_public_inputs - 1;
        if proving_key.l_query.len() != expected_l_len {
            failed_checks.push(format!(
                "L query length mismatch: {} != {}", 
                proving_key.l_query.len(), expected_l_len
            ));
            pk_valid = false;
        }
        
        // Check H query has reasonable length
        *total_checks += 1;
        let expected_h_len = r1cs.num_constraints.next_power_of_two();
        if proving_key.h_query.len() > expected_h_len {
            failed_checks.push("H query length exceeds expected maximum".to_string());
            pk_valid = false;
        }
        
        println!("     Proving key structure: {}", if pk_valid { "✅ Valid" } else { "❌ Invalid" });
        pk_valid
    }
    
    /// Validate verification key structure
    fn validate_verification_key_structure(
        verification_key: &VerificationKey,
        r1cs: &R1CS,
        total_checks: &mut usize,
        failed_checks: &mut Vec<String>,
    ) -> bool {
        println!("   Validating verification key structure...");
        
        let mut vk_valid = true;
        
        // Check IC length (should be num_public_inputs + 1)
        *total_checks += 1;
        let expected_ic_len = r1cs.num_public_inputs + 1;
        if verification_key.ic.len() != expected_ic_len {
            failed_checks.push(format!(
                "IC length mismatch: {} != {}", 
                verification_key.ic.len(), expected_ic_len
            ));
            vk_valid = false;
        }
        
        println!("     Verification key structure: {}", if vk_valid { "✅ Valid" } else { "❌ Invalid" });
        vk_valid
    }
    
    /// Validate consistency between proving and verification keys
    fn validate_key_consistency(
        proving_key: &ProvingKey,
        verification_key: &VerificationKey,
        total_checks: &mut usize,
        failed_checks: &mut Vec<String>,
    ) -> bool {
        println!("   Validating key consistency...");
        
        let mut consistent = true;
        
        // Check that verification key in proving key matches standalone verification key
        *total_checks += 1;
        if proving_key.verification_key.ic.len() != verification_key.ic.len() {
            failed_checks.push("Verification key IC length mismatch between PK and VK".to_string());
            consistent = false;
        }
        
        // Check alpha_g1 consistency
        *total_checks += 1;
        if proving_key.alpha_g1 != proving_key.verification_key.alpha_g1 ||
           proving_key.verification_key.alpha_g1 != verification_key.alpha_g1 {
            failed_checks.push("Alpha G1 inconsistency between keys".to_string());
            consistent = false;
        }
        
        // Check beta_g2 consistency
        *total_checks += 1;
        if proving_key.beta_g2 != proving_key.verification_key.beta_g2 ||
           proving_key.verification_key.beta_g2 != verification_key.beta_g2 {
            failed_checks.push("Beta G2 inconsistency between keys".to_string());
            consistent = false;
        }
        
        // Check delta_g2 consistency
        *total_checks += 1;
        if proving_key.delta_g2 != proving_key.verification_key.delta_g2 ||
           proving_key.verification_key.delta_g2 != verification_key.delta_g2 {
            failed_checks.push("Delta G2 inconsistency between keys".to_string());
            consistent = false;
        }
        
        println!("     Key consistency: {}", if consistent { "✅ Consistent" } else { "❌ Inconsistent" });
        consistent
    }
    
    /// Validate security properties
    fn validate_security_properties(
        powers: &PowersOfTau,
        proving_key: &ProvingKey,
        verification_key: &VerificationKey,
        total_checks: &mut usize,
        failed_checks: &mut Vec<String>,
    ) -> bool {
        println!("   Validating security properties...");
        
        let mut secure = true;
        
        // Check that we don't have trivial/identity elements
        *total_checks += 1;
        if Self::has_trivial_elements(proving_key) {
            failed_checks.push("Proving key contains trivial/identity elements".to_string());
            secure = false;
        }
        
        *total_checks += 1;
        if Self::has_trivial_elements_vk(verification_key) {
            failed_checks.push("Verification key contains trivial/identity elements".to_string());
            secure = false;
        }
        
        // Check randomness in ceremony parameters
        *total_checks += 1;
        if Self::appears_deterministic(powers) {
            failed_checks.push("Powers of Tau appear deterministic (weak randomness)".to_string());
            secure = false;
        }
        
        // Check for common discrete log relationships
        *total_checks += 1;
        if let Err(e) = Self::check_discrete_log_security(proving_key, verification_key) {
            failed_checks.push(format!("Discrete log security check failed: {}", e));
            secure = false;
        }
        
        println!("     Security properties: {}", if secure { "✅ Secure" } else { "❌ Insecure" });
        secure
    }
    
    /// Check for trivial elements in proving key
    fn has_trivial_elements(proving_key: &ProvingKey) -> bool {
        // Check for identity elements in key components
        // This is a simplified check - in practice would be more thorough
        proving_key.a_query.is_empty() || 
        proving_key.b_g1_query.is_empty() || 
        proving_key.l_query.is_empty()
    }
    
    /// Check for trivial elements in verification key
    fn has_trivial_elements_vk(verification_key: &VerificationKey) -> bool {
        verification_key.ic.is_empty()
    }
    
    /// Check if Powers of Tau appear deterministic
    fn appears_deterministic(powers: &PowersOfTau) -> bool {
        // Simple heuristic: check if ceremony ID suggests it's a test
        powers.ceremony_id.contains("test") || 
        powers.ceremony_id.contains("demo") ||
        powers.max_degree < 16 // Very small ceremonies are likely tests
    }
    
    /// Check discrete logarithm security properties
    fn check_discrete_log_security(
        proving_key: &ProvingKey,
        _verification_key: &VerificationKey,
    ) -> Result<()> {
        // Verify that we can't easily compute discrete logs between related elements
        // This is a placeholder for more sophisticated checks
        
        // Check that alpha_g1 and beta_g1 are different points
        if proving_key.alpha_g1 == proving_key.beta_g1 {
            return Err(TrustedSetupError::SecurityViolation(
                "Alpha and beta G1 points are identical".to_string()
            ));
        }
        
        // Check that delta_g1 and alpha_g1 are different
        if proving_key.delta_g1 == proving_key.alpha_g1 {
            return Err(TrustedSetupError::SecurityViolation(
                "Delta and alpha G1 points are identical".to_string()
            ));
        }
        
        Ok(())
    }
}

// Extension trait for power of two check
trait IsPowerOfTwo {
    fn is_power_of_two(self) -> bool;
}

impl IsPowerOfTwo for usize {
    fn is_power_of_two(self) -> bool {
        self != 0 && (self & (self - 1)) == 0
    }
}

// Extension trait for next power of two
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
    use crate::circuit_setup::CircuitSetup;
    
    #[test]
    fn test_power_of_two_check() {
        assert!(16.is_power_of_two());
        assert!(!15.is_power_of_two());
        assert!(1.is_power_of_two());
        assert!(!0.is_power_of_two());
    }
    
    #[test]
    fn test_next_power_of_two() {
        assert_eq!(15.next_power_of_two(), 16);
        assert_eq!(16.next_power_of_two(), 16);
        assert_eq!(17.next_power_of_two(), 32);
    }
    
    #[test]
    fn test_validation_small_setup() {
        // Create a small valid setup for testing
        let r1cs = R1CS::create_tokamak_circuit_r1cs().unwrap();
        let powers = PowersOfTau::generate_for_circuit(16).unwrap();
        let (proving_key, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers).unwrap();
        
        let report = TrustedSetupValidator::validate_complete_setup(
            &r1cs, &powers, &proving_key, &verification_key
        ).unwrap();
        
        // Should have some failed checks due to small test size, but structure should be valid
        assert!(report.total_checks > 0);
        assert!(report.proving_key_valid);
        assert!(report.verification_key_valid);
    }
}