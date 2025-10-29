#![allow(non_snake_case)]

// WASM imports
use wasm_bindgen::prelude::*;
use web_sys::console;

// Arkworks-based libs (replaces ICICLE-based libs)
use libs_wasm::{
    G1serde, G2serde, SigmaVerify, Sigma2, PartialSigma1Verify,
    Instance, PublicInputBuffer, PublicOutputBuffer, SetupParams,
    Proof, FormattedProof, Binding, Proof0, Proof1, Proof2, Proof3, Proof4, FieldSerde,
    Preprocess, FormattedPreprocess,
    pairing
};

// Arkworks types
use ark_bls12_381::Fr as ScalarField;
use ark_ff::{BigInteger, Field, One, PrimeField, Zero};
use ark_poly::{Polynomial, Radix2EvaluationDomain, EvaluationDomain, univariate::DensePolynomial};
use ark_ec::AffineRepr;

// tiny-keccak for Keccak256 (replaces icicle-hash)
use tiny_keccak::{Hasher, Keccak};

// Hex handling
use hex::FromHex;

// Serialization
use serde::{Deserialize, Serialize};
use serde_json;

// Standard library
use std::path::PathBuf;

// Error handling for WASM
#[macro_export]
macro_rules! console_log {
    ($($t:tt)*) => {
        console::log_1(&format!($($t)*).into());
    }
}

#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    console_log!("WASM Verifier module initialized");
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeccakVerificationResult {
    True,
    False,
    NoKeccakData,
}

pub struct Verifier {
    pub sigma: SigmaVerify,
    pub a_pub: Vec<ScalarField>,
    pub publicInputBuffer: PublicInputBuffer,
    pub publicOutputBuffer: PublicOutputBuffer,
    pub preprocess: Preprocess,
    pub setup_params: SetupParams,
    pub proof: Proof,
}

impl Verifier {
    pub fn verify_keccak256(&self) -> KeccakVerificationResult {
        let l_pub_out = self.setup_params.l_pub_out;
        let keccak_in_pts = &self.publicOutputBuffer.outPts;
        let keccak_out_pts = &self.publicInputBuffer.inPts;
        
        if keccak_out_pts.len() == 0 {
            return KeccakVerificationResult::NoKeccakData;
        }
        
        // Helper function to parse hex string to ScalarField
        let scalar_from_hex = |hex_str: &str| -> ScalarField {
            let hex = hex_str.trim_start_matches("0x");
            let hex_padded = if hex.len() % 2 == 1 {
                format!("0{}", hex)
            } else {
                hex.to_string()
            };
            let bytes = hex::decode(&hex_padded).expect("Invalid hex");
            ScalarField::from_be_bytes_mod_order(&bytes)
        };
        
        let mut keccak_inputs_be_bytes = Vec::new();
        let mut prev_key: usize = 0;
        let mut data_restored: Vec<u8> = Vec::new();
        
        for i in 0..keccak_in_pts.len()/2 {
            let keccak_in_lsb = &keccak_in_pts[2 * i];
            let keccak_in_msb = &keccak_in_pts[2 * i + 1];
            
            if keccak_in_lsb.extDest != "KeccakIn" || keccak_in_msb.extDest != "KeccakIn" {
                panic!("The pointed data is not a Keccak input.")
            }
            
            if scalar_from_hex(&keccak_in_lsb.valueHex) != self.a_pub[2 * i] 
                || scalar_from_hex(&keccak_in_msb.valueHex) != self.a_pub[2 * i + 1] {
                panic!("a_pub does not match with the publicOutputBuffer items.")
            }
            
            let this_key = usize::from_str_radix(&keccak_in_lsb.key.trim_start_matches("0x"), 16).unwrap();
            let _this_key = usize::from_str_radix(&keccak_in_msb.key.trim_start_matches("0x"), 16).unwrap();
            
            if this_key != _this_key {
                panic!("Pointed two keccak inputs have different key values")
            }
            
            let msb_string = keccak_in_msb.valueHex.trim_start_matches("0x");
            let lsb_string = keccak_in_lsb.valueHex.trim_start_matches("0x");
            let input_string = [msb_string.to_string(), lsb_string.to_string()].concat();
            let mut input_be_bytes = Vec::from_hex(&input_string).expect("Invalid hex");

            if this_key != prev_key {
                keccak_inputs_be_bytes.push(data_restored);
                data_restored = input_be_bytes.clone();
            } else {
                data_restored.append(&mut input_be_bytes);
            }
            prev_key = this_key;
        }
        keccak_inputs_be_bytes.push(data_restored);

        let mut keccak_outputs_be_bytes = Vec::new();
        let mut prev_key: usize = 0;
        let mut data_restored: Vec<u8> = Vec::new();
        
        for i in 0..keccak_out_pts.len()/2 {
            let keccak_out_lsb = &keccak_out_pts[2 * i];
            let keccak_out_msb = &keccak_out_pts[2 * i + 1];
            
            if keccak_out_lsb.extSource != "KeccakOut" || keccak_out_msb.extSource != "KeccakOut" {
                panic!("The pointed data is not a Keccak output.")
            }
            
            if scalar_from_hex(&keccak_out_lsb.valueHex) != self.a_pub[l_pub_out + 2 * i] 
                || scalar_from_hex(&keccak_out_msb.valueHex) != self.a_pub[l_pub_out + 2 * i + 1] {
                panic!("a_pub does not match with the publicInputBuffer items.")
            }
            
            let this_key = usize::from_str_radix(&keccak_out_lsb.key.trim_start_matches("0x"), 16).unwrap();
            let _this_key = usize::from_str_radix(&keccak_out_msb.key.trim_start_matches("0x"), 16).unwrap();
            
            if this_key != _this_key {
                panic!("Pointed two keccak outputs have different key values")
            }
            
            let msb_string = keccak_out_msb.valueHex.trim_start_matches("0x");
            let lsb_string = keccak_out_lsb.valueHex.trim_start_matches("0x");
            let output_string = [msb_string.to_string(), lsb_string.to_string()].concat();
            let mut output_be_bytes = Vec::from_hex(&output_string).expect("Invalid hex");

            if this_key != prev_key {
                keccak_outputs_be_bytes.push(data_restored);
                data_restored = output_be_bytes.clone();
            } else {
                data_restored.append(&mut output_be_bytes);
            }
            prev_key = this_key;
        }
        keccak_outputs_be_bytes.push(data_restored);

        // Use tiny-keccak instead of ICICLE Keccak256
        let mut flag = KeccakVerificationResult::True;
        if keccak_inputs_be_bytes.len() != keccak_outputs_be_bytes.len() {
            panic!("Length mismatch between Keccak inputs and outputs.")
        }
        
        for i in 0..keccak_inputs_be_bytes.len() {
            let data_in = &keccak_inputs_be_bytes[i];
            let mut keccak = Keccak::v256();
            let mut res_bytes = [0u8; 32];
            keccak.update(data_in);
            keccak.finalize(&mut res_bytes);
            
            if res_bytes.to_vec() != keccak_outputs_be_bytes[i] {
                flag = KeccakVerificationResult::False;
            }
        }
        
        return flag;
    }
    
