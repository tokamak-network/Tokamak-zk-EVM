#![allow(non_snake_case)]
use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::iotools::{Permutation, PlacementVariables, SetupParams, SubcircuitInfo, SubcircuitR1CS};
use libs::field_structures::{FieldSerde, hashing};
use libs::vector_operations::{point_div_two_vecs, resize, transpose_inplace};
use libs::group_structures::{Sigma, G1serde};
use libs::polynomial_structures::{gen_aX, gen_bXY, gen_uXY, gen_vXY, gen_wXY};
use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use icicle_core::ntt;
use serde::{Deserialize, Serialize};
use bincode;

use std::{vec, cmp};

macro_rules! poly_comb {
    ($a:expr) => { $a };
    ($a:expr, $($rest:expr),+) => {
        &$a + &poly_comb!($($rest),+)
    };
}

pub struct Mixer{
    pub rU_X: ScalarField,
    pub rU_Y: ScalarField,
    pub rV_X: ScalarField,
    pub rV_Y: ScalarField,
    pub rW_X: Vec<ScalarField>,
    pub rW_Y: Vec<ScalarField>,
    pub rB_X: Vec<ScalarField>,
    pub rB_Y: Vec<ScalarField>,
    pub rR_X: ScalarField,
    pub rR_Y: ScalarField,
    pub rO_mid: ScalarField,
}
pub struct Compiler{
    pub setup_params: SetupParams,
    pub subcircuit_infos: Box<[SubcircuitInfo]>,
    pub global_wire_list: Box<[Box<[usize]>]>,
    pub placement_variables: Box<[PlacementVariables]>,
    pub permutation_raw: Box<[Permutation]>
}
pub struct Instance{
    pub s0XY: DensePolynomialExt,
    pub s1XY: DensePolynomialExt,
    pub t_n: DensePolynomialExt,
    pub t_mi: DensePolynomialExt,
    pub t_smax: DensePolynomialExt,
    pub aX: DensePolynomialExt,
}
pub struct Witness{
    pub bXY: DensePolynomialExt,
    pub uXY: DensePolynomialExt,
    pub vXY: DensePolynomialExt,
    pub wXY: DensePolynomialExt,
    pub rXY: DensePolynomialExt,
}
pub struct Quotients{
    pub q0XY: DensePolynomialExt,
    pub q1XY: DensePolynomialExt,
    pub q2XY: DensePolynomialExt,
    pub q3XY: DensePolynomialExt,
    pub q4XY: DensePolynomialExt,
    pub q5XY: DensePolynomialExt,
    pub q6XY: DensePolynomialExt,
    pub q7XY: DensePolynomialExt,
}
pub struct Challenge{
    pub thetas: Box<[ScalarField]>,
    pub chi: ScalarField,
    pub zeta: ScalarField,
    pub kappa0: ScalarField,
    pub kappa1: ScalarField,
}
pub struct Prover{
    pub setup_params: SetupParams,
    pub sigma: Sigma,
    pub instance: Instance,
    pub witness: Witness,
    pub mixer: Mixer,
    pub quotients: Quotients
}
pub struct Binding {
    pub A: G1serde,
    pub O_pub: G1serde,
    pub O_mid: G1serde,
    pub O_prv: G1serde
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Proof0 {
    pub U: G1serde,
    pub V: G1serde,
    pub W: G1serde,
    pub Q_AX: G1serde,
    pub Q_AY: G1serde,
    pub B: G1serde
}
impl Proof0 {
    pub fn verify0(&self) -> Vec<ScalarField>{
        // TODO: Generate thetas
        let mut theta0_seed = bincode::serialize(&self).unwrap();
        theta0_seed.extend(&(0u64).to_le_bytes());
        
        let mut theta1_seed = bincode::serialize(&self).unwrap();
        theta1_seed.extend(&(1u64).to_le_bytes());

        let mut theta2_seed = bincode::serialize(&self).unwrap();
        theta2_seed.extend(&(2u64).to_le_bytes());
        
        return vec![
            hashing(&theta0_seed), 
            hashing(&theta1_seed),
            hashing(&theta2_seed)
            ]

    }
}
#[derive(Serialize, Deserialize, Debug)]
pub struct Proof1 {
    pub R: G1serde
}
impl Proof1 {
    pub fn verify1(&self) -> ScalarField{
        // TODO: Generate kappa_0
        let seed = bincode::serialize(&self).unwrap();
        return hashing(&seed)
    }
}
#[derive(Serialize, Deserialize, Debug)]
pub struct Proof2 {
    pub Q_CX: G1serde,
    pub Q_CY: G1serde
}
impl Proof2 {
    pub fn verify2(&self) -> (ScalarField, ScalarField) {
        // TODO: Generate chi and zeta
        let mut chi_seed = bincode::serialize(&self).unwrap();
        chi_seed.extend(&(0u64).to_le_bytes());
        
        let mut zeta_seed = bincode::serialize(&self).unwrap();
        zeta_seed.extend(&(1u64).to_le_bytes());

        return (
            hashing(&chi_seed), 
            hashing(&zeta_seed)
        )
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Proof3 {
    pub V_eval: FieldSerde,
    pub R_eval: FieldSerde,
    pub R_omegaX_eval: FieldSerde,
    pub R_omegaX_omegaY_eval: FieldSerde
}
impl Proof3 {
    pub fn verify3(&self) -> ScalarField {
        // TODO: Generate kappa1
        let seed = bincode::serialize(&self).unwrap();
        return hashing(&seed)
    }
}
#[derive(Serialize, Deserialize, Debug)]
pub struct Proof4 {
    pub Pi_X: G1serde,
    pub Pi_Y: G1serde,
    pub M_X: G1serde,
    pub M_Y: G1serde,
    pub N_X: G1serde,
    pub N_Y: G1serde
}

pub struct Proof4Test {
    pub Pi_AX: G1serde,
    pub Pi_AY: G1serde,
    pub Pi_CX: G1serde,
    pub Pi_CY: G1serde,
    pub Pi_B: G1serde,
    pub M_X: G1serde,
    pub M_Y: G1serde,
    pub N_X: G1serde,
    pub N_Y: G1serde
}

impl Prover{
    pub fn init() -> (Self, Binding) {
        // Load setup parameters from JSON file
        println!("Loading setup parameters...");
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

        // Load subcircuit information
        println!("Loading subcircuit information...");
        let subcircuit_path = "subcircuitInfo.json";
        let subcircuit_infos = SubcircuitInfo::from_path(subcircuit_path).unwrap();

        // Load local variables of placements (public instance + interface witness + internal witness)
        println!("Loading placement variables...");
        let placement_variables_path = "placementVariables.json";
        let placement_variables = PlacementVariables::from_path(&placement_variables_path).unwrap();

        let witness: Witness = {
            // Load subcircuit library R1CS
            println!("Loading subcircuits...");
            let mut compact_library_R1CS: Vec<SubcircuitR1CS> = Vec::new();
            for i in 0..s_d {
                println!("Loading subcircuit id {}", i);
                let r1cs_path: String = format!("json/subcircuit{i}.json");

                // Evaluate QAP for the current subcircuit
                let compact_r1cs = SubcircuitR1CS::from_path(&r1cs_path, &setup_params, &subcircuit_infos[i]).unwrap();
                compact_library_R1CS.push(compact_r1cs);
            }

            // Parsing the variables
            println!("Parsing the instance and witness...");
            println!("Generating b(X,Y)...");
            let bXY = gen_bXY(&placement_variables, &subcircuit_infos, &setup_params);
            println!("Generating u(X,Y)...");
            let uXY = gen_uXY(&placement_variables, &compact_library_R1CS, &setup_params);
            println!("Generating v(X,Y)...");
            let vXY = gen_vXY(&placement_variables, &compact_library_R1CS, &setup_params);
            println!("Generating w(X,Y)...");
            let wXY = gen_wXY(&placement_variables, &compact_library_R1CS, &setup_params);
            let rXY = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&vec![ScalarField::zero()]), 1, 1);
            Witness {bXY, uXY, vXY, wXY, rXY}
        };

        let quotients: Quotients = {
            let q0XY = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&vec![ScalarField::zero()]), 1, 1);
            let q1XY = q0XY.clone();
            let q2XY = q0XY.clone();
            let q3XY = q0XY.clone();
            let q4XY = q0XY.clone();
            let q5XY = q0XY.clone();
            let q6XY = q0XY.clone();
            let q7XY = q0XY.clone();
            Quotients {q0XY, q1XY, q2XY, q3XY, q4XY, q5XY, q6XY, q7XY}
        };

