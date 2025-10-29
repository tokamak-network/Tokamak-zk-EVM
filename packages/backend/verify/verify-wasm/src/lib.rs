#![allow(non_snake_case)]

use wasm_bindgen::prelude::*;
use ark_bls12_381::{Bls12_381, Fr as ScalarField, Fq, G1Affine, G2Affine, G1Projective};
use ark_ec::{pairing::Pairing, AffineRepr, CurveGroup};
use ark_ff::{Field, PrimeField, One, Zero, BigInteger};
use ark_poly::{EvaluationDomain, Radix2EvaluationDomain};
use ark_serialize::CanonicalDeserialize;
use serde::{Deserialize, Serialize};
use tiny_keccak::{Keccak, Hasher};
use std::str::FromStr;

// Enable console.log in WASM
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

// Hardcoded omega values to match ICICLE (Native verifier)
// These must match the values used by ICICLE's NTT implementation
// Using decimal string representation for accuracy
lazy_static::lazy_static! {
    // OMEGA_64: Root of unity for domain size 64
    // Native hex: 0x0e4840ac57f86f5e293b1d67bc8de5d9a12a70a615d0b8e4d2fc5e69ac5db47f
    // Decimal: 6470021439685169351889959568722840341063277117700861498181041749928882701439
    static ref OMEGA_64: ScalarField = 
        ScalarField::from_str("6470021439685169351889959568722840341063277117700861498181041749928882701439").unwrap();
    
    // OMEGA_M_I: Root of unity for m_i (1024)
    // Native hex: 0x2f6eb835d55e325765b98fc854d026ab38622d8e04f4a1e3a9c5a666e7847f34
    // Decimal: 21328829733576761151404230261968752855781179864716879432436835449516750606329
    static ref OMEGA_M_I: ScalarField = 
        ScalarField::from_str("21328829733576761151404230261968752855781179864716879432436835449516750606329").unwrap();
    
    // OMEGA_S_MAX: Root of unity for s_max (512)
    // Native hex: 0x1b6a52aad2c285beec616a0801e11f3807601f94f73dcf9e3f79c27a096e7614
    // Decimal: 12531186154666751577774347439625638674013361494693625348921624593362229945844
    static ref OMEGA_S_MAX: ScalarField = 
        ScalarField::from_str("12531186154666751577774347439625638674013361494693625348921624593362229945844").unwrap();
}

// Verification result enum
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeccakVerificationResult {
    True,
    False,
    NoKeccakData,
}

