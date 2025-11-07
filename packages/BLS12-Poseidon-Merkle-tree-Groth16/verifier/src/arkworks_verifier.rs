use crate::errors::{VerifierError, Result};
use ark_bls12_381::{Bls12_381, Fr as ScalarField, G1Affine, G2Affine, G1Projective, G2Projective, Fq, Fq2};
use ark_ec::{AffineRepr, CurveGroup, pairing::Pairing};
use ark_ff::{PrimeField, BigInteger, Zero, One, Field};
use tokamak_groth16_trusted_setup::{VerificationKey as TrustedSetupVK};
use serde_json::Value;
use std::path::Path;

/// Pure Arkworks-based Groth16 verifier (no ICICLE dependencies)
pub struct ArkworksGroth16Verifier {
    verification_key: TrustedSetupVK,
}

/// Groth16 proof structure using pure Arkworks types
#[derive(Debug, Clone)]
pub struct ArkworksGroth16Proof {
    pub a: G1Affine,
    pub b: G2Affine, 
    pub c: G1Affine,
}

/// Public inputs using pure Arkworks types
#[derive(Debug, Clone)]
pub struct ArkworksPublicInputs {
    pub merkle_root: ScalarField,
    pub active_leaves: ScalarField,
    pub channel_id: ScalarField,
}

impl ArkworksGroth16Verifier {
    /// Create new Arkworks-based verifier
    pub fn new(verification_key: TrustedSetupVK) -> Self {
        Self { verification_key }
    }

    /// Load verifier from file
    pub fn from_file<P: AsRef<Path>>(vk_path: P) -> Result<Self> {
        let vk = TrustedSetupVK::load_from_file(vk_path)?;
        Ok(Self::new(vk))
    }