        // Load permutation (copy constraints of the variables)
        println!("Loading a permutation...");
        let permutation_path = "permutation.json";
        let permutation_raw = Permutation::from_path(&permutation_path).unwrap();

        let instance: Instance = {
            // Parsing the inputs
            println!("Generating a(X)...");
            let mut aX = gen_aX(&placement_variables, &subcircuit_infos, &setup_params);
            aX.optimize_size();
            // Fixed polynomials
            println!("Generating useful fixed polynomials...");
            let mut t_n_coeffs = vec![ScalarField::zero(); 2*n];
            t_n_coeffs[0] = ScalarField::zero() - ScalarField::one();
            t_n_coeffs[n] = ScalarField::one();
            let t_n = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_n_coeffs), 2*n, 1);
            let mut t_mi_coeffs = vec![ScalarField::zero(); 2*m_i];
            t_mi_coeffs[0] = ScalarField::zero() - ScalarField::one();
            t_mi_coeffs[m_i] = ScalarField::one();
            let t_mi = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_mi_coeffs), 2*m_i, 1);
            let mut t_smax_coeffs = vec![ScalarField::zero(); 2*s_max];
            t_smax_coeffs[0] = ScalarField::zero() - ScalarField::one();
            t_smax_coeffs[s_max] = ScalarField::one();
            let t_smax = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_smax_coeffs), 1, 2*s_max);
            // Generating permutation polynomials
            println!("Converting the permutation matrices into polynomials s^0 and s^1...");
            let (s0XY, s1XY) = Permutation::to_poly(&permutation_raw, m_i, s_max);

            Instance {aX, t_n, t_mi, t_smax, s0XY, s1XY}
        };

        #[cfg(feature = "testing-mode")] {
            // Checking Lemma 3
            let mut bXY_evals = vec![ScalarField::zero(); m_i*s_max];
            witness.bXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut bXY_evals));
            let mut s0XY_evals = vec![ScalarField::zero(); m_i*s_max];
            instance.s0XY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut s0XY_evals));
            let mut s1XY_evals = vec![ScalarField::zero(); m_i*s_max];
            instance.s1XY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut s1XY_evals));

            let mut X_mono_coef = vec![ScalarField::zero(); m_i];
            X_mono_coef[1] = ScalarField::one();
            let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), m_i, 1);
            drop(X_mono_coef);
            let mut Y_mono_coef = vec![ScalarField::zero(); s_max];
            Y_mono_coef[1] = ScalarField::one();
            let Y_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, s_max);
            drop(Y_mono_coef);
            let mut X_mono_evals = vec![ScalarField::zero(); m_i];
            X_mono.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut X_mono_evals));
            let mut Y_mono_evals = vec![ScalarField::zero(); s_max];
            Y_mono.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut Y_mono_evals));

            let thetas = ScalarCfg::generate_random(3);
            let fXY = &( &(&witness.bXY + &(&thetas[0] * &instance.s0XY)) + &(&thetas[1] * &instance.s1XY)) + &thetas[2];
            let gXY = &( &(&witness.bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono)) + &thetas[2];
            let mut fXY_evals = vec![ScalarField::zero(); m_i*s_max].into_boxed_slice();
            fXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut fXY_evals));
            let mut gXY_evals = vec![ScalarField::zero(); m_i*s_max].into_boxed_slice();
            gXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut gXY_evals));
            let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
            let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
    
            for i in 0..m_i {
                for j in 0..s_max {
                    assert!(X_mono_evals[i].eq(&omega_m_i.pow(i)));
                    assert!(Y_mono_evals[j].eq(&omega_s_max.pow(j)));
                }
            }
            let mut flag_b = true;
            let mut flag_s0 = true;
            let mut flag_s1 = true;
            let mut flag_r = true;
            for permEntry in &permutation_raw {
                let this_wire_idx = permEntry.row;
                let this_placement_idx = permEntry.col;
                let next_wire_idx = permEntry.X as usize;
                let next_placement_idx = permEntry.Y as usize;
    
                let this_idx = this_wire_idx * s_max + this_placement_idx;
                let next_idx = next_wire_idx * s_max + next_placement_idx;
    
                if !bXY_evals[this_idx].eq(&bXY_evals[next_idx]) {
                    flag_b = false;
                }
                if !s0XY_evals[this_idx].eq(&X_mono_evals[next_wire_idx]) {
                    flag_s0 = false;
                }
                if !s1XY_evals[this_idx].eq(&Y_mono_evals[next_placement_idx]) {
                    flag_s1 = false;
                }
                if !fXY_evals[this_idx].eq(&gXY_evals[next_idx]) {
                    flag_r = false;
                }
            }
            assert!(flag_b);
            println!("Checked: b(X,Y) satisfies the copy constraints.");
            assert!(flag_s0);
            println!("Checked: s^(0)(X,Y) is well-formed.");
            assert!(flag_s1);
            println!("Checked: s^(1)(X,Y) is well-formed.");
            assert!(flag_r);
            println!("Checked: f(X,Y) and g(X,Y) are well-formed.");
    
            let mut LHS = vec![ScalarField::zero(); 1];
            let mut RHS = vec![ScalarField::zero(); 1];
            let vec_ops = VecOpsConfig::default();
            ScalarCfg::product(HostSlice::from_slice(&fXY_evals), HostSlice::from_mut_slice(&mut LHS), &vec_ops).unwrap();
            ScalarCfg::product(HostSlice::from_slice(&gXY_evals), HostSlice::from_mut_slice(&mut RHS), &vec_ops).unwrap();
            assert!( LHS[0].eq( &RHS[0] ) );
            println!("Checked: Lemma 3");        
        }

        // Load Sigma (reference string)
        println!("Loading the reference string...");
        let sigma_path = "setup/trusted-setup/output/combined_sigma.json";
        let sigma = Sigma::read_from_json(&sigma_path)
        .expect("No reference string is found. Run the Setup first.");

        let mixer: Mixer = {
            let rU_X = ScalarCfg::generate_random(1)[0];
            let rU_Y = ScalarCfg::generate_random(1)[0];
            let rV_X = ScalarCfg::generate_random(1)[0];
            let rV_Y = ScalarCfg::generate_random(1)[0];
            let rW_X = resize(
                &ScalarCfg::generate_random(3), 
                3, 
                1, 
                4, 
                1, 
                ScalarField::zero()
            );
            let rW_Y = resize(
                &ScalarCfg::generate_random(3), 
                1, 
                3, 
                1, 
                4, 
                ScalarField::zero()
            );
            let rB_X = ScalarCfg::generate_random(2);
            let rB_Y = ScalarCfg::generate_random(2);
            let rO_mid = ScalarCfg::generate_random(1)[0];
            let rR_X = ScalarCfg::generate_random(1)[0];
            let rR_Y = ScalarCfg::generate_random(1)[0];
            Mixer {rB_X, rB_Y, rR_X, rR_Y, rU_X, rU_Y, rV_X, rV_Y, rW_X, rW_Y, rO_mid}
        };

        let binding: Binding = {
            let A = sigma.sigma_1.encode_poly(&instance.aX, &setup_params);
            let O_pub = sigma.sigma_1.encode_O_pub(&placement_variables, &subcircuit_infos, &setup_params);
            let O_mid_core = sigma.sigma_1.encode_O_mid_no_zk(&placement_variables, &subcircuit_infos, &setup_params);
            let O_mid = 
                O_mid_core
                + sigma.sigma_1.delta * mixer.rO_mid;
            let O_prv_core = sigma.sigma_1.encode_O_prv_no_zk(&placement_variables, &subcircuit_infos, &setup_params);
            let O_prv =
                O_prv_core
                - sigma.sigma_1.eta * mixer.rO_mid

                + sigma.sigma_1.delta_inv_alphak_xh_tx[0][0] * mixer.rU_X
                + sigma.sigma_1.delta_inv_alphak_xh_tx[1][0] * mixer.rV_X
                + (
                    sigma.sigma_1.delta_inv_alphak_xh_tx[2][0] * mixer.rW_X[0]
                    + sigma.sigma_1.delta_inv_alphak_xh_tx[2][1] * mixer.rW_X[1]
                    + sigma.sigma_1.delta_inv_alphak_xh_tx[2][2] * mixer.rW_X[2]
                )
                + (
                    sigma.sigma_1.delta_inv_alpha4_xj_tx[0] * mixer.rB_X[0]
                    + sigma.sigma_1.delta_inv_alpha4_xj_tx[1] * mixer.rB_X[1]
                )

                + sigma.sigma_1.delta_inv_alphak_yi_ty[0][0] * mixer.rU_Y
                + sigma.sigma_1.delta_inv_alphak_yi_ty[1][0] * mixer.rV_Y
                + (
                    sigma.sigma_1.delta_inv_alphak_yi_ty[2][0] * mixer.rW_Y[0]
                    + sigma.sigma_1.delta_inv_alphak_yi_ty[2][1] * mixer.rW_Y[1]
                    + sigma.sigma_1.delta_inv_alphak_yi_ty[2][2] * mixer.rW_Y[2]
                )
                + (
                    sigma.sigma_1.delta_inv_alphak_yi_ty[3][0] * mixer.rB_Y[0]
                    + sigma.sigma_1.delta_inv_alphak_yi_ty[3][1] * mixer.rB_Y[1]
                );
            Binding {A, O_pub, O_mid, O_prv}
        };
        return (
            Self {sigma, setup_params, instance, witness, mixer, quotients},
            binding
        )
    }

    pub fn prove0(&mut self) -> Proof0 {
        // Arithmetic constraints argument polynomials
        println!("Building a polynomial p_0(X,Y) for the arithmetic constraints and quotients of it...");
        let mut p0XY = &( &self.witness.uXY * &self.witness.vXY ) - &self.witness.wXY;
        (self.quotients.q0XY, self.quotients.q1XY) = p0XY.div_by_vanishing(
            self.setup_params.n as i64, 
            self.setup_params.s_max as i64
        );

        #[cfg(feature = "testing-mode")] {
            let x_e = ScalarCfg::generate_random(1)[0];
            let y_e = ScalarCfg::generate_random(1)[0];
            let p_0_eval = p0XY.eval(&x_e, &y_e);
            let q_0_eval = self.quotients.q0XY.eval(&x_e, &y_e);
            let q_1_eval = self.quotients.q1XY.eval(&x_e, &y_e);
            let t_n_eval = x_e.pow(self.setup_params.n) - ScalarField::one();
            let t_smax_eval = y_e.pow(self.setup_params.s_max) - ScalarField::one();
            assert!( p_0_eval.eq( &(q_0_eval * t_n_eval + q_1_eval * t_smax_eval) ) );
            println!("Checked: u(X,Y), v(X,Y), and w(X,Y) satisfy the arithmetic constraints.")
        }
        
        // Adding zero-knowledge
        println!("Adding zero-knowledge to the arithmetic constraints witnesses...");

        let rW_X = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&self.mixer.rW_X), 
            self.mixer.rW_X.len(), 
            1
        );
        let rW_Y = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&self.mixer.rW_Y), 
            1, 
            self.mixer.rW_Y.len()
        );

        let mut UXY = poly_comb!(
            self.witness.uXY,
            &self.mixer.rU_X * &self.instance.t_n,
            &self.mixer.rU_Y * &self.instance.t_smax
        );
        UXY.optimize_size();
        let mut VXY = poly_comb!(
            self.witness.vXY,
            &self.mixer.rV_X * &self.instance.t_n,
            &self.mixer.rV_Y * &self.instance.t_smax
        );
        VXY.optimize_size();
        let mut WXY = poly_comb!(
            self.witness.wXY,
            &rW_X * &self.instance.t_n,
            &rW_Y * &self.instance.t_smax
        );
        WXY.optimize_size();
        let mut Q_AX_XY = poly_comb!(
            self.quotients.q0XY,
            &self.mixer.rU_X * &self.witness.vXY,
            &self.mixer.rV_X * &self.witness.uXY,
            -&rW_X,
            &(self.mixer.rU_X * self.mixer.rV_X) * &self.instance.t_n,
            &(self.mixer.rU_Y * self.mixer.rV_X) * &self.instance.t_smax
        );
        Q_AX_XY.optimize_size();
        let mut Q_AY_XY = poly_comb!(
            self.quotients.q1XY,
            &self.mixer.rU_Y * &self.witness.vXY,
            &self.mixer.rV_Y * &self.witness.uXY,
            -&rW_Y,
            &(self.mixer.rU_X * self.mixer.rV_Y) * &self.instance.t_n,
            &(self.mixer.rU_Y * self.mixer.rV_Y) * &self.instance.t_smax
        );
        Q_AY_XY.optimize_size();

        let rB_X = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&self.mixer.rB_X), 
            self.mixer.rB_X.len(), 
            1
        );
        let rB_Y = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&self.mixer.rB_Y), 
            1, 
            self.mixer.rB_Y.len()
        );

        let term_B_zk = &(&rB_X * &self.instance.t_mi) + &(&rB_Y * &self.instance.t_smax);
        let mut BXY = &self.witness.bXY + &term_B_zk;
        BXY.optimize_size();

        let U = self.sigma.sigma_1.encode_poly(&UXY, &self.setup_params);
        let V = self.sigma.sigma_1.encode_poly(&VXY, &self.setup_params);
        let W = self.sigma.sigma_1.encode_poly(&WXY, &self.setup_params);
        let Q_AX = self.sigma.sigma_1.encode_poly(&Q_AX_XY, &self.setup_params);
        let Q_AY = self.sigma.sigma_1.encode_poly(&Q_AY_XY, &self.setup_params);
        let B = self.sigma.sigma_1.encode_poly(&BXY, &self.setup_params);

        return Proof0 {U, V, W, Q_AX, Q_AY, B}
    }

    pub fn prove1(&mut self, thetas: &Vec<ScalarField>) -> Proof1{
        let m_i = self.setup_params.l_D - self.setup_params.l;
        let s_max = self.setup_params.s_max;

        let mut X_mono_coef = vec![ScalarField::zero(); 2];
        X_mono_coef[1] = ScalarField::one();
        let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), 2, 1);
        drop(X_mono_coef);

        let mut Y_mono_coef = vec![ScalarField::zero(); 2];
        Y_mono_coef[1] = ScalarField::one();
        let Y_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, 2);
        drop(Y_mono_coef);

        let fXY = &( &(&self.witness.bXY + &(&thetas[0] * &self.instance.s0XY)) + &(&thetas[1] * &self.instance.s1XY)) + &thetas[2];
        let gXY = &( &(&self.witness.bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono)) + &thetas[2];

        let mut fXY_evals = vec![ScalarField::zero(); m_i*s_max].into_boxed_slice();
        fXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut fXY_evals));
        let mut gXY_evals = vec![ScalarField::zero(); m_i*s_max].into_boxed_slice();
        gXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut gXY_evals));

        // Generating the recursion polynomial r(X,Y)
        println!("Generating r(X,Y)...");
        let mut rXY_evals = vec![ScalarField::zero(); m_i * s_max];
        let mut scalers_tr = vec![ScalarField::zero(); m_i * s_max];
        point_div_two_vecs(&gXY_evals, &fXY_evals, &mut scalers_tr);
        transpose_inplace(&mut scalers_tr, m_i, s_max);
        rXY_evals[m_i * s_max - 1] = ScalarField::one();
        for idx in (0..m_i * s_max- 1).rev() {
            rXY_evals[idx] = rXY_evals[idx+1] * scalers_tr[idx+1];
        }
        transpose_inplace(&mut rXY_evals, s_max, m_i);

        self.witness.rXY = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&rXY_evals),
            m_i, 
            s_max, 
            None, 
            None
        );

        #[cfg(feature = "testing-mode")] {
            let mut flag1 = true;
            for row_idx in 1..m_i - 1 {
                for col_idx in 0..s_max-1 {
                    let this_idx = row_idx * s_max + col_idx;
                    let ref_idx = (row_idx - 1) * s_max  + col_idx;
                    if !(rXY_evals[this_idx] * gXY_evals[this_idx]).eq(&(rXY_evals[ref_idx] * fXY_evals[this_idx])) {
                        flag1 = false;
                    }
                }
            }
            assert!(flag1);
            let mut flag2 = true;
            for col_idx in 0..s_max-1 {
                let this_idx = col_idx;
                let ref_idx = s_max * (m_i - 1) + col_idx - 1;
                if !(rXY_evals[this_idx] * gXY_evals[this_idx]).eq(&(rXY_evals[ref_idx] * fXY_evals[this_idx])) {
                    flag2 = false;
                }
            }
            assert!(flag2);
            println!("Checked: r(X,Y) is well constructed.")
        }
        
        // Adding zero-knowledge to the copy constraint argument
        let mut RXY = &self.witness.rXY + &(&(&self.mixer.rR_X * &self.instance.t_mi) + &(&self.mixer.rR_Y * &self.instance.t_smax));
        RXY.optimize_size();
        let R = self.sigma.sigma_1.encode_poly(&RXY, &self.setup_params);
        return Proof1 {R}
    }
    
    pub fn prove2(&mut self, thetas: &Vec<ScalarField>, kappa0: ScalarField) -> Proof2 {
        let m_i = self.setup_params.l_D - self.setup_params.l;
        let s_max = self.setup_params.s_max;
        let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
        let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
        let r_omegaX = self.witness.rXY.scale_coeffs_x(&omega_m_i.inv());
        let r_omegaX_omegaY = r_omegaX.scale_coeffs_y(&omega_s_max.inv());
        #[cfg(feature = "testing-mode")] {
            let x_e = ScalarCfg::generate_random(1)[0];
            let y_e = ScalarCfg::generate_random(1)[0];
            let r_eval = self.witness.rXY.eval(&x_e, &y_e);
            let r_eval_from_r_omegaX = r_omegaX.eval(&(omega_m_i * x_e), &y_e);
            let r_eval_from_r_omegaX_omegaY = r_omegaX_omegaY.eval(&(omega_m_i * x_e), &(omega_s_max * y_e));

            assert!( r_eval.eq( &(r_eval_from_r_omegaX) ) );
            assert!( r_eval.eq( &(r_eval_from_r_omegaX_omegaY) ) );    
        }
        let mut X_mono_coef = vec![ScalarField::zero(); 2];
        X_mono_coef[1] = ScalarField::one();
        let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), 2, 1);

        let mut Y_mono_coef = vec![ScalarField::zero(); 2];
        Y_mono_coef[1] = ScalarField::one();
        let Y_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, 2);

        let fXY = &( &(&self.witness.bXY + &(&thetas[0] * &self.instance.s0XY)) + &(&thetas[1] * &self.instance.s1XY)) + &thetas[2];
        let gXY = &( &(&self.witness.bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono)) + &thetas[2];

        // Generating the copy constraints argumet polynomials p_1(X,Y), p_2(X,Y), p_3(X,Y)
        println!("Generating p_1(X,Y), p_2(X,Y), p_3(X,Y)...");
        let mut k_evals = vec![ScalarField::zero(); m_i];
        k_evals[m_i - 1] = ScalarField::one();
        let lagrange_K_XY = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&k_evals),
            m_i,
            1,
            None,
            None
        );
        drop(k_evals);
        let mut k0_evals = vec![ScalarField::zero(); m_i];
        k0_evals[0] = ScalarField::one();
        let lagrange_K0_XY = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&k0_evals),
            m_i,
            1,
            None,
            None
        );
        drop(k0_evals);
        let mut l_evals = vec![ScalarField::zero(); s_max];
        l_evals[s_max - 1] = ScalarField::one();
        let lagrange_L_XY = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&l_evals),
            1,
            s_max,
            None,
            None
        );
        drop(l_evals);

        let lagrange_KL_XY = &lagrange_K_XY * &lagrange_L_XY;
        
        let mut p1XY = &(&self.witness.rXY - &ScalarField::one()) * &(lagrange_KL_XY);
        let mut p2XY = &(&X_mono - &ScalarField::one()) * &(
            &(&self.witness.rXY * &gXY) - &(&r_omegaX * &fXY)
        );
        let mut p3XY = &lagrange_K0_XY * &(
            &(&self.witness.rXY * &gXY) - &(&r_omegaX_omegaY * &fXY)
        );

        (self.quotients.q2XY, self.quotients.q3XY) = p1XY.div_by_vanishing(m_i as i64, s_max as i64);
        (self.quotients.q4XY, self.quotients.q5XY) = p2XY.div_by_vanishing(m_i as i64, s_max as i64);
        (self.quotients.q6XY, self.quotients.q7XY) = p3XY.div_by_vanishing(m_i as i64, s_max as i64);
        #[cfg(feature = "testing-mode")] {
            let x_e = ScalarCfg::generate_random(1)[0];
            let y_e = ScalarCfg::generate_random(1)[0];
            let p_1_eval = p1XY.eval(&x_e, &y_e);
            let p_2_eval = p2XY.eval(&x_e, &y_e);
            let p_3_eval = p3XY.eval(&x_e, &y_e);
            let q_2_eval = self.quotients.q2XY.eval(&x_e, &y_e);
            let q_3_eval = self.quotients.q3XY.eval(&x_e, &y_e);
            let q_4_eval = self.quotients.q4XY.eval(&x_e, &y_e);
            let q_5_eval = self.quotients.q5XY.eval(&x_e, &y_e);
            let q_6_eval = self.quotients.q6XY.eval(&x_e, &y_e);
            let q_7_eval = self.quotients.q7XY.eval(&x_e, &y_e);
    
            let t_mi_eval = x_e.pow(m_i) - ScalarField::one();
            let t_smax_eval = y_e.pow(s_max) - ScalarField::one();
            assert!( p_1_eval.eq( &(q_2_eval * t_mi_eval + q_3_eval * t_smax_eval) ) );
            assert!( p_2_eval.eq( &(q_4_eval * t_mi_eval + q_5_eval * t_smax_eval) ) );    
            assert!( p_3_eval.eq( &(q_6_eval * t_mi_eval + q_7_eval * t_smax_eval) ) );
            println!("Checked: r(X,Y) satisfy the recursion for the copy constraints.")
        }
        
        // Adding zero-knowledge to the copy constraint argument
        println!("Adding zero-knowledge to the copy constraints witnesses...");

        let rB_X = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&self.mixer.rB_X), 
            self.mixer.rB_X.len(), 
            1
        );
        let rB_Y = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&self.mixer.rB_Y), 
            1, 
            self.mixer.rB_Y.len()
        );

        let r_D1 = &self.witness.rXY - &r_omegaX; 
        let r_D2 = &self.witness.rXY - &r_omegaX_omegaY;
        let g_D = &gXY - &fXY;

        let Q_CX: G1serde = {
            let term1 = poly_comb!(
                &(&rB_X * &(&X_mono - &ScalarField::one())) * &r_D1,
                &(&self.mixer.rR_X * &(&X_mono - &ScalarField::one())) * &g_D
            );
            let term2 = poly_comb!(
                &(&rB_X * &lagrange_K0_XY) * &r_D2,
                &(&self.mixer.rR_X * &lagrange_K0_XY) * &g_D
            );
            let mut Q_CX_XY = poly_comb!(
                self.quotients.q2XY,
                &kappa0 * &self.quotients.q4XY,
                &kappa0.pow(2) * &self.quotients.q6XY,
                &self.mixer.rR_X * &lagrange_KL_XY,
                &kappa0 * &term1,
                &kappa0.pow(2) * &term2
            );
            Q_CX_XY.optimize_size();
            self.sigma.sigma_1.encode_poly(&Q_CX_XY, &self.setup_params)
        };

        let Q_CY: G1serde = {
            let term3 = poly_comb!(
                &(&rB_Y * &(&X_mono - &ScalarField::one())) * &r_D1,
                &(&self.mixer.rR_Y * &(&X_mono - &ScalarField::one())) * &g_D
            );
            let term4 = poly_comb!(
                &(&rB_Y * &lagrange_K0_XY) * &r_D2,
                &(&self.mixer.rR_Y * &lagrange_K0_XY) * &g_D
            );
            let Q_CY_XY = poly_comb!(
                self.quotients.q3XY,
                &kappa0 * &self.quotients.q5XY,
                &kappa0.pow(2) * &self.quotients.q7XY,
                &self.mixer.rR_Y * &lagrange_KL_XY,
                &kappa0 * &term3,
                &kappa0.pow(2) * &term4
            );
            self.sigma.sigma_1.encode_poly(&Q_CY_XY, &self.setup_params)
        };
        return Proof2 {Q_CX, Q_CY}
    }

    pub fn prove3(&self, chi: ScalarField, zeta: ScalarField) -> Proof3 {
        let m_i = self.setup_params.l_D - self.setup_params.l;
        let s_max = self.setup_params.s_max;
        let V_eval: ScalarField = {
            let VXY = poly_comb!(
                self.witness.vXY,
                &self.mixer.rV_X * &self.instance.t_n,
                &self.mixer.rV_Y * &self.instance.t_smax
            );
            VXY.eval(&chi, &zeta)
        };

        let RXY = &self.witness.rXY + &(&(&self.mixer.rR_X * &self.instance.t_mi) + &(&self.mixer.rR_Y * &self.instance.t_smax));
        let R_eval = RXY.eval(&chi, &zeta);

        let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
        let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);

        let R_omegaX_XY = RXY.scale_coeffs_x(&omega_m_i.inv());
        let R_omegaX_eval = R_omegaX_XY.eval(&chi, &zeta);

        let R_omegaX_omegaY_XY = R_omegaX_XY.scale_coeffs_y(&omega_s_max.inv());
        let R_omegaX_omegaY_eval = R_omegaX_omegaY_XY.eval(&chi, &zeta);

        return Proof3 {
            V_eval: FieldSerde(V_eval), 
            R_eval: FieldSerde(R_eval), 
            R_omegaX_eval: FieldSerde(R_omegaX_eval), 
            R_omegaX_omegaY_eval: FieldSerde(R_omegaX_omegaY_eval)
        }
    }

    pub fn prove4(&self, proof3: &Proof3, thetas: &Vec<ScalarField>, kappa0: ScalarField, chi: ScalarField, zeta: ScalarField, kappa1: ScalarField) -> (Proof4, Proof4Test) {
        let (Pi_AX, Pi_AY) = {
            let (mut Pi_AX_XY, mut Pi_AY_XY, rem) = {
                let t_n_eval = self.instance.t_n.eval(&chi, &ScalarField::one());
                let t_smax_eval = self.instance.t_smax.eval(&ScalarField::one(), &zeta);
                let small_v_eval = self.witness.vXY.eval(&chi, &zeta);

                let rW_X = DensePolynomialExt::from_coeffs(
                    HostSlice::from_slice(&self.mixer.rW_X), 
                    self.mixer.rW_X.len(), 
                    1
                );
                let rW_Y = DensePolynomialExt::from_coeffs(
                    HostSlice::from_slice(&self.mixer.rW_Y), 
                    1, 
                    self.mixer.rW_Y.len()
                );

                let VXY = poly_comb!(
                    self.witness.vXY,
                    &self.mixer.rV_X * &self.instance.t_n,
                    &self.mixer.rV_Y * &self.instance.t_smax
                );

                let pA_XY = poly_comb!(
                    // for KZG of V
                    &kappa1 * &(&VXY - &proof3.V_eval.0),

                    // for Arithmetic constraints
                    &self.witness.uXY * &small_v_eval,
                    -&self.witness.wXY,
                    -&(&self.quotients.q0XY * &t_n_eval),
                    -&(&self.quotients.q1XY * &t_smax_eval),

                    // for zero-knowledge
                    &( &(small_v_eval * self.mixer.rU_X) * &self.instance.t_n ) + &( &(small_v_eval * self.mixer.rU_Y) * &self.instance.t_smax ),
                    -&(&self.witness.vXY * &( (self.mixer.rU_X * t_n_eval) + (self.mixer.rU_Y * t_smax_eval) )),
                    &rW_X * &(&t_n_eval - &self.instance.t_n),
                    &rW_Y * &( &t_smax_eval - &self.instance.t_smax )
                );
                pA_XY.div_by_ruffini(&chi, &zeta)
            };
            Pi_AX_XY.optimize_size();
            Pi_AY_XY.optimize_size();
            (
                self.sigma.sigma_1.encode_poly(&Pi_AX_XY, &self.setup_params),
                self.sigma.sigma_1.encode_poly(&Pi_AY_XY, &self.setup_params)
            )
        };

        let m_i = self.setup_params.l_D - self.setup_params.l;
        let s_max = self.setup_params.s_max;
        let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
        let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
        let RXY = &self.witness.rXY + &(&(&self.mixer.rR_X * &self.instance.t_mi) + &(&self.mixer.rR_Y * &self.instance.t_smax));
        let (M_X, M_Y) = {
            let (mut M_X_XY, mut M_Y_XY, rem2) = (&RXY - &proof3.R_omegaX_eval.0).div_by_ruffini(
                &(omega_m_i.inv() * chi), 
                &zeta
            );
            #[cfg(feature = "testing-mode")] {
                assert_eq!(rem2, ScalarField::zero());
                let x_e = ScalarCfg::generate_random(1)[0];
                let y_e = ScalarCfg::generate_random(1)[0];
                let lhs = (&RXY - &proof3.R_omegaX_eval.0).eval(&x_e, &y_e);
                let rhs = M_X_XY.eval(&x_e, &y_e) * (x_e - omega_m_i.inv() * chi) + M_Y_XY.eval(&x_e, &y_e) * (y_e - zeta);
                assert_eq!(lhs, rhs);
            }
            M_X_XY.optimize_size();
            M_Y_XY.optimize_size();
            (
                self.sigma.sigma_1.encode_poly(&M_X_XY, &self.setup_params),
                self.sigma.sigma_1.encode_poly(&M_Y_XY, &self.setup_params)
            )
        };

        let (N_X, N_Y) = {
            let (mut N_X_XY, mut N_Y_XY, rem3) = (&RXY - &proof3.R_omegaX_omegaY_eval.0).div_by_ruffini(
                &(omega_m_i.inv() * chi), 
                &(omega_s_max.inv() * zeta)
            );
            #[cfg(feature = "testing-mode")] {
                assert_eq!(rem3, ScalarField::zero());
                let x_e = ScalarCfg::generate_random(1)[0];
                let y_e = ScalarCfg::generate_random(1)[0];
                let lhs = (&RXY - &proof3.R_omegaX_omegaY_eval.0).eval(&x_e, &y_e);
                let rhs = N_X_XY.eval(&x_e, &y_e) * (x_e - omega_m_i.inv() * chi) + N_Y_XY.eval(&x_e, &y_e) * (y_e - omega_s_max.inv() * zeta);
                assert_eq!(lhs, rhs);
            }
            N_X_XY.optimize_size();
            N_Y_XY.optimize_size();
            (
                self.sigma.sigma_1.encode_poly(&N_X_XY, &self.setup_params),
                self.sigma.sigma_1.encode_poly(&N_Y_XY, &self.setup_params)
            )
        };
        
        let (Pi_CX, Pi_CY) = {
            let LHS_for_copy = {
                let r_omegaX = self.witness.rXY.scale_coeffs_x(&omega_m_i.inv());
                let r_omegaX_omegaY = r_omegaX.scale_coeffs_y(&omega_s_max.inv());
                let mut X_mono_coef = vec![ScalarField::zero(); 2];
                X_mono_coef[1] = ScalarField::one();
                let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), 2, 1);
                drop(X_mono_coef);
                let (fXY, gXY) = {
                    let mut Y_mono_coef = vec![ScalarField::zero(); 2];
                    Y_mono_coef[1] = ScalarField::one();
                    let Y_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, 2);
                    (
                        &( &(&self.witness.bXY + &(&thetas[0] * &self.instance.s0XY)) + &(&thetas[1] * &self.instance.s1XY)) + &thetas[2],
                        &( &(&self.witness.bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono)) + &thetas[2]
                    )
                };
                let t_mi_eval = chi.pow(m_i) - ScalarField::one();
                let t_s_max_eval = zeta.pow(s_max) - ScalarField::one();
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
                let lagrange_K0_eval = lagrange_K0_XY.eval(&chi, &zeta);
    
                let pC_XY = {
                    let small_r_eval = self.witness.rXY.eval(&chi, &zeta);
                    let small_r_omegaX_eval = r_omegaX.eval(&chi, &zeta);
                    let small_r_omegaX_omegaY_eval = r_omegaX_omegaY.eval(&chi, &zeta);
                    let lagrange_KL_XY = {
                        let mut k_evals = vec![ScalarField::zero(); m_i];
                        k_evals[m_i - 1] = ScalarField::one();
                        let lagrange_K_XY = DensePolynomialExt::from_rou_evals(
                            HostSlice::from_slice(&k_evals),
                            m_i,
                            1,
                            None,
                            None
                        );
                        let mut l_evals = vec![ScalarField::zero(); s_max];
                        l_evals[s_max - 1] = ScalarField::one();
                        let lagrange_L_XY = DensePolynomialExt::from_rou_evals(
                            HostSlice::from_slice(&l_evals),
                            1,
                            s_max,
                            None,
                            None
                        );
                        &lagrange_K_XY * &lagrange_L_XY
                    };
                    let term5 = poly_comb!(
                        &small_r_eval * &gXY,
                        -&(&small_r_omegaX_eval * &fXY)
                    );
                    let term6 = poly_comb!(
                        &small_r_eval * &gXY,
                        -&(&small_r_omegaX_omegaY_eval * &fXY)
                    );
                    let term7 = poly_comb!(
                        self.quotients.q2XY,
                        &kappa0 * &self.quotients.q4XY,
                        &kappa0.pow(2) * &self.quotients.q6XY
                    );
                    let term8 = poly_comb!(
                        self.quotients.q3XY,
                        &kappa0 * &self.quotients.q5XY,
                        &kappa0.pow(2) * &self.quotients.q7XY
                    );
                    poly_comb!(
                        &(small_r_eval - ScalarField::one()) * &lagrange_KL_XY,
                        &(kappa0 * (chi - ScalarField::one()) ) * &term5,
                        &(kappa0.pow(2) * lagrange_K0_eval ) * &term6,
                        -&(&t_mi_eval * &term7),
                        -&(&t_s_max_eval * &term8)
                    )
                };
                let (LHS_zk1, LHS_zk2) = {
                    let r_D1 = &self.witness.rXY - &r_omegaX; 
                    let r_D2 = &self.witness.rXY - &r_omegaX_omegaY;
                    let (term9, term_B_zk) = {
                        let rB_X = DensePolynomialExt::from_coeffs(
                            HostSlice::from_slice(&self.mixer.rB_X), 
                            self.mixer.rB_X.len(), 
                            1
                        );
                        let rB_Y = DensePolynomialExt::from_coeffs(
                            HostSlice::from_slice(&self.mixer.rB_Y), 
                            1, 
                            self.mixer.rB_Y.len()
                        );
                        (
                            &(&t_mi_eval * &rB_X) + &(&t_s_max_eval * &rB_Y),
                            &(&rB_X * &self.instance.t_mi) + &(&rB_Y * &self.instance.t_smax)
                        )
                    };
                    let term10 = &(self.mixer.rR_X * t_mi_eval + self.mixer.rR_Y * t_s_max_eval) * &(&gXY - &fXY);
                    (
                        poly_comb!(
                            &( (chi - ScalarField::one()) * r_D1.eval(&chi, &zeta) ) * &term_B_zk,
                            -&( &( &(&X_mono - &ScalarField::one()) * &r_D1 ) * &term9 ),
                            &term10 * &(&chi - &X_mono)
                        ),
                        poly_comb!(
                            &( lagrange_K0_eval * r_D2.eval(&chi, &zeta) ) * &term_B_zk,
                            -&( &(&lagrange_K0_XY * &r_D2) * &term9 ),
                            &term10 * &(&lagrange_K0_eval - &lagrange_K0_XY)
                        )
                    )
                };
    
                poly_comb!(
                    &kappa1.pow(2) * &pC_XY,
                    &(kappa1.pow(2) * kappa0) * &LHS_zk1,
                    &(kappa1.pow(2) * kappa0.pow(2)) * &LHS_zk2,
                    &kappa1.pow(3) * &(&RXY - &proof3.R_eval.0)
                )
            };

            let (mut Pi_CX_XY, mut Pi_CY_XY, rem1) = LHS_for_copy.div_by_ruffini(&chi, &zeta);
            #[cfg(feature = "testing-mode")] {
                assert_eq!(rem1, ScalarField::zero());
                let x_e = ScalarCfg::generate_random(1)[0];
                let y_e = ScalarCfg::generate_random(1)[0];
                let lhs = LHS_for_copy.eval(&x_e, &y_e);
                let rhs = Pi_CX_XY.eval(&x_e, &y_e) * (x_e - chi) + Pi_CY_XY.eval(&x_e, &y_e) * (y_e - zeta);
                assert_eq!(lhs, rhs);
            }
            Pi_CX_XY.optimize_size();
            Pi_CY_XY.optimize_size();
            (
                self.sigma.sigma_1.encode_poly(&Pi_CX_XY, &self.setup_params),
                self.sigma.sigma_1.encode_poly(&Pi_CY_XY, &self.setup_params)
            )
        };
        #[cfg(feature = "testing-mode")] {
            println!("Checked: B(X,Y) and R(X,Y) with zero-knowledge satisfy the copy constraints.")
        }
        drop(RXY);
        let Pi_B = {
            let A_eval = self.instance.aX.eval(&chi, &zeta);
            let (mut pi_B_XY, _, _) = (&self.instance.aX - &A_eval).div_by_ruffini(&chi, &zeta);
            pi_B_XY.optimize_size();
            self.sigma.sigma_1.encode_poly(&pi_B_XY, &self.setup_params) * kappa1.pow(4)
        };

        let Pi_X = Pi_AX + Pi_CX + Pi_B;
        let Pi_Y = Pi_AY + Pi_CY;

        return (
            Proof4 {Pi_X, Pi_Y, M_X, M_Y, N_X, N_Y},
            Proof4Test {Pi_CX, Pi_CY, Pi_AX, Pi_AY, Pi_B, M_X, M_Y, N_X, N_Y}
        )
    }


}