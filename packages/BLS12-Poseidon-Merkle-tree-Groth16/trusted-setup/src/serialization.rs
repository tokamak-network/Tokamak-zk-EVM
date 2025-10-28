use crate::errors::{Groth16Error, Result};
use crate::circuit_setup::{ProvingKey, VerificationKey};
use icicle_bls12_381::curve::{G1Affine, G2Affine};
use icicle_core::traits::FieldImpl;
use libs::group_structures::{G1serde, G2serde};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;

/// Binary format version for compatibility checking
const BINARY_FORMAT_VERSION: u32 = 1;

/// Serializable proving key using backend's G1serde/G2serde types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializableProvingKey {
    pub alpha_g1: G1serde,
    pub beta_g1: G1serde,
    pub beta_g2: G2serde,
    pub delta_g1: G1serde,
    pub delta_g2: G2serde,
    pub a_query: Vec<G1serde>,
    pub b_g1_query: Vec<G1serde>,
    pub b_g2_query: Vec<G2serde>,
    pub h_query: Vec<G1serde>,
    pub l_query: Vec<G1serde>,
    pub verification_key: SerializableVerificationKey,
}

/// Serializable verification key using backend's G1serde/G2serde types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializableVerificationKey {
    pub alpha_g1: G1serde,
    pub beta_g2: G2serde,
    pub gamma_g2: G2serde,
    pub delta_g2: G2serde,
    pub ic: Vec<G1serde>,
}

/// Conversion utilities between ICICLE types and serializable types
pub struct SerializationUtils;

impl SerializationUtils {
    /// Convert ICICLE ProvingKey to serializable format
    pub fn proving_key_to_serializable(proving_key: &ProvingKey) -> SerializableProvingKey {
        SerializableProvingKey {
            alpha_g1: G1serde(proving_key.alpha_g1),
            beta_g1: G1serde(proving_key.beta_g1),
            beta_g2: G2serde(proving_key.beta_g2),
            delta_g1: G1serde(proving_key.delta_g1),
            delta_g2: G2serde(proving_key.delta_g2),
            a_query: proving_key.a_query.iter().map(|&p| G1serde(p)).collect(),
            b_g1_query: proving_key.b_g1_query.iter().map(|&p| G1serde(p)).collect(),
            b_g2_query: proving_key.b_g2_query.iter().map(|&p| G2serde(p)).collect(),
            h_query: proving_key.h_query.iter().map(|&p| G1serde(p)).collect(),
            l_query: proving_key.l_query.iter().map(|&p| G1serde(p)).collect(),
            verification_key: Self::verification_key_to_serializable(&proving_key.verification_key),
        }
    }
    
    /// Convert serializable format back to ICICLE ProvingKey
    pub fn proving_key_from_serializable(serializable: &SerializableProvingKey) -> ProvingKey {
        ProvingKey {
            alpha_g1: serializable.alpha_g1.0,
            beta_g1: serializable.beta_g1.0,
            beta_g2: serializable.beta_g2.0,
            delta_g1: serializable.delta_g1.0,
            delta_g2: serializable.delta_g2.0,
            a_query: serializable.a_query.iter().map(|p| p.0).collect(),
            b_g1_query: serializable.b_g1_query.iter().map(|p| p.0).collect(),
            b_g2_query: serializable.b_g2_query.iter().map(|p| p.0).collect(),
            h_query: serializable.h_query.iter().map(|p| p.0).collect(),
            l_query: serializable.l_query.iter().map(|p| p.0).collect(),
            verification_key: Self::verification_key_from_serializable(&serializable.verification_key),
        }
    }
    
    /// Convert ICICLE VerificationKey to serializable format
    pub fn verification_key_to_serializable(verification_key: &VerificationKey) -> SerializableVerificationKey {
        SerializableVerificationKey {
            alpha_g1: G1serde(verification_key.alpha_g1),
            beta_g2: G2serde(verification_key.beta_g2),
            gamma_g2: G2serde(verification_key.gamma_g2),
            delta_g2: G2serde(verification_key.delta_g2),
            ic: verification_key.ic.iter().map(|&p| G1serde(p)).collect(),
        }
    }
    