    /// Parse G1 point from JSON hex coordinates
    fn parse_g1_point_from_json(&self, json_obj: &Value) -> Result<G1Affine> {
        let x_hex = json_obj.get("x").and_then(|v| v.as_str()).ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing x coordinate".to_string())
        })?;
        let y_hex = json_obj.get("y").and_then(|v| v.as_str()).ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing y coordinate".to_string())
        })?;

        // Parse hex strings to field elements
        let x_fq = self.parse_base_field_from_hex(x_hex)?;
        let y_fq = self.parse_base_field_from_hex(y_hex)?;

        // Create G1 point
        Ok(G1Affine::new(x_fq, y_fq))
    }

    /// Parse G2 point from JSON hex coordinates
    fn parse_g2_point_from_json(&self, json_obj: &Value) -> Result<G2Affine> {
        let x_array = json_obj.get("x").and_then(|v| v.as_array()).ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing x coordinate array".to_string())
        })?;
        let y_array = json_obj.get("y").and_then(|v| v.as_array()).ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing y coordinate array".to_string())
        })?;

        if x_array.len() != 2 || y_array.len() != 2 {
            return Err(VerifierError::InvalidProofFormat("G2 coordinates must have 2 components".to_string()));
        }

        // Parse Fq2 components
        let x_c0_hex = x_array[0].as_str().ok_or_else(|| {
            VerifierError::InvalidProofFormat("Invalid x.c0 component".to_string())
        })?;
        let x_c1_hex = x_array[1].as_str().ok_or_else(|| {
            VerifierError::InvalidProofFormat("Invalid x.c1 component".to_string())
        })?;
        let y_c0_hex = y_array[0].as_str().ok_or_else(|| {
            VerifierError::InvalidProofFormat("Invalid y.c0 component".to_string())
        })?;
        let y_c1_hex = y_array[1].as_str().ok_or_else(|| {
            VerifierError::InvalidProofFormat("Invalid y.c1 component".to_string())
        })?;

        let x_c0 = self.parse_base_field_from_hex(x_c0_hex)?;
        let x_c1 = self.parse_base_field_from_hex(x_c1_hex)?;
        let y_c0 = self.parse_base_field_from_hex(y_c0_hex)?;
        let y_c1 = self.parse_base_field_from_hex(y_c1_hex)?;

        // Create Fq2 elements
        let x_fq2 = Fq2::new(x_c0, x_c1);
        let y_fq2 = Fq2::new(y_c0, y_c1);

        // Create G2 point
        Ok(G2Affine::new(x_fq2, y_fq2))
    }

    /// Parse base field element from hex string
    fn parse_base_field_from_hex(&self, hex_str: &str) -> Result<Fq> {
        let hex_clean = hex_str.strip_prefix("0x").unwrap_or(hex_str);
        let bytes = hex::decode(hex_clean)?;
        
        // Convert bytes to BigInteger for Fq
        let mut padded = vec![0u8; 48]; // BLS12-381 base field is 48 bytes
        let copy_len = bytes.len().min(48);
        padded[..copy_len].copy_from_slice(&bytes[..copy_len]);
        
        // Convert to u64 words for BigInteger
        let mut u64_words = [0u64; 6]; // 48 bytes = 6 * 8 bytes
        for (i, chunk) in padded.chunks(8).enumerate() {
            if i < 6 {
                let mut word_bytes = [0u8; 8];
                word_bytes[..chunk.len()].copy_from_slice(chunk);
                u64_words[i] = u64::from_le_bytes(word_bytes);
            }
        }
        
        let bigint = ark_ff::BigInt::new(u64_words);
        Fq::from_bigint(bigint).ok_or_else(|| {
            VerifierError::FieldElementError("Invalid base field element".to_string())
        })
    }

    /// Parse scalar field element from hex string
    fn parse_scalar_field_from_hex(&self, hex_str: &str) -> Result<ScalarField> {
        let hex_clean = hex_str.strip_prefix("0x").unwrap_or(hex_str);
        let bytes = hex::decode(hex_clean)?;
        
        // Scalar field is 32 bytes for BLS12-381
        let mut padded = vec![0u8; 32];
        let copy_len = bytes.len().min(32);
        padded[..copy_len].copy_from_slice(&bytes[..copy_len]);
        
        // Convert to u64 words for BigInteger
        let mut u64_words = [0u64; 4]; // 32 bytes = 4 * 8 bytes
        for (i, chunk) in padded.chunks(8).enumerate() {
            if i < 4 {
                let mut word_bytes = [0u8; 8];
                word_bytes[..chunk.len()].copy_from_slice(chunk);
                u64_words[i] = u64::from_le_bytes(word_bytes);
            }
        }
        
        let bigint = ark_ff::BigInt::new(u64_words);
        ScalarField::from_bigint(bigint).ok_or_else(|| {
            VerifierError::FieldElementError("Invalid scalar field element".to_string())
        })
    }

    /// Parse proof from JSON using pure Arkworks
    pub fn parse_proof_json(&self, json_str: &str) -> Result<ArkworksGroth16Proof> {
        let json: Value = serde_json::from_str(json_str)?;
        
        let proof_obj = json.get("proof").ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing 'proof' field".to_string())
        })?;

        let a_obj = proof_obj.get("a").ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing 'a' point".to_string())
        })?;
        let a = self.parse_g1_point_from_json(a_obj)?;

        let b_obj = proof_obj.get("b").ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing 'b' point".to_string())
        })?;
        let b = self.parse_g2_point_from_json(b_obj)?;

        let c_obj = proof_obj.get("c").ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing 'c' point".to_string())
        })?;
        let c = self.parse_g1_point_from_json(c_obj)?;

        Ok(ArkworksGroth16Proof { a, b, c })
    }

    /// Parse public inputs from JSON using pure Arkworks
    pub fn parse_public_inputs_json(&self, json_str: &str) -> Result<ArkworksPublicInputs> {
        let json: Value = serde_json::from_str(json_str)?;
        
        let merkle_root_hex = json.get("merkle_root").and_then(|v| v.as_str()).ok_or_else(|| {
            VerifierError::InvalidPublicInputs("Missing merkle_root".to_string())
        })?;
        let merkle_root = self.parse_scalar_field_from_hex(merkle_root_hex)?;

        let active_leaves_val = json.get("active_leaves").and_then(|v| v.as_u64()).ok_or_else(|| {
            VerifierError::InvalidPublicInputs("Missing active_leaves".to_string())
        })?;
        let active_leaves = ScalarField::from(active_leaves_val);

        let channel_id_val = json.get("channel_id").and_then(|v| v.as_u64()).ok_or_else(|| {
            VerifierError::InvalidPublicInputs("Missing channel_id".to_string())
        })?;
        let channel_id = ScalarField::from(channel_id_val);

        Ok(ArkworksPublicInputs {
            merkle_root,
            active_leaves,
            channel_id,
        })
    }

    /// Convert trusted setup verification key elements to Arkworks format
    fn convert_verification_key_elements(&self) -> Result<(G1Affine, G2Affine, G2Affine, G2Affine, Vec<G1Affine>)> {
        println!("   🔄 Converting verification key elements from raw bytes to Arkworks...");
        
        // Convert alpha_g1 from raw bytes
        let alpha_g1 = self.convert_g1_from_bytes(&self.verification_key.alpha_g1.x_bytes, &self.verification_key.alpha_g1.y_bytes)?;
        
        // Convert beta_g2 from raw bytes
        let beta_g2 = self.convert_g2_from_bytes(&self.verification_key.beta_g2.x_bytes, &self.verification_key.beta_g2.y_bytes)?;
        
        // Convert gamma_g2 from raw bytes
        let gamma_g2 = self.convert_g2_from_bytes(&self.verification_key.gamma_g2.x_bytes, &self.verification_key.gamma_g2.y_bytes)?;
        
        // Convert delta_g2 from raw bytes
        let delta_g2 = self.convert_g2_from_bytes(&self.verification_key.delta_g2.x_bytes, &self.verification_key.delta_g2.y_bytes)?;
        
        // Convert IC elements from raw bytes
        let mut ic = Vec::with_capacity(self.verification_key.ic.len());
        for ic_element in &self.verification_key.ic {
            let ic_point = self.convert_g1_from_bytes(&ic_element.x_bytes, &ic_element.y_bytes)?;
            ic.push(ic_point);
        }
        
        println!("   ✅ Converted {} verification key elements successfully", 4 + ic.len());
        
        Ok((alpha_g1, beta_g2, gamma_g2, delta_g2, ic))
    }

    /// Convert G1 point from raw bytes to Arkworks G1Affine
    fn convert_g1_from_bytes(&self, x_bytes: &[u8], y_bytes: &[u8]) -> Result<G1Affine> {
        // Convert bytes to base field elements
        let x_fq = self.bytes_to_base_field(x_bytes)?;
        let y_fq = self.bytes_to_base_field(y_bytes)?;
        
        // Create G1 point
        Ok(G1Affine::new(x_fq, y_fq))
    }

    /// Convert G2 point from raw bytes to Arkworks G2Affine
    fn convert_g2_from_bytes(&self, x_bytes: &[u8], y_bytes: &[u8]) -> Result<G2Affine> {
        // G2 coordinates are Fq2 elements (96 bytes each: c0 || c1)
        if x_bytes.len() != 96 || y_bytes.len() != 96 {
            return Err(VerifierError::CurvePointError(format!(
                "G2 coordinates must be 96 bytes each, got x:{}, y:{}", x_bytes.len(), y_bytes.len()
            )));
        }
        
        // Split into c0 and c1 components (48 bytes each)
        let x_c0 = self.bytes_to_base_field(&x_bytes[0..48])?;
        let x_c1 = self.bytes_to_base_field(&x_bytes[48..96])?;
        let y_c0 = self.bytes_to_base_field(&y_bytes[0..48])?;
        let y_c1 = self.bytes_to_base_field(&y_bytes[48..96])?;
        
        // Create Fq2 elements
        let x_fq2 = Fq2::new(x_c0, x_c1);
        let y_fq2 = Fq2::new(y_c0, y_c1);
        
        // Create G2 point
        Ok(G2Affine::new(x_fq2, y_fq2))
    }

    /// Convert raw bytes to Arkworks base field element
    fn bytes_to_base_field(&self, bytes: &[u8]) -> Result<Fq> {
        if bytes.len() != 48 {
            return Err(VerifierError::FieldElementError(format!(
                "Base field element must be 48 bytes, got {}", bytes.len()
            )));
        }
        
        // Convert to u64 words for BigInteger (48 bytes = 6 * 8 bytes)
        let mut u64_words = [0u64; 6];
        for (i, chunk) in bytes.chunks(8).enumerate() {
            if i < 6 {
                let mut word_bytes = [0u8; 8];
                word_bytes[..chunk.len()].copy_from_slice(chunk);
                u64_words[i] = u64::from_le_bytes(word_bytes);
            }
        }
        
        let bigint = ark_ff::BigInt::new(u64_words);
        Fq::from_bigint(bigint).ok_or_else(|| {
            VerifierError::FieldElementError("Invalid base field element bytes".to_string())
        })
    }

    /// Compute L_pub using pure Arkworks arithmetic
    fn compute_l_pub(&self, public_inputs: &ArkworksPublicInputs, ic: &[G1Affine]) -> Result<G1Affine> {
        println!("   🧮 Computing L_pub with pure Arkworks arithmetic...");
        
        if ic.len() < 4 {
            return Err(VerifierError::VerificationKeyError("Insufficient IC elements".to_string()));
        }
        
        // L_pub = IC[0] + public_input[0] * IC[1] + public_input[1] * IC[2] + public_input[2] * IC[3]
        let mut result = G1Projective::from(ic[0]);
        
        let inputs = [
            public_inputs.merkle_root,
            public_inputs.active_leaves,
            public_inputs.channel_id,
        ];
        
        for (i, &input) in inputs.iter().enumerate() {
            let ic_point = G1Projective::from(ic[i + 1]);
            let contribution = ic_point * input;
            result += contribution;
            
            println!("   ✅ Added public_input[{}] * IC[{}]", i, i + 1);
        }
        
        println!("   ✅ L_pub computation completed");
        Ok(G1Affine::from(result))
    }

    /// Perform pure Arkworks Groth16 verification 
    pub fn verify(&self, proof: &ArkworksGroth16Proof, public_inputs: &ArkworksPublicInputs) -> Result<bool> {
        println!("🔐 Performing pure Arkworks Groth16 verification...");

        // Convert verification key elements
        let (alpha_g1, beta_g2, gamma_g2, delta_g2, ic) = self.convert_verification_key_elements()?;
        
        println!("   ✅ Verification key elements converted to Arkworks");

        // Compute L_pub using pure Arkworks
        let l_pub = self.compute_l_pub(public_inputs, &ic)?;
        
        println!("   ✅ L_pub computed with pure Arkworks arithmetic");

        // Perform pairing verification: e(A, B) = e(α, β) · e(L_pub, γ) · e(C, δ)
        println!("   🔐 Computing pairings...");
        
        // Use multi-pairing for verification: e(A, B) * e(-α, β) * e(-L_pub, γ) * e(-C, δ) = 1
        let multi_pairing = Bls12_381::multi_pairing(
            [proof.a, -alpha_g1, -l_pub, -proof.c],
            [proof.b, beta_g2, gamma_g2, delta_g2]
        );
        
        let verification_result = multi_pairing.is_zero();
        
        println!("   📊 Multi-pairing identity check: {}", if verification_result { "✅ PASSED" } else { "❌ FAILED" });
        
        if verification_result {
            println!("   🎉 PROOF VERIFICATION SUCCESSFUL!");
        } else {
            println!("   ❌ PROOF VERIFICATION FAILED");
        }

        Ok(verification_result)
    }

    /// Verify proof from files using pure Arkworks
    pub fn verify_from_files<P1: AsRef<Path>, P2: AsRef<Path>>(&self, proof_path: P1, inputs_path: P2) -> Result<u32> {
        let proof_json = std::fs::read_to_string(proof_path)?;
        let proof = self.parse_proof_json(&proof_json)?;

        let inputs_json = std::fs::read_to_string(inputs_path)?;
        let public_inputs = self.parse_public_inputs_json(&inputs_json)?;

        let result = self.verify(&proof, &public_inputs)?;
        
        Ok(if result { 1 } else { 0 })
    }
}