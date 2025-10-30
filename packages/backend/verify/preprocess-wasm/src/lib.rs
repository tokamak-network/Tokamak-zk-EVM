#![allow(non_snake_case)]

// WASM imports
use wasm_bindgen::prelude::*;
use web_sys::console;

// Arkworks types
use ark_bls12_381::{Fr as ScalarField, G1Affine, G1Projective, Fq as BaseField};
use ark_ec::{AdditiveGroup, AffineRepr, CurveGroup, VariableBaseMSM};
use ark_ff::{BigInteger, Field, PrimeField, Zero};
use ark_poly::{EvaluationDomain, Radix2EvaluationDomain};

// Serialization
use serde::{Deserialize, Serialize};
use serde_json;

// Hex handling
use hex;

// Random number generation (for future use)
// use rand::SeedableRng;
// use rand_chacha::ChaCha20Rng;

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
    console_log!("WASM Preprocess module initialized");
}

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupParams {
    pub l: usize,
    pub l_pub_in: usize,
    pub l_pub_out: usize,
    pub l_prv_in: usize,
    pub l_prv_out: usize,
    pub l_D: usize,
    pub m_D: usize,
    pub n: usize,
    pub s_D: usize,
    pub s_max: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct G1serde(
    #[serde(
        serialize_with = "serialize_g1",
        deserialize_with = "deserialize_g1"
    )]
    pub G1Affine,
);

impl G1serde {
    pub fn zero() -> Self {
        G1serde(G1Affine::zero())
    }
}

fn serialize_g1<S>(point: &G1Affine, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    use serde::ser::SerializeStruct;
    let mut s = serializer.serialize_struct("G1", 2)?;
    
    // Convert to hex strings (big-endian)
    let x_bytes = point.x.into_bigint().to_bytes_be();
    let y_bytes = point.y.into_bigint().to_bytes_be();
    
    let x_hex = format!("0x{}", hex::encode(&x_bytes));
    let y_hex = format!("0x{}", hex::encode(&y_bytes));
    
    s.serialize_field("x", &x_hex)?;
    s.serialize_field("y", &y_hex)?;
    s.end()
}

