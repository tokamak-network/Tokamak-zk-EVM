#![allow(non_snake_case)]
use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::iotools::{Instance, SetupParams};
use libs::group_structures::{G1serde, G2serde, Sigma2};
use libs::iotools::{ArchivedSigmaVerifyRkyv, SigmaVerifyRkyv};
use libs::utils::{
    check_device, init_ntt_domain, load_setup_params_from_qap_path, prover_verifier_ntt_domain_size, setup_shape,
    validate_setup_shape,
};
use memmap2::Mmap;
use std::io;
use std::fs::File;
use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use icicle_core::ntt;
use prove::{*};
use libs::group_structures::pairing;
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

pub struct SigmaVerifyZeroCopy {
    mmap: Mmap,
}

impl SigmaVerifyZeroCopy {
    pub fn load(path: &PathBuf) -> std::io::Result<Self> {
        let file = File::open(path)?;
        let mmap = unsafe { Mmap::map(&file)? };
        rkyv::check_archived_root::<SigmaVerifyRkyv>(&mmap).map_err(|err| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Invalid sigma_verify archive: {err:?}"),
            )
        })?;
        Ok(Self { mmap })
    }

    fn sigma(&self) -> &ArchivedSigmaVerifyRkyv {
        // Safe because we validated the archive on load and the mmap lives with self.
        unsafe { rkyv::archived_root::<SigmaVerifyRkyv>(&self.mmap) }
    }

    pub fn g(&self) -> G1serde {
        self.sigma().g()
    }

    pub fn h(&self) -> G2serde {
        self.sigma().h()
    }

    pub fn sigma1_x(&self) -> G1serde {
        self.sigma().sigma1_x()
    }

    pub fn sigma1_y(&self) -> G1serde {
        self.sigma().sigma1_y()
    }

    pub fn sigma2(&self) -> Sigma2 {
        self.sigma().sigma2()
    }

    pub fn lagrange_kl(&self) -> G1serde {
        self.sigma().lagrange_kl()
    }
}

pub struct Verifier {
    pub sigma: SigmaVerifyZeroCopy,
    pub a_pub_X: DensePolynomialExt,
    // pub publicInputBuffer: PublicInputBuffer,
    // pub publicOutputBuffer: PublicOutputBuffer,
    pub preprocess: Preprocess,
    pub setup_params: SetupParams,
    pub proof: Proof,
}
impl Verifier {
    pub fn init(paths: &VerifyInputPaths) -> Self {
        let setup_params = load_setup_params_from_qap_path(paths.qap_path);
        let shape = setup_shape(&setup_params);
        validate_setup_shape(&shape);
        let ntt_domain_size = prover_verifier_ntt_domain_size(&shape);
        check_device();
        init_ntt_domain(ntt_domain_size);

        // Load instance
        let instance_path = PathBuf::from(paths.synthesizer_path).join("instance.json");
        let instance = Instance::read_from_json(instance_path).unwrap();
        // Parsing the inputs
        let a_pub_X = instance.gen_a_pub_X(&setup_params);

        // Load Sigma (reference string)
        let sigma_path = PathBuf::from(paths.setup_path).join("sigma_verify.rkyv");
        let sigma = SigmaVerifyZeroCopy::load(&sigma_path)
            .expect("No reference string is found. Run the Setup first (expected sigma_verify.rkyv).");

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
            a_pub_X, 
            // publicInputBuffer: instance.publicInputBuffer, 
            // publicOutputBuffer: instance.publicOutputBuffer, 
            setup_params, 
            preprocess,
            proof
        }
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

