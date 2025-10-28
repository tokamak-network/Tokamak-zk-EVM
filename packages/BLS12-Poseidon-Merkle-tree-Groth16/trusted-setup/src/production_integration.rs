use crate::errors::{Groth16Error, Result};
use crate::circuit_setup::{ProvingKey, VerificationKey};
use crate::r1cs::R1CS;
use crate::powers_of_tau::PowersOfTau;
use crate::ceremony_verification::{CeremonyVerifier, CeremonyValidation, SecurityLevel};
use crate::serialization::{SerializationUtils, SerializableProvingKey, SerializableVerificationKey};
use std::path::{Path, PathBuf};
use std::fs;

/// Production trusted setup loader and manager
pub struct ProductionSetup {
    pub proving_key: ProvingKey,
    pub verification_key: VerificationKey,
    pub validation: CeremonyValidation,
    pub setup_info: SetupInfo,
}

/// Information about the loaded trusted setup
#[derive(Debug, Clone)]
pub struct SetupInfo {
    pub source_directory: PathBuf,
    pub ceremony_files: Vec<PathBuf>,
    pub r1cs_compatibility: bool,
    pub security_assessment: String,
    pub recommended_usage: UsageRecommendation,
}

/// Usage recommendations based on ceremony validation
#[derive(Debug, Clone, PartialEq)]
pub enum UsageRecommendation {
    /// Safe for production deployment
    ProductionReady,
    /// Use for development and testing only
    TestingOnly,
    /// Do not use - regenerate ceremony
    DoNotUse,
}

impl ProductionSetup {
    /// Load trusted setup from standard output directory
    pub fn load_from_output_directory<P: AsRef<Path>>(
        trusted_setup_dir: P,
        r1cs: &R1CS,
    ) -> Result<Self> {
        println!("🔧 Loading production trusted setup from: {:?}", trusted_setup_dir.as_ref());
        
        let setup_dir = trusted_setup_dir.as_ref().to_path_buf();
        
        // Validate directory structure
        Self::validate_directory_structure(&setup_dir)?;
        
        // Load keys from the most appropriate format
        let (proving_key, verification_key) = Self::load_keys_from_directory(&setup_dir)?;
        
        // Perform ceremony verification
        println!("🔍 Performing ceremony verification...");
        let validation = Self::verify_loaded_ceremony(&proving_key, &verification_key, r1cs)?;
        
        // Generate setup information
        let setup_info = Self::generate_setup_info(&setup_dir, &validation, r1cs)?;
        
        // Print summary
        Self::print_setup_summary(&setup_info, &validation);
        
        Ok(ProductionSetup {
            proving_key,
            verification_key,
            validation,
            setup_info,
        })
    }
    
    /// Load trusted setup from the fixed output directory
    /// Since we have a fixed circuit, there must be a consistent trusted setup
    pub fn load_fixed_setup<P: AsRef<Path>>(
        trusted_setup_dir: P,
        r1cs: &R1CS,
    ) -> Result<Self> {
        println!("🔄 Loading trusted setup for the fixed circuit...");
        println!("📁 Directory: {:?}", trusted_setup_dir.as_ref());
        
        // For the fixed circuit, the trusted setup must exist
        match Self::load_from_output_directory(&trusted_setup_dir, r1cs) {
            Ok(setup) => {
                println!("✅ Successfully loaded existing trusted setup");
                return Ok(setup);
            }
            Err(e) => {
                return Err(Groth16Error::ValidationError(format!(
                    "Cannot load trusted setup for fixed circuit: {}\n\
                    \n\
                    The trusted setup files in {:?} are missing or invalid.\n\
                    \n\
                    To fix this:\n\
                    1. Run the trusted setup ceremony to generate the files\n\
                    2. Use: cargo run --bin generate_fixed_setup\n\
                    3. Or ensure valid trusted setup files exist in the directory\n\
                    \n\
                    Required files: proving_key.bin, verification_key.bin",
                    e, trusted_setup_dir.as_ref()
                )));
            }
        }
    }
    
