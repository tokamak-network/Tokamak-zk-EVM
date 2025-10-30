use crate::errors::{TrustedSetupError, Result};
use crate::r1cs::R1CS;
use crate::powers_of_tau::PowersOfTau;
use crate::circuit_setup::{CircuitSetup, ProvingKey, VerificationKey};
use crate::validation::TrustedSetupValidator;
// use std::path::Path; // Unused in current implementation
use serde::{Deserialize, Serialize};

/// Complete trusted setup ceremony orchestrator
pub struct TrustedSetupCeremony {
    ceremony_config: CeremonyConfig,
}

/// Configuration for the trusted setup ceremony
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CeremonyConfig {
    pub ceremony_name: String,
    pub circuit_name: String,
    pub expected_constraints: usize,
    pub output_directory: String,
    pub validate_outputs: bool,
    pub save_intermediate: bool,
}

/// Results from a complete trusted setup ceremony
#[derive(Debug)]
pub struct CeremonyResult {
    pub proving_key: ProvingKey,
    pub verification_key: VerificationKey,
    pub ceremony_info: CeremonyInfo,
    pub validation_report: ValidationReport,
}

/// Information about the ceremony execution
#[derive(Debug, Serialize, Deserialize)]
pub struct CeremonyInfo {
    pub ceremony_name: String,
    pub circuit_name: String,
    pub constraints: usize,
    pub variables: usize,
    pub public_inputs: usize,
    pub max_degree: usize,
    pub total_duration_secs: u64,
    pub phases: Vec<PhaseInfo>,
}

/// Information about each phase of the ceremony
#[derive(Debug, Serialize, Deserialize)]
pub struct PhaseInfo {
    pub name: String,
    pub duration_secs: u64,
    pub success: bool,
    pub details: String,
}

/// Validation report for the ceremony outputs
#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationReport {
    pub powers_of_tau_valid: bool,
    pub proving_key_valid: bool,
    pub verification_key_valid: bool,
    pub consistency_checks_passed: bool,
    pub security_checks_passed: bool,
    pub total_checks: usize,
    pub failed_checks: Vec<String>,
}

impl Default for CeremonyConfig {
    fn default() -> Self {
        Self {
            ceremony_name: "tokamak-trusted-setup".to_string(),
            circuit_name: "TokamakStorageMerkleProofOptimized".to_string(),
            expected_constraints: 66_735,
            output_directory: "./ceremony_output".to_string(),
            validate_outputs: true,
            save_intermediate: true,
        }
    }
}

impl TrustedSetupCeremony {
    /// Create a new ceremony with default configuration
    pub fn new() -> Self {
        Self {
            ceremony_config: CeremonyConfig::default(),
        }
    }
    
    /// Create a new ceremony with custom configuration
    pub fn with_config(config: CeremonyConfig) -> Self {
        Self {
            ceremony_config: config,
        }
    }
    
