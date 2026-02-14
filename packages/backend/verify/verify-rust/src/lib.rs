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

struct VerificationChallenges {
    thetas: Vec<ScalarField>,
    kappa0: ScalarField,
    chi: ScalarField,
    zeta: ScalarField,
    kappa1: ScalarField,
    kappa2: ScalarField,
}

struct VerificationDomainContext {
    m_i: usize,
    omega_m_i: ScalarField,
    omega_s_max: ScalarField,
    t_n_eval: ScalarField,
    t_mi_eval: ScalarField,
    t_smax_eval: ScalarField,
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
        let a_pub_X = instance.gen_a_free_X(&setup_params);

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

    fn collect_challenges(&self) -> VerificationChallenges {
        let proof0 = &self.proof.proof0;
        let proof1 = &self.proof.proof1;
        let proof2 = &self.proof.proof2;
        let proof3 = &self.proof.proof3;
        let mut transcript_manager = TranscriptManager::new();
        let thetas = proof0.verify0_with_manager(&mut transcript_manager);
        let kappa0 = proof1.verify1_with_manager(&mut transcript_manager);
        let (chi, zeta) = proof2.verify2_with_manager(&mut transcript_manager);
        let kappa1 = proof3.verify3_with_manager(&mut transcript_manager);
        let kappa2 = ScalarCfg::generate_random(1)[0];
        VerificationChallenges {
            thetas,
            kappa0,
            chi,
            zeta,
            kappa1,
            kappa2,
        }
    }

    fn build_domain_context(&self, challenges: &VerificationChallenges) -> VerificationDomainContext {
        let m_i = self.setup_params.l_D - self.setup_params.l;
        let s_max = self.setup_params.s_max;
        VerificationDomainContext {
            m_i,
            omega_m_i: ntt::get_root_of_unity::<ScalarField>(m_i as u64),
            omega_s_max: ntt::get_root_of_unity::<ScalarField>(s_max as u64),
            t_n_eval: challenges.chi.pow(self.setup_params.n) - ScalarField::one(),
            t_mi_eval: challenges.chi.pow(m_i) - ScalarField::one(),
            t_smax_eval: challenges.zeta.pow(s_max) - ScalarField::one(),
        }
    }

    fn eval_lagrange_k0(&self, domain: &VerificationDomainContext, challenges: &VerificationChallenges) -> ScalarField {
        let lagrange_K0_XY = {
            let mut k0_evals = vec![ScalarField::zero(); domain.m_i];
            k0_evals[0] = ScalarField::one();
            DensePolynomialExt::from_rou_evals(
                HostSlice::from_slice(&k0_evals),
                domain.m_i,
                1,
                None,
                None
            )
        };
        lagrange_K0_XY.eval(&challenges.chi, &challenges.zeta)
    }

    fn eval_a_pub(&self, challenges: &VerificationChallenges) -> ScalarField {
        self.a_pub_X.eval(&challenges.chi, &challenges.zeta)
    }

    fn lhs_arith(&self, domain: &VerificationDomainContext, challenges: &VerificationChallenges) -> G1serde {
        let proof0 = &self.proof.proof0;
        let proof3 = &self.proof.proof3;
        (proof0.U * proof3.V_eval)
            - proof0.W
            + (proof0.V - self.sigma.g() * proof3.V_eval) * challenges.kappa1
            - proof0.Q_AX * domain.t_n_eval
            - proof0.Q_AY * domain.t_smax_eval
    }

