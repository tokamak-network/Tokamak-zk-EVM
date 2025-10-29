#![allow(non_snake_case)]
use hex::FromHex;
use icicle_core::hash::HashConfig;
use icicle_hash::keccak::Keccak256;
use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::iotools::{Instance, PublicInputBuffer, PublicOutputBuffer, SetupParams};
use libs::group_structures::{SigmaVerify};
use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use icicle_core::ntt;
use prove::{*};
use libs::group_structures::{pairing, icicle_g1_affine_to_ark};
use preprocess::{Preprocess, FormattedPreprocess};

use std::path::{PathBuf};
use std::vec;

pub struct VerifyInputPaths<'a> {
    pub qap_path: &'a str,
    pub synthesizer_path: &'a str,
    pub setup_path: &'a str,
    pub preprocess_path: &'a str,
    pub proof_path: &'a str,
}   

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeccakVerificationResult {
    True,
    False,
    NoKeccakData,
}

pub struct Verifier {
    pub sigma: SigmaVerify,
    pub a_pub: Box<[ScalarField]>,
    pub publicInputBuffer: PublicInputBuffer,
    pub publicOutputBuffer: PublicOutputBuffer,
    pub preprocess: Preprocess,
    pub setup_params: SetupParams,
    pub proof: Proof,
}
impl Verifier {
    pub fn init(paths: &VerifyInputPaths) -> Self {
        // Load setup parameters from JSON file
        let setup_path = PathBuf::from(paths.qap_path).join("setupParams.json");
        let setup_params = SetupParams::read_from_json(setup_path).unwrap();

        // Extract key parameters from setup_params
        let l = setup_params.l;     // Number of public I/O wires
        let l_d = setup_params.l_D; // Number of interface wires
        let s_d = setup_params.s_D; // Number of subcircuits
        let n = setup_params.n;     // Number of constraints per subcircuit
        let s_max = setup_params.s_max; // The maximum number of placements
        let l_pub = setup_params.l_pub_in + setup_params.l_pub_out;
        let l_prv = setup_params.l_prv_in + setup_params.l_prv_out;
        
        if !(l_pub.is_power_of_two() || l_pub==0) {
            panic!("l_pub is not a power of two.");
        }
    
        if !(l_prv.is_power_of_two()) {
            panic!("l_prv is not a power of two.");
        }
        // Assert n is a power of two
        if !n.is_power_of_two() {
            panic!("n is not a power of two.");
        }
        // Assert s_max is a power of two
        if !s_max.is_power_of_two() {
            panic!("s_max is not a power of two.");
        }
        // The last wire-related parameter
        let m_i = l_d - l;
        // Assert m_I is a power of two
        if !m_i.is_power_of_two() {
            panic!("m_I is not a power of two.");
        }

        // Load instance
        let instance_path = PathBuf::from(paths.synthesizer_path).join("instance.json");
        let instance = Instance::read_from_json(instance_path).unwrap();
        // Parsing the inputs
        let mut a_pub = vec![ScalarField::zero(); l_pub].into_boxed_slice();
        for i in 0..l_pub {
            a_pub[i] = ScalarField::from_hex(&instance.a_pub[i]);
        }

        // Load Sigma (reference string)
        let sigma_path = PathBuf::from(paths.setup_path).join("sigma_verify.json");
        let sigma = SigmaVerify::read_from_json(sigma_path)
        .expect("No reference string is found. Run the Setup first.");

        // Load Verifier preprocess
        let preprocess_path = PathBuf::from(paths.preprocess_path).join("preprocess.json");
        let preprocess = FormattedPreprocess::read_from_json(preprocess_path)
            .expect("No Verifier preprocess is found. Run the Preprocess first.")
            .recover_proof_from_format();

        // Load Proof
        let proof_path = PathBuf::from(paths.proof_path).join("proof.json");
        // let proof = Proof::read_from_json(&proof_path)
        // .expect("No proof is found. Run the Prove first.");
        let proof = FormattedProof::read_from_json(proof_path)
        .expect("No proof is found. Run the Prove first.").recover_proof_from_format();

        return Self {
            sigma, 
            a_pub, 
            publicInputBuffer: instance.publicInputBuffer, 
            publicOutputBuffer: instance.publicOutputBuffer, 
            setup_params, 
            preprocess,
            proof
        }
    }