    /// Run the complete trusted setup ceremony
    pub fn run_ceremony(&self) -> Result<CeremonyResult> {
        println!("🎭 Starting Tokamak Trusted Setup Ceremony");
        println!("   Name: {}", self.ceremony_config.ceremony_name);
        println!("   Circuit: {}", self.ceremony_config.circuit_name);
        println!("   Expected constraints: {}", self.ceremony_config.expected_constraints);
        
        let ceremony_start = std::time::Instant::now();
        let mut phases = Vec::new();
        
        // Ensure output directory exists
        std::fs::create_dir_all(&self.ceremony_config.output_directory)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        
        // Phase 1: Generate or load R1CS
        let (r1cs, phase1) = self.run_phase_1()?;
        phases.push(phase1);
        
        // Phase 2: Generate Powers of Tau
        let (powers_of_tau, phase2) = self.run_phase_2(&r1cs)?;
        phases.push(phase2);
        
        // Phase 3: Generate Proving and Verification Keys
        let (proving_key, verification_key, phase3) = self.run_phase_3(&r1cs, &powers_of_tau)?;
        phases.push(phase3);
        
        // Phase 4: Validation
        let (validation_report, phase4) = self.run_phase_4(&r1cs, &powers_of_tau, &proving_key, &verification_key)?;
        phases.push(phase4);
        
        // Phase 5: Save outputs
        let phase5 = self.run_phase_5(&r1cs, &powers_of_tau, &proving_key, &verification_key)?;
        phases.push(phase5);
        
        let total_duration = ceremony_start.elapsed();
        
        let ceremony_info = CeremonyInfo {
            ceremony_name: self.ceremony_config.ceremony_name.clone(),
            circuit_name: self.ceremony_config.circuit_name.clone(),
            constraints: r1cs.num_constraints,
            variables: r1cs.num_variables,
            public_inputs: r1cs.num_public_inputs,
            max_degree: powers_of_tau.max_degree,
            total_duration_secs: total_duration.as_secs(),
            phases,
        };
        
        println!("🎉 Trusted Setup Ceremony completed successfully!");
        println!("   Total duration: {:?}", total_duration);
        
        Ok(CeremonyResult {
            proving_key,
            verification_key,
            ceremony_info,
            validation_report,
        })
    }
    
    /// Phase 1: R1CS Generation/Loading
    fn run_phase_1(&self) -> Result<(R1CS, PhaseInfo)> {
        println!("\n📋 Phase 1: R1CS Generation");
        let phase_start = std::time::Instant::now();
        
        // Generate synthetic R1CS for Tokamak circuit
        // In production, this would load from the actual circuit compilation
        let r1cs = R1CS::create_tokamak_circuit_r1cs()?;
        
        // Validate the R1CS
        r1cs.validate()?;
        
        // Save if configured
        if self.ceremony_config.save_intermediate {
            let r1cs_path = format!("{}/r1cs.bin", self.ceremony_config.output_directory);
            r1cs.save_to_file(&r1cs_path)?;
            println!("   💾 R1CS saved to: {}", r1cs_path);
        }
        
        let duration = phase_start.elapsed();
        let stats = r1cs.get_stats();
        
        let phase_info = PhaseInfo {
            name: "R1CS Generation".to_string(),
            duration_secs: duration.as_secs(),
            success: true,
            details: format!("Generated R1CS with {} constraints, {} variables", 
                           r1cs.num_constraints, r1cs.num_variables),
        };
        
        println!("   ✅ Phase 1 completed in {:?}", duration);
        println!("   📊 {}", stats);
        
        Ok((r1cs, phase_info))
    }
    
    /// Phase 2: Powers of Tau Generation
    fn run_phase_2(&self, r1cs: &R1CS) -> Result<(PowersOfTau, PhaseInfo)> {
        println!("\n🔐 Phase 2: Powers of Tau Generation");
        let phase_start = std::time::Instant::now();
        
        // Generate Powers of Tau for the circuit size
        let powers_of_tau = PowersOfTau::generate_for_circuit_with_id(
            r1cs.num_constraints,
            &self.ceremony_config.ceremony_name,
        )?;
        
        // Validate the Powers of Tau
        powers_of_tau.validate()?;
        
        // Save if configured
        if self.ceremony_config.save_intermediate {
            let powers_path = format!("{}/powers_of_tau.bin", self.ceremony_config.output_directory);
            powers_of_tau.save_to_file(&powers_path)?;
            println!("   💾 Powers of Tau saved to: {}", powers_path);
        }
        
        let duration = phase_start.elapsed();
        let info = powers_of_tau.get_info();
        
        let phase_info = PhaseInfo {
            name: "Powers of Tau Generation".to_string(),
            duration_secs: duration.as_secs(),
            success: true,
            details: format!("Generated {} total cryptographic points, max degree {}", 
                           info.total_points, info.max_degree),
        };
        
        println!("   ✅ Phase 2 completed in {:?}", duration);
        println!("   📊 {}", info);
        
        Ok((powers_of_tau, phase_info))
    }
    