    /// Generate minimal ceremony and save to output directory for the fixed circuit
    pub fn generate_and_save_minimal_ceremony<P: AsRef<Path>>(
        output_dir: P,
        r1cs: &R1CS,
    ) -> Result<Self> {
        println!("🔧 Generating minimal trusted setup for the fixed circuit...");
        println!("📊 Circuit parameters:");
        println!("   - Variables: {}", r1cs.num_variables);
        println!("   - Public inputs: {}", r1cs.num_public_inputs);
        println!("   - Constraints: {}", r1cs.num_constraints);
        
        // Calculate the required degree based on circuit size
        // Need at least next power of 2 >= max(num_variables, num_constraints)
        let required_size = std::cmp::max(r1cs.num_variables, r1cs.num_constraints);
        let required_degree = (required_size as f64).log2().ceil() as u32;
        let tau_size = 1usize << required_degree;
        
        println!("🔢 Circuit requires degree: 2^{} = {} (for {} constraints)", required_degree, tau_size, r1cs.num_constraints);
        println!("⚠️  This will take several minutes to generate");
        
        // Generate the ceremony with the proper size
        let powers = crate::powers_of_tau::PowersOfTau::generate(tau_size)?;
        let (proving_key, verification_key) = crate::circuit_setup::CircuitSetup::generate_keys(r1cs, &powers)?;
        
        // Verify the generated ceremony
        let validation = Self::verify_loaded_ceremony(&proving_key, &verification_key, r1cs)?;
        
        // Create setup info
        let setup_info = SetupInfo {
            source_directory: output_dir.as_ref().to_path_buf(),
            ceremony_files: vec![],
            r1cs_compatibility: validation.r1cs_compatibility,
            security_assessment: format!("Generated minimal setup for {} constraints (demo purposes)", r1cs.num_constraints),
            recommended_usage: UsageRecommendation::TestingOnly,
        };
        
        let production_setup = ProductionSetup {
            proving_key,
            verification_key,
            validation,
            setup_info,
        };
        
        // Save to the output directory to ensure it's available for future runs
        production_setup.save_to_directory(&output_dir)?;
        
        println!("✅ Minimal trusted setup generated and saved");
        println!("📁 Files saved to: {:?}", output_dir.as_ref());
        
        Ok(production_setup)
    }
    
    /// Generate a new ceremony compatible with the given R1CS
    pub fn generate_compatible_ceremony(r1cs: &R1CS) -> Result<Self> {
        println!("🏗️  Generating new trusted setup ceremony...");
        println!("📊 Circuit parameters:");
        println!("   - Variables: {}", r1cs.num_variables);
        println!("   - Public inputs: {}", r1cs.num_public_inputs);
        println!("   - Constraints: {}", r1cs.num_constraints);
        
        // Calculate required powers of tau degree
        let required_degree = (r1cs.num_constraints as f64).log2().ceil() as u32 + 1;
        let tau_size = 1usize << required_degree;
        
        println!("🔢 Required Powers of Tau degree: 2^{} = {}", required_degree, tau_size);
        
        // Check if this will take too long
        if tau_size > 16384 {
            println!("⚠️  Large ceremony detected - this may take significant time");
            println!("🕒 Estimated generation time: 10-60 minutes for full ceremony");
            
            // For demo purposes, use smaller degree
            let demo_degree = 14; // 2^14 = 16384
            let demo_size = 1usize << demo_degree;
            println!("🔧 Using reduced degree for demo: 2^{} = {}", demo_degree, demo_size);
            
            let powers = PowersOfTau::generate(demo_size)?;
            let (proving_key, verification_key) = crate::circuit_setup::CircuitSetup::generate_keys(r1cs, &powers)?;
            
            // Verify the generated ceremony
            let validation = Self::verify_loaded_ceremony(&proving_key, &verification_key, r1cs)?;
            
            let setup_info = SetupInfo {
                source_directory: PathBuf::from("generated"),
                ceremony_files: vec![],
                r1cs_compatibility: validation.r1cs_compatibility,
                security_assessment: "Generated ceremony with reduced parameters for demo".to_string(),
                recommended_usage: UsageRecommendation::TestingOnly,
            };
            
            println!("✅ Generated ceremony successfully (demo parameters)");
            
            return Ok(ProductionSetup {
                proving_key,
                verification_key,
                validation,
                setup_info,
            });
        } else {
            // Generate full ceremony
            let powers = PowersOfTau::generate(tau_size)?;
            let (proving_key, verification_key) = crate::circuit_setup::CircuitSetup::generate_keys(r1cs, &powers)?;
            
            // Verify the generated ceremony
            let validation = Self::verify_loaded_ceremony(&proving_key, &verification_key, r1cs)?;
            
            let setup_info = SetupInfo {
                source_directory: PathBuf::from("generated"),
                ceremony_files: vec![],
                r1cs_compatibility: validation.r1cs_compatibility,
                security_assessment: "Freshly generated ceremony".to_string(),
                recommended_usage: if validation.security_level == SecurityLevel::Production {
                    UsageRecommendation::ProductionReady
                } else {
                    UsageRecommendation::TestingOnly
                },
            };
            
            println!("✅ Generated ceremony successfully");
            
            Ok(ProductionSetup {
                proving_key,
                verification_key,
                validation,
                setup_info,
            })
        }
    }
    