fn deserialize_g1<'de, D>(deserializer: D) -> Result<G1Affine, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    struct G1Coords {
        x: String,
        y: String,
    }
    
    let coords = G1Coords::deserialize(deserializer)?;
    
    // Parse hex strings (big-endian)
    let x_hex = coords.x.trim_start_matches("0x");
    let y_hex = coords.y.trim_start_matches("0x");
    
    let x_bytes = hex::decode(x_hex).map_err(serde::de::Error::custom)?;
    let y_bytes = hex::decode(y_hex).map_err(serde::de::Error::custom)?;
    
    let x = BaseField::from_be_bytes_mod_order(&x_bytes);
    let y = BaseField::from_be_bytes_mod_order(&y_bytes);
    
    Ok(G1Affine::new(x, y))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SigmaPreprocess {
    pub sigma_1: PartialSigma1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartialSigma1 {
    pub xy_powers: Vec<G1serde>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Permutation {
    pub row: usize,
    pub col: usize,
    pub X: usize,
    pub Y: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preprocess {
    pub s0: G1serde,
    pub s1: G1serde,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormattedPreprocess {
    pub preprocess_entries_part1: Vec<String>,
    pub preprocess_entries_part2: Vec<String>,
}

// ============================================================================
// 2D Polynomial Structure (Arkworks-based)
// ============================================================================

/// 2D polynomial represented in coefficient form
/// P(x,y) = sum_{i,j} coeffs[i*y_size + j] * x^i * y^j
#[derive(Clone, Debug)]
pub struct DensePolynomial2D {
    pub coeffs: Vec<ScalarField>,
    pub x_size: usize,  // Number of x coefficients
    pub y_size: usize,  // Number of y coefficients
}

impl DensePolynomial2D {
    /// Create zero polynomial
    pub fn zero(x_size: usize, y_size: usize) -> Self {
        Self {
            coeffs: vec![ScalarField::zero(); x_size * y_size],
            x_size,
            y_size,
        }
    }
    
    /// Create from evaluations on roots of unity (2D IFFT)
    /// evals: evaluations at (omega_x^i, omega_y^j) for i in [0, x_size), j in [0, y_size)
    pub fn from_rou_evals(evals: &[ScalarField], x_size: usize, y_size: usize) -> Self {
        assert_eq!(evals.len(), x_size * y_size, "Evaluation length mismatch");
        
        // Create evaluation domains
        let domain_x = Radix2EvaluationDomain::<ScalarField>::new(x_size)
            .expect("Failed to create x domain");
        let domain_y = Radix2EvaluationDomain::<ScalarField>::new(y_size)
            .expect("Failed to create y domain");
        
        // Perform 2D IFFT: IFFT along y-axis first, then x-axis
        let mut temp = vec![ScalarField::zero(); x_size * y_size];
        
        // IFFT along y-axis (for each x coordinate)
        for i in 0..x_size {
            let mut y_evals: Vec<ScalarField> = (0..y_size)
                .map(|j| evals[i * y_size + j])
                .collect();
            
            domain_y.ifft_in_place(&mut y_evals);
            
            for j in 0..y_size {
                temp[i * y_size + j] = y_evals[j];
            }
        }
        
        // IFFT along x-axis (for each y coordinate)
        let mut coeffs = vec![ScalarField::zero(); x_size * y_size];
        for j in 0..y_size {
            let mut x_evals: Vec<ScalarField> = (0..x_size)
                .map(|i| temp[i * y_size + j])
                .collect();
            
            domain_x.ifft_in_place(&mut x_evals);
            
            for i in 0..x_size {
                coeffs[i * y_size + j] = x_evals[i];
            }
        }
        
        Self {
            coeffs,
            x_size,
            y_size,
        }
    }
    
    /// Get degree of polynomial (excluding zero high-degree terms)
    pub fn degree(&self) -> (usize, usize) {
        let mut x_degree = 0;
        let mut y_degree = 0;
        
        for i in 0..self.x_size {
            for j in 0..self.y_size {
                if self.coeffs[i * self.y_size + j] != ScalarField::zero() {
                    x_degree = x_degree.max(i);
                    y_degree = y_degree.max(j);
                }
            }
        }
        
        (x_degree, y_degree)
    }
}

// ============================================================================
// Root of Unity Helpers
// ============================================================================

/// Get root of unity for a given domain size
/// Uses hardcoded values to match ICICLE's ntt::get_root_of_unity
fn get_root_of_unity(size: usize) -> Result<ScalarField, String> {
    // For common sizes, use Arkworks' domain generator which should match ICICLE
    let domain = Radix2EvaluationDomain::<ScalarField>::new(size)
        .ok_or_else(|| format!("Failed to create domain for size {}", size))?;
    
    Ok(domain.group_gen())
}

// ============================================================================
// Permutation to Polynomial Conversion
// ============================================================================

impl Permutation {
    /// Convert permutation array to two polynomials s0 and s1
    /// This is the pure Arkworks implementation of Permutation::to_poly
    pub fn to_poly(
        perm_raw: &[Permutation],
        m_i: usize,
        s_max: usize,
    ) -> (DensePolynomial2D, DensePolynomial2D) {
        // Get roots of unity
        let omega_m_i = get_root_of_unity(m_i).expect("Failed to get omega_m_i");
        let omega_s_max = get_root_of_unity(s_max).expect("Failed to get omega_s_max");
        
        // Initialize evaluation vectors
        let mut s0_evals = vec![ScalarField::zero(); m_i * s_max];
        let mut s1_evals = vec![ScalarField::zero(); m_i * s_max];
        
        // Initialize with identity permutation
        for row_idx in 0..m_i {
            for col_idx in 0..s_max {
                let idx = row_idx * s_max + col_idx;
                s0_evals[idx] = omega_m_i.pow(&[row_idx as u64]);
                s1_evals[idx] = omega_s_max.pow(&[col_idx as u64]);
            }
        }
        
        // Apply permutation
        for perm in perm_raw {
            let idx = perm.row * s_max + perm.col;
            s0_evals[idx] = omega_m_i.pow(&[perm.X as u64]);
            s1_evals[idx] = omega_s_max.pow(&[perm.Y as u64]);
        }
        
        // Convert evaluations to polynomials (2D IFFT)
        let s0_poly = DensePolynomial2D::from_rou_evals(&s0_evals, m_i, s_max);
        let s1_poly = DensePolynomial2D::from_rou_evals(&s1_evals, m_i, s_max);
        
        (s0_poly, s1_poly)
    }
}

// ============================================================================
// Polynomial Encoding (MSM-based)
// ============================================================================

impl PartialSigma1 {
    /// Encode polynomial using optimized Multi-Scalar Multiplication (MSM)
    /// Uses 2-bit windowed method with lookup tables
    pub fn encode_poly(
        &self,
        poly: &mut DensePolynomial2D,
        params: &SetupParams,
    ) -> G1serde {
        let (x_degree, y_degree) = poly.degree();
        let target_x_size = x_degree + 1;
        let target_y_size = y_degree + 1;
        
        // Check if we have enough CRS elements
        let rs_x_size = std::cmp::max(2 * params.n, 2 * (params.l_D - params.l));
        let rs_y_size = params.s_max * 2;
        
        if target_x_size > rs_x_size || target_y_size > rs_y_size {
            panic!("Insufficient length of sigma.sigma_1.xy_powers");
        }
        
        if target_x_size * target_y_size == 0 {
            return G1serde::zero();
        }
        
        // Extract non-zero coefficients and corresponding CRS points
        let mut scalars = Vec::new();
        let mut points = Vec::new();
        
        for i in 0..target_x_size {
            for j in 0..target_y_size {
                let coeff = poly.coeffs[i * poly.y_size + j];
                if coeff != ScalarField::zero() {
                    scalars.push(coeff);
                    
                    // Get corresponding CRS point
                    let crs_idx = i * rs_y_size + j;
                    points.push(self.xy_powers[crs_idx].0);
                }
            }
        }
        
        if scalars.is_empty() {
            return G1serde::zero();
        }
        
        // Perform optimized MSM with 4-bit lookup tables (more memory, faster computation)
        console_log!("Performing optimized MSM with {} points", scalars.len());
        let result = Self::msm_with_4bit_lookup(&points, &scalars);
        
        G1serde(result.into_affine())
    }
    
    /// MSM with 4-bit window lookup table (faster but uses ~800MB memory)
    fn msm_with_4bit_lookup(points: &[G1Affine], scalars: &[ScalarField]) -> G1Projective {
        if points.is_empty() {
            return G1Projective::zero();
        }
        
        console_log!("💾 Building 4-bit lookup tables for {} points...", points.len());
        let start_time = js_sys::Date::now();
        
        // Build 4-bit lookup tables (16 entries per point = ~800MB)
        let tables: Vec<[G1Affine; 16]> = points
            .iter()
            .map(|p| Self::build_4bit_table(p))
            .collect();
        
        let build_time = js_sys::Date::now() - start_time;
        console_log!("✅ Lookup tables built in {:.2}s (~{}MB)", build_time / 1000.0, points.len() * 16 * 96 / 1024 / 1024);
        
        console_log!("⚡ Computing MSM with 4-bit windowed method...");
        let compute_start = js_sys::Date::now();
        
        // Window method: process 4 bits at a time
        let mut result = G1Projective::zero();
        
        // Process from high to low (64 windows for 256-bit scalar)
        for window_idx in (0..64).rev() {
            // Double 4 times (shift left by 4 bits)
            result = result.double().double().double().double();
            
            // Add contribution from each point
            for i in 0..points.len() {
                let window_val = Self::get_window_4bit(&scalars[i], window_idx);
                if window_val > 0 {
                    result += tables[i][window_val as usize];
                }
            }
        }
        
        let compute_time = js_sys::Date::now() - compute_start;
        console_log!("✅ MSM computed in {:.2}s", compute_time / 1000.0);
        
        result
    }
    
    /// Build 4-bit lookup table for a single point: [0P, 1P, 2P, ..., 15P]
    fn build_4bit_table(point: &G1Affine) -> [G1Affine; 16] {
        let mut table = [G1Affine::identity(); 16];
        
        table[0] = G1Affine::identity();  // 0 × P
        table[1] = *point;                 // 1 × P
        
        // Build rest by adding P each time
        for i in 2..16 {
            table[i] = (table[i-1].into_group() + point).into_affine();
        }
        
        table
    }
    
    /// Extract 4-bit window from scalar at given position
    fn get_window_4bit(scalar: &ScalarField, window_idx: usize) -> u8 {
        // Convert scalar to bytes (little-endian)
        let mut bytes = [0u8; 32];
        let bigint = scalar.into_bigint();
        
        // Extract bytes from BigInt limbs
        for (i, limb) in bigint.0.iter().enumerate() {
            let limb_bytes = limb.to_le_bytes();
            for (j, byte) in limb_bytes.iter().enumerate() {
                let byte_idx = i * 8 + j;
                if byte_idx < 32 {
                    bytes[byte_idx] = *byte;
                }
            }
        }
        
        // Extract 4-bit window
        let bit_idx = window_idx * 4;
        let byte_idx = bit_idx / 8;
        let bit_offset = bit_idx % 8;
        
        if byte_idx >= 32 {
            return 0;
        }
        
        // Handle case where window spans two bytes
        if bit_offset <= 4 {
            (bytes[byte_idx] >> bit_offset) & 0xF
        } else {
            // Need to combine bits from two bytes
            let low_bits = bytes[byte_idx] >> bit_offset;
            let high_bits = if byte_idx + 1 < 32 {
                bytes[byte_idx + 1] << (8 - bit_offset)
            } else {
                0
            };
            (low_bits | high_bits) & 0xF
        }
    }
}

// ============================================================================
// Preprocess Generation
// ============================================================================

impl Preprocess {
    /// Generate preprocess from sigma and permutation
    pub fn gen(
        sigma: &SigmaPreprocess,
        permutation_raw: &[Permutation],
        setup_params: &SetupParams,
    ) -> Self {
        let m_i = setup_params.l_D - setup_params.l;
        let s_max = setup_params.s_max;
        
        console_log!("Converting permutation to polynomials...");
        console_log!("m_i = {}, s_max = {}", m_i, s_max);
        
        // Convert permutation to polynomials
        let (mut s0_poly, mut s1_poly) = Permutation::to_poly(permutation_raw, m_i, s_max);
        
        console_log!("Encoding polynomials with CRS...");
        
        // Encode polynomials using CRS
        let s0 = sigma.sigma_1.encode_poly(&mut s0_poly, setup_params);
        let s1 = sigma.sigma_1.encode_poly(&mut s1_poly, setup_params);
        
        console_log!("Preprocess generation complete");
        
        Self { s0, s1 }
    }
    
    /// Convert to formatted preprocess for Solidity verifier
    pub fn convert_format_for_solidity_verifier(&self) -> FormattedPreprocess {
        let mut preprocess_entries_part1 = Vec::new();
        let mut preprocess_entries_part2 = Vec::new();
        
        // Split each G1 point into part1 (16 bytes) and part2 (32 bytes)
        for point in [&self.s0, &self.s1].iter() {
            let (x_part1, x_part2, y_part1, y_part2) = split_g1(point);
            preprocess_entries_part1.push(x_part1);
            preprocess_entries_part2.push(x_part2);
            preprocess_entries_part1.push(y_part1);
            preprocess_entries_part2.push(y_part2);
        }
        
        FormattedPreprocess {
            preprocess_entries_part1,
            preprocess_entries_part2,
        }
    }
}

// Helper function to split G1 point for Solidity format
fn split_g1(point: &G1serde) -> (String, String, String, String) {
    // Get X coordinate bytes in big-endian
    let x_bytes = point.0.x.into_bigint().to_bytes_be();
    let y_bytes = point.0.y.into_bigint().to_bytes_be();
    
    // For BLS12-381 Fp elements, we have 48 bytes
    // First 16 bytes go to part1, last 32 bytes to part2
    let x_part1 = format!("0x{}", hex::encode(&x_bytes[0..16]));
    let x_part2 = format!("0x{}", hex::encode(&x_bytes[16..48]));
    let y_part1 = format!("0x{}", hex::encode(&y_bytes[0..16]));
    let y_part2 = format!("0x{}", hex::encode(&y_bytes[16..48]));
    
    (x_part1, x_part2, y_part1, y_part2)
}

// ============================================================================
// WASM Interface
// ============================================================================

#[wasm_bindgen]
pub struct PreprocessWasm {
    preprocess: Preprocess,
}

#[wasm_bindgen]
impl PreprocessWasm {
    #[wasm_bindgen(constructor)]
    pub fn new(
        sigma_value: JsValue,
        permutation_value: JsValue,
        setup_params_value: JsValue,
    ) -> Result<PreprocessWasm, JsValue> {
        console_log!("Initializing WASM Preprocess...");
        
        // Parse inputs from JavaScript objects (much faster than serde_json::from_str!)
        console_log!("Step 1/6: Converting sigma from JavaScript object...");
        let sigma: SigmaPreprocess = serde_wasm_bindgen::from_value(sigma_value)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sigma: {:?}", e)))?;
        console_log!("✅ Sigma converted");
        
        console_log!("Step 2/6: Converting permutation from JavaScript object...");
        let permutation_raw: Vec<Permutation> = serde_wasm_bindgen::from_value(permutation_value)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse permutation: {:?}", e)))?;
        console_log!("✅ Permutation converted ({} entries)", permutation_raw.len());
        
        console_log!("Step 3/6: Converting setup params from JavaScript object...");
        let setup_params: SetupParams = serde_wasm_bindgen::from_value(setup_params_value)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse setup_params: {:?}", e)))?;
        console_log!("✅ Setup params converted");
        
        console_log!("Step 4/6: Generating preprocess (this may take 5-30 seconds)...");
        
        // Generate preprocess
        let preprocess = Preprocess::gen(&sigma, &permutation_raw, &setup_params);
        
        console_log!("✅ Preprocess generation successful");
        
        Ok(PreprocessWasm { preprocess })
    }
    
    /// Get preprocess as JSON
    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.preprocess)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
    }
    
    /// Get formatted preprocess for Solidity verifier
    #[wasm_bindgen(js_name = toFormattedJSON)]
    pub fn to_formatted_json(&self) -> Result<String, JsValue> {
        let formatted = self.preprocess.convert_format_for_solidity_verifier();
        serde_json::to_string(&formatted)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
    }
}