    pub fn verify_snark(&self) -> bool {
        console_log!("\n=== WASM SNARK Verification ===");
        
        let binding = &self.proof.binding;
        let proof0 = &self.proof.proof0;
        let proof1 = &self.proof.proof1;
        let proof2 = &self.proof.proof2;
        let proof3 = &self.proof.proof3; 
        let proof4 = &self.proof.proof4;
        
        console_log!("\n--- Proof Points ---");
        console_log!("binding.A: x={:?}, y={:?}", binding.A.0.x, binding.A.0.y);
        console_log!("proof0.U: x={:?}, y={:?}", proof0.U.0.x, proof0.U.0.y);
        console_log!("proof0.V: x={:?}, y={:?}", proof0.V.0.x, proof0.V.0.y);
        console_log!("proof0.W: x={:?}, y={:?}", proof0.W.0.x, proof0.W.0.y);
        
        // TODO: Implement TranscriptManager for WASM
        // For now, use hardcoded challenges from native for comparison
        console_log!("WARNING: Using simplified verification without transcript manager");
        
        let m_i = self.setup_params.l_D - self.setup_params.l;
        let s_max = self.setup_params.s_max;
        
        // Use hardcoded omega values (matching ICICLE's ntt::get_root_of_unity)
        let omega_m_i = get_root_of_unity(m_i).expect("Failed to get omega_m_i");
        let omega_s_max = get_root_of_unity(s_max).expect("Failed to get omega_s_max");
        
        console_log!("\n--- Omega Values ---");
        console_log!("omega_m_i: {:?}", omega_m_i);
        console_log!("omega_s_max: {:?}", omega_s_max);
        
        // TODO: Full SNARK verification logic
        // This requires:
        // 1. Polynomial evaluation (DensePolynomialExt equivalent)
        // 2. Transcript manager for challenge generation
        // 3. All the verification equations
        
        console_log!("WASM SNARK verification not fully implemented yet");
        console_log!("=====================================\n");
        
        // Placeholder return
        return true;
    }
}

/// Get root of unity matching ICICLE's ntt::get_root_of_unity
fn get_root_of_unity(size: usize) -> Result<ScalarField, String> {
    match size {
        1024 => {
            // omega_1024 from native ICICLE
            let mut bytes = [0u8; 32];
            hex::decode_to_slice("2f27b09858f43cef3ed6d55a6350721d79efd6b0570bf109d58a5af42d010ff9", &mut bytes)
                .map_err(|e| format!("Failed to decode omega_1024: {:?}", e))?;
            bytes.reverse(); // Convert from big-endian to little-endian
            Ok(ScalarField::from_le_bytes_mod_order(&bytes))
        },
        512 => {
            // omega_512 from native ICICLE
            let mut bytes = [0u8; 32];
            hex::decode_to_slice("1bb466679a5d88b1ecfbede342dee7f415c1ad4c687f28a233811ea1fe0c65f4", &mut bytes)
                .map_err(|e| format!("Failed to decode omega_512: {:?}", e))?;
            bytes.reverse(); // Convert from big-endian to little-endian
            Ok(ScalarField::from_le_bytes_mod_order(&bytes))
        },
        _ => {
            // Fallback to Arkworks' root (may not match ICICLE)
            let domain = Radix2EvaluationDomain::<ScalarField>::new(size)
                .ok_or_else(|| "Failed to create evaluation domain".to_string())?;
            Ok(domain.group_gen())
        }
    }
}

// WASM exports will be added here