        let A_eval = self.a_pub_X.eval(&chi, &zeta);
        
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
            +(proof0.V - self.sigma.g() * proof3.V_eval) * kappa1
            - proof0.Q_AX * t_n_eval
            - proof0.Q_AY * t_smax_eval;
        let F = 
            proof0.B
            + self.preprocess.s0 * thetas[0]
            + self.preprocess.s1 * thetas[1]
            + self.sigma.g() * thetas[2];
        let G = 
            proof0.B
            + self.sigma.sigma1_x() * thetas[0]
            + self.sigma.sigma1_y() * thetas[1]
            + self.sigma.g() * thetas[2];
        let LHS_C_term1 = 
            self.sigma.lagrange_kl() * (proof3.R_eval - ScalarField::one())
            + (G * proof3.R_eval - F * proof3.R_omegaX_eval) * (kappa0 * (chi - ScalarField::one()))
            + (G * proof3.R_eval - F * proof3.R_omegaX_omegaY_eval) * (kappa0.pow(2) * lagrange_K0_eval)
            - proof2.Q_CX * t_mi_eval
            - proof2.Q_CY * t_smax_eval;
        let LHS_C = 
            LHS_C_term1 * kappa1.pow(2)
            + (proof1.R - self.sigma.g() * proof3.R_eval) * kappa1.pow(3)
            + (proof1.R - self.sigma.g() * proof3.R_omegaX_eval) * kappa2
            + (proof1.R - self.sigma.g() * proof3.R_omegaX_omegaY_eval) * kappa2.pow(2);
        let LHS_B =
            binding.A * ( ScalarField::one() + (kappa2 * kappa1.pow(4)) )
            - self.sigma.g() * (kappa2 * kappa1.pow(4) * A_eval);
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
            &[self.sigma.h(), self.sigma.sigma2().alpha4,  self.sigma.sigma2().alpha,   self.sigma.sigma2().alpha2,  self.sigma.sigma2().alpha3]
        );
        let right_pair = pairing(
            &[binding.O_inst,        binding.O_mid,              binding.O_prv,              AUX_X,                  AUX_Y               ],
            &[self.sigma.sigma2().gamma,   self.sigma.sigma2().eta,     self.sigma.sigma2().delta,   self.sigma.sigma2().x,   self.sigma.sigma2().y]
        );
        left_pair.eq(&right_pair)
    }

    pub fn verify_arith(&self, proof4: &Proof4Test) -> bool {
        let proof0 = &self.proof.proof0;
        let proof1 = &self.proof.proof1;
        let proof2 = &self.proof.proof2;
        let proof3 = &self.proof.proof3;
        
        let mut transcript_manager = TranscriptManager::new();

        // Compute challenges using the transcript manager
        let _thetas = proof0.verify0_with_manager(&mut transcript_manager);
        let _kappa0 = proof1.verify1_with_manager(&mut transcript_manager);
        let (chi, zeta) = proof2.verify2_with_manager(&mut transcript_manager);
        let kappa1 = proof3.verify3_with_manager(&mut transcript_manager);

        let s_max = self.setup_params.s_max;
        let t_n_eval = chi.pow(self.setup_params.n) - ScalarField::one();
        let t_smax_eval = zeta.pow(s_max) - ScalarField::one();

        let LHS_A = 
            (proof0.U * proof3.V_eval)
            - proof0.W
            +(proof0.V - self.sigma.g() * proof3.V_eval) * kappa1
            - proof0.Q_AX * t_n_eval
            - proof0.Q_AY * t_smax_eval;

        let AUX_A = 
            proof4.Pi_AX * chi
            + proof4.Pi_AY * zeta;

        let left_pair = pairing(
            &[LHS_A + AUX_A],
            &[self.sigma.h()]
        );
        let right_pair = pairing(
            &[proof4.Pi_AX,             proof4.Pi_AY],
            &[self.sigma.sigma2().x,     self.sigma.sigma2().y]
        );
        return left_pair.eq(&right_pair)
    }

    pub fn verify_copy(&self, proof4: &Proof4Test) -> bool {
        let proof0 = &self.proof.proof0;
        let proof1 = &self.proof.proof1;
        let proof2 = &self.proof.proof2;
        let proof3 = &self.proof.proof3;
        
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
            + self.sigma.g() * thetas[2];
        let G = 
            proof0.B
            + self.sigma.sigma1_x() * thetas[0]
            + self.sigma.sigma1_y() * thetas[1]
            + self.sigma.g() * thetas[2];
        let LHS_C_term1 = 
            self.sigma.lagrange_kl() * (proof3.R_eval - ScalarField::one())
            + (G * proof3.R_eval - F * proof3.R_omegaX_eval) * (kappa0 * (chi - ScalarField::one()))
            + (G * proof3.R_eval - F * proof3.R_omegaX_omegaY_eval) * (kappa0.pow(2) * lagrange_K0_eval)
            - proof2.Q_CX * t_mi_eval
            - proof2.Q_CY * t_smax_eval;
        let LHS_C = 
            LHS_C_term1 * kappa1.pow(2)
            + (proof1.R - self.sigma.g() * proof3.R_eval) * kappa1.pow(3)
            + (proof1.R - self.sigma.g() * proof3.R_omegaX_eval) * kappa2
            + (proof1.R - self.sigma.g() * proof3.R_omegaX_omegaY_eval) * kappa2.pow(2);
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
            &[self.sigma.h()]
        );
        let right_pair = pairing(
            &[AUX_X,                  AUX_Y               ],
            &[self.sigma.sigma2().x,   self.sigma.sigma2().y]
        );
        return left_pair.eq(&right_pair)
    }

    pub fn verify_binding(&self, proof4: &Proof4Test) -> bool {
        let binding = &self.proof.binding;
        let proof0 = &self.proof.proof0;
        let proof1 = &self.proof.proof1;
        let proof2 = &self.proof.proof2;
        let proof3 = &self.proof.proof3;
        
        let mut transcript_manager = TranscriptManager::new();

        // Compute challenges using the transcript manager
        let _thetas = proof0.verify0_with_manager(&mut transcript_manager);
        let _kappa0 = proof1.verify1_with_manager(&mut transcript_manager);
        let (chi, zeta) = proof2.verify2_with_manager(&mut transcript_manager);
        let kappa1 = proof3.verify3_with_manager(&mut transcript_manager);
        let kappa2 = ScalarCfg::generate_random(1)[0];

        let A_eval = self.a_pub_X.eval(&chi, &zeta);
        let LHS_B =
            binding.A * ( ScalarField::one() + (kappa2 * kappa1.pow(4)) )
            - self.sigma.g() * (kappa2 * kappa1.pow(4) * A_eval);
        let AUX_B = 
            proof4.Pi_B * (kappa2 * chi);
        let left_pair = pairing(
            &[LHS_B + AUX_B,    proof0.B,                   proof0.U,                   proof0.V,                   proof0.W                 ],
            &[self.sigma.h(),     self.sigma.sigma2().alpha4,  self.sigma.sigma2().alpha,   self.sigma.sigma2().alpha2,  self.sigma.sigma2().alpha3]
        );
        let right_pair = pairing(
            &[binding.O_inst,            binding.O_mid,              binding.O_prv,              proof4.Pi_B * kappa2    ],
            &[self.sigma.sigma2().gamma,       self.sigma.sigma2().eta,     self.sigma.sigma2().delta,   self.sigma.sigma2().x    ]
        );

        return left_pair.eq(&right_pair)
        
    }


}