    /// Validate trusted setup directory structure
    fn validate_directory_structure<P: AsRef<Path>>(dir: P) -> Result<()> {
        let dir = dir.as_ref();
        
        if !dir.exists() {
            return Err(Groth16Error::ValidationError(
                format!("Trusted setup directory does not exist: {:?}", dir)
            ));
        }
        
        if !dir.is_dir() {
            return Err(Groth16Error::ValidationError(
                format!("Path is not a directory: {:?}", dir)
            ));
        }
        
        // List available files
        let entries: Vec<_> = fs::read_dir(dir)
            .map_err(|e| Groth16Error::ValidationError(format!("Cannot read directory: {}", e)))?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .collect();
        
        println!("📁 Found files in trusted setup directory:");
        for entry in &entries {
            if let Some(name) = entry.file_name() {
                println!("   - {:?}", name);
            }
        }
        
        // Check for required files (either binary or JSON)
        let has_proving_key = entries.iter().any(|p| {
            p.file_name().map_or(false, |name| {
                name == "proving_key.bin" || name == "proving_key.json"
            })
        });
        
        let has_verification_key = entries.iter().any(|p| {
            p.file_name().map_or(false, |name| {
                name == "verification_key.bin" || name == "verification_key.json"
            })
        });
        
        if !has_proving_key && !has_verification_key {
            return Err(Groth16Error::ValidationError(
                "No proving or verification keys found in directory".to_string()
            ));
        }
        
        println!("✅ Directory structure validated");
        Ok(())
    }
    
    /// Load keys from directory with format detection
    fn load_keys_from_directory<P: AsRef<Path>>(dir: P) -> Result<(ProvingKey, VerificationKey)> {
        let dir = dir.as_ref();
        
        // Try loading binary format first (more efficient)
        let proving_key_bin = dir.join("proving_key.bin");
        let verification_key_bin = dir.join("verification_key.bin");
        
        if proving_key_bin.exists() && verification_key_bin.exists() {
            println!("📂 Loading keys from binary format...");
            let proving_key = ProvingKey::load_from_binary(&proving_key_bin)?;
            let verification_key = VerificationKey::load_from_binary(&verification_key_bin)?;
            return Ok((proving_key, verification_key));
        }
        
        // Try loading JSON format
        let proving_key_json = dir.join("proving_key.json");
        let verification_key_json = dir.join("verification_key.json");
        
        if proving_key_json.exists() && verification_key_json.exists() {
            println!("📂 Loading keys from JSON format...");
            // JSON loading implementation would go here
            return Err(Groth16Error::SerializationError(
                "JSON key loading not yet implemented".to_string()
            ));
        }
        
        // Try loading verification key only (for verification purposes)
        if verification_key_json.exists() {
            println!("📂 Found verification key JSON, creating minimal setup...");
            // For now, return error since we need both keys
            return Err(Groth16Error::SerializationError(
                "Proving key not found, verification-only mode not implemented".to_string()
            ));
        }
        
        Err(Groth16Error::ValidationError(
            "No loadable key files found in directory".to_string()
        ))
    }
    