    /// Convert serializable format back to ICICLE VerificationKey
    pub fn verification_key_from_serializable(serializable: &SerializableVerificationKey) -> VerificationKey {
        VerificationKey {
            alpha_g1: serializable.alpha_g1.0,
            beta_g2: serializable.beta_g2.0,
            gamma_g2: serializable.gamma_g2.0,
            delta_g2: serializable.delta_g2.0,
            ic: serializable.ic.iter().map(|p| p.0).collect(),
        }
    }
}

impl ProvingKey {
    /// Save proving key to binary file using backend serialization
    pub fn save_to_binary<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("💾 Saving proving key to binary file: {:?}", path.as_ref());
        
        // Convert to serializable format
        let serializable = SerializationUtils::proving_key_to_serializable(self);
        
        // Use bincode for binary serialization
        let encoded = bincode::serialize(&serializable)
            .map_err(|e| Groth16Error::SerializationError(format!("Bincode serialization failed: {}", e)))?;
        
        // Write to file
        std::fs::write(path.as_ref(), encoded)?;
        
        println!("✅ Proving key binary saved successfully");
        println!("   - File size: {} bytes", std::fs::metadata(path.as_ref())?.len());
        println!("   - A query: {} points", self.a_query.len());
        println!("   - H query: {} points", self.h_query.len());
        println!("   - L query: {} points", self.l_query.len());
        
        Ok(())
    }
    
    /// Load proving key from binary file using backend deserialization
    pub fn load_from_binary<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("📂 Loading proving key from binary file: {:?}", path.as_ref());
        
        // Read file
        let encoded = std::fs::read(path.as_ref())?;
        
        // Deserialize using bincode
        let serializable: SerializableProvingKey = bincode::deserialize(&encoded)
            .map_err(|e| Groth16Error::SerializationError(format!("Bincode deserialization failed: {}", e)))?;
        
        // Convert back to ICICLE format
        let proving_key = SerializationUtils::proving_key_from_serializable(&serializable);
        
        println!("✅ Proving key loaded successfully");
        println!("   - File size: {} bytes", encoded.len());
        println!("   - A query: {} points", proving_key.a_query.len());
        println!("   - H query: {} points", proving_key.h_query.len());
        println!("   - L query: {} points", proving_key.l_query.len());
        
        Ok(proving_key)
    }
    
    /// Save proving key to JSON file for human-readable inspection
    pub fn save_to_json<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("💾 Saving proving key to JSON file: {:?}", path.as_ref());
        
        // Convert to serializable format
        let serializable = SerializationUtils::proving_key_to_serializable(self);
        
        // Use serde_json for JSON serialization
        let json = serde_json::to_string_pretty(&serializable)
            .map_err(|e| Groth16Error::SerializationError(format!("JSON serialization failed: {}", e)))?;
        
        // Write to file
        std::fs::write(path.as_ref(), json)?;
        
        println!("✅ Proving key JSON saved successfully");
        println!("   - File size: {} bytes", std::fs::metadata(path.as_ref())?.len());
        
        Ok(())
    }
}

impl VerificationKey {
    /// Save verification key to binary file using backend serialization
    pub fn save_to_binary<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        println!("💾 Saving verification key to binary file: {:?}", path.as_ref());
        
        // Convert to serializable format
        let serializable = SerializationUtils::verification_key_to_serializable(self);
        
        // Use bincode for binary serialization
        let encoded = bincode::serialize(&serializable)
            .map_err(|e| Groth16Error::SerializationError(format!("Bincode serialization failed: {}", e)))?;
        
        // Write to file
        std::fs::write(path.as_ref(), encoded)?;
        
        println!("✅ Verification key binary saved successfully");
        println!("   - File size: {} bytes", std::fs::metadata(path.as_ref())?.len());
        println!("   - IC length: {}", self.ic.len());
        