    fn lhs_copy(
        &self,
        domain: &VerificationDomainContext,
        challenges: &VerificationChallenges,
        lagrange_k0_eval: ScalarField,
    ) -> G1serde {
        let proof0 = &self.proof.proof0;
        let proof1 = &self.proof.proof1;
        let proof2 = &self.proof.proof2;
        let proof3 = &self.proof.proof3;
        let F = proof0.B
            + self.preprocess.s0 * challenges.thetas[0]
            + self.preprocess.s1 * challenges.thetas[1]
            + self.sigma.g() * challenges.thetas[2];
        let G = proof0.B
            + self.sigma.sigma1_x() * challenges.thetas[0]
            + self.sigma.sigma1_y() * challenges.thetas[1]
            + self.sigma.g() * challenges.thetas[2];
        let LHS_C_term1 = self.sigma.lagrange_kl() * (proof3.R_eval - ScalarField::one())
            + (G * proof3.R_eval - F * proof3.R_omegaX_eval)
                * (challenges.kappa0 * (challenges.chi - ScalarField::one()))
            + (G * proof3.R_eval - F * proof3.R_omegaX_omegaY_eval)
                * (challenges.kappa0.pow(2) * lagrange_k0_eval)
            - proof2.Q_CX * domain.t_mi_eval
            - proof2.Q_CY * domain.t_smax_eval;
        LHS_C_term1 * challenges.kappa1.pow(2)
            + (proof1.R - self.sigma.g() * proof3.R_eval) * challenges.kappa1.pow(3)
            + (proof1.R - self.sigma.g() * proof3.R_omegaX_eval) * challenges.kappa2
            + (proof1.R - self.sigma.g() * proof3.R_omegaX_omegaY_eval) * challenges.kappa2.pow(2)
    }

    fn lhs_binding(&self, challenges: &VerificationChallenges, a_eval: ScalarField) -> G1serde {
        let binding = &self.proof.binding;
        binding.A_free * (ScalarField::one() + (challenges.kappa2 * challenges.kappa1.pow(4)))
            - self.sigma.g() * (challenges.kappa2 * challenges.kappa1.pow(4) * a_eval)
    }

    fn snark_aux(
        &self,
        proof4: &Proof4,
        domain: &VerificationDomainContext,
        challenges: &VerificationChallenges,
    ) -> (G1serde, G1serde, G1serde) {
        let AUX = proof4.Pi_X * (challenges.kappa2 * challenges.chi)
            + proof4.Pi_Y * (challenges.kappa2 * challenges.zeta)
            + proof4.M_X * (challenges.kappa2.pow(2) * domain.omega_m_i.inv() * challenges.chi)
            + proof4.M_Y * (challenges.kappa2.pow(2) * challenges.zeta)
            + proof4.N_X * (challenges.kappa2.pow(3) * domain.omega_m_i.inv() * challenges.chi)
            + proof4.N_Y * (challenges.kappa2.pow(3) * domain.omega_s_max.inv() * challenges.zeta);
        let AUX_X = proof4.Pi_X * challenges.kappa2
            + proof4.M_X * challenges.kappa2.pow(2)
            + proof4.N_X * challenges.kappa2.pow(3);
        let AUX_Y = proof4.Pi_Y * challenges.kappa2
            + proof4.M_Y * challenges.kappa2.pow(2)
            + proof4.N_Y * challenges.kappa2.pow(3);
        (AUX, AUX_X, AUX_Y)
    }

    fn copy_aux(
        &self,
        proof4: &Proof4Test,
        domain: &VerificationDomainContext,
        challenges: &VerificationChallenges,
    ) -> (G1serde, G1serde, G1serde) {
        let AUX_C = proof4.Pi_CX * challenges.chi
            + proof4.Pi_CY * challenges.zeta
            + proof4.M_X * (challenges.kappa2 * domain.omega_m_i.inv() * challenges.chi)
            + proof4.M_Y * (challenges.kappa2 * challenges.zeta)
            + proof4.N_X * (challenges.kappa2.pow(2) * domain.omega_m_i.inv() * challenges.chi)
            + proof4.N_Y * (challenges.kappa2.pow(2) * domain.omega_s_max.inv() * challenges.zeta);
        let AUX_X = proof4.Pi_CX
            + proof4.M_X * challenges.kappa2
            + proof4.N_X * challenges.kappa2.pow(2);
        let AUX_Y = proof4.Pi_CY
            + proof4.M_Y * challenges.kappa2
            + proof4.N_Y * challenges.kappa2.pow(2);
        (AUX_C, AUX_X, AUX_Y)
    }

    fn arith_aux(&self, proof4: &Proof4Test, challenges: &VerificationChallenges) -> G1serde {
        proof4.Pi_AX * challenges.chi + proof4.Pi_AY * challenges.zeta
    }