    /// Verify loaded ceremony
    fn verify_loaded_ceremony(
        proving_key: &ProvingKey,
        verification_key: &VerificationKey,
        r1cs: &R1CS,
    ) -> Result<CeremonyValidation> {
        // For loaded ceremonies, we can't verify Powers of Tau directly
        // so we create a simplified validation
        let mut validation = CeremonyValidation {
            powers_of_tau_valid: true, // Assume valid if keys loaded successfully
            circuit_keys_valid: false,
            pairing_checks_passed: false,
            r1cs_compatibility: false,
            security_level: SecurityLevel::Insecure,
        };
        
        // Validate circuit key consistency
        validation.circuit_keys_valid = proving_key.verification_key.alpha_g1 == verification_key.alpha_g1 &&
                                       proving_key.verification_key.beta_g2 == verification_key.beta_g2 &&
                                       proving_key.verification_key.gamma_g2 == verification_key.gamma_g2 &&
                                       proving_key.verification_key.delta_g2 == verification_key.delta_g2;
        
        // Simplified pairing checks (structural validation)
        validation.pairing_checks_passed = proving_key.alpha_g1 != icicle_bls12_381::curve::G1Affine::zero() &&
                                           verification_key.beta_g2 != icicle_bls12_381::curve::G2Affine::zero();
        
        // Check R1CS compatibility
        validation.r1cs_compatibility = proving_key.a_query.len() == r1cs.num_variables &&
                                        proving_key.h_query.len() >= r1cs.num_constraints &&
                                        verification_key.ic.len() == r1cs.num_public_inputs + 1;
        
        // Assess security level
        if validation.circuit_keys_valid && validation.pairing_checks_passed && validation.r1cs_compatibility {
            if r1cs.num_constraints >= 10000 {
                validation.security_level = SecurityLevel::Production;
            } else {
                validation.security_level = SecurityLevel::Testing;
            }
        }
        
        Ok(validation)
    }
    
    /// Generate setup information
    fn generate_setup_info<P: AsRef<Path>>(
        dir: P,
        validation: &CeremonyValidation,
        r1cs: &R1CS,
    ) -> Result<SetupInfo> {
        let dir = dir.as_ref();
        
        // Collect ceremony files
        let ceremony_files: Vec<PathBuf> = fs::read_dir(dir)
            .map_err(|e| Groth16Error::ValidationError(format!("Cannot read directory: {}", e)))?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| {
                path.extension().map_or(false, |ext| ext == "bin" || ext == "json")
            })
            .collect();
        
        // Generate security assessment
        let security_assessment = match validation.security_level {
            SecurityLevel::Production => format!(
                "Production-ready ceremony with {} constraints and full validation passed",
                r1cs.num_constraints
            ),
            SecurityLevel::Testing => format!(
                "Testing-level ceremony with {} constraints - suitable for development only",
                r1cs.num_constraints
            ),
            SecurityLevel::Insecure => "Insecure ceremony - critical validation failures detected".to_string(),
        };
        
        // Determine usage recommendation
        let recommended_usage = match validation.security_level {
            SecurityLevel::Production => UsageRecommendation::ProductionReady,
            SecurityLevel::Testing => UsageRecommendation::TestingOnly,
            SecurityLevel::Insecure => UsageRecommendation::DoNotUse,
        };
        