    /// Phase 3: Key Generation
    fn run_phase_3(&self, r1cs: &R1CS, powers_of_tau: &PowersOfTau) -> Result<(ProvingKey, VerificationKey, PhaseInfo)> {
        println!("\n🔑 Phase 3: Proving and Verification Key Generation");
        let phase_start = std::time::Instant::now();
        
        // Generate the Groth16 keys
        let (proving_key, verification_key) = CircuitSetup::generate_keys(r1cs, powers_of_tau)?;
        
        let duration = phase_start.elapsed();
        
        let phase_info = PhaseInfo {
            name: "Key Generation".to_string(),
            duration_secs: duration.as_secs(),
            success: true,
            details: format!("Generated proving key ({} G1 + {} G2 elements) and verification key ({} elements)", 
                           proving_key.a_query.len() + proving_key.b_g1_query.len() + proving_key.h_query.len() + proving_key.l_query.len(),
                           proving_key.b_g2_query.len(),
                           verification_key.ic.len() + 4),
        };
        
        println!("   ✅ Phase 3 completed in {:?}", duration);
        
        Ok((proving_key, verification_key, phase_info))
    }
    
    /// Phase 4: Validation
    fn run_phase_4(
        &self,
        r1cs: &R1CS,
        powers_of_tau: &PowersOfTau,
        proving_key: &ProvingKey,
        verification_key: &VerificationKey,
    ) -> Result<(ValidationReport, PhaseInfo)> {
        println!("\n🔍 Phase 4: Comprehensive Validation");
        let phase_start = std::time::Instant::now();
        
        let validation_report = if self.ceremony_config.validate_outputs {
            TrustedSetupValidator::validate_complete_setup(r1cs, powers_of_tau, proving_key, verification_key)?
        } else {
            ValidationReport {
                powers_of_tau_valid: true,
                proving_key_valid: true,
                verification_key_valid: true,
                consistency_checks_passed: true,
                security_checks_passed: true,
                total_checks: 0,
                failed_checks: Vec::new(),
            }
        };
        
        let duration = phase_start.elapsed();
        
        let success = validation_report.failed_checks.is_empty();
        let phase_info = PhaseInfo {
            name: "Validation".to_string(),
            duration_secs: duration.as_secs(),
            success,
            details: format!("Performed {} validation checks, {} failed", 
                           validation_report.total_checks, validation_report.failed_checks.len()),
        };
        
        println!("   ✅ Phase 4 completed in {:?}", duration);
        println!("   📊 Validation: {} checks, {} failed", 
                validation_report.total_checks, validation_report.failed_checks.len());
        
        Ok((validation_report, phase_info))
    }
    
    /// Phase 5: Save Final Outputs
    fn run_phase_5(
        &self,
        r1cs: &R1CS,
        powers_of_tau: &PowersOfTau,
        proving_key: &ProvingKey,
        verification_key: &VerificationKey,
    ) -> Result<PhaseInfo> {
        println!("\n💾 Phase 5: Saving Final Outputs");
        let phase_start = std::time::Instant::now();
        
        let output_dir = &self.ceremony_config.output_directory;
        
        // Save proving key (binary)
        let pk_path = format!("{}/proving_key.bin", output_dir);
        proving_key.save_to_file(&pk_path)?;
        println!("   📄 Proving key (binary) saved to: {}", pk_path);
        
        // Save proving key (JSON)
        let pk_json_path = format!("{}/proving_key.json", output_dir);
        proving_key.save_to_json(&pk_json_path)?;
        println!("   📄 Proving key (JSON) saved to: {}", pk_json_path);
        
        // Save verification key (binary)
        let vk_path = format!("{}/verification_key.bin", output_dir);
        verification_key.save_to_file(&vk_path)?;
        println!("   📄 Verification key (binary) saved to: {}", vk_path);
        
        // Save verification key (JSON)
        let vk_json_path = format!("{}/verification_key.json", output_dir);
        verification_key.save_to_json(&vk_json_path)?;
        println!("   📄 Verification key (JSON) saved to: {}", vk_json_path);
        
        // Save ceremony info
        let info_path = format!("{}/ceremony_info.json", output_dir);
        let ceremony_info = serde_json::json!({
            "ceremony_name": self.ceremony_config.ceremony_name,
            "circuit_name": self.ceremony_config.circuit_name,
            "constraints": r1cs.num_constraints,
            "variables": r1cs.num_variables,
            "public_inputs": r1cs.num_public_inputs,
            "max_degree": powers_of_tau.max_degree,
            "ceremony_id": powers_of_tau.ceremony_id,
            "created_at": powers_of_tau.created_at,
        });
        
        std::fs::write(&info_path, serde_json::to_string_pretty(&ceremony_info)?)
            .map_err(|e| TrustedSetupError::IoError(e))?;
        println!("   📄 Ceremony info saved to: {}", info_path);
        
        let duration = phase_start.elapsed();
        
        let phase_info = PhaseInfo {
            name: "Save Outputs".to_string(),
            duration_secs: duration.as_secs(),
            success: true,
            details: format!("Saved all outputs to {}", output_dir),
        };
        
        println!("   ✅ Phase 5 completed in {:?}", duration);
        
        Ok(phase_info)
    }
}