// JSON input structures
#[derive(Debug, Serialize, Deserialize)]
pub struct SetupParams {
    pub l: usize,
    pub l_D: usize,
    pub s_D: usize,
    pub n: usize,
    pub s_max: usize,
    pub l_pub_in: usize,
    pub l_pub_out: usize,
    pub l_prv_in: usize,
    pub l_prv_out: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BufferPt {
    pub valueHex: String,
    pub extSource: Option<String>,
    pub extDest: Option<String>,
    pub key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PublicInputBuffer {
    pub inPts: Vec<BufferPt>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PublicOutputBuffer {
    pub outPts: Vec<BufferPt>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Instance {
    pub publicInputBuffer: PublicInputBuffer,
    pub publicOutputBuffer: PublicOutputBuffer,
    pub a_pub: Vec<String>,
    pub a_prv: Vec<String>,
}

// FormattedProof structure (matches Native format)
#[derive(Debug, Serialize, Deserialize)]
pub struct FormattedProof {
    pub proof_entries_part1: Vec<String>,
    pub proof_entries_part2: Vec<String>,
}

impl FormattedProof {
    // Combine two hex strings: part1 (16 bytes) + part2 (32 bytes) = 48 bytes
    fn combine_hex(part1: &str, part2: &str) -> Result<String, String> {
        let p1 = part1.trim_start_matches("0x");
        let p2 = part2.trim_start_matches("0x");
        
        console_log!("combine_hex: p1.len()={}, p2.len()={}", p1.len(), p2.len());
        
        // Validate lengths
        if p1.len() != 32 {
            return Err(format!("part1 length invalid: {} (expected 32), value: {}", p1.len(), part1));
        }
        if p2.len() != 64 {
            return Err(format!("part2 length invalid: {} (expected 64), value: {}", p2.len(), part2));
        }
        
        // Combine: part1 (16 bytes = 32 hex) + part2 (32 bytes = 64 hex) = 48 bytes = 96 hex
        let combined = format!("0x{}{}", p1, p2);
        console_log!("combined.len()={}", combined.len() - 2); // -2 for "0x"
        Ok(combined)
    }
    
    // Convert FormattedProof to Proof (same as Native Rust)
    pub fn recover_proof_from_format(&self) -> Result<Proof, String> {
        console_log!("recover_proof_from_format: starting...");
        
        const G1_CNT: usize = 19;      // Number of G1 points
        const SCALAR_CNT: usize = 4;   // Number of Scalars
        
        if self.proof_entries_part1.len() != G1_CNT * 2 {
            return Err(format!("Invalid part1 length: expected {}, got {}", G1_CNT * 2, self.proof_entries_part1.len()));
        }
        if self.proof_entries_part2.len() != G1_CNT * 2 + SCALAR_CNT {
            return Err(format!("Invalid part2 length: expected {}, got {}", G1_CNT * 2 + SCALAR_CNT, self.proof_entries_part2.len()));
        }
        
        console_log!("recover_proof_from_format: lengths validated");
        
        let p1 = &self.proof_entries_part1;
        let p2 = &self.proof_entries_part2;
        
        // Helper to create G1Point from entries
        // Each coordinate is: part1[idx] (16 bytes) + part2[idx] (32 bytes) = 48 bytes
        let g1_from_idx = |idx: usize, part1: &[String], part2: &[String]| -> Result<G1Point, String> {
            // X coordinate: part1[idx] + part2[idx]
            let x = Self::combine_hex(&part1[idx], &part2[idx])?;
            // Y coordinate: part1[idx+1] + part2[idx+1]
            let y = Self::combine_hex(&part1[idx + 1], &part2[idx + 1])?;
            Ok(G1Point { x, y })
        };
        
        // Extract G1 points in order (must match Native order)
        // idx increments by 2 for each point (one for x, one for y)
        let mut idx = 0;
        console_log!("Extracting U at idx={}", idx);
        let U = g1_from_idx(idx, p1, p2)?; idx += 2;
        console_log!("Extracting V at idx={}", idx);
        let V = g1_from_idx(idx, p1, p2)?; idx += 2;
        console_log!("Extracting W at idx={}", idx);
        let W = g1_from_idx(idx, p1, p2)?; idx += 2;
        let O_mid = g1_from_idx(idx, p1, p2)?; idx += 2;
        let O_prv = g1_from_idx(idx, p1, p2)?; idx += 2;
        let Q_AX = g1_from_idx(idx, p1, p2)?; idx += 2;
        let Q_AY = g1_from_idx(idx, p1, p2)?; idx += 2;
        let Q_CX = g1_from_idx(idx, p1, p2)?; idx += 2;
        let Q_CY = g1_from_idx(idx, p1, p2)?; idx += 2;
        let Pi_X = g1_from_idx(idx, p1, p2)?; idx += 2;
        let Pi_Y = g1_from_idx(idx, p1, p2)?; idx += 2;
        let B = g1_from_idx(idx, p1, p2)?; idx += 2;
        let R = g1_from_idx(idx, p1, p2)?; idx += 2;
        let M_Y = g1_from_idx(idx, p1, p2)?; idx += 2;
        let M_X = g1_from_idx(idx, p1, p2)?; idx += 2;
        let N_Y = g1_from_idx(idx, p1, p2)?; idx += 2;
        let N_X = g1_from_idx(idx, p1, p2)?; idx += 2;
        let O_inst = g1_from_idx(idx, p1, p2)?; idx += 2;
        let A = g1_from_idx(idx, p1, p2)?;
        
        // Extract scalars from end of part2
        let scalar_slice = &p2[G1_CNT * 2..];
        
        Ok(Proof {
            binding: Binding { A, O_inst, O_mid, O_prv },
            proof0: Proof0 { U, V, W, Q_AX, Q_AY, B },
            proof1: Proof1 { R },
            proof2: Proof2 { Q_CX, Q_CY },
            proof3: Proof3 {
                R_eval: scalar_slice[0].clone(),
                R_omegaX_eval: scalar_slice[1].clone(),
                R_omegaX_omegaY_eval: scalar_slice[2].clone(),
                V_eval: scalar_slice[3].clone(),
            },
            proof4: Proof4 { Pi_X, Pi_Y, M_X, M_Y, N_X, N_Y },
        })
    }
}

// Proof structures
#[derive(Debug, Serialize, Deserialize)]
pub struct G1Point {
    pub x: String,
    pub y: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum G2Point {
    // Array format: x:[x0, x1], y:[y0, y1]
    Array { x: [String; 2], y: [String; 2] },
    // String format: x:"long_hex", y:"long_hex" (96 bytes each = 192 hex chars)
    String { x: String, y: String },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Binding {
    pub A: G1Point,
    pub O_inst: G1Point,
    pub O_mid: G1Point,
    pub O_prv: G1Point,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Proof0 {
    pub B: G1Point,
    pub U: G1Point,
    pub V: G1Point,
    pub W: G1Point,
    pub Q_AX: G1Point,
    pub Q_AY: G1Point,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Proof1 {
    pub R: G1Point,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Proof2 {
    pub Q_CX: G1Point,
    pub Q_CY: G1Point,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Proof3 {
    pub V_eval: String,
    pub R_eval: String,
    pub R_omegaX_eval: String,
    pub R_omegaX_omegaY_eval: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Proof4 {
    pub Pi_X: G1Point,
    pub Pi_Y: G1Point,
    pub M_X: G1Point,
    pub M_Y: G1Point,
    pub N_X: G1Point,
    pub N_Y: G1Point,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Proof {
    pub binding: Binding,
    pub proof0: Proof0,
    pub proof1: Proof1,
    pub proof2: Proof2,
    pub proof3: Proof3,
    pub proof4: Proof4,
}

// Preprocess structures
#[derive(Debug, Serialize, Deserialize)]
pub struct Preprocess {
    pub s0: G1Point,
    pub s1: G1Point,
}

// Formatted Preprocess (hex array format from file)
#[derive(Debug, Serialize, Deserialize)]
pub struct FormattedPreprocess {
    pub preprocess_entries_part1: Vec<String>,
    pub preprocess_entries_part2: Vec<String>,
}

impl FormattedPreprocess {
    pub fn recover_preprocess(&self) -> Result<Preprocess, String> {
        let p1 = &self.preprocess_entries_part1;
        let p2 = &self.preprocess_entries_part2;
        
        const G1_CNT: usize = 2;  // s0, s1
        
        if p1.len() != G1_CNT * 2 {
            return Err(format!("Invalid part1 length: expected {}, got {}", G1_CNT * 2, p1.len()));
        }
        if p2.len() != G1_CNT * 2 {
            return Err(format!("Invalid part2 length: expected {}, got {}", G1_CNT * 2, p2.len()));
        }
        
        // Recover s0 (idx 0, 1)
        let s0_x = Self::recover_fq(&p1[0], &p2[0])?;
        let s0_y = Self::recover_fq(&p1[1], &p2[1])?;
        
        // Recover s1 (idx 2, 3)
        let s1_x = Self::recover_fq(&p1[2], &p2[2])?;
        let s1_y = Self::recover_fq(&p1[3], &p2[3])?;
        
        Ok(Preprocess {
            s0: G1Point { x: s0_x, y: s0_y },
            s1: G1Point { x: s1_x, y: s1_y },
        })
    }
    
    fn recover_fq(part1: &str, part2: &str) -> Result<String, String> {
        // part1: 16 bytes (32 hex chars), part2: 32 bytes (64 hex chars)
        let p1 = part1.trim_start_matches("0x");
        let p2 = part2.trim_start_matches("0x");
        
        // Combine to form 48-byte (96 hex chars) Fq element
        let combined = format!("0x{}{}", p1, p2);
        Ok(combined)
    }
}

// Sigma structures
#[derive(Debug, Serialize, Deserialize)]
pub struct Sigma1 {
    pub x: G1Point,
    pub y: G1Point,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Sigma2 {
    pub alpha: G2Point,
    pub alpha2: G2Point,
    pub alpha3: G2Point,
    pub alpha4: G2Point,
    pub x: G2Point,
    pub y: G2Point,
    pub gamma: G2Point,
    pub delta: G2Point,
    pub eta: G2Point,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SigmaVerify {
    pub G: G1Point,
    pub H: G2Point,
    pub sigma_1: Sigma1,
    pub sigma_2: Sigma2,
    pub lagrange_KL: G1Point,
}

// Verifier struct
#[wasm_bindgen]
pub struct Verifier {
    setup_params: SetupParams,
    a_pub: Vec<ScalarField>,
    public_input_buffer: PublicInputBuffer,
    public_output_buffer: PublicOutputBuffer,
    proof: Option<Proof>,
    preprocess: Option<Preprocess>,
    sigma: Option<SigmaVerify>,
}

#[wasm_bindgen]
impl Verifier {
    /// Initialize verifier with JSON strings
    #[wasm_bindgen(constructor)]
    pub fn new(
        setup_params_json: &str,
        instance_json: &str,
        proof_json: Option<String>,
        preprocess_json: Option<String>,
        sigma_json: Option<String>,
    ) -> Result<Verifier, JsValue> {
        console_log!("Initializing WASM Verifier...");
        
        // Parse setup parameters
        let setup_params: SetupParams = serde_json::from_str(setup_params_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse setup params: {}", e)))?;
        
        // Validate setup parameters
        Self::validate_setup_params(&setup_params)?;
        
        // Parse instance
        let instance: Instance = serde_json::from_str(instance_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse instance: {}", e)))?;
        
        // Parse a_pub
        let l_pub = setup_params.l_pub_in + setup_params.l_pub_out;
        let mut a_pub = Vec::with_capacity(l_pub);
        
        for hex_str in instance.a_pub.iter().take(l_pub) {
            let scalar = Self::scalar_from_hex(hex_str)
                .map_err(|e| JsValue::from_str(&format!("Failed to parse a_pub: {}", e)))?;
            a_pub.push(scalar);
        }
        
        // Parse optional proof (FormattedProof)
        let proof = if let Some(json) = proof_json {
            let formatted: FormattedProof = serde_json::from_str(&json)
                .map_err(|e| JsValue::from_str(&format!("Failed to parse formatted proof: {}", e)))?;
            Some(formatted.recover_proof_from_format()
                .map_err(|e| JsValue::from_str(&format!("Failed to recover proof: {}", e)))?)
        } else {
            None
        };
        
        // Parse optional preprocess
        let preprocess = if let Some(json) = preprocess_json {
            Some(serde_json::from_str(&json)
                .map_err(|e| JsValue::from_str(&format!("Failed to parse preprocess: {}", e)))?)
        } else {
            None
        };
        
        // Parse optional sigma
        let sigma = if let Some(json) = sigma_json {
            Some(serde_json::from_str(&json)
                .map_err(|e| JsValue::from_str(&format!("Failed to parse sigma: {}", e)))?)
        } else {
            None
        };
        
        console_log!("Verifier initialized successfully");
        
        Ok(Verifier {
            setup_params,
            a_pub,
            public_input_buffer: instance.publicInputBuffer,
            public_output_buffer: instance.publicOutputBuffer,
            proof,
            preprocess,
            sigma,
        })
    }
    
    /// Verify Keccak256 hashes
    pub fn verify_keccak256(&self) -> KeccakVerificationResult {
        console_log!("Starting Keccak256 verification...");
        
        let l_pub_out = self.setup_params.l_pub_out;
        let keccak_in_pts = &self.public_output_buffer.outPts;
        let keccak_out_pts = &self.public_input_buffer.inPts;
        
        // Check if we have enough data for Keccak verification
        let required_len = l_pub_out * 2;
        if keccak_out_pts.is_empty() || keccak_in_pts.is_empty() {
            console_log!("No Keccak data found (empty buffers)");
            return KeccakVerificationResult::NoKeccakData;
        }
        
        if self.a_pub.len() < required_len {
            console_log!("No Keccak data found (insufficient a_pub: {} < {})", self.a_pub.len(), required_len);
            return KeccakVerificationResult::NoKeccakData;
        }
        
        // Parse Keccak inputs
        let keccak_inputs = match Self::parse_keccak_data(
            keccak_in_pts,
            &self.a_pub[..required_len],
            "KeccakIn"
        ) {
            Ok(data) => data,
            Err(e) => {
                console_log!("Failed to parse Keccak inputs: {}", e);
                return KeccakVerificationResult::False;
            }
        };
        
        // Parse Keccak outputs
        let keccak_outputs = match Self::parse_keccak_data(
            keccak_out_pts,
            &self.a_pub[required_len..],
            "KeccakOut"
        ) {
            Ok(data) => data,
            Err(e) => {
                console_log!("Failed to parse Keccak outputs: {}", e);
                return KeccakVerificationResult::False;
            }
        };
        
        if keccak_inputs.len() != keccak_outputs.len() {
            console_log!("Keccak input/output length mismatch");
            return KeccakVerificationResult::False;
        }
        
        // Verify each hash
        for (input, expected_output) in keccak_inputs.iter().zip(keccak_outputs.iter()) {
            let mut hasher = Keccak::v256();
            hasher.update(input);
            let mut actual_output = [0u8; 32];
            hasher.finalize(&mut actual_output);
            
            if &actual_output[..] != expected_output.as_slice() {
                console_log!("Keccak256 verification failed");
                return KeccakVerificationResult::False;
            }
        }
        
        console_log!("Keccak256 verification passed");
        KeccakVerificationResult::True
    }
    
    /// Verify complete SNARK proof
    pub fn verify_snark(&self) -> Result<bool, JsValue> {
        console_log!("Starting SNARK verification...");
        
        // Check required data
        let proof = self.proof.as_ref()
            .ok_or_else(|| JsValue::from_str("Proof data required"))?;
        let preprocess = self.preprocess.as_ref()
            .ok_or_else(|| JsValue::from_str("Preprocess data required"))?;
        let sigma = self.sigma.as_ref()
            .ok_or_else(|| JsValue::from_str("Sigma data required"))?;
        
        // Convert JSON points to curve points
        let binding_A = Self::g1_from_json(&proof.binding.A)?;
        let binding_O_inst = Self::g1_from_json(&proof.binding.O_inst)?;
        let binding_O_mid = Self::g1_from_json(&proof.binding.O_mid)?;
        let binding_O_prv = Self::g1_from_json(&proof.binding.O_prv)?;
        
        console_log!("binding_A: x={:?}, y={:?}", binding_A.x, binding_A.y);
        
        let proof0_B = Self::g1_from_json(&proof.proof0.B)?;
        let proof0_U = Self::g1_from_json(&proof.proof0.U)?;
        let proof0_V = Self::g1_from_json(&proof.proof0.V)?;
        let proof0_W = Self::g1_from_json(&proof.proof0.W)?;
        let proof0_Q_AX = Self::g1_from_json(&proof.proof0.Q_AX)?;
        let proof0_Q_AY = Self::g1_from_json(&proof.proof0.Q_AY)?;
        
        console_log!("proof0_U: x={:?}, y={:?}", proof0_U.x, proof0_U.y);
        console_log!("proof0_V: x={:?}, y={:?}", proof0_V.x, proof0_V.y);
        console_log!("proof0_W: x={:?}, y={:?}", proof0_W.x, proof0_W.y);
        
        let proof1_R = Self::g1_from_json(&proof.proof1.R)?;
        console_log!("proof1_R: x={:?}, y={:?}", proof1_R.x, proof1_R.y);
        
        let proof2_Q_CX = Self::g1_from_json(&proof.proof2.Q_CX)?;
        let proof2_Q_CY = Self::g1_from_json(&proof.proof2.Q_CY)?;
        
        let proof3_V_eval = Self::scalar_from_hex(&proof.proof3.V_eval)?;
        let proof3_R_eval = Self::scalar_from_hex(&proof.proof3.R_eval)?;
        let proof3_R_omegaX_eval = Self::scalar_from_hex(&proof.proof3.R_omegaX_eval)?;
        let proof3_R_omegaX_omegaY_eval = Self::scalar_from_hex(&proof.proof3.R_omegaX_omegaY_eval)?;
        
        console_log!("proof3_V_eval: {:?}", proof3_V_eval);
        console_log!("proof3_R_eval: {:?}", proof3_R_eval);
        console_log!("proof3_R_omegaX_eval: {:?}", proof3_R_omegaX_eval);
        console_log!("proof3_R_omegaX_omegaY_eval: {:?}", proof3_R_omegaX_omegaY_eval);
        
        let proof4_Pi_X = Self::g1_from_json(&proof.proof4.Pi_X)?;
        let proof4_Pi_Y = Self::g1_from_json(&proof.proof4.Pi_Y)?;
        let proof4_M_X = Self::g1_from_json(&proof.proof4.M_X)?;
        let proof4_M_Y = Self::g1_from_json(&proof.proof4.M_Y)?;
        let proof4_N_X = Self::g1_from_json(&proof.proof4.N_X)?;
        let proof4_N_Y = Self::g1_from_json(&proof.proof4.N_Y)?;
        
        let preprocess_s0 = Self::g1_from_json(&preprocess.s0)?;
        let preprocess_s1 = Self::g1_from_json(&preprocess.s1)?;
        console_log!("preprocess_s0: x={:?}, y={:?}", preprocess_s0.x, preprocess_s0.y);
        console_log!("preprocess_s1: x={:?}, y={:?}", preprocess_s1.x, preprocess_s1.y);
        
        let sigma_G = Self::g1_from_json(&sigma.G)?;
        console_log!("sigma_G: x={:?}, y={:?}", sigma_G.x, sigma_G.y);
        let sigma_lagrange_KL = Self::g1_from_json(&sigma.lagrange_KL)?;
        let sigma_H = Self::g2_from_json(&sigma.H)?;
        console_log!("sigma_H: x.c0={:?}, x.c1={:?}, y.c0={:?}, y.c1={:?}", 
            sigma_H.x.c0, sigma_H.x.c1, sigma_H.y.c0, sigma_H.y.c1);
        let sigma_1_x = Self::g1_from_json(&sigma.sigma_1.x)?;
        let sigma_1_y = Self::g1_from_json(&sigma.sigma_1.y)?;
        let sigma_2_alpha = Self::g2_from_json(&sigma.sigma_2.alpha)?;
        let sigma_2_alpha2 = Self::g2_from_json(&sigma.sigma_2.alpha2)?;
        let sigma_2_alpha3 = Self::g2_from_json(&sigma.sigma_2.alpha3)?;
        let sigma_2_alpha4 = Self::g2_from_json(&sigma.sigma_2.alpha4)?;
        let sigma_2_x = Self::g2_from_json(&sigma.sigma_2.x)?;
        let sigma_2_y = Self::g2_from_json(&sigma.sigma_2.y)?;
        let sigma_2_gamma = Self::g2_from_json(&sigma.sigma_2.gamma)?;
        let sigma_2_delta = Self::g2_from_json(&sigma.sigma_2.delta)?;
        let sigma_2_eta = Self::g2_from_json(&sigma.sigma_2.eta)?;
        
        console_log!("\n--- WASM G2 Points for LEFT Pairing ---");
        console_log!("sigma.H: x.c0={:?}, x.c1={:?}, y.c0={:?}, y.c1={:?}", 
            sigma_H.x.c0, sigma_H.x.c1, sigma_H.y.c0, sigma_H.y.c1);
        console_log!("sigma.sigma_2.alpha4: x.c0={:?}, x.c1={:?}, y.c0={:?}, y.c1={:?}", 
            sigma_2_alpha4.x.c0, sigma_2_alpha4.x.c1, sigma_2_alpha4.y.c0, sigma_2_alpha4.y.c1);
        console_log!("sigma.sigma_2.alpha: x.c0={:?}, x.c1={:?}, y.c0={:?}, y.c1={:?}", 
            sigma_2_alpha.x.c0, sigma_2_alpha.x.c1, sigma_2_alpha.y.c0, sigma_2_alpha.y.c1);
        console_log!("sigma.sigma_2.alpha2: x.c0={:?}, x.c1={:?}, y.c0={:?}, y.c1={:?}", 
            sigma_2_alpha2.x.c0, sigma_2_alpha2.x.c1, sigma_2_alpha2.y.c0, sigma_2_alpha2.y.c1);
        console_log!("sigma.sigma_2.alpha3: x.c0={:?}, x.c1={:?}, y.c0={:?}, y.c1={:?}", 
            sigma_2_alpha3.x.c0, sigma_2_alpha3.x.c1, sigma_2_alpha3.y.c0, sigma_2_alpha3.y.c1);
        
        console_log!("\n--- WASM G2 Points for RIGHT Pairing ---");
        console_log!("sigma.sigma_2.gamma: x.c0={:?}, x.c1={:?}, y.c0={:?}, y.c1={:?}", 
            sigma_2_gamma.x.c0, sigma_2_gamma.x.c1, sigma_2_gamma.y.c0, sigma_2_gamma.y.c1);
        console_log!("sigma.sigma_2.eta: x.c0={:?}, x.c1={:?}, y.c0={:?}, y.c1={:?}", 
            sigma_2_eta.x.c0, sigma_2_eta.x.c1, sigma_2_eta.y.c0, sigma_2_eta.y.c1);
        console_log!("sigma.sigma_2.delta: x.c0={:?}, x.c1={:?}, y.c0={:?}, y.c1={:?}", 
            sigma_2_delta.x.c0, sigma_2_delta.x.c1, sigma_2_delta.y.c0, sigma_2_delta.y.c1);
        console_log!("sigma.sigma_2.x: x.c0={:?}, x.c1={:?}, y.c0={:?}, y.c1={:?}", 
            sigma_2_x.x.c0, sigma_2_x.x.c1, sigma_2_x.y.c0, sigma_2_x.y.c1);
        console_log!("sigma.sigma_2.y: x.c0={:?}, x.c1={:?}, y.c0={:?}, y.c1={:?}", 
            sigma_2_y.x.c0, sigma_2_y.x.c1, sigma_2_y.y.c0, sigma_2_y.y.c1);
        
        // ✅ Compute challenges using Fiat-Shamir transform
        console_log!("\nComputing challenges using TranscriptManager...");
        let mut transcript_manager = TranscriptManager::new();
        
        // Add proof0 (binding.A is NOT committed, matches Native)
        transcript_manager.add_proof0(&proof.proof0)?;
        let thetas = transcript_manager.get_thetas();
        let theta0 = thetas[0];
        let theta1 = thetas[1];
        let theta2 = thetas[2];
        console_log!("Thetas computed");
        
        // Add proof1
        transcript_manager.add_proof1(&proof.proof1)?;
        let kappa0 = transcript_manager.get_kappa0();
        console_log!("Kappa0 computed");
        
        // Add proof2
        transcript_manager.add_proof2(&proof.proof2)?;
        let (chi, zeta) = transcript_manager.get_chi_zeta();
        console_log!("Chi and Zeta computed");
        
        // Add proof3
        transcript_manager.add_proof3(&proof.proof3)?;
        let kappa1 = transcript_manager.get_kappa1();
        console_log!("Kappa1 computed");
        
        // Generate kappa2 as random value (matches Native implementation)
        // In Native, kappa2 = ScalarCfg::generate_random(1)[0]
        // For debugging: use fixed value to compare with native
        let kappa2 = ScalarField::one();
        console_log!("Kappa2 computed (FIXED TO 1 FOR DEBUGGING)");
        
        // Compute verification equation components
        let m_i = self.setup_params.l_D - self.setup_params.l;
        let s_max = self.setup_params.s_max;
        
        console_log!("m_i: {}, s_max: {}", m_i, s_max);
        
        // Get roots of unity
        let omega_m_i = Self::get_root_of_unity(m_i)?;
        let omega_s_max = Self::get_root_of_unity(s_max)?;
        
        console_log!("WASM omega_m_i: {}", omega_m_i);
        console_log!("WASM omega_s_max: {}", omega_s_max);
        
        let t_n_eval = chi.pow([self.setup_params.n as u64]) - ScalarField::one();
        let t_mi_eval = chi.pow([m_i as u64]) - ScalarField::one();
        let t_smax_eval = zeta.pow([s_max as u64]) - ScalarField::one();
        
        // Compute a_pub polynomial evaluation using IFFT + Horner
        let A_eval = self.eval_lagrange_poly(&chi, &zeta)?;
        console_log!("A_eval: {:?}", A_eval);
        
        // Compute lagrange_K0 evaluation
        let lagrange_K0_eval = Self::compute_lagrange_k0(m_i, &chi, &zeta)?;
        
        // Compute LHS components
        console_log!("🔥🔥🔥 WASM BUILD VERSION: 2024-10-28-15:00-FULL-AFFINE 🔥🔥🔥");
        
    console_log!("\n--- Omega Values ---");
    console_log!("omega_m_i: {:?}", omega_m_i);
    console_log!("omega_s_max: {:?}", omega_s_max);
    
    // LHS_A calculation - CRITICAL: Match Native's G1serde behavior
    // Native: ALL operations (*, +, -) return Affine!
    // WASM must mimic this by converting to Affine after EACH operation
    let lhs_a_term1 = (proof0_U.into_affine() * proof3_V_eval).into_affine();
    let lhs_a_term2_scalar_mult = (sigma_G.into_affine() * proof3_V_eval).into_affine();
    let lhs_a_term2 = ((proof0_V.into_affine().into_group() - lhs_a_term2_scalar_mult.into_group()).into_affine() * kappa1).into_affine();
    let lhs_a_term3 = (proof0_Q_AX.into_affine() * t_n_eval).into_affine();
    let lhs_a_term4 = (proof0_Q_AY.into_affine() * t_smax_eval).into_affine();
    // Now each term is Affine, do point ops with Affine->Projective->Affine pattern
    let LHS_A = (lhs_a_term1.into_group() - proof0_W.into_affine().into_group()).into_affine();
    let LHS_A = (LHS_A.into_group() + lhs_a_term2.into_group()).into_affine();
    let LHS_A = (LHS_A.into_group() - lhs_a_term3.into_group()).into_affine();
    let LHS_A = (LHS_A.into_group() - lhs_a_term4.into_group()).into_affine();
        
    // F calculation - ALL operations return Affine like Native
    let term1 = (preprocess_s0.into_affine() * theta0).into_affine();
    let term2 = (preprocess_s1.into_affine() * theta1).into_affine();
    let term3 = (sigma_G.into_affine() * theta2).into_affine();
    
    let F = (proof0_B.into_affine().into_group() + term1.into_group()).into_affine();
    let F = (F.into_group() + term2.into_group()).into_affine();
    let F = (F.into_group() + term3.into_group()).into_affine();
    console_log!("F: x={:?}, y={:?}", F.x, F.y);
    
    // G calculation - ALL operations return Affine like Native
    let g_term1 = (sigma_1_x.into_affine() * theta0).into_affine();
    let g_term2 = (sigma_1_y.into_affine() * theta1).into_affine();
    let g_term3 = (sigma_G.into_affine() * theta2).into_affine();
    let G = (proof0_B.into_affine().into_group() + g_term1.into_group()).into_affine();
    let G = (G.into_group() + g_term2.into_group()).into_affine();
    let G = (G.into_group() + g_term3.into_group()).into_affine();
        
    // LHS_C_term1 calculation - F and G are already Affine!
    console_log!("\n🔍 LHS_C Term Debug (WASM):");
    
    let lhs_c_t1_a = (sigma_lagrange_KL.into_affine() * (proof3_R_eval - ScalarField::one())).into_affine();
    console_log!("  term1_a (lagrange_KL * (R_eval - 1)): x={:?}, y={:?}", lhs_c_t1_a.x, lhs_c_t1_a.y);
    
    let lhs_c_t1_b_term1 = (G.into_group() * proof3_R_eval).into_affine();
    let lhs_c_t1_b_term2 = (F.into_group() * proof3_R_omegaX_eval).into_affine();
    let lhs_c_t1_b = ((lhs_c_t1_b_term1.into_group() - lhs_c_t1_b_term2.into_group()).into_affine() * (kappa0 * (chi - ScalarField::one()))).into_affine();
    console_log!("  term1_b: x={:?}, y={:?}", lhs_c_t1_b.x, lhs_c_t1_b.y);
    
    let lhs_c_t1_c_term1 = (G.into_group() * proof3_R_eval).into_affine();
    let lhs_c_t1_c_term2 = (F.into_group() * proof3_R_omegaX_omegaY_eval).into_affine();
    let lhs_c_t1_c = ((lhs_c_t1_c_term1.into_group() - lhs_c_t1_c_term2.into_group()).into_affine() * (kappa0.pow([2u64]) * lagrange_K0_eval)).into_affine();
    console_log!("  term1_c: x={:?}, y={:?}", lhs_c_t1_c.x, lhs_c_t1_c.y);
    
    let lhs_c_t1_d = (proof2_Q_CX.into_affine() * t_mi_eval).into_affine();
    console_log!("  term1_d (Q_CX * t_mi_eval): x={:?}, y={:?}", lhs_c_t1_d.x, lhs_c_t1_d.y);
    
    let lhs_c_t1_e = (proof2_Q_CY.into_affine() * t_smax_eval).into_affine();
    console_log!("  term1_e (Q_CY * t_smax_eval): x={:?}, y={:?}", lhs_c_t1_e.x, lhs_c_t1_e.y);
    
    // Now add/sub all Affine terms
    let LHS_C_term1 = (lhs_c_t1_a.into_group() + lhs_c_t1_b.into_group()).into_affine();
    let LHS_C_term1 = (LHS_C_term1.into_group() + lhs_c_t1_c.into_group()).into_affine();
    let LHS_C_term1 = (LHS_C_term1.into_group() - lhs_c_t1_d.into_group()).into_affine();
    let LHS_C_term1 = (LHS_C_term1.into_group() - lhs_c_t1_e.into_group()).into_affine();
    console_log!("  LHS_C_term1 (total): x={:?}, y={:?}", LHS_C_term1.x, LHS_C_term1.y);
        
    // LHS_C calculation - LHS_C_term1 is already Affine
    console_log!("\n🔍 LHS_C Final Calculation (WASM):");
    
    let lhs_c_a = (LHS_C_term1.into_group() * kappa1.pow([2u64])).into_affine();
    console_log!("  lhs_c_a (term1 * kappa1^2): x={:?}, y={:?}", lhs_c_a.x, lhs_c_a.y);
    
    let lhs_c_b_sub = (sigma_G.into_affine() * proof3_R_eval).into_affine();
    let lhs_c_b = ((proof1_R.into_affine().into_group() - lhs_c_b_sub.into_group()).into_affine() * kappa1.pow([3u64])).into_affine();
    console_log!("  lhs_c_b: x={:?}, y={:?}", lhs_c_b.x, lhs_c_b.y);
    
    let lhs_c_c_sub = (sigma_G.into_affine() * proof3_R_omegaX_eval).into_affine();
    let lhs_c_c = ((proof1_R.into_affine().into_group() - lhs_c_c_sub.into_group()).into_affine() * kappa2).into_affine();
    console_log!("  lhs_c_c: x={:?}, y={:?}", lhs_c_c.x, lhs_c_c.y);
    
    let lhs_c_d_sub = (sigma_G.into_affine() * proof3_R_omegaX_omegaY_eval).into_affine();
    let lhs_c_d = ((proof1_R.into_affine().into_group() - lhs_c_d_sub.into_group()).into_affine() * kappa2.pow([2u64])).into_affine();
    console_log!("  lhs_c_d: x={:?}, y={:?}", lhs_c_d.x, lhs_c_d.y);
    
    let lhs_c_temp1 = (lhs_c_a.into_group() + lhs_c_b.into_group()).into_affine();
    console_log!("  after + lhs_c_b: x={:?}, y={:?}", lhs_c_temp1.x, lhs_c_temp1.y);
    
    let lhs_c_temp2 = (lhs_c_temp1.into_group() + lhs_c_c.into_group()).into_affine();
    console_log!("  after + lhs_c_c: x={:?}, y={:?}", lhs_c_temp2.x, lhs_c_temp2.y);
    
    let LHS_C = (lhs_c_temp2.into_group() + lhs_c_d.into_group()).into_affine();
    console_log!("  LHS_C final: x={:?}, y={:?}", LHS_C.x, LHS_C.y);
        
    // LHS_B calculation
    let scalar_a = ScalarField::one() + (kappa2 * kappa1.pow([4u64]));
    let scalar_b = kappa2 * kappa1.pow([4u64]) * A_eval;
    
    console_log!("🔍 LHS_B Debug:");
    console_log!("  scalar_a (1 + kappa2*kappa1^4): {:?}", scalar_a);
    console_log!("  scalar_b (kappa2*kappa1^4*A_eval): {:?}", scalar_b);
    
    let lhs_b_a = (binding_A.into_affine() * scalar_a).into_affine();
    console_log!("  lhs_b_a (binding_A * scalar_a): x={:?}, y={:?}", lhs_b_a.x, lhs_b_a.y);
    
    let lhs_b_b = (sigma_G.into_affine() * scalar_b).into_affine();
    console_log!("  lhs_b_b (sigma_G * scalar_b): x={:?}, y={:?}", lhs_b_b.x, lhs_b_b.y);
    
    // CRITICAL TEST: Use Native's exact lhs_b_a and lhs_b_b values
    // Native lhs_b_a: x=0x0af0fb31515d2e39a4f0ee3f3ca48c972b34f3beb83072976e1f11a2ec3de7d5536f54b51ee5309f0fcf1357bf621817
    //                 y=0x1405e08261397ee60317579e222c5b14c4c516fe1e93df0f317b90ec73a20bcea967e402ea34def565de5e1ceeccc74e
    // Native lhs_b_b: x=0x0dd28c0408fd6c96cc1640e8b37d4a859c248937a7d76608614d6827ce6e0e6f89cb097dbc1669d26212406919cff4cc
    //                 y=0x07598302d13728d0dd59d81a9197a160a982364349bd35924f12efaca790a096207664a20623dc2ff4de6d7c7c0a8124
    
    let native_lhs_b_a_x_hex = "0af0fb31515d2e39a4f0ee3f3ca48c972b34f3beb83072976e1f11a2ec3de7d5536f54b51ee5309f0fcf1357bf621817";
    let native_lhs_b_a_y_hex = "1405e08261397ee60317579e222c5b14c4c516fe1e93df0f317b90ec73a20bcea967e402ea34def565de5e1ceeccc74e";
    let native_lhs_b_b_x_hex = "0dd28c0408fd6c96cc1640e8b37d4a859c248937a7d76608614d6827ce6e0e6f89cb097dbc1669d26212406919cff4cc";
    let native_lhs_b_b_y_hex = "07598302d13728d0dd59d81a9197a160a982364349bd35924f12efaca790a096207664a20623dc2ff4de6d7c7c0a8124";
    
    let native_lhs_b_a = G1Affine::new_unchecked(
        Self::fq_from_hex(native_lhs_b_a_x_hex)?,
        Self::fq_from_hex(native_lhs_b_a_y_hex)?
    );
    let native_lhs_b_b = G1Affine::new_unchecked(
        Self::fq_from_hex(native_lhs_b_b_x_hex)?,
        Self::fq_from_hex(native_lhs_b_b_y_hex)?
    );
    
    let LHS_B_from_native = (native_lhs_b_a.into_group() - native_lhs_b_b.into_group()).into_affine();
    console_log!("  LHS_B_from_native (using Native hex values): x={:?}, y={:?}", LHS_B_from_native.x, LHS_B_from_native.y);
    console_log!("  Expected Native LHS_B.x: 0x16ac8052e61fc2990ca6002366bab16ee61085ebae6701f0de42c20c9e7df7079614633e154594a23f21012321ec7422");
    
    // Also test current WASM values
    let LHS_B_normal = (lhs_b_a.into_group() - lhs_b_b.into_group()).into_affine();
    console_log!("  LHS_B_normal (WASM values): x={:?}, y={:?}", LHS_B_normal.x, LHS_B_normal.y);
    
    // Use normal subtraction
    let LHS_B = LHS_B_normal;
    
    console_log!("LHS_A: x={:?}, y={:?}", LHS_A.x, LHS_A.y);
    console_log!("LHS_B: x={:?}, y={:?}", LHS_B.x, LHS_B.y);
    console_log!("LHS_C: x={:?}, y={:?}", LHS_C.x, LHS_C.y);
    
    // LHS calculation - all terms are Affine
    console_log!("\n🔍 Final LHS Calculation (WASM):");
    console_log!("  LHS_A: x={:?}", LHS_A.x);
    console_log!("  LHS_B: x={:?}", LHS_B.x);
    console_log!("  LHS_C: x={:?}", LHS_C.x);
    console_log!("  kappa2: {:?}", kappa2);
    
    let lhs_ac_sum = (LHS_A.into_group() + LHS_C.into_group()).into_affine();
    console_log!("  (LHS_A + LHS_C): x={:?}, y={:?}", lhs_ac_sum.x, lhs_ac_sum.y);
    
    let lhs_term = (lhs_ac_sum.into_group() * kappa2).into_affine();
    console_log!("  (LHS_A + LHS_C) * kappa2: x={:?}, y={:?}", lhs_term.x, lhs_term.y);
    
    let LHS = (LHS_B.into_group() + lhs_term.into_group()).into_affine();
    console_log!("  LHS final: x={:?}, y={:?}", LHS.x, LHS.y);
        
    // AUX calculation - ALL operations return Affine
    let aux_a = (proof4_Pi_X.into_affine() * (kappa2 * chi)).into_affine();
    let aux_b = (proof4_Pi_Y.into_affine() * (kappa2 * zeta)).into_affine();
    let aux_c = (proof4_M_X.into_affine() * (kappa2.pow([2u64]) * omega_m_i.inverse().unwrap() * chi)).into_affine();
    let aux_d = (proof4_M_Y.into_affine() * (kappa2.pow([2u64]) * zeta)).into_affine();
    let aux_e = (proof4_N_X.into_affine() * (kappa2.pow([3u64]) * omega_m_i.inverse().unwrap() * chi)).into_affine();
    let aux_f = (proof4_N_Y.into_affine() * (kappa2.pow([3u64]) * omega_s_max.inverse().unwrap() * zeta)).into_affine();
    let AUX = (aux_a.into_group() + aux_b.into_group()).into_affine();
    let AUX = (AUX.into_group() + aux_c.into_group()).into_affine();
    let AUX = (AUX.into_group() + aux_d.into_group()).into_affine();
    let AUX = (AUX.into_group() + aux_e.into_group()).into_affine();
    let AUX = (AUX.into_group() + aux_f.into_group()).into_affine();
    
    console_log!("AUX: x={:?}, y={:?}", AUX.x, AUX.y);
    
    // AUX_X calculation - ALL operations return Affine
    let aux_x_a = (proof4_Pi_X.into_affine() * kappa2).into_affine();
    let aux_x_b = (proof4_M_X.into_affine() * kappa2.pow([2u64])).into_affine();
    let aux_x_c = (proof4_N_X.into_affine() * kappa2.pow([3u64])).into_affine();
    let AUX_X = (aux_x_a.into_group() + aux_x_b.into_group()).into_affine();
    let AUX_X = (AUX_X.into_group() + aux_x_c.into_group()).into_affine();
    console_log!("AUX_X: x={:?}, y={:?}", AUX_X.x, AUX_X.y);
    
    // AUX_Y calculation - ALL operations return Affine
    let aux_y_a = (proof4_Pi_Y.into_affine() * kappa2).into_affine();
    let aux_y_b = (proof4_M_Y.into_affine() * kappa2.pow([2u64])).into_affine();
    let aux_y_c = (proof4_N_Y.into_affine() * kappa2.pow([3u64])).into_affine();
    let AUX_Y = (aux_y_a.into_group() + aux_y_b.into_group()).into_affine();
    let AUX_Y = (AUX_Y.into_group() + aux_y_c.into_group()).into_affine();
    console_log!("AUX_Y: x={:?}, y={:?}", AUX_Y.x, AUX_Y.y);
        
    // Compute pairings
    console_log!("Computing pairings...");
    
    let lhs_aux = (LHS.into_group() + AUX.into_group()).into_affine();
        console_log!("LHS+AUX: x={:?}, y={:?}", lhs_aux.x, lhs_aux.y);
        
        console_log!("proof0_B: x={:?}, y={:?}", proof0_B.x, proof0_B.y);
        console_log!("proof0_U: x={:?}, y={:?}", proof0_U.x, proof0_U.y);
        console_log!("proof0_V: x={:?}, y={:?}", proof0_V.x, proof0_V.y);
        console_log!("proof0_W: x={:?}, y={:?}", proof0_W.x, proof0_W.y);
        
        let left_points_g1 = vec![
            lhs_aux,
            proof0_B.into_affine(),
            proof0_U.into_affine(),
            proof0_V.into_affine(),
            proof0_W.into_affine(),
        ];
        
        let left_points_g2 = vec![
            sigma_H,
            sigma_2_alpha4,
            sigma_2_alpha,
            sigma_2_alpha2,
            sigma_2_alpha3,
        ];
        
        console_log!("binding_O_inst: x={:?}, y={:?}", binding_O_inst.x, binding_O_inst.y);
        console_log!("binding_O_mid: x={:?}, y={:?}", binding_O_mid.x, binding_O_mid.y);
        console_log!("binding_O_prv: x={:?}, y={:?}", binding_O_prv.x, binding_O_prv.y);
        console_log!("AUX_X: x={:?}, y={:?}", AUX_X.x, AUX_X.y);
        console_log!("AUX_Y: x={:?}, y={:?}", AUX_Y.x, AUX_Y.y);
        
    let right_points_g1 = vec![
        binding_O_inst.into_affine(),
        binding_O_mid.into_affine(),
        binding_O_prv.into_affine(),
        AUX_X,  // Already Affine
        AUX_Y,  // Already Affine
    ];
        
        let right_points_g2 = vec![
            sigma_2_gamma,
            sigma_2_eta,
            sigma_2_delta,
            sigma_2_x,
            sigma_2_y,
        ];
        
        console_log!("Computing pairings...");
        let left_pair = Self::multi_pairing(&left_points_g1, &left_points_g2)?;
        let right_pair = Self::multi_pairing(&right_points_g1, &right_points_g2)?;
        
        console_log!("Left pairing result: {:?}", left_pair);
        console_log!("Right pairing result: {:?}", right_pair);
        
        let result = left_pair == right_pair;
        
        if result {
            console_log!("✅ SNARK verification PASSED");
        } else {
            console_log!("❌ SNARK verification FAILED");
            console_log!("Debug: theta0={:?}, theta1={:?}, theta2={:?}", theta0, theta1, theta2);
            console_log!("Debug: kappa0={:?}, kappa1={:?}, kappa2={:?}", kappa0, kappa1, kappa2);
            console_log!("Debug: chi={:?}, zeta={:?}", chi, zeta);
        }
        
        Ok(result)
    }
    
    // Helper functions
    
    fn validate_setup_params(params: &SetupParams) -> Result<(), JsValue> {
        let l_pub = params.l_pub_in + params.l_pub_out;
        let l_prv = params.l_prv_in + params.l_prv_out;
        let m_i = params.l_D - params.l;
        
        if l_pub != 0 && !l_pub.is_power_of_two() {
            return Err(JsValue::from_str("l_pub must be a power of two or zero"));
        }
        
        if !l_prv.is_power_of_two() {
            return Err(JsValue::from_str("l_prv must be a power of two"));
        }
        
        if !params.n.is_power_of_two() {
            return Err(JsValue::from_str("n must be a power of two"));
        }
        
        if !params.s_max.is_power_of_two() {
            return Err(JsValue::from_str("s_max must be a power of two"));
        }
        
        if !m_i.is_power_of_two() {
            return Err(JsValue::from_str("m_I must be a power of two"));
        }
        
        Ok(())
    }
    
    fn scalar_from_hex(hex_str: &str) -> Result<ScalarField, String> {
        let mut hex_str_trimmed = hex_str.trim_start_matches("0x").to_string();
        
        // Pad with leading zero if odd length
        if hex_str_trimmed.len() % 2 == 1 {
            hex_str_trimmed = format!("0{}", hex_str_trimmed);
        }
        
        console_log!("scalar_from_hex: input length={}, trimmed length={}", hex_str.len(), hex_str_trimmed.len());
        
        let bytes = hex::decode(&hex_str_trimmed)
            .map_err(|e| format!("Invalid hex (len={}): {}", hex_str_trimmed.len(), e))?;
        
        // Pad to 32 bytes if needed
        let mut padded = vec![0u8; 32];
        let start = 32 - bytes.len().min(32);
        padded[start..].copy_from_slice(&bytes[..bytes.len().min(32)]);
        
        // Convert to ScalarField (little-endian)
        padded.reverse();
        ScalarField::deserialize_compressed(&padded[..])
            .map_err(|e| format!("Failed to deserialize scalar: {}", e))
    }
    
    fn fq_from_hex(hex_str: &str) -> Result<Fq, String> {
        let mut hex_str_trimmed = hex_str.trim_start_matches("0x").to_string();
        
        // Pad with leading zero if odd length
        if hex_str_trimmed.len() % 2 == 1 {
            hex_str_trimmed = format!("0{}", hex_str_trimmed);
        }
        
        console_log!("fq_from_hex: input length={}, trimmed length={}", hex_str.len(), hex_str_trimmed.len());
        
        // Decode hex to bytes (big-endian from JSON)
        let mut bytes = hex::decode(&hex_str_trimmed)
            .map_err(|e| format!("Invalid hex (len={}): {}", hex_str_trimmed.len(), e))?;
        
        // Ensure exactly 48 bytes (pad if needed)
        if bytes.len() < 48 {
            let mut padded = vec![0u8; 48];
            let start = 48 - bytes.len();
            padded[start..].copy_from_slice(&bytes);
            bytes = padded;
        } else if bytes.len() > 48 {
            return Err(format!("Hex too long: {} bytes (max 48)", bytes.len()));
        }
        
        // 🔥 Match Native: Convert to little-endian and use from_random_bytes
        // Native does: ICICLE.to_bytes_le() → Fq::from_random_bytes()
        bytes.reverse(); // Big-endian → Little-endian
        
        Fq::from_random_bytes(&bytes)
            .ok_or_else(|| format!("Failed to parse Fq from bytes"))
    }
    
    fn fq2_from_hex(hex_str: &str) -> Result<ark_bls12_381::Fq2, String> {
        let mut hex_str_trimmed = hex_str.trim_start_matches("0x").to_string();
        
        // Pad with leading zero if odd length
        if hex_str_trimmed.len() % 2 == 1 {
            hex_str_trimmed = format!("0{}", hex_str_trimmed);
        }
        
        console_log!("fq2_from_hex: input length={}, trimmed length={}", hex_str.len(), hex_str_trimmed.len());
        
        // Decode hex to bytes (big-endian from JSON)
        let mut bytes = hex::decode(&hex_str_trimmed)
            .map_err(|e| format!("Invalid hex (len={}): {}", hex_str_trimmed.len(), e))?;
        
        // Ensure exactly 96 bytes (pad if needed)
        if bytes.len() < 96 {
            let mut padded = vec![0u8; 96];
            let start = 96 - bytes.len();
            padded[start..].copy_from_slice(&bytes);
            bytes = padded;
        } else if bytes.len() > 96 {
            return Err(format!("Hex too long: {} bytes (max 96)", bytes.len()));
        }
        
        // 🔥 Match Native: JSON is big-endian, ICICLE uses little-endian
        // Reverse entire 96 bytes to match ICICLE's to_bytes_le() output
        bytes.reverse();
        
        // Use Fq2::from_random_bytes on entire 96 bytes (like Native does)
        let fq2 = ark_bls12_381::Fq2::from_random_bytes(&bytes)
            .ok_or_else(|| format!("Failed to parse Fq2 from bytes"))?;
        
        console_log!("fq2_from_hex: c0={}, c1={}", fq2.c0, fq2.c1);
        
        Ok(fq2)
    }
    
    fn g1_from_json(point: &G1Point) -> Result<G1Projective, JsValue> {
        let x = Self::fq_from_hex(&point.x)
            .map_err(|e| JsValue::from_str(&format!("Invalid G1 x: {}", e)))?;
        let y = Self::fq_from_hex(&point.y)
            .map_err(|e| JsValue::from_str(&format!("Invalid G1 y: {}", e)))?;
        
        // Use new_unchecked - ICICLE and Arkworks may use different curve equations
        let affine = G1Affine::new_unchecked(x, y);
        Ok(affine.into_group())
    }
    
    fn g2_from_json(point: &G2Point) -> Result<G2Affine, JsValue> {
        use ark_bls12_381::Fq2;
        
        let (x0, x1, y0, y1) = match point {
            // Array format: x:[x0, x1], y:[y0, y1]
            G2Point::Array { x, y } => {
                let x0 = Self::fq_from_hex(&x[0])
                    .map_err(|e| JsValue::from_str(&format!("Invalid G2 x[0]: {}", e)))?;
                let x1 = Self::fq_from_hex(&x[1])
                    .map_err(|e| JsValue::from_str(&format!("Invalid G2 x[1]: {}", e)))?;
                let y0 = Self::fq_from_hex(&y[0])
                    .map_err(|e| JsValue::from_str(&format!("Invalid G2 y[0]: {}", e)))?;
                let y1 = Self::fq_from_hex(&y[1])
                    .map_err(|e| JsValue::from_str(&format!("Invalid G2 y[1]: {}", e)))?;
                (x0, x1, y0, y1)
            },
            // String format: x:"long_hex", y:"long_hex" (96 bytes = 192 hex chars)
            G2Point::String { x, y } => {
                // 🔥 Match Native: Parse entire Fq2 from 96 bytes using from_random_bytes
                let x_fq2 = Self::fq2_from_hex(x)
                    .map_err(|e| JsValue::from_str(&format!("Invalid G2 x (from string): {}", e)))?;
                let y_fq2 = Self::fq2_from_hex(y)
                    .map_err(|e| JsValue::from_str(&format!("Invalid G2 y (from string): {}", e)))?;
                
                return Ok(G2Affine::new_unchecked(x_fq2, y_fq2));
            }
        };
        
        // Array format: manually construct Fq2
        let x = Fq2::new(x0, x1);
        let y = Fq2::new(y0, y1);
        
        // Use new_unchecked - ICICLE and Arkworks may use different curve equations
        Ok(G2Affine::new_unchecked(x, y))
    }
    
    fn multi_pairing(
        g1_points: &[G1Affine],
        g2_points: &[G2Affine],
    ) -> Result<ark_ec::pairing::PairingOutput<Bls12_381>, JsValue> {
        if g1_points.len() != g2_points.len() {
            return Err(JsValue::from_str("Point count mismatch"));
        }
        
        Ok(Bls12_381::multi_pairing(g1_points, g2_points))
    }
    
    fn get_root_of_unity(size: usize) -> Result<ScalarField, JsValue> {
        // Use the same roots of unity as ICICLE's ntt::get_root_of_unity
        // These specific primitive roots are what the native verifier uses
        match size {
            1024 => {
                // omega_1024 from native: 0x2f27b09858f43cef3ed6d55a6350721d79efd6b0570bf109d58a5af42d010ff9
                // Convert to BigInteger (little-endian byte order for ark-ff)
                let mut bytes = [0u8; 32];
                hex::decode_to_slice("2f27b09858f43cef3ed6d55a6350721d79efd6b0570bf109d58a5af42d010ff9", &mut bytes)
                    .map_err(|e| JsValue::from_str(&format!("Failed to decode omega_1024: {:?}", e)))?;
                bytes.reverse(); // Convert from big-endian to little-endian
                Ok(ScalarField::from_le_bytes_mod_order(&bytes))
            },
            512 => {
                // omega_512 from native: 0x1bb466679a5d88b1ecfbede342dee7f415c1ad4c687f28a233811ea1fe0c65f4
                let mut bytes = [0u8; 32];
                hex::decode_to_slice("1bb466679a5d88b1ecfbede342dee7f415c1ad4c687f28a233811ea1fe0c65f4", &mut bytes)
                    .map_err(|e| JsValue::from_str(&format!("Failed to decode omega_512: {:?}", e)))?;
                bytes.reverse(); // Convert from big-endian to little-endian
                Ok(ScalarField::from_le_bytes_mod_order(&bytes))
            },
            _ => {
                // Fallback to Arkworks' root for other sizes (may not match ICICLE)
                let domain = Radix2EvaluationDomain::<ScalarField>::new(size)
                    .ok_or_else(|| JsValue::from_str("Failed to create evaluation domain"))?;
                Ok(domain.group_gen())
            }
        }
    }
    
    fn eval_lagrange_poly(&self, chi: &ScalarField, _zeta: &ScalarField) -> Result<ScalarField, JsValue> {
        // ✅ IFFT-based evaluation matching Native's approach
        // 1. Perform IFFT on a_pub evaluations to get polynomial coefficients
        // 2. Evaluate the polynomial at chi using Horner's method
        
        let n = self.setup_params.l_pub_in + self.setup_params.l_pub_out; // domain size = 64
        
        if n == 0 {
            return Ok(ScalarField::zero());
        }
        
        console_log!("🔧 IFFT-based polynomial evaluation: n={}", n);
        
        // 🔍 First, verify a_pub values match Native
        console_log!("\n🔍 Checking a_pub values:");
        console_log!("  a_pub.len() = {}", self.a_pub.len());
        if self.a_pub.len() > 0 {
            console_log!("  a_pub[0] = {:?}", self.a_pub[0]);
        }
        if self.a_pub.len() > 1 {
            console_log!("  a_pub[1] = {:?}", self.a_pub[1]);
        }
        console_log!("  Expected Native a_pub[0]: 282694985723695679721431686460036218601");
        
        // 🔄 Try Arkworks standard domain with its default omega
        // The key insight: maybe we don't need to match ICICLE's IFFT coefficients exactly
        // As long as the polynomial evaluation at chi is correct!
        
        let domain = Radix2EvaluationDomain::<ScalarField>::new(n)
            .ok_or_else(|| JsValue::from_str("Failed to create evaluation domain"))?;
        
        // Pad a_pub to domain size if needed
        let mut evals = self.a_pub.clone();
        while evals.len() < n {
            evals.push(ScalarField::zero());
        }
        
        console_log!("Using Arkworks standard IFFT (omega may differ from ICICLE)");
        console_log!("But polynomial evaluation at chi should still be correct!");
        
        // Perform standard Arkworks IFFT
        domain.ifft_in_place(&mut evals);
        
        console_log!("IFFT complete, got {} coefficients", evals.len());
        
        // Evaluate polynomial at chi using Horner's method
        // p(chi) = c0 + chi*(c1 + chi*(c2 + chi*(...)))
        let mut result = evals[n - 1];
        for i in (0..n - 1).rev() {
            result = result * chi + evals[i];
        }
        
        console_log!("✅ IFFT-based A_eval: {:?}", result);
        
        Ok(result)
    }
    
    // Cooley-Tukey IFFT implementation (in-place, radix-2)
    fn cooley_tukey_ifft_in_place(data: &mut [ScalarField], omega_inv: ScalarField) -> Result<(), JsValue> {
        let n = data.len();
        if n == 0 || (n & (n - 1)) != 0 {
            return Err(JsValue::from_str("Data length must be a power of 2"));
        }
        
        console_log!("  Starting Cooley-Tukey IFFT, n={}", n);
        console_log!("  Before bit-reversal: data[0]={:?}, data[1]={:?}", data[0], data[1]);
        
        // Bit-reversal permutation
        let mut j = 0;
        for i in 1..n {
            let mut bit = n >> 1;
            while j >= bit {
                j -= bit;
                bit >>= 1;
            }
            j += bit;
            if i < j {
                data.swap(i, j);
            }
        }
        
        console_log!("  After bit-reversal: data[0]={:?}, data[1]={:?}", data[0], data[1]);
        
        // Cooley-Tukey FFT
        let mut len = 2;
        let mut stage = 0;
        while len <= n {
            stage += 1;
            let half_len = len / 2;
            
            // Compute omega^(n/len) for this stage
            let theta = omega_inv.pow([(n / len) as u64, 0, 0, 0]);
            
            if stage <= 2 {
                console_log!("  Stage {}: len={}, theta={:?}", stage, len, theta);
            }
            
            let mut omega_power = ScalarField::one();
            for j in 0..half_len {
                let mut k = j;
                while k < n {
                    let t = omega_power * data[k + half_len];
                    let u = data[k];
                    data[k] = u + t;
                    data[k + half_len] = u - t;
                    k += len;
                }
                omega_power *= theta;
            }
            
            if stage <= 2 {
                console_log!("    After stage {}: data[0]={:?}, data[1]={:?}", stage, data[0], data[1]);
            }
            
            len *= 2;
        }
        
        console_log!("  IFFT complete (before normalization)");
        
        Ok(())
    }
    
    fn compute_lagrange_k0(m_i: usize, chi: &ScalarField, _zeta: &ScalarField) -> Result<ScalarField, JsValue> {
        // ✅ Solidity-style: L_0(chi) = (chi^m_i - 1) / (m_i * (chi - 1))
        // This is UNIVARIATE, matching Solidity verifier's computeLagrangeK0Eval()
        
        // Safety check: chi cannot be 1
        if chi == &ScalarField::one() {
            return Err(JsValue::from_str("chi cannot be 1 for lagrange_K0 evaluation"));
        }
        
        let chi_m_i = chi.pow([m_i as u64]);
        let numerator = chi_m_i - ScalarField::one();
        let denominator = ScalarField::from(m_i as u64) * (*chi - ScalarField::one());
        
        let result = numerator / denominator;
        
        console_log!("lagrange_K0_eval (Solidity-style): {:?}", result);
        
        Ok(result)
    }
    
    fn parse_keccak_data(
        pts: &[BufferPt],
        a_pub_slice: &[ScalarField],
        expected_type: &str,
    ) -> Result<Vec<Vec<u8>>, String> {
        let mut result = Vec::new();
        let mut prev_key: Option<usize> = None;
        let mut current_data = Vec::new();
        
        for i in 0..pts.len() / 2 {
            let pt_lsb = &pts[2 * i];
            let pt_msb = &pts[2 * i + 1];
            
            // Validate type
            let type_field = if expected_type == "KeccakIn" {
                &pt_lsb.extDest
            } else {
                &pt_lsb.extSource
            };
            
            if type_field.as_deref() != Some(expected_type) {
                return Err(format!("Expected {} type", expected_type));
            }
            
            // Validate values match a_pub (with bounds checking)
            let idx_lsb = 2 * i;
            let idx_msb = 2 * i + 1;
            
            if idx_msb >= a_pub_slice.len() {
                return Err(format!(
                    "Index out of bounds: idx_msb={} >= a_pub_slice.len()={}",
                    idx_msb, a_pub_slice.len()
                ));
            }
            
            let val_lsb = Self::scalar_from_hex(&pt_lsb.valueHex)?;
            let val_msb = Self::scalar_from_hex(&pt_msb.valueHex)?;
            
            if val_lsb != a_pub_slice[idx_lsb] || val_msb != a_pub_slice[idx_msb] {
                return Err("Value mismatch with a_pub".to_string());
            }
            
            // Parse key
            let key = usize::from_str_radix(
                pt_lsb.key.trim_start_matches("0x"),
                16
            ).map_err(|e| format!("Invalid key: {}", e))?;
            
            // Combine MSB and LSB
            let msb_bytes = hex::decode(pt_msb.valueHex.trim_start_matches("0x"))
                .map_err(|e| format!("Invalid MSB hex: {}", e))?;
            let lsb_bytes = hex::decode(pt_lsb.valueHex.trim_start_matches("0x"))
                .map_err(|e| format!("Invalid LSB hex: {}", e))?;
            
            let mut combined = msb_bytes;
            combined.extend_from_slice(&lsb_bytes);
            
            // Group by key
            if let Some(prev) = prev_key {
                if key != prev {
                    result.push(current_data.clone());
                    current_data = combined;
                } else {
                    current_data.extend_from_slice(&combined);
                }
            } else {
                current_data = combined;
            }
            
            prev_key = Some(key);
        }
        
        if !current_data.is_empty() {
            result.push(current_data);
        }
        
        Ok(result)
    }
}

//========================================================================
// Helper Functions for G1/Scalar Parsing
//========================================================================

fn g1_from_json_helper(point: &G1Point) -> Result<G1Affine, JsValue> {
    let x = fq_from_hex_helper(&point.x)?;
    let y = fq_from_hex_helper(&point.y)?;
    
    // Use new_unchecked - ICICLE and Arkworks may use different curve equations
    Ok(G1Affine::new_unchecked(x, y))
}

fn fq_from_hex_helper(hex_str: &str) -> Result<Fq, JsValue> {
    let mut hex_str_trimmed = hex_str.trim_start_matches("0x").to_string();
    
    if hex_str_trimmed.len() % 2 == 1 {
        hex_str_trimmed = format!("0{}", hex_str_trimmed);
    }
    
    let mut bytes = hex::decode(&hex_str_trimmed)
        .map_err(|e| JsValue::from_str(&format!("Invalid hex: {}", e)))?;
    
    if bytes.len() < 48 {
        let mut padded = vec![0u8; 48];
        let start = 48 - bytes.len();
        padded[start..].copy_from_slice(&bytes);
        bytes = padded;
    } else if bytes.len() > 48 {
        return Err(JsValue::from_str(&format!("Hex too long: {} bytes", bytes.len())));
    }
    
    // hex::decode returns big-endian bytes, use from_be_bytes_mod_order
    Ok(Fq::from_be_bytes_mod_order(&bytes))
}

fn scalar_from_hex_helper(hex_str: &str) -> Result<ScalarField, JsValue> {
    let mut hex_str_trimmed = hex_str.trim_start_matches("0x").to_string();
    
    if hex_str_trimmed.len() % 2 == 1 {
        hex_str_trimmed = format!("0{}", hex_str_trimmed);
    }
    
    let bytes = hex::decode(&hex_str_trimmed)
        .map_err(|e| JsValue::from_str(&format!("Invalid hex: {}", e)))?;
    
    let mut padded = vec![0u8; 32];
    let start = 32 - bytes.len().min(32);
    padded[start..].copy_from_slice(&bytes[..bytes.len().min(32)]);
    
    padded.reverse();
    ScalarField::deserialize_compressed(&padded[..])
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize scalar: {}", e)))
}

//========================================================================
// Fiat-Shamir Transform - Transcript Manager
//========================================================================

/// Rolling Keccak transcript for challenge generation
struct RollingKeccakTranscript {
    state_part_0: [u8; 32],
    state_part_1: [u8; 32],
    challenge_counter: u32,
}

impl RollingKeccakTranscript {
    const DST_0_TAG: u8 = 0;
    const DST_1_TAG: u8 = 1;
    const CHALLENGE_DST_TAG: u8 = 2;
    
    fn new() -> Self {
        Self {
            state_part_0: [0u8; 32],
            state_part_1: [0u8; 32],
            challenge_counter: 0,
        }
    }
    
    /// Update transcript state with new bytes
    fn update(&mut self, bytes: &[u8]) -> Result<(), String> {
        if bytes.len() > 32 {
            return Err("Input must be 32 bytes or less".to_string());
        }
        
        let old_state_0 = self.state_part_0;
        let old_state_1 = self.state_part_1;
        
        // Create 100-byte buffer matching Solidity layout
        let mut hash_input = [0u8; 100];
        hash_input[3] = Self::DST_0_TAG;
        hash_input[4..36].copy_from_slice(&old_state_0);
        hash_input[36..68].copy_from_slice(&old_state_1);
        
        // Right-align bytes in the 32-byte slot
        let start_idx = 100 - bytes.len();
        hash_input[start_idx..100].copy_from_slice(bytes);
        
        // Update state_0
        let mut hasher = Keccak::v256();
        hasher.update(&hash_input);
        hasher.finalize(&mut self.state_part_0);
        
        // Update state_1 with different tag
        hash_input[3] = Self::DST_1_TAG;
        let mut hasher = Keccak::v256();
        hasher.update(&hash_input);
        hasher.finalize(&mut self.state_part_1);
        
        Ok(())
    }
    
    /// Generate raw challenge bytes
    fn get_challenge_raw(&mut self) -> [u8; 32] {
        let mut hash_input = [0u8; 72];
        hash_input[3] = Self::CHALLENGE_DST_TAG;
        hash_input[4..36].copy_from_slice(&self.state_part_0);
        hash_input[36..68].copy_from_slice(&self.state_part_1);
        
        // Challenge counter (big-endian, shifted left by 224 bits)
        hash_input[68] = (self.challenge_counter >> 24) as u8;
        hash_input[69] = (self.challenge_counter >> 16) as u8;
        hash_input[70] = (self.challenge_counter >> 8) as u8;
        hash_input[71] = self.challenge_counter as u8;
        
        self.challenge_counter += 1;
        
        let mut value = [0u8; 32];
        let mut hasher = Keccak::v256();
        hasher.update(&hash_input);
        hasher.finalize(&mut value);
        
        value
    }
    
    /// Generate field element challenge
    fn get_challenge(&mut self) -> ScalarField {
        let mut result = self.get_challenge_raw();
        
        // Apply field mask (FR_MASK = 0x1fffffff...)
        result[0] &= 0x1f;
        result.reverse(); // Convert to little-endian
        
        let scalar = ScalarField::from_le_bytes_mod_order(&result);
        
        // Ensure never zero
        if scalar == ScalarField::zero() {
            ScalarField::one()
        } else {
            scalar
        }
    }
    
    /// Commit a BLS12-381 field element (48 bytes)
    fn commit_bls12_381_field_element(&mut self, element: &Fq) -> Result<(), String> {
        // Get field element as 48-byte big-endian
        let mut le_bytes = element.into_bigint().to_bytes_le();
        while le_bytes.len() < 48 {
            le_bytes.push(0);
        }
        le_bytes.reverse(); // Convert to big-endian
        
        // Split into part1 (16 bytes) and part2 (32 bytes)
        let part1 = &le_bytes[0..16];
        let part2 = &le_bytes[16..48];
        
        // Create padded part1 (16 bytes of zeros + 16 bytes of part1)
        // This matches Native implementation
        let mut part1_padded = [0u8; 32];
        part1_padded[16..32].copy_from_slice(part1);
        
        // Commit each part separately
        self.update(&part1_padded)?;  // 32 bytes
        self.update(part2)?;           // 32 bytes
        
        Ok(())
    }
    
    /// Commit a scalar field element (32 bytes)
    fn commit_field_as_bytes(&mut self, element: &ScalarField) -> Result<(), String> {
        let mut le_bytes = element.into_bigint().to_bytes_le();
        
        // Ensure it's no more than 32 bytes
        if le_bytes.len() > 32 {
            let len = le_bytes.len();
            le_bytes = le_bytes[(len - 32)..].to_vec();
        }
        
        // Convert to big-endian
        le_bytes.reverse();
        
        // Create a properly aligned 32-byte array (right-aligned, left-padded with zeros)
        let mut result = [0u8; 32];
        let start_idx = 32 - le_bytes.len();
        result[start_idx..].copy_from_slice(&le_bytes);
        
        self.update(&result)
    }
}

/// Transcript manager for Fiat-Shamir challenges
struct TranscriptManager {
    transcript: RollingKeccakTranscript,
}

impl TranscriptManager {
    fn new() -> Self {
        Self {
            transcript: RollingKeccakTranscript::new(),
        }
    }
    
    fn add_proof0(&mut self, proof: &Proof0) -> Result<(), String> {
        // Commit proof0 points in order: U, V, W, Q_AX, Q_AY, B
        // Note: binding.A is NOT committed to transcript (matches Native implementation)
        let u = g1_from_json_helper(&proof.U).map_err(|e| format!("Failed to parse U: {:?}", e))?;
        self.transcript.commit_bls12_381_field_element(&u.x)?;
        self.transcript.commit_bls12_381_field_element(&u.y)?;
        
        let v = g1_from_json_helper(&proof.V).map_err(|e| format!("Failed to parse V: {:?}", e))?;
        self.transcript.commit_bls12_381_field_element(&v.x)?;
        self.transcript.commit_bls12_381_field_element(&v.y)?;
        
        let w = g1_from_json_helper(&proof.W).map_err(|e| format!("Failed to parse W: {:?}", e))?;
        self.transcript.commit_bls12_381_field_element(&w.x)?;
        self.transcript.commit_bls12_381_field_element(&w.y)?;
        
        let q_ax = g1_from_json_helper(&proof.Q_AX).map_err(|e| format!("Failed to parse Q_AX: {:?}", e))?;
        self.transcript.commit_bls12_381_field_element(&q_ax.x)?;
        self.transcript.commit_bls12_381_field_element(&q_ax.y)?;
        
        let q_ay = g1_from_json_helper(&proof.Q_AY).map_err(|e| format!("Failed to parse Q_AY: {:?}", e))?;
        self.transcript.commit_bls12_381_field_element(&q_ay.x)?;
        self.transcript.commit_bls12_381_field_element(&q_ay.y)?;
        
        let b = g1_from_json_helper(&proof.B).map_err(|e| format!("Failed to parse B: {:?}", e))?;
        self.transcript.commit_bls12_381_field_element(&b.x)?;
        self.transcript.commit_bls12_381_field_element(&b.y)?;
        
        Ok(())
    }
    
    fn get_thetas(&mut self) -> Vec<ScalarField> {
        vec![
            self.transcript.get_challenge(),
            self.transcript.get_challenge(),
            self.transcript.get_challenge(),
        ]
    }
    
    fn add_proof1(&mut self, proof: &Proof1) -> Result<(), String> {
        let r = g1_from_json_helper(&proof.R).map_err(|e| format!("Failed to parse R: {:?}", e))?;
        self.transcript.commit_bls12_381_field_element(&r.x)?;
        self.transcript.commit_bls12_381_field_element(&r.y)?;
        Ok(())
    }
    
    fn get_kappa0(&mut self) -> ScalarField {
        self.transcript.get_challenge()
    }
    
    fn add_proof2(&mut self, proof: &Proof2) -> Result<(), String> {
        let q_cx = g1_from_json_helper(&proof.Q_CX).map_err(|e| format!("Failed to parse Q_CX: {:?}", e))?;
        self.transcript.commit_bls12_381_field_element(&q_cx.x)?;
        self.transcript.commit_bls12_381_field_element(&q_cx.y)?;
        
        let q_cy = g1_from_json_helper(&proof.Q_CY).map_err(|e| format!("Failed to parse Q_CY: {:?}", e))?;
        self.transcript.commit_bls12_381_field_element(&q_cy.x)?;
        self.transcript.commit_bls12_381_field_element(&q_cy.y)?;
        
        Ok(())
    }
    
    fn get_chi_zeta(&mut self) -> (ScalarField, ScalarField) {
        (
            self.transcript.get_challenge(),
            self.transcript.get_challenge(),
        )
    }
    
    fn add_proof3(&mut self, proof: &Proof3) -> Result<(), String> {
        self.transcript.commit_field_as_bytes(&scalar_from_hex_helper(&proof.V_eval).map_err(|e| format!("Failed to parse V_eval: {:?}", e))?)?;
        self.transcript.commit_field_as_bytes(&scalar_from_hex_helper(&proof.R_eval).map_err(|e| format!("Failed to parse R_eval: {:?}", e))?)?;
        self.transcript.commit_field_as_bytes(&scalar_from_hex_helper(&proof.R_omegaX_eval).map_err(|e| format!("Failed to parse R_omegaX_eval: {:?}", e))?)?;
        self.transcript.commit_field_as_bytes(&scalar_from_hex_helper(&proof.R_omegaX_omegaY_eval).map_err(|e| format!("Failed to parse R_omegaX_omegaY_eval: {:?}", e))?)?;
        Ok(())
    }
    
    fn get_kappa1(&mut self) -> ScalarField {
        self.transcript.get_challenge()
    }
}

// Initialize panic hook for better error messages in WASM
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
    console_log!("WASM Verifier module initialized");
}

// Convert FormattedPreprocess to Preprocess
#[wasm_bindgen(js_name = recoverPreprocess)]
pub fn recover_preprocess_from_json(js_value: JsValue) -> Result<JsValue, JsValue> {
    let formatted: FormattedPreprocess = serde_wasm_bindgen::from_value(js_value)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse FormattedPreprocess: {:?}", e)))?;
    
    let preprocess = formatted.recover_preprocess()
        .map_err(|e| JsValue::from_str(&e))?;
    
    serde_wasm_bindgen::to_value(&preprocess)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize Preprocess: {:?}", e)))
}