        Ok(())
    }
    
    /// Load verification key from binary file using backend deserialization
    pub fn load_from_binary<P: AsRef<Path>>(path: P) -> Result<Self> {
        println!("📂 Loading verification key from binary file: {:?}", path.as_ref());
        
        // Read file
        let encoded = std::fs::read(path.as_ref())?;
        
        // Deserialize using bincode
        let serializable: SerializableVerificationKey = bincode::deserialize(&encoded)
            .map_err(|e| Groth16Error::SerializationError(format!("Bincode deserialization failed: {}", e)))?;
        
        // Convert back to ICICLE format
        let verification_key = SerializationUtils::verification_key_from_serializable(&serializable);
        
        println!("✅ Verification key loaded successfully");
        println!("   - File size: {} bytes", encoded.len());
        println!("   - IC length: {}", verification_key.ic.len());
        
        Ok(verification_key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powers_of_tau::PowersOfTau;
    use crate::r1cs::R1CS;
    use crate::circuit_setup::CircuitSetup;
    
    #[test]
    fn test_binary_serialization_roundtrip() {
        // Generate a small key for testing
        let powers = PowersOfTau::generate(64).unwrap();
        
        let r1cs = R1CS {
            num_variables: 30,
            num_public_inputs: 3,
            num_constraints: 25,
            a_matrix: vec![vec![]; 25],
            b_matrix: vec![vec![]; 25],
            c_matrix: vec![vec![]; 25],
        };
        
        let (proving_key, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers).unwrap();
        
        // Test proving key serialization
        let pk_path = "test_pk.bin";
        proving_key.save_to_binary(pk_path).unwrap();
        
        // Test verification key serialization
        let vk_path = "test_vk.bin";
        verification_key.save_to_binary(vk_path).unwrap();
        
        // Test loading with full roundtrip
        let loaded_pk = ProvingKey::load_from_binary(pk_path).unwrap();
        let loaded_vk = VerificationKey::load_from_binary(vk_path).unwrap();
        
        // Verify dimensions match
        assert_eq!(proving_key.a_query.len(), loaded_pk.a_query.len());
        assert_eq!(proving_key.h_query.len(), loaded_pk.h_query.len());
        assert_eq!(verification_key.ic.len(), loaded_vk.ic.len());
        
        // Cleanup
        std::fs::remove_file(pk_path).ok();
        std::fs::remove_file(vk_path).ok();
    }
    
    #[test]
    fn test_serialization_conversion() {
        // Test conversion utilities
        let vk = VerificationKey {
            alpha_g1: G1Affine::zero(),
            beta_g2: G2Affine::zero(),
            gamma_g2: G2Affine::zero(),
            delta_g2: G2Affine::zero(),
            ic: vec![G1Affine::zero(); 3],
        };
        
        // Convert to serializable and back
        let serializable = SerializationUtils::verification_key_to_serializable(&vk);
        let restored = SerializationUtils::verification_key_from_serializable(&serializable);
        
        // Verify dimensions match
        assert_eq!(vk.ic.len(), restored.ic.len());
    }
    
    #[test]
    fn test_json_serialization() {
        // Generate a small key for testing
        let powers = PowersOfTau::generate(32).unwrap();
        
        let r1cs = R1CS {
            num_variables: 10,
            num_public_inputs: 2,
            num_constraints: 8,
            a_matrix: vec![vec![]; 8],
            b_matrix: vec![vec![]; 8],
            c_matrix: vec![vec![]; 8],
        };
        
        let (proving_key, _) = CircuitSetup::generate_keys(&r1cs, &powers).unwrap();
        
        // Test JSON serialization
        let json_path = "test_pk.json";
        proving_key.save_to_json(json_path).unwrap();
        
        // Verify file exists and contains JSON
        let content = std::fs::read_to_string(json_path).unwrap();
        assert!(content.contains("alpha_g1"));
        assert!(content.contains("a_query"));
        
        // Cleanup
        std::fs::remove_file(json_path).ok();
    }
}