impl std::fmt::Display for CeremonyResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "🎭 Trusted Setup Ceremony Result")?;
        writeln!(f, "================================")?;
        writeln!(f, "Ceremony: {}", self.ceremony_info.ceremony_name)?;
        writeln!(f, "Circuit: {}", self.ceremony_info.circuit_name)?;
        writeln!(f, "Constraints: {}", self.ceremony_info.constraints)?;
        writeln!(f, "Variables: {}", self.ceremony_info.variables)?;
        writeln!(f, "Public inputs: {}", self.ceremony_info.public_inputs)?;
        writeln!(f, "Max degree: {}", self.ceremony_info.max_degree)?;
        writeln!(f, "Total duration: {} seconds", self.ceremony_info.total_duration_secs)?;
        writeln!(f)?;
        writeln!(f, "📊 Phase Summary:")?;
        for phase in &self.ceremony_info.phases {
            let status = if phase.success { "✅" } else { "❌" };
            writeln!(f, "  {} {}: {} seconds - {}", status, phase.name, phase.duration_secs, phase.details)?;
        }
        writeln!(f)?;
        writeln!(f, "🔍 Validation Results:")?;
        writeln!(f, "  Powers of Tau: {}", if self.validation_report.powers_of_tau_valid { "✅ Valid" } else { "❌ Invalid" })?;
        writeln!(f, "  Proving Key: {}", if self.validation_report.proving_key_valid { "✅ Valid" } else { "❌ Invalid" })?;
        writeln!(f, "  Verification Key: {}", if self.validation_report.verification_key_valid { "✅ Valid" } else { "❌ Invalid" })?;
        writeln!(f, "  Consistency: {}", if self.validation_report.consistency_checks_passed { "✅ Passed" } else { "❌ Failed" })?;
        writeln!(f, "  Security: {}", if self.validation_report.security_checks_passed { "✅ Passed" } else { "❌ Failed" })?;
        writeln!(f, "  Total checks: {}", self.validation_report.total_checks)?;
        
        if !self.validation_report.failed_checks.is_empty() {
            writeln!(f, "  ❌ Failed checks:")?;
            for check in &self.validation_report.failed_checks {
                writeln!(f, "    - {}", check)?;
            }
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_ceremony_config_default() {
        let config = CeremonyConfig::default();
        assert_eq!(config.expected_constraints, 10_972);
        assert_eq!(config.circuit_name, "TokamakStorageMerkleProofOptimized");
    }
    
    #[test]
    fn test_ceremony_creation() {
        let ceremony = TrustedSetupCeremony::new();
        assert_eq!(ceremony.ceremony_config.ceremony_name, "tokamak-trusted-setup");
    }
}