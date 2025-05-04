#![allow(non_snake_case)]
use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::iotools::{Permutation, PublicInstance, SetupParams, SubcircuitInfo};
use libs::group_structures::{G1serde, Preprocess, Sigma, SigmaVerify};
use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use icicle_core::ntt;
use prove::{*};
use libs::group_structures::pairing;

use std::vec;

pub struct Verifier {
    pub sigma: SigmaVerify,
    pub aX: DensePolynomialExt,
    pub preprocess: Preprocess,
    pub setup_params: SetupParams,
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
        
        // Assert l is a power of two
        if !l.is_power_of_two() {
            panic!("l is not a power of two.");
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

        // Load public instance
        let public_instance_path = "publicInstance.json";
        let public_instance = PublicInstance::from_path(&public_instance_path).unwrap();
        // Parsing the inputs
        let aX = public_instance.gen_aX(&setup_params);

        // Load Sigma (reference string)
        let sigma_path = "setup/trusted-setup/output/sigma_verify.json";
        let sigma = SigmaVerify::read_from_json(&sigma_path)
        .expect("No reference string is found. Run the Setup first.");
        println!{"sigma.sigma_1.x: {:?}", sigma.sigma_1.x}

        // Load Verifier preprocess
        let preprocess_path = "verify/preprocess/output/preprocess.json";
        let preprocess = Preprocess::read_from_json(&preprocess_path)
        .expect("No Verifier preprocess is found. Run the Preprocess first.");

        return Self {sigma, aX, setup_params, preprocess}
    }
    
    pub fn verify_all(&self, binding: &Binding, proof0: &Proof0, proof1: &Proof1, proof2: &Proof2, proof3: &Proof3, proof4: &Proof4) -> bool {
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

        println!("thetas: {:?}", thetas);
        println!("kappa0: {:?}", kappa0);
        println!("kappa1: {:?}", kappa1);
        println!("kappa2: {:?}", kappa2);
        println!("chi: {:?}", chi);
        println!("zeta: {:?}", zeta);
        println!("m_i: {:?}", m_i);
        println!("s_max: {:?}", s_max);
        println!("omega_m_i: {:?}", omega_m_i);
        println!("omega_s_max: {:?}", omega_s_max);
        println!("t_n_eval: {:?}", t_n_eval);
        println!("t_mi_eval: {:?}", t_mi_eval);
        println!("t_smax_eval: {:?}", t_smax_eval);

        let A_eval = self.aX.eval(&chi, &zeta);
        
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
            &[binding.O_pub,            binding.O_mid,          binding.O_prv,              AUX_X,                  AUX_Y               ],
            &[self.sigma.sigma_2.gamma, self.sigma.sigma_2.eta, self.sigma.sigma_2.delta,   self.sigma.sigma_2.x,   self.sigma.sigma_2.y]
        );
        return left_pair.eq(&right_pair)
    }

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
        println!("K0: {:?}", lagrange_K0_eval);

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

        let A_eval = self.aX.eval(&chi, &zeta);
        
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
        println!("A_pub: {:?}", A_eval);
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
            &[binding.O_pub,            binding.O_mid,          binding.O_prv,              proof4.Pi_B * kappa2    ],
            &[self.sigma.sigma_2.gamma, self.sigma.sigma_2.eta, self.sigma.sigma_2.delta,   self.sigma.sigma_2.x    ]
        );
        return left_pair.eq(&right_pair)
    }

}