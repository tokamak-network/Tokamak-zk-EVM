use crate::errors::{VerifierError, Result};
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField, G1Projective, G2Projective, BaseField, G2BaseField};
use icicle_core::traits::FieldImpl;
use tokamak_groth16_trusted_setup::{VerificationKey as TrustedSetupVK};
use serde_json::Value;
use std::path::Path;

// Import Arkworks only for pairing (temporary until ICICLE pairing is available)
use ark_bls12_381::{Bls12_381, G1Affine as ArkG1, G2Affine as ArkG2, Fq, Fq2, Fr as ArkFr, G1Projective as ArkG1Proj, G2Projective as ArkG2Proj};
use ark_ec::pairing::Pairing;
use ark_ff::{PrimeField, BigInt, Zero, BigInteger, Field};

/// Groth16 proof structure for verification
#[derive(Debug, Clone)]
pub struct Groth16Proof {
    pub a: G1Affine,
    pub b: G2Affine,
    pub c: G1Affine,
}

/// Public inputs for the circuit
#[derive(Debug, Clone)]
pub struct PublicInputs {
    pub merkle_root: ScalarField,
    pub active_leaves: ScalarField,
    pub channel_id: ScalarField,
}

/// Groth16 Verifier
pub struct Groth16Verifier {
    verification_key: TrustedSetupVK,
}

impl Groth16Verifier {
    /// Create new verifier with verification key
    pub fn new(verification_key: TrustedSetupVK) -> Self {
        Self { verification_key }
    }

    /// Convert ICICLE ScalarField to Arkworks Fr with exact precision
    fn icicle_scalar_to_ark(scalar: &ScalarField) -> Result<ArkFr> {
        let bytes = scalar.to_bytes_le();
        // BLS12-381 scalar field is 32 bytes (255 bits)
        if bytes.len() != 32 {
            return Err(VerifierError::FieldConversionError(format!(
                "Expected 32 bytes for scalar field, got {}", bytes.len()
            )));
        }
        
        // Convert bytes to BigInt (little-endian)
        let mut u64_words = [0u64; 4];
        for (i, chunk) in bytes.chunks(8).enumerate() {
            if i < 4 {
                let mut word_bytes = [0u8; 8];
                word_bytes[..chunk.len()].copy_from_slice(chunk);
                u64_words[i] = u64::from_le_bytes(word_bytes);
            }
        }
        let bigint = BigInt::new(u64_words);
        Ok(ArkFr::from_bigint(bigint).ok_or_else(|| {
            VerifierError::FieldConversionError("Invalid scalar field value".to_string())
        })?)
    }

    /// Convert ICICLE G1Affine to Arkworks G1Affine with exact precision
    fn icicle_g1_to_ark(g: &G1Affine) -> Result<ArkG1> {
        let x_bytes = g.x.to_bytes_le();
        let y_bytes = g.y.to_bytes_le();
        
        // Base field elements are 48 bytes (381 bits)
        if x_bytes.len() != 48 || y_bytes.len() != 48 {
            return Err(VerifierError::CurvePointError(format!(
                "Expected 48 bytes for base field, got x:{}, y:{}", x_bytes.len(), y_bytes.len()
            )));
        }
        
        // Convert to Arkworks base field elements  
        let mut x_u64_words = [0u64; 6];
        for (i, chunk) in x_bytes.chunks(8).enumerate() {
            if i < 6 {
                let mut word_bytes = [0u8; 8];
                word_bytes[..chunk.len()].copy_from_slice(chunk);
                x_u64_words[i] = u64::from_le_bytes(word_bytes);
            }
        }
        let mut y_u64_words = [0u64; 6];
        for (i, chunk) in y_bytes.chunks(8).enumerate() {
            if i < 6 {
                let mut word_bytes = [0u8; 8];
                word_bytes[..chunk.len()].copy_from_slice(chunk);
                y_u64_words[i] = u64::from_le_bytes(word_bytes);
            }
        }
        let x_bigint = BigInt::new(x_u64_words);
        let y_bigint = BigInt::new(y_u64_words);
        
        let x_fq = Fq::from_bigint(x_bigint).ok_or_else(|| {
            VerifierError::FieldConversionError("Invalid x coordinate".to_string())
        })?;
        
        let y_fq = Fq::from_bigint(y_bigint).ok_or_else(|| {
            VerifierError::FieldConversionError("Invalid y coordinate".to_string())
        })?;
        
        // Create Arkworks G1 point
        Ok(ArkG1::new(x_fq, y_fq))
    }