    pub fn verify_keccak256(&self) -> KeccakVerificationResult {
        let l_pub_out = self.setup_params.l_pub_out;
        let keccak_in_pts = &self.publicOutputBuffer.outPts;
        let keccak_out_pts = &self.publicInputBuffer.inPts;
        if keccak_out_pts.len() == 0 {
            return KeccakVerificationResult::NoKeccakData
        }
        
        let mut keccak_inputs_be_bytes= Vec::new();
        let mut prev_key: usize = 0;
        let mut data_restored: Vec<u8> = Vec::new();
        for i in 0..keccak_in_pts.len()/2 {
            let keccak_in_lsb = &keccak_in_pts[2 * i];
            let keccak_in_msb = &keccak_in_pts[2 * i + 1];
            if keccak_in_lsb.extDest != "KeccakIn" || keccak_in_msb.extDest != "KeccakIn" {
                panic!("The pointed data is not a Keccak input.")
            }
            if !ScalarField::from_hex(&keccak_in_lsb.valueHex).eq(&self.a_pub[2 * i]) || !ScalarField::from_hex(&keccak_in_msb.valueHex).eq(&self.a_pub[2 * i + 1]) {
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

        let mut keccak_outputs_be_bytes= Vec::new();
        let mut prev_key: usize = 0;
        let mut data_restored: Vec<u8> = Vec::new();
        for i in 0..keccak_out_pts.len()/2 {
            let keccak_out_lsb = &keccak_out_pts[2 * i];
            let keccak_out_msb = &keccak_out_pts[2 * i + 1];
            if keccak_out_lsb.extSource != "KeccakOut" || keccak_out_msb.extSource != "KeccakOut" {
                panic!("The pointed data is not a Keccak output.")
            }
            if !ScalarField::from_hex(&keccak_out_lsb.valueHex).eq(&self.a_pub[l_pub_out + 2 * i]) || !ScalarField::from_hex(&keccak_out_msb.valueHex).eq(&self.a_pub[l_pub_out + 2 * i + 1]) {
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

        let keccak_hasher = Keccak256::new(0 /* default input size */).unwrap();
        let mut flag = KeccakVerificationResult::True;
        if keccak_inputs_be_bytes.len() != keccak_outputs_be_bytes.len() {
            panic!("Length mismatch between Keccak inputs and outputs.")
        }
        for i in 0..keccak_inputs_be_bytes.len() {
            let data_in = &keccak_inputs_be_bytes[i];
            let mut res_bytes = vec![0u8; 32]; // 32-byte output buffer
            keccak_hasher
            .hash(
                HostSlice::from_slice(&data_in),  // Input data
                &HashConfig::default(),                       // Default configuration
                HostSlice::from_mut_slice(&mut res_bytes),       // Output buffer
            )
            .unwrap();
            if res_bytes != keccak_outputs_be_bytes[i] {
                flag = KeccakVerificationResult::False;
            }
        }
        return flag
    }
    
    pub fn verify_snark(&self) -> bool {
        println!("\n=== Native SNARK Verification Debug ===");
        
        let binding = &self.proof.binding;
        let proof0 = &self.proof.proof0;
        let proof1= &self.proof.proof1;
        let proof2 = &self.proof.proof2;
        let proof3 = &self.proof.proof3; 
        let proof4 = &self.proof.proof4;
        
        println!("\n--- Proof Points ---");
        println!("binding.A: x={:?}, y={:?}", binding.A.0.x, binding.A.0.y);
        println!("proof0.U: x={:?}, y={:?}", proof0.U.0.x, proof0.U.0.y);
        println!("proof0.V: x={:?}, y={:?}", proof0.V.0.x, proof0.V.0.y);
        println!("proof0.W: x={:?}, y={:?}", proof0.W.0.x, proof0.W.0.y);
        println!("proof1.R: x={:?}, y={:?}", proof1.R.0.x, proof1.R.0.y);
        println!("sigma.G: x={:?}, y={:?}", self.sigma.G.0.x, self.sigma.G.0.y);
        
        println!("\n--- Proof Scalars (proof3) ---");
        println!("proof3.V_eval: {:?}", proof3.V_eval);
        println!("proof3.R_eval: {:?}", proof3.R_eval);
        println!("proof3.R_omegaX_eval: {:?}", proof3.R_omegaX_eval);
        println!("proof3.R_omegaX_omegaY_eval: {:?}", proof3.R_omegaX_omegaY_eval);

        let mut transcript_manager = TranscriptManager::new();

        // Compute challenges using the transcript manager
        println!("\n--- Computing Challenges ---");
        let thetas = proof0.verify0_with_manager(&mut transcript_manager);
        println!("theta0: {:?}", thetas[0]);
        println!("theta1: {:?}", thetas[1]);
        println!("theta2: {:?}", thetas[2]);
        
        let kappa0 = proof1.verify1_with_manager(&mut transcript_manager);
        println!("kappa0: {:?}", kappa0);
        
        let (chi, zeta) = proof2.verify2_with_manager(&mut transcript_manager);
        println!("chi: {:?}", chi);
        println!("zeta: {:?}", zeta);
        
        let kappa1 = proof3.verify3_with_manager(&mut transcript_manager);
        println!("kappa1: {:?}", kappa1);
        
        // TEMPORARY: Fix kappa2 = 1 for debugging comparison with WASM
        let kappa2 = ScalarField::one(); // ScalarCfg::generate_random(1)[0];
        println!("kappa2: {:?} (FIXED TO 1 FOR DEBUGGING)", kappa2);
        
        println!("\n--- Preprocess Values ---");
        println!("preprocess.s0: x={:?}, y={:?}", self.preprocess.s0.0.x, self.preprocess.s0.0.y);
        println!("preprocess.s1: x={:?}, y={:?}", self.preprocess.s1.0.x, self.preprocess.s1.0.y);
        
        let m_i = self.setup_params.l_D - self.setup_params.l;
        let s_max = self.setup_params.s_max;
        let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
        let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
        
        // Debug: Print omega for a_pub domain (n=64)
        let n_pub = self.setup_params.l_pub_in + self.setup_params.l_pub_out;
        let omega_64 = ntt::get_root_of_unity::<ScalarField>(n_pub as u64);
        println!("\n--- Omega Debug ---");
        println!("n_pub (l_pub_in + l_pub_out): {}", n_pub);
        println!("omega_64 from ICICLE ntt::get_root_of_unity: {}", omega_64);
        println!("Expected OMEGA_64: 0x0e4840ac57f86f5e293b1d67bc8de5d9a12a70a615d0b8e4d2fc5e69ac5db47f");
        println!("===================\n");
        
        let t_n_eval = chi.pow(self.setup_params.n) - ScalarField::one();
        let t_mi_eval = chi.pow(m_i) - ScalarField::one();
        let t_smax_eval = zeta.pow(s_max) - ScalarField::one();

        let a_pub_X = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&self.a_pub),
            self.setup_params.l_pub_in + self.setup_params.l_pub_out,
            1,
            None,
            None
        );
        
        println!("\n🔍 a_pub values (before IFFT):");
        println!("  a_pub.len() = {}", self.a_pub.len());
        if self.a_pub.len() > 0 {
            println!("  a_pub[0] = {}", self.a_pub[0]);
        }
        if self.a_pub.len() > 1 {
            println!("  a_pub[1] = {}", self.a_pub[1]);
        }
        
        println!("\n🔍 a_pub_X polynomial info:");
        println!("  x_size: {}", a_pub_X.x_size);
        println!("  y_size: {}", a_pub_X.y_size);
        println!("  x_degree: {}", a_pub_X.x_degree);
        println!("  y_degree: {}", a_pub_X.y_degree);
        
        // Test with zeta=1
        let A_eval_zeta1 = a_pub_X.eval(&chi, &ScalarField::one());
        println!("  A_eval with zeta=1: {}", A_eval_zeta1);
        
        let A_eval = a_pub_X.eval(&chi, &zeta);
        
        println!("\n=== Native A_eval Debug ===");
        println!("Native A_eval (ICICLE): {}", A_eval);
        println!("  Are A_eval(zeta=1) == A_eval(actual zeta)? {}", A_eval_zeta1 == A_eval);
        
        // Output bytes for Arkworks conversion in WASM
        let a_eval_bytes = A_eval.to_bytes_le();
        println!("Native A_eval bytes (little-endian hex): 0x{}", hex::encode(&a_eval_bytes));
        println!("a_pub[0]: {}", self.a_pub[0]);
        
        // Output ALL 64 IFFT coefficients for WASM
        println!("\n=== Native IFFT Coefficients (JSON array) ===");
        print!("[");
        for i in 0..64 {
            if i > 0 { print!(","); }
            let coeff_bytes = a_pub_X.get_coeff(i, 0).to_bytes_le();
            print!("\"{}\"", hex::encode(&coeff_bytes));
        }
        println!("]");
        println!("a_pub[1]: {}", self.a_pub[1]);
        if self.a_pub.len() > 63 {
            println!("a_pub[63]: {}", self.a_pub[63]);
        }
        
        // Print IFFT coefficients
        println!("\n--- IFFT Coefficients (Native) ---");
        for i in 0..8 {
            println!("coeff[{}]: {}", i, a_pub_X.get_coeff(i, 0));
        }
        println!("...");
        for i in 60..64 {
            println!("coeff[{}]: {}", i, a_pub_X.get_coeff(i, 0));
        }
        println!("============================\n");
        
        let lagrange_K0_eval = {
            let lagrange_K0_XY = {
                let mut k0_evals = vec![ScalarField::zero(); m_i];
                k0_evals[0] = ScalarField::one();
                DensePolynomialExt::from_rou_evals(
                    HostSlice::from_slice(&k0_evals),
                    m_i,
                    1,
                    None,
                    None
                )
            };
            lagrange_K0_XY.eval(&chi, &zeta)
        };
        
        println!("lagrange_K0_eval (Native): {}", lagrange_K0_eval);

        let LHS_A = 
            (proof0.U * proof3.V_eval)
            - proof0.W
            +(proof0.V - self.sigma.G * proof3.V_eval) * kappa1
            - proof0.Q_AX * t_n_eval
            - proof0.Q_AY * t_smax_eval;
        let F = 
            proof0.B
            + self.preprocess.s0 * thetas[0]
            + self.preprocess.s1 * thetas[1]
            + self.sigma.G * thetas[2];
        println!("\n--- Intermediate Values ---");
        println!("F: x={:?}, y={:?}", F.0.x, F.0.y);
        let G = 
            proof0.B
            + self.sigma.sigma_1.x * thetas[0]
            + self.sigma.sigma_1.y * thetas[1]
            + self.sigma.G * thetas[2];
        println!("\n🔍 LHS_C Term Debug (Native - ICICLE):");
        let lhs_c_term1_a = self.sigma.lagrange_KL * (proof3.R_eval - ScalarField::one());
        println!("  term1_a (lagrange_KL * (R_eval - 1)): x={:?}, y={:?}", lhs_c_term1_a.0.x, lhs_c_term1_a.0.y);
        
        println!("\n🔍 LHS_C Term Debug (Native - ARKWORKS):");
        let lhs_c_term1_a_ark = icicle_g1_affine_to_ark(&lhs_c_term1_a.0);
        println!("  term1_a (Arkworks): x={:?}, y={:?}", lhs_c_term1_a_ark.x, lhs_c_term1_a_ark.y);
        
        let lhs_c_term1_b = (G * proof3.R_eval - F * proof3.R_omegaX_eval) * (kappa0 * (chi - ScalarField::one()));
        let lhs_c_term1_b_ark = icicle_g1_affine_to_ark(&lhs_c_term1_b.0);
        println!("  term1_b (Arkworks): x={:?}, y={:?}", lhs_c_term1_b_ark.x, lhs_c_term1_b_ark.y);
        
        let lhs_c_term1_c = (G * proof3.R_eval - F * proof3.R_omegaX_omegaY_eval) * (kappa0.pow(2) * lagrange_K0_eval);
        let lhs_c_term1_c_ark = icicle_g1_affine_to_ark(&lhs_c_term1_c.0);
        println!("  term1_c (Arkworks): x={:?}, y={:?}", lhs_c_term1_c_ark.x, lhs_c_term1_c_ark.y);
        
        let lhs_c_term1_d = proof2.Q_CX * t_mi_eval;
        let lhs_c_term1_d_ark = icicle_g1_affine_to_ark(&lhs_c_term1_d.0);
        println!("  term1_d (Arkworks): x={:?}, y={:?}", lhs_c_term1_d_ark.x, lhs_c_term1_d_ark.y);
        
        let lhs_c_term1_e = proof2.Q_CY * t_smax_eval;
        let lhs_c_term1_e_ark = icicle_g1_affine_to_ark(&lhs_c_term1_e.0);
        println!("  term1_e (Arkworks): x={:?}, y={:?}", lhs_c_term1_e_ark.x, lhs_c_term1_e_ark.y);
        
        let LHS_C_term1 = 
            lhs_c_term1_a
            + lhs_c_term1_b
            + lhs_c_term1_c
            - lhs_c_term1_d
            - lhs_c_term1_e;
        let LHS_C_term1_ark = icicle_g1_affine_to_ark(&LHS_C_term1.0);
        println!("  LHS_C_term1 (Arkworks): x={:?}, y={:?}", LHS_C_term1_ark.x, LHS_C_term1_ark.y);
        
        let lhs_c_b = (proof1.R - self.sigma.G * proof3.R_eval) * kappa1.pow(3);
        let lhs_c_b_ark = icicle_g1_affine_to_ark(&lhs_c_b.0);
        println!("  lhs_c_b (Arkworks): x={:?}, y={:?}", lhs_c_b_ark.x, lhs_c_b_ark.y);
        
        let lhs_c_c = (proof1.R - self.sigma.G * proof3.R_omegaX_eval) * kappa2;
        let lhs_c_c_ark = icicle_g1_affine_to_ark(&lhs_c_c.0);
        println!("  lhs_c_c (Arkworks): x={:?}, y={:?}", lhs_c_c_ark.x, lhs_c_c_ark.y);
        
        let lhs_c_d = (proof1.R - self.sigma.G * proof3.R_omegaX_omegaY_eval) * kappa2.pow(2);
        let lhs_c_d_ark = icicle_g1_affine_to_ark(&lhs_c_d.0);
        println!("  lhs_c_d (Arkworks): x={:?}, y={:?}", lhs_c_d_ark.x, lhs_c_d_ark.y);
        
        println!("\n🔍 LHS_C Final Calculation (Native):");
        let lhs_c_a = LHS_C_term1 * kappa1.pow(2);
        let lhs_c_a_ark = icicle_g1_affine_to_ark(&lhs_c_a.0);
        println!("  lhs_c_a (term1 * kappa1^2, Arkworks): x={:?}, y={:?}", lhs_c_a_ark.x, lhs_c_a_ark.y);
        
        let lhs_c_temp1 = lhs_c_a + lhs_c_b;
        let lhs_c_temp1_ark = icicle_g1_affine_to_ark(&lhs_c_temp1.0);
        println!("  after + lhs_c_b (Arkworks): x={:?}, y={:?}", lhs_c_temp1_ark.x, lhs_c_temp1_ark.y);
        
        let lhs_c_temp2 = lhs_c_temp1 + lhs_c_c;
        let lhs_c_temp2_ark = icicle_g1_affine_to_ark(&lhs_c_temp2.0);
        println!("  after + lhs_c_c (Arkworks): x={:?}, y={:?}", lhs_c_temp2_ark.x, lhs_c_temp2_ark.y);
        
        let LHS_C = lhs_c_temp2 + lhs_c_d;
        let LHS_C_ark = icicle_g1_affine_to_ark(&LHS_C.0);
        println!("  LHS_C final (Arkworks): x={:?}, y={:?}", LHS_C_ark.x, LHS_C_ark.y);
        
        let scalar_a = ScalarField::one() + (kappa2 * kappa1.pow(4));
        let scalar_b = kappa2 * kappa1.pow(4) * A_eval;
        
        println!("\n🔍 LHS_B Debug:");
        println!("  scalar_a (1 + kappa2*kappa1^4): {}", scalar_a);
        println!("  scalar_b (kappa2*kappa1^4*A_eval): {}", scalar_b);
        
        let lhs_b_a = binding.A * scalar_a;
        println!("  lhs_b_a (binding.A * scalar_a ICICLE): x={:?}, y={:?}", lhs_b_a.0.x, lhs_b_a.0.y);
        
        // Convert to Arkworks and print
        let lhs_b_a_ark = icicle_g1_affine_to_ark(&lhs_b_a.0);
        println!("  lhs_b_a (ARKWORKS): x={:?}, y={:?}", lhs_b_a_ark.x, lhs_b_a_ark.y);
        
        let lhs_b_b = self.sigma.G * scalar_b;
        println!("  lhs_b_b (sigma.G * scalar_b ICICLE): x={:?}, y={:?}", lhs_b_b.0.x, lhs_b_b.0.y);
        
        // Convert to Arkworks and print
        let lhs_b_b_ark = icicle_g1_affine_to_ark(&lhs_b_b.0);
        println!("  lhs_b_b (ARKWORKS): x={:?}, y={:?}", lhs_b_b_ark.x, lhs_b_b_ark.y);
        
        let LHS_B = lhs_b_a - lhs_b_b;
        println!("  LHS_B (lhs_b_a - lhs_b_b ICICLE): x={:?}, y={:?}", LHS_B.0.x, LHS_B.0.y);
        
        // Convert to Arkworks and print
        let LHS_B_ark = icicle_g1_affine_to_ark(&LHS_B.0);
        println!("  LHS_B (ARKWORKS): x={:?}, y={:?}", LHS_B_ark.x, LHS_B_ark.y);
        
        println!("\n--- LHS Components (ICICLE) ---");
        println!("LHS_A: x={:?}, y={:?}", LHS_A.0.x, LHS_A.0.y);
        println!("LHS_B: x={:?}, y={:?}", LHS_B.0.x, LHS_B.0.y);
        println!("LHS_C: x={:?}, y={:?}", LHS_C.0.x, LHS_C.0.y);
        
        println!("\n--- LHS Components (ARKWORKS) ---");
        let LHS_A_ark = icicle_g1_affine_to_ark(&LHS_A.0);
        let LHS_C_ark = icicle_g1_affine_to_ark(&LHS_C.0);
        println!("LHS_A (ARKWORKS): x={:?}, y={:?}", LHS_A_ark.x, LHS_A_ark.y);
        println!("LHS_B (ARKWORKS): x={:?}, y={:?}", LHS_B_ark.x, LHS_B_ark.y);
        println!("LHS_C (ARKWORKS): x={:?}, y={:?}", LHS_C_ark.x, LHS_C_ark.y);
        
        println!("\n🔍 Final LHS Calculation (Native):");
        let lhs_ac_sum = LHS_A + LHS_C;
        let lhs_ac_sum_ark = icicle_g1_affine_to_ark(&lhs_ac_sum.0);
        println!("  (LHS_A + LHS_C) Arkworks: x={:?}, y={:?}", lhs_ac_sum_ark.x, lhs_ac_sum_ark.y);
        
        let lhs_term = lhs_ac_sum * kappa2;
        let lhs_term_ark = icicle_g1_affine_to_ark(&lhs_term.0);
        println!("  (LHS_A + LHS_C) * kappa2 Arkworks: x={:?}, y={:?}", lhs_term_ark.x, lhs_term_ark.y);
        
        let LHS = LHS_B + lhs_term;
        println!("LHS (ICICLE): x={:?}, y={:?}", LHS.0.x, LHS.0.y);
        
        // Convert to Arkworks for comparison
        let LHS_ark = icicle_g1_affine_to_ark(&LHS.0);
        println!("LHS (ARKWORKS): x={:?}, y={:?}", LHS_ark.x, LHS_ark.y);
        let AUX = 
            proof4.Pi_X * (kappa2 * chi)
            + proof4.Pi_Y * (kappa2 * zeta)
            + proof4.M_X * (kappa2.pow(2) * omega_m_i.inv() * chi)
            + proof4.M_Y * (kappa2.pow(2) * zeta)
            + proof4.N_X * (kappa2.pow(3) * omega_m_i.inv() * chi)
            + proof4.N_Y * (kappa2.pow(3) * omega_s_max.inv() * zeta);
        let AUX_X = 
            proof4.Pi_X * kappa2
            + proof4.M_X * kappa2.pow(2)
            + proof4.N_X * kappa2.pow(3);
        let AUX_Y = 
            proof4.Pi_Y * kappa2
            + proof4.M_Y * kappa2.pow(2)
            + proof4.N_Y * kappa2.pow(3);

    println!("\n--- Omega Values ---");
    println!("m_i: {}", m_i);
    println!("s_max: {}", s_max);
    println!("omega_m_i: {:?}", omega_m_i);
    println!("omega_s_max: {:?}", omega_s_max);
        
        println!("\n--- AUX Components ---");
        println!("AUX: x={:?}, y={:?}", AUX.0.x, AUX.0.y);
        println!("AUX_X: x={:?}, y={:?}", AUX_X.0.x, AUX_X.0.y);
        println!("AUX_Y: x={:?}, y={:?}", AUX_Y.0.x, AUX_Y.0.y);
        
        println!("\n--- Pairing Points ---");
        let lhs_aux = LHS + AUX;
        println!("LHS+AUX: x={:?}, y={:?}", lhs_aux.0.x, lhs_aux.0.y);
        println!("binding.O_inst: x={:?}, y={:?}", binding.O_inst.0.x, binding.O_inst.0.y);
        println!("binding.A: x={:?}, y={:?}", binding.A.0.x, binding.A.0.y);
        
        let left_pair = pairing(
            &[LHS + AUX,    proof0.B,                   proof0.U,                   proof0.V,                   proof0.W                 ],
            &[self.sigma.H, self.sigma.sigma_2.alpha4,  self.sigma.sigma_2.alpha,   self.sigma.sigma_2.alpha2,  self.sigma.sigma_2.alpha3]
        );
        let right_pair = pairing(
            &[binding.O_inst,            binding.O_mid,          binding.O_prv,              AUX_X,                  AUX_Y               ],
            &[self.sigma.sigma_2.gamma, self.sigma.sigma_2.eta, self.sigma.sigma_2.delta,   self.sigma.sigma_2.x,   self.sigma.sigma_2.y]
        );

        println!("\n--- Pairing Results ---");
        println!("Left pairing == Right pairing: {}", left_pair.eq(&right_pair));
        println!("=====================================\n");

        return left_pair.eq(&right_pair)
    }
    /*
    pub fn verify_arith(&self, binding: &Binding, proof0: &Proof0, proof1: &Proof1, proof2: &Proof2, proof3: &Proof3, proof4: &Proof4Test) -> bool {
        let (chi, zeta) = proof2.verify2();
        let kappa1 = proof3.verify3();

        let s_max = self.setup_params.s_max;
        let t_n_eval = chi.pow(self.setup_params.n) - ScalarField::one();
        let t_smax_eval = zeta.pow(s_max) - ScalarField::one();

        let LHS_A = 
            (proof0.U * proof3.V_eval)
            - proof0.W
            +(proof0.V - self.sigma.G * proof3.V_eval) * kappa1
            - proof0.Q_AX * t_n_eval
            - proof0.Q_AY * t_smax_eval;

        let AUX_A = 
            proof4.Pi_AX * chi
            + proof4.Pi_AY * zeta;

        let left_pair = pairing(
            &[LHS_A + AUX_A],
            &[self.sigma.H]
        );
        let right_pair = pairing(
            &[proof4.Pi_AX,             proof4.Pi_AY],
            &[self.sigma.sigma_2.x,     self.sigma.sigma_2.y]
        );
        return left_pair.eq(&right_pair)
    }

    pub fn verify_copy(&self, binding: &Binding, proof0: &Proof0, proof1: &Proof1, proof2: &Proof2, proof3: &Proof3, proof4: &Proof4Test) -> bool {
        let thetas = proof0.verify0();
        let kappa0 = proof1.verify1();
        let (chi, zeta) = proof2.verify2();
        let kappa1 = proof3.verify3();
        let kappa2 = ScalarCfg::generate_random(1)[0];

        let m_i = self.setup_params.l_D - self.setup_params.l;
        let s_max = self.setup_params.s_max;
        let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
        let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
        let t_mi_eval = chi.pow(m_i) - ScalarField::one();
        let t_smax_eval = zeta.pow(s_max) - ScalarField::one();
        
        let lagrange_K0_eval = {
            let lagrange_K0_XY = {
                let mut k0_evals = vec![ScalarField::zero(); m_i];
                k0_evals[0] = ScalarField::one();
                DensePolynomialExt::from_rou_evals(
                    HostSlice::from_slice(&k0_evals),
                    m_i,
                    1,
                    None,
                    None
                )
            };
            lagrange_K0_XY.eval(&chi, &zeta)
        };

        let F = 
            proof0.B
            + self.preprocess.s0 * thetas[0]
            + self.preprocess.s1 * thetas[1]
            + self.sigma.G * thetas[2];
        let G = 
            proof0.B
            + self.sigma.sigma_1.x * thetas[0]
            + self.sigma.sigma_1.y * thetas[1]
            + self.sigma.G * thetas[2];
        let LHS_C_term1 = 
            self.preprocess.lagrange_KL * (proof3.R_eval - ScalarField::one())
            + (G * proof3.R_eval - F * proof3.R_omegaX_eval) * (kappa0 * (chi - ScalarField::one()))
            + (G * proof3.R_eval - F * proof3.R_omegaX_omegaY_eval) * (kappa0.pow(2) * lagrange_K0_eval)
            - proof2.Q_CX * t_mi_eval
            - proof2.Q_CY * t_smax_eval;
        let LHS_C = 
            LHS_C_term1 * kappa1.pow(2)
            + (proof1.R - self.sigma.G * proof3.R_eval) * kappa1.pow(3)
            + (proof1.R - self.sigma.G * proof3.R_omegaX_eval) * kappa2
            + (proof1.R - self.sigma.G * proof3.R_omegaX_omegaY_eval) * kappa2.pow(2);
        
        println!("\n--- LHS Components ---");
        println!("LHS_A: x={:?}, y={:?}", LHS_A.0.x, LHS_A.0.y);
        println!("LHS_B: x={:?}, y={:?}", LHS_B.0.x, LHS_B.0.y);
        println!("LHS_C: x={:?}, y={:?}", LHS_C.0.x, LHS_C.0.y);
        
        let AUX_C = 
            proof4.Pi_CX * chi
            + proof4.Pi_CY * zeta
            + proof4.M_X * (kappa2 * omega_m_i.inv() * chi)
            + proof4.M_Y * (kappa2 * zeta)
            + proof4.N_X * (kappa2.pow(2) * omega_m_i.inv() * chi)
            + proof4.N_Y * (kappa2.pow(2) * omega_s_max.inv() * zeta);
        let AUX_X = 
            proof4.Pi_CX 
            + proof4.M_X * kappa2
            + proof4.N_X * kappa2.pow(2);
        let AUX_Y = 
            proof4.Pi_CY
            + proof4.M_Y * kappa2
            + proof4.N_Y * kappa2.pow(2);
        let left_pair = pairing(
            &[LHS_C + AUX_C],
            &[self.sigma.H]
        );
        let right_pair = pairing(
            &[AUX_X,                  AUX_Y               ],
            &[self.sigma.sigma_2.x,   self.sigma.sigma_2.y]
        );
        return left_pair.eq(&right_pair)
    }

    pub fn verify_binding(&self, binding: &Binding, proof0: &Proof0, proof1: &Proof1, proof2: &Proof2, proof3: &Proof3, proof4: &Proof4Test) -> bool {
        let thetas = proof0.verify0();
        let kappa0 = proof1.verify1();
        let (chi, zeta) = proof2.verify2();
        let kappa1 = proof3.verify3();
        let kappa2 = ScalarCfg::generate_random(1)[0];

        let m_i = self.setup_params.l_D - self.setup_params.l;
        let s_max = self.setup_params.s_max;
        let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
        let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
        let t_n_eval = chi.pow(self.setup_params.n) - ScalarField::one();
        let t_mi_eval = chi.pow(m_i) - ScalarField::one();
        let t_smax_eval = zeta.pow(s_max) - ScalarField::one();

        let a_pub_X = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&self.a_pub),
            self.setup_params.l_pub_in + self.setup_params.l_pub_out,
            1,
            None,
            None
        );
        let A_eval = a_pub_X.eval(&chi, &zeta);
        
        let lagrange_K0_eval = {
            let lagrange_K0_XY = {
                let mut k0_evals = vec![ScalarField::zero(); m_i];
                k0_evals[0] = ScalarField::one();
                DensePolynomialExt::from_rou_evals(
                    HostSlice::from_slice(&k0_evals),
                    m_i,
                    1,
                    None,
                    None
                )
            };
            lagrange_K0_XY.eval(&chi, &zeta)
        };
        let LHS_B =
            binding.A * ( ScalarField::one() + (kappa2 * kappa1.pow(4)) )
            - self.sigma.G * (kappa2 * kappa1.pow(4) * A_eval);
        let AUX_B = 
            proof4.Pi_B * (kappa2 * chi);
        let left_pair = pairing(
            &[LHS_B + AUX_B,    proof0.B,                   proof0.U,                   proof0.V,                   proof0.W                 ],
            &[self.sigma.H,     self.sigma.sigma_2.alpha4,  self.sigma.sigma_2.alpha,   self.sigma.sigma_2.alpha2,  self.sigma.sigma_2.alpha3]
        );
        let right_pair = pairing(
            &[binding.O_inst,            binding.O_mid,          binding.O_prv,              proof4.Pi_B * kappa2    ],
            &[self.sigma.sigma_2.gamma, self.sigma.sigma_2.eta, self.sigma.sigma_2.delta,   self.sigma.sigma_2.x    ]
        );
        return left_pair.eq(&right_pair)
    }

*/
}