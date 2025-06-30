#![allow(non_snake_case)]
use hex::FromHex;
use icicle_core::hash::HashConfig;
use icicle_hash::keccak::Keccak256;
use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::iotools::{Instance, Permutation, PublicInputBuffer, PublicOutputBuffer, SetupParams, SubcircuitInfo};
use libs::group_structures::{G1serde, Preprocess, Sigma, SigmaVerify};
use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use icicle_core::ntt;
use prove::{*};
use libs::group_structures::pairing;

use std::vec;

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
    pub fn init() -> Self {
        // Load setup parameters from JSON file
        let setup_path = "setupParams.json";
        let setup_params = SetupParams::from_path(setup_path).unwrap();

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
        let instance_path = "instance.json";
        let instance = Instance::from_path(&instance_path).unwrap();
        // Parsing the inputs
        let mut a_pub = vec![ScalarField::zero(); l_pub].into_boxed_slice();
        for i in 0..l_pub {
            a_pub[i] = ScalarField::from_hex(&instance.a[i]);
        }

        // Load Sigma (reference string)
        let sigma_path = "setup/trusted-setup/output/sigma_verify.json";
        let sigma = SigmaVerify::read_from_json(&sigma_path)
        .expect("No reference string is found. Run the Setup first.");

        // Load Verifier preprocess
        let preprocess_path = "verify/preprocess/output/preprocess.json";
        let preprocess = Preprocess::read_from_json(&preprocess_path)
        .expect("No Verifier preprocess is found. Run the Preprocess first.");

        // Load Proof
        let proof_path = "prove/output/proof.json";
        let proof = Proof::read_from_json(&proof_path)
        .expect("No proof is found. Run the Prove first.");

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

    pub fn verify_keccak256(&self) -> bool {
        let l_pub_out = self.setup_params.l_pub_out;
        let keccak_in_pts = &self.publicOutputBuffer.outPts;
        let keccak_out_pts = &self.publicInputBuffer.inPts;
        
        let mut keccak_inputs_be_bytes= Vec::new();
        let mut prev_key: usize = 0;
        let mut data_restored: Vec<u8> = Vec::new();
        println!("1");
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
        println!("2");
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
        let mut flag = true;
        if keccak_inputs_be_bytes.len() != keccak_outputs_be_bytes.len() {
            panic!("Length mismatch between Keccak inputs and outputs.")
        }
        println!("3");
        for i in 0..keccak_inputs_be_bytes.len() {
            let data_in = &keccak_inputs_be_bytes[i];
            let mut res_bytes = vec![0u8; 32]; // 32-byte output buffer
            println!("4, {:?}", data_in);
            keccak_hasher
            .hash(
                HostSlice::from_slice(&data_in),  // Input data
                &HashConfig::default(),                       // Default configuration
                HostSlice::from_mut_slice(&mut res_bytes),       // Output buffer
            )
            .unwrap();
        println!("5, {:?}", res_bytes);
            if res_bytes != keccak_outputs_be_bytes[i] {
                flag = false;
            }
        }
        return flag
    }
    
    pub fn verify_snark(&self) -> bool {
        let binding = &self.proof.binding;
        let proof0 = &self.proof.proof0;
        let proof1= &self.proof.proof1;
        let proof2 = &self.proof.proof2;
        let proof3 = &self.proof.proof3; 
        let proof4 = &self.proof.proof4;

        let mut transcript_manager = TranscriptManager::new();

        // Compute challenges using the transcript manager
        let thetas = proof0.verify0_with_manager(&mut transcript_manager);
        let kappa0 = proof1.verify1_with_manager(&mut transcript_manager);
        let (chi, zeta) = proof2.verify2_with_manager(&mut transcript_manager);
        let kappa1 = proof3.verify3_with_manager(&mut transcript_manager);
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
        let LHS_B =
            binding.A * ( ScalarField::one() + (kappa2 * kappa1.pow(4)) )
            - self.sigma.G * (kappa2 * kappa1.pow(4) * A_eval);
        let LHS = LHS_B + ( (LHS_A + LHS_C) * kappa2 );
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

        let left_pair = pairing(
            &[LHS + AUX,    proof0.B,                   proof0.U,                   proof0.V,                   proof0.W                 ],
            &[self.sigma.H, self.sigma.sigma_2.alpha4,  self.sigma.sigma_2.alpha,   self.sigma.sigma_2.alpha2,  self.sigma.sigma_2.alpha3]
        );
        let right_pair = pairing(
            &[binding.O_inst,            binding.O_mid,          binding.O_prv,              AUX_X,                  AUX_Y               ],
            &[self.sigma.sigma_2.gamma, self.sigma.sigma_2.eta, self.sigma.sigma_2.delta,   self.sigma.sigma_2.x,   self.sigma.sigma_2.y]
        );

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