    /// Convert ICICLE G2Affine to Arkworks G2Affine with exact precision  
    fn icicle_g2_to_ark(g: &G2Affine) -> Result<ArkG2> {
        // G2 coordinates are extensions: Fq2 = Fq[u]/(u^2 + 1)
        // Each coordinate is 2 * 48 = 96 bytes
        let x_bytes = g.x.to_bytes_le();
        let y_bytes = g.y.to_bytes_le();
        
        if x_bytes.len() != 96 || y_bytes.len() != 96 {
            return Err(VerifierError::CurvePointError(format!(
                "Expected 96 bytes for G2 coordinates, got x:{}, y:{}", x_bytes.len(), y_bytes.len()
            )));
        }
        
        // Split into c0 and c1 components (each 48 bytes)
        let mut x_c0_u64_words = [0u64; 6];
        for (i, chunk) in x_bytes[0..48].chunks(8).enumerate() {
            if i < 6 {
                let mut word_bytes = [0u8; 8];
                word_bytes[..chunk.len()].copy_from_slice(chunk);
                x_c0_u64_words[i] = u64::from_le_bytes(word_bytes);
            }
        }
        let mut x_c1_u64_words = [0u64; 6];
        for (i, chunk) in x_bytes[48..96].chunks(8).enumerate() {
            if i < 6 {
                let mut word_bytes = [0u8; 8];
                word_bytes[..chunk.len()].copy_from_slice(chunk);
                x_c1_u64_words[i] = u64::from_le_bytes(word_bytes);
            }
        }
        let mut y_c0_u64_words = [0u64; 6];
        for (i, chunk) in y_bytes[0..48].chunks(8).enumerate() {
            if i < 6 {
                let mut word_bytes = [0u8; 8];
                word_bytes[..chunk.len()].copy_from_slice(chunk);
                y_c0_u64_words[i] = u64::from_le_bytes(word_bytes);
            }
        }
        let mut y_c1_u64_words = [0u64; 6];
        for (i, chunk) in y_bytes[48..96].chunks(8).enumerate() {
            if i < 6 {
                let mut word_bytes = [0u8; 8];
                word_bytes[..chunk.len()].copy_from_slice(chunk);
                y_c1_u64_words[i] = u64::from_le_bytes(word_bytes);
            }
        }
        let x_c0_bigint = BigInt::new(x_c0_u64_words);
        let x_c1_bigint = BigInt::new(x_c1_u64_words);
        let y_c0_bigint = BigInt::new(y_c0_u64_words);
        let y_c1_bigint = BigInt::new(y_c1_u64_words);
        
        // Convert to Fq elements
        let x_c0 = Fq::from_bigint(x_c0_bigint).ok_or_else(|| {
            VerifierError::FieldConversionError("Invalid x.c0".to_string())
        })?;
        let x_c1 = Fq::from_bigint(x_c1_bigint).ok_or_else(|| {
            VerifierError::FieldConversionError("Invalid x.c1".to_string())
        })?;
        let y_c0 = Fq::from_bigint(y_c0_bigint).ok_or_else(|| {
            VerifierError::FieldConversionError("Invalid y.c0".to_string())
        })?;
        let y_c1 = Fq::from_bigint(y_c1_bigint).ok_or_else(|| {
            VerifierError::FieldConversionError("Invalid y.c1".to_string())
        })?;
        
        // Create Fq2 elements: c0 + c1*u
        let x_fq2 = Fq2::new(x_c0, x_c1);
        let y_fq2 = Fq2::new(y_c0, y_c1);
        
        // Create G2 point
        Ok(ArkG2::new(x_fq2, y_fq2))
    }

