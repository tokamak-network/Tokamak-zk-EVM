use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use crate::iotools::{SubcircuitR1CS, SubcircuitInfo, SetupParams};
use super::vector_operations::{*};
use std::collections::HashSet;

macro_rules! impl_Tau_struct {
    ( $($ScalarField:ident),* ) => {
        pub struct Tau {
            $(pub $ScalarField: ScalarField),*
        }

        impl Tau {
            pub fn gen() -> Self {
                Self {
                    $($ScalarField: ScalarCfg::generate_random(1)[0]),*
                }
            }
        }
    };
}
impl_Tau_struct!(x, y, alpha, gamma, delta, eta);

pub fn from_r1cs_to_evaled_qap_mixture(
    compact_R1CS: &SubcircuitR1CS,
    setup_params: &SetupParams, 
    subcircuit_info: &SubcircuitInfo, 
    tau: &Tau, 
    x_evaled_lagrange_vec: &Box<[ScalarField]>
) -> Box<[ScalarField]> {
    let compact_A_mat = &compact_R1CS.A_compact_col_mat;
    let compact_B_mat = &compact_R1CS.B_compact_col_mat;
    let compact_C_mat = &compact_R1CS.C_compact_col_mat;
    let active_wires_A = &compact_R1CS.A_active_wires;
    let active_wires_B = &compact_R1CS.B_active_wires;
    let active_wires_C = &compact_R1CS.C_active_wires;
    let u_len = active_wires_A.len();
    let v_len = active_wires_B.len();
    let w_len = active_wires_C.len();
    let n = setup_params.n;

    // Evaluate u,v,w polynomials at tau.x
    let mut evaled_u_compact_col_vec = vec![ScalarField::zero(); u_len].into_boxed_slice();
    let mut evaled_v_compact_col_vec = vec![ScalarField::zero(); v_len].into_boxed_slice();
    let mut evaled_w_compact_col_vec = vec![ScalarField::zero(); w_len].into_boxed_slice();

    matrix_matrix_mul(compact_A_mat, x_evaled_lagrange_vec, u_len, n, 1, &mut evaled_u_compact_col_vec);
    matrix_matrix_mul(compact_B_mat, x_evaled_lagrange_vec, v_len, n, 1, &mut evaled_v_compact_col_vec);
    matrix_matrix_mul(compact_C_mat, x_evaled_lagrange_vec, w_len, n, 1, &mut evaled_w_compact_col_vec);
    
    // // Collect all active wires to form o_i(x) := \alpha * u_i(x) + \alpha^2 * v_i(x) + \alpha^3 * w_i(x)
    // let mut active_wires_o = HashSet::new();
    // active_wires_o = active_wires_o.union(active_wires_A).copied().collect();
    // active_wires_o = active_wires_o.union(active_wires_B).copied().collect();
    // active_wires_o = active_wires_o.union(active_wires_C).copied().collect();
    // let o_len = active_wires_o.len();
    
    // Prepare vectors for final evaluation
    let o_len = subcircuit_info.Nwires;
    let mut evaled_u_vec = vec![ScalarField::zero(); o_len].into_boxed_slice();
    let mut evaled_v_vec = evaled_u_vec.clone();
    let mut evaled_w_vec = evaled_u_vec.clone();

    let mut ordered_active_wires_A: Vec<usize> = active_wires_A.iter().cloned().collect();
    ordered_active_wires_A.sort();
    for (idx_u, &idx_o) in ordered_active_wires_A.iter().enumerate() {
        evaled_u_vec[idx_o] = evaled_u_compact_col_vec[idx_u];
    }
    let mut ordered_active_wires_B: Vec<usize> = active_wires_B.iter().cloned().collect();
    ordered_active_wires_B.sort();
    for (idx_v, &idx_o) in ordered_active_wires_B.iter().enumerate() {
        evaled_v_vec[idx_o] = evaled_v_compact_col_vec[idx_v];
    }
    let mut ordered_active_wires_C: Vec<usize> = active_wires_C.iter().cloned().collect();
    ordered_active_wires_C.sort();
    for (idx_w, &idx_o) in ordered_active_wires_C.iter().enumerate() {
        evaled_w_vec[idx_o] = evaled_w_compact_col_vec[idx_w];
    }
    drop(evaled_u_compact_col_vec);
    drop(evaled_v_compact_col_vec);
    drop(evaled_w_compact_col_vec);
    
    let mut first_term_vec = vec![ScalarField::zero(); o_len].into_boxed_slice();
    let mut second_term_vec = vec![ScalarField::zero(); o_len].into_boxed_slice();
    scale_vec(tau.alpha, &evaled_u_vec, &mut first_term_vec);
    scale_vec(tau.alpha.pow(2), &evaled_v_vec, &mut second_term_vec);
    drop(evaled_u_vec);
    drop(evaled_v_vec);

    let mut third_term_vec = vec![ScalarField::zero(); o_len].into_boxed_slice();
    point_add_two_vecs(&first_term_vec, &second_term_vec, &mut third_term_vec);
    drop(first_term_vec);
    drop(second_term_vec);

    let mut fourth_term_vec = vec![ScalarField::zero(); o_len].into_boxed_slice();
    scale_vec(tau.alpha.pow(3), &evaled_w_vec, &mut fourth_term_vec);
    drop(evaled_w_vec);

    let mut evaled_o_vec = vec![ScalarField::zero(); o_len].into_boxed_slice();
    point_add_two_vecs(&third_term_vec, &fourth_term_vec, &mut evaled_o_vec);
    
    return evaled_o_vec
}