    pub fn verify_snark(&self) -> bool {
        let binding = &self.proof.binding;
        let proof0 = &self.proof.proof0;
        let proof4 = &self.proof.proof4;
        let challenges = self.collect_challenges();
        let domain = self.build_domain_context(&challenges);
        let lagrange_k0_eval = self.eval_lagrange_k0(&domain, &challenges);
        let a_eval = self.eval_a_pub(&challenges);
        let lhs_a = self.lhs_arith(&domain, &challenges);
        let lhs_c = self.lhs_copy(&domain, &challenges, lagrange_k0_eval);
        let lhs_b = self.lhs_binding(&challenges, a_eval);
        let lhs = lhs_b + ((lhs_a + lhs_c) * challenges.kappa2);
        let (aux, aux_x, aux_y) = self.snark_aux(proof4, &domain, &challenges);

        let left_pair = pairing(
            &[lhs + aux,    proof0.B,                   proof0.U,                   proof0.V,                   proof0.W                 ],
            &[self.sigma.h(), self.sigma.sigma2().alpha4,  self.sigma.sigma2().alpha,   self.sigma.sigma2().alpha2,  self.sigma.sigma2().alpha3]
        );
        let right_pair = pairing(
            &[self.preprocess.O_pub_fix + binding.O_pub_free,    binding.O_mid,              binding.O_prv,              aux_x,                  aux_y               ],
            &[self.sigma.sigma2().gamma,   self.sigma.sigma2().eta,     self.sigma.sigma2().delta,   self.sigma.sigma2().x,   self.sigma.sigma2().y]
        );
        left_pair.eq(&right_pair)
    }

    pub fn verify_arith(&self, proof4: &Proof4Test) -> bool {
        let challenges = self.collect_challenges();
        let domain = self.build_domain_context(&challenges);
        let lhs_a = self.lhs_arith(&domain, &challenges);
        let aux_a = self.arith_aux(proof4, &challenges);

        let left_pair = pairing(
            &[lhs_a + aux_a],
            &[self.sigma.h()]
        );
        let right_pair = pairing(
            &[proof4.Pi_AX,             proof4.Pi_AY],
            &[self.sigma.sigma2().x,     self.sigma.sigma2().y]
        );
        return left_pair.eq(&right_pair)
    }

    pub fn verify_copy(&self, proof4: &Proof4Test) -> bool {
        let challenges = self.collect_challenges();
        let domain = self.build_domain_context(&challenges);
        let lagrange_k0_eval = self.eval_lagrange_k0(&domain, &challenges);
        let lhs_c = self.lhs_copy(&domain, &challenges, lagrange_k0_eval);
        let (aux_c, aux_x, aux_y) = self.copy_aux(proof4, &domain, &challenges);
        let left_pair = pairing(
            &[lhs_c + aux_c],
            &[self.sigma.h()]
        );
        let right_pair = pairing(
            &[aux_x,                  aux_y               ],
            &[self.sigma.sigma2().x,   self.sigma.sigma2().y]
        );
        return left_pair.eq(&right_pair)
    }

    pub fn verify_binding(&self, proof4: &Proof4Test) -> bool {
        let binding = &self.proof.binding;
        let proof0 = &self.proof.proof0;
        let challenges = self.collect_challenges();
        let a_eval = self.eval_a_pub(&challenges);
        let lhs_b = self.lhs_binding(&challenges, a_eval);
        let aux_b = proof4.Pi_B * (challenges.kappa2 * challenges.chi);
        let left_pair = pairing(
            &[lhs_b + aux_b,    proof0.B,                   proof0.U,                   proof0.V,                   proof0.W                 ],
            &[self.sigma.h(),     self.sigma.sigma2().alpha4,  self.sigma.sigma2().alpha,   self.sigma.sigma2().alpha2,  self.sigma.sigma2().alpha3]
        );
        let right_pair = pairing(
            &[self.preprocess.O_pub_fix + binding.O_pub_free,    binding.O_mid,              binding.O_prv,              proof4.Pi_B * challenges.kappa2    ],
            &[self.sigma.sigma2().gamma,       self.sigma.sigma2().eta,     self.sigma.sigma2().delta,   self.sigma.sigma2().x    ]
        );

        return left_pair.eq(&right_pair)
        
    }


}