    /// Perform the core Groth16 verification with exact same arithmetic as prover
    pub fn verify(&self, proof: &Groth16Proof, public_inputs: &PublicInputs) -> Result<bool> {
        println!("🔐 Performing ICICLE-based Groth16 verification with exact prover alignment...");

        // Step 1: Convert proof elements to Arkworks for pairing (exact conversion)
        let ark_a = Self::icicle_g1_to_ark(&proof.a)?;
        let ark_b = Self::icicle_g2_to_ark(&proof.b)?;
        let ark_c = Self::icicle_g1_to_ark(&proof.c)?;
        
        println!("   ✅ Proof elements converted to Arkworks");

        // Step 2: Convert verification key elements (exact same conversion as prover)
        let ark_alpha_g1 = Self::icicle_g1_to_ark(&self.verification_key.alpha_g1.to_g1_affine())?;
        let ark_beta_g2 = Self::icicle_g2_to_ark(&self.verification_key.beta_g2.to_g2_affine())?;
        let ark_gamma_g2 = Self::icicle_g2_to_ark(&self.verification_key.gamma_g2.to_g2_affine())?;
        let ark_delta_g2 = Self::icicle_g2_to_ark(&self.verification_key.delta_g2.to_g2_affine())?;
        
        println!("   ✅ Verification key elements converted");

        // Step 3: Compute L_pub using ICICLE arithmetic (same as prover)
        let l_pub_icicle = self.compute_l_pub_icicle(public_inputs)?;
        let ark_l_pub = Self::icicle_g1_to_ark(&l_pub_icicle)?;
        
        println!("   ✅ L_pub computed with ICICLE arithmetic");

        // Step 4: Perform pairing verification
        // e(A, B) = e(α, β) · e(L_pub, γ) · e(C, δ)
        
        println!("   🔐 Computing pairings...");
        
        let pairing_ab = Bls12_381::pairing(ark_a, ark_b);
        let pairing_alpha_beta = Bls12_381::pairing(ark_alpha_g1, ark_beta_g2);
        let pairing_lpub_gamma = Bls12_381::pairing(ark_l_pub, ark_gamma_g2);
        let pairing_c_delta = Bls12_381::pairing(ark_c, ark_delta_g2);
        
        println!("   ✅ All pairings computed");

        // Use multi-pairing for verification: e(A, B) * e(-α, β) * e(-L_pub, γ) * e(-C, δ) = 1
        use ark_ec::AffineRepr;
        let multi_pairing = Bls12_381::multi_pairing(
            [ark_a, -ark_alpha_g1, -ark_l_pub, -ark_c],
            [ark_b, ark_beta_g2, ark_gamma_g2, ark_delta_g2]
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

    /// Compute L_pub using ICICLE arithmetic (exactly matching prover)
    fn compute_l_pub_icicle(&self, public_inputs: &PublicInputs) -> Result<G1Affine> {
        println!("   🧮 Computing L_pub with ICICLE arithmetic (matching prover)...");
        
        // Collect public inputs in same order as prover
        let pub_inputs = vec![
            public_inputs.merkle_root,
            public_inputs.active_leaves, 
            public_inputs.channel_id,
        ];
        
        println!("   📊 Public inputs: {} values", pub_inputs.len());

        // Start with IC[0] (constant term)
        let mut result = G1Projective::from(self.verification_key.ic[0].to_g1_affine());
        
        // Add ∑(public_input[i] * IC[i+1]) using ICICLE arithmetic
        for (i, &input) in pub_inputs.iter().enumerate() {
            if i + 1 < self.verification_key.ic.len() {
                let ic_point = G1Projective::from(self.verification_key.ic[i + 1].to_g1_affine());
                let contribution = ic_point * input;
                result = result + contribution;
                
                // Debug output (matching prover format)
                let input_bytes = input.to_bytes_le();
                println!("   ✅ Added public_input[{}] * IC[{}]", i, i + 1);
                println!("     Input value: {:02x?}", &input_bytes[..8]);
            }
        }
        
        println!("   ✅ L_pub computation completed");
        Ok(G1Affine::from(result))
    }

    /// Load verifier from binary file (for compatibility with existing interface)
    pub fn from_file<P: AsRef<Path>>(vk_path: P) -> Result<Self> {
        let vk = TrustedSetupVK::load_from_file(vk_path)?;
        Ok(Self::new(vk))
    }

    /// Verify proof from files (for compatibility with existing interface)
    pub fn verify_from_files<P1: AsRef<Path>, P2: AsRef<Path>>(&self, proof_path: P1, inputs_path: P2) -> Result<u32> {
        // Load proof
        let proof_json = std::fs::read_to_string(proof_path)?;
        let proof = self.parse_proof_json(&proof_json)?;

        // Load public inputs 
        let inputs_json = std::fs::read_to_string(inputs_path)?;
        let public_inputs = self.parse_public_inputs_json(&inputs_json)?;

        // Perform verification using ICICLE arithmetic
        let result = self.verify(&proof, &public_inputs)?;
        
        Ok(if result { 1 } else { 0 })
    }

    /// Parse proof from JSON (exact same format as prover output)
    fn parse_proof_json(&self, json_str: &str) -> Result<Groth16Proof> {
        let json: Value = serde_json::from_str(json_str)?;
        
        let proof_obj = json.get("proof").ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing 'proof' field".to_string())
        })?;

        // Parse A point (G1)
        let a_obj = proof_obj.get("a").ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing 'a' point".to_string())
        })?;
        let a = self.parse_g1_point(a_obj)?;

        // Parse B point (G2) 
        let b_obj = proof_obj.get("b").ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing 'b' point".to_string())
        })?;
        let b = self.parse_g2_point(b_obj)?;

        // Parse C point (G1)
        let c_obj = proof_obj.get("c").ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing 'c' point".to_string())
        })?;
        let c = self.parse_g1_point(c_obj)?;

        Ok(Groth16Proof { a, b, c })
    }

    /// Parse G1 point from JSON
    fn parse_g1_point(&self, json_obj: &Value) -> Result<G1Affine> {
        let x_hex = json_obj.get("x").and_then(|v| v.as_str()).ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing x coordinate".to_string())
        })?;
        let y_hex = json_obj.get("y").and_then(|v| v.as_str()).ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing y coordinate".to_string())
        })?;

        let x_bytes = self.parse_hex_field(&x_hex, 48)?;
        let y_bytes = self.parse_hex_field(&y_hex, 48)?;

        // Create ICICLE base field elements (48 bytes = 12 limbs of 32 bits)
        let x_field = BaseField::from_bytes_le(&x_bytes);
        let y_field = BaseField::from_bytes_le(&y_bytes);

        Ok(G1Affine { x: x_field, y: y_field })
    }

    /// Parse G2 point from JSON
    fn parse_g2_point(&self, json_obj: &Value) -> Result<G2Affine> {
        // G2 coordinates are arrays [c0, c1] for Fq2 elements
        let x_array = json_obj.get("x").and_then(|v| v.as_array()).ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing x coordinate array".to_string())
        })?;
        let y_array = json_obj.get("y").and_then(|v| v.as_array()).ok_or_else(|| {
            VerifierError::InvalidProofFormat("Missing y coordinate array".to_string())
        })?;

        if x_array.len() != 2 || y_array.len() != 2 {
            return Err(VerifierError::InvalidProofFormat("G2 coordinates must have 2 components".to_string()));
        }

        // Parse c0 and c1 components
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

        // Parse 48-byte base field elements and combine into 96-byte G2 field
        let x_c0_bytes = self.parse_hex_field(&x_c0_hex, 48)?;
        let x_c1_bytes = self.parse_hex_field(&x_c1_hex, 48)?;
        let y_c0_bytes = self.parse_hex_field(&y_c0_hex, 48)?;
        let y_c1_bytes = self.parse_hex_field(&y_c1_hex, 48)?;

        // Combine c0 and c1 into 96-byte G2 base field (c0 || c1)
        let mut x_bytes = Vec::with_capacity(96);
        x_bytes.extend_from_slice(&x_c0_bytes);
        x_bytes.extend_from_slice(&x_c1_bytes);
        
        let mut y_bytes = Vec::with_capacity(96);
        y_bytes.extend_from_slice(&y_c0_bytes);
        y_bytes.extend_from_slice(&y_c1_bytes);

        // Create ICICLE G2 base field elements (96 bytes = 24 limbs of 32 bits)
        let x_field = G2BaseField::from_bytes_le(&x_bytes);
        let y_field = G2BaseField::from_bytes_le(&y_bytes);

        Ok(G2Affine { x: x_field, y: y_field })
    }

    /// Parse public inputs from JSON (exact same format as prover)
    fn parse_public_inputs_json(&self, json_str: &str) -> Result<PublicInputs> {
        let json: Value = serde_json::from_str(json_str)?;
        
        // Parse merkle_root
        let merkle_root_hex = json.get("merkle_root").and_then(|v| v.as_str()).ok_or_else(|| {
            VerifierError::InvalidPublicInputs("Missing merkle_root".to_string())
        })?;
        let merkle_root = self.parse_scalar_from_hex(merkle_root_hex)?;

        // Parse active_leaves
        let active_leaves_val = json.get("active_leaves").and_then(|v| v.as_u64()).ok_or_else(|| {
            VerifierError::InvalidPublicInputs("Missing active_leaves".to_string())
        })?;
        let active_leaves = ScalarField::from([active_leaves_val as u32, 0, 0, 0, 0, 0, 0, 0]);

        // Parse channel_id
        let channel_id_val = json.get("channel_id").and_then(|v| v.as_u64()).ok_or_else(|| {
            VerifierError::InvalidPublicInputs("Missing channel_id".to_string())
        })?;
        let channel_id = ScalarField::from([channel_id_val as u32, 0, 0, 0, 0, 0, 0, 0]);

        Ok(PublicInputs {
            merkle_root,
            active_leaves,
            channel_id,
        })
    }

    /// Parse scalar field from hex string
    fn parse_scalar_from_hex(&self, hex_str: &str) -> Result<ScalarField> {
        let hex_clean = hex_str.strip_prefix("0x").unwrap_or(hex_str);
        let bytes = hex::decode(hex_clean)?;
        
        if bytes.len() > 32 {
            return Err(VerifierError::FieldElementError("Field element too large".to_string()));
        }
        
        // Pad to 32 bytes and convert
        let mut padded = vec![0u8; 32];
        padded[..bytes.len()].copy_from_slice(&bytes);
        
        Ok(ScalarField::from_bytes_le(&padded))
    }

    /// Parse hex field element
    fn parse_hex_field(&self, hex_str: &str, expected_len: usize) -> Result<Vec<u8>> {
        let hex_clean = hex_str.strip_prefix("0x").unwrap_or(hex_str);
        let bytes = hex::decode(hex_clean)?;
        
        if bytes.len() != expected_len {
            return Err(VerifierError::FieldElementError(format!(
                "Expected {} bytes, got {}", expected_len, bytes.len()
            )));
        }
        
        Ok(bytes)
    }
}
