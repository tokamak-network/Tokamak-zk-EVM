use ark_ec::{AffineRepr, PrimeGroup};
use icicle_bls12_381::curve::ScalarCfg;
use icicle_bls12_381::polynomials::DensePolynomial as DensePolynomialBls12381;
use icicle_core::curve::Curve;
use icicle_core::traits::{FieldImpl, GenerateRandom};
use icicle_runtime::memory::HostSlice;

use icicle_core::polynomials::UnivariatePolynomial;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::iotools::{SetupParams, SubcircuitInfo};


pub struct QAP {
    pub u_j_X: Vec<DensePolynomialExt>,
    pub v_j_X: Vec<DensePolynomialExt>,
    pub w_j_X: Vec<DensePolynomialExt>,
}

impl QAP {
    /*  pub fn from_subcircuit_to_QAP(
          compact_R1CS: &SubcircuitR1CS,
          setup_params: &SetupParams,
          subcircuit_info: &SubcircuitInfo,
      ) -> QAP {
          let compact_A_mat = &compact_R1CS.A_compact_col_mat;
          let compact_B_mat = &compact_R1CS.B_compact_col_mat;
          let compact_C_mat = &compact_R1CS.C_compact_col_mat;
          let active_wires_A = &compact_R1CS.A_active_wires;
          let active_wires_B = &compact_R1CS.B_active_wires;
          let active_wires_C = &compact_R1CS.C_active_wires;
          let n = setup_params.n;
  
          // Reconstruct local u,v,w polynomials
          let zero_coef_vec = [ScalarField::zero()];
          let zero_coef = HostSlice::from_slice(&zero_coef_vec);
          let zero_poly = DensePolynomialExt::from_coeffs(zero_coef, 1, 1);
          let mut u_j_X = vec![zero_poly.clone(); subcircuit_info.Nwires];
          let mut v_j_X = vec![zero_poly.clone(); subcircuit_info.Nwires];
          let mut w_j_X = vec![zero_poly.clone(); subcircuit_info.Nwires];
  
          let mut ordered_active_wires_A: Vec<usize> = active_wires_A.iter().cloned().collect();
          ordered_active_wires_A.sort();
          for (idx_u, &idx_o) in ordered_active_wires_A.iter().enumerate() {
              let u_j_eval_vec = &compact_A_mat[idx_u * n .. (idx_u+1) * n];
              let u_j_eval = HostSlice::from_slice(&u_j_eval_vec);
              let u_j_poly = DensePolynomialExt::from_rou_evals(u_j_eval, n, 1, None, None);
              u_j_X[idx_o] = u_j_poly;
          }
          let mut ordered_active_wires_B: Vec<usize> = active_wires_B.iter().cloned().collect();
          ordered_active_wires_B.sort();
          for (idx_v, &idx_o) in ordered_active_wires_B.iter().enumerate() {
              let v_j_eval_vec = &compact_B_mat[idx_v * n .. (idx_v+1) * n];
              let v_j_eval = HostSlice::from_slice(&v_j_eval_vec);
              let v_j_poly = DensePolynomialExt::from_rou_evals(v_j_eval, n, 1, None, None);
              v_j_X[idx_o] = v_j_poly;
          }
          let mut ordered_active_wires_C: Vec<usize> = active_wires_C.iter().cloned().collect();
          ordered_active_wires_C.sort();
          for (idx_w, &idx_o) in ordered_active_wires_C.iter().enumerate() {
              let w_j_eval_vec = &compact_C_mat[idx_w * n .. (idx_w+1) * n];
              let w_j_eval = HostSlice::from_slice(&w_j_eval_vec);
              let w_j_poly = DensePolynomialExt::from_rou_evals(w_j_eval, n, 1, None, None);
              w_j_X[idx_o] = w_j_poly;
          }
  
          QAP{u_j_X, v_j_X, w_j_X}
      }*/
}

#[test]
fn test_poly() {
    // Load setup parameters from JSON file
    let setup_file_name = "setupParams.json";
    let setup_params = SetupParams::from_path(setup_file_name).unwrap();
    // Load subcircuit information
    let subcircuit_file_name = "subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(subcircuit_file_name).unwrap();

    let m_d = setup_params.m_D; // Total number of wires
    let s_d = setup_params.s_D; // Number of subcircuits
    let n = setup_params.n;     // Number of constraints per subcircuit
    let s_max = setup_params.s_max; // The maximum number of placements.
    // Additional wire-related parameters
    let l = setup_params.l;     // Number of public I/O wires
    let l_d = setup_params.l_D; // Number of interface wires
    // The last wire-related parameter
    let m_i = l_d - l;
    println!("Setup parameters: \n n = {:?}, \n s_max = {:?}, \n l = {:?}, \n m_I = {:?}, \n m_D = {:?}", n, s_max, l, m_i, m_d);


    /*let qap = QAP::from_subcircuit_to_QAP(&subcircuit_infos, &setup_params);
    for j in 0..m_d {
        let o_eval = o_evaled_vec[j];
        let u_eval = qap.u_j_X[j].eval(&tau.x, &ScalarField::one());
        let v_eval = qap.v_j_X[j].eval(&tau.x, &ScalarField::one());
        let w_eval = qap.w_j_X[j].eval(&tau.x, &ScalarField::one());
        let o_eval_est = tau.alpha * u_eval + tau.alpha.pow(2) * v_eval + tau.alpha.pow(3) * w_eval;
        assert_eq!(o_eval, o_eval_est);
    }*/
    println!("Checked: QAP loading");
}
#[test]
pub fn test_ro() {
    let mut f1 = randomize_poly::<DensePolynomialBls12381>(6, true /*from random coeffs*/);
    let f2 = randomize_poly::<DensePolynomialBls12381>(6, true /*from random coeffs*/);

    let scalar = ScalarCfg::generate_random(1)[0];
    f1 = f1.mul_by_scalar(&scalar);

    f1.add_assign(&f2);
}

fn randomize_poly<P>(size: usize, from_coeffs: bool) -> P
where
    P: UnivariatePolynomial,
    P::Field: FieldImpl,
    P::FieldConfig: GenerateRandom<P::Field>,
{
    println!("Randomizing polynomial of size {} (from_coeffs: {})", size, from_coeffs);
    let coeffs_or_evals = P::FieldConfig::generate_random(size);
    let p = if from_coeffs {
        P::from_coeffs(HostSlice::from_slice(&coeffs_or_evals), size)
    } else {
        P::from_rou_evals(HostSlice::from_slice(&coeffs_or_evals), size)
    };
    p
}
fn main() {}