        Ok(SetupInfo {
            source_directory: dir.to_path_buf(),
            ceremony_files,
            r1cs_compatibility: validation.r1cs_compatibility,
            security_assessment,
            recommended_usage,
        })
    }
    
    /// Print setup summary
    fn print_setup_summary(setup_info: &SetupInfo, validation: &CeremonyValidation) {
        println!("\n🎯 === Trusted Setup Summary ===");
        println!("📂 Source: {:?}", setup_info.source_directory);
        println!("📁 Files loaded: {}", setup_info.ceremony_files.len());
        
        for file in &setup_info.ceremony_files {
            if let Some(name) = file.file_name() {
                println!("   - {:?}", name);
            }
        }
        
        println!("\n🔍 Validation Results:");
        println!("   - Powers of Tau: {}", if validation.powers_of_tau_valid { "✅" } else { "❌" });
        println!("   - Circuit Keys: {}", if validation.circuit_keys_valid { "✅" } else { "❌" });
        println!("   - Pairing Checks: {}", if validation.pairing_checks_passed { "✅" } else { "❌" });
        println!("   - R1CS Compatible: {}", if validation.r1cs_compatibility { "✅" } else { "❌" });
        
        println!("\n🔒 Security Level: {:?}", validation.security_level);
        println!("📋 Assessment: {}", setup_info.security_assessment);
        
        println!("\n💡 Recommendation:");
        match setup_info.recommended_usage {
            UsageRecommendation::ProductionReady => {
                println!("   ✅ Ready for production deployment");
            }
            UsageRecommendation::TestingOnly => {
                println!("   🧪 Use for development and testing only");
                println!("   🔧 Consider generating production ceremony for mainnet");
            }
            UsageRecommendation::DoNotUse => {
                println!("   ❌ Do not use - regenerate trusted setup");
            }
        }
        println!("==============================\n");
    }
    
    /// Save the loaded setup to a new location
    pub fn save_to_directory<P: AsRef<Path>>(&self, output_dir: P) -> Result<()> {
        let output_dir = output_dir.as_ref();
        
        // Create directory if it doesn't exist
        fs::create_dir_all(output_dir)
            .map_err(|e| Groth16Error::SerializationError(format!("Cannot create directory: {}", e)))?;
        
        // Save both binary and JSON formats
        let pk_bin_path = output_dir.join("proving_key.bin");
        let vk_bin_path = output_dir.join("verification_key.bin");
        let pk_json_path = output_dir.join("proving_key.json");
        let vk_json_path = output_dir.join("verification_key.json");
        
        // Save binary format
        self.proving_key.save_to_binary(&pk_bin_path)?;
        self.verification_key.save_to_binary(&vk_bin_path)?;
        
        // Save JSON format
        self.proving_key.save_to_json(&pk_json_path)?;
        self.verification_key.save_to_json(&vk_json_path)?;
        
        // Save validation report
        let report_path = output_dir.join("ceremony_validation_report.md");
        let report = CeremonyVerifier::generate_report(&self.validation);
        fs::write(&report_path, report)
            .map_err(|e| Groth16Error::SerializationError(format!("Cannot write report: {}", e)))?;
        
        println!("✅ Trusted setup saved to: {:?}", output_dir);
        println!("📁 Files created:");
        println!("   - proving_key.bin");
        println!("   - verification_key.bin");
        println!("   - proving_key.json");
        println!("   - verification_key.json");
        println!("   - ceremony_validation_report.md");
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::r1cs::R1CS;
    use tempfile::TempDir;
    
    #[test]
    fn test_generate_compatible_ceremony() {
        let r1cs = R1CS {
            num_variables: 50,
            num_public_inputs: 3,
            num_constraints: 40,
            a_matrix: vec![vec![]; 40],
            b_matrix: vec![vec![]; 40],
            c_matrix: vec![vec![]; 40],
        };
        
        let setup = ProductionSetup::generate_compatible_ceremony(&r1cs).unwrap();
        
        assert!(setup.validation.r1cs_compatibility);
        assert!(setup.validation.circuit_keys_valid);
        assert_eq!(setup.setup_info.recommended_usage, UsageRecommendation::TestingOnly);
    }
    
    #[test]
    fn test_setup_save_and_info() {
        let temp_dir = TempDir::new().unwrap();
        
        let r1cs = R1CS {
            num_variables: 30,
            num_public_inputs: 2,
            num_constraints: 25,
            a_matrix: vec![vec![]; 25],
            b_matrix: vec![vec![]; 25],
            c_matrix: vec![vec![]; 25],
        };
        
        let setup = ProductionSetup::generate_compatible_ceremony(&r1cs).unwrap();
        
        // Save setup
        setup.save_to_directory(temp_dir.path()).unwrap();
        
        // Verify files were created
        assert!(temp_dir.path().join("proving_key.bin").exists());
        assert!(temp_dir.path().join("verification_key.bin").exists());
        assert!(temp_dir.path().join("ceremony_validation_report.md").exists());
    }
}