use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
use icicle_core::traits::FieldImpl;
use icicle_core::vec_ops::transpose_matrix;
use icicle_runtime::memory::HostSlice;
use crate::iotools::{PlacementVariables, Instance, SetupParams, SubcircuitInfo, SubcircuitR1CS};
use crate::bivariate_polynomial::{DensePolynomialExt, BivariatePolynomial};
use crate::field_structures::Tau;
use crate::vector_operations::{*};
use std::collections::HashSet;

pub struct QAP{
    pub u_j_X: Vec<DensePolynomialExt>,
    pub v_j_X: Vec<DensePolynomialExt>,
    pub w_j_X: Vec<DensePolynomialExt>
}

pub fn from_subcircuit_to_QAP(
    compact_R1CS: &SubcircuitR1CS,
    setup_params: &SetupParams, 
    subcircuit_info: &SubcircuitInfo, 
) -> (Vec<DensePolynomialExt>, Vec<DensePolynomialExt>, Vec<DensePolynomialExt>) {
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

    return (u_j_X, v_j_X, w_j_X)
}

// pub struct GlobalVariables {
//     pub placementId: usize,
//     pub globalIdx: Box<[usize]>,
//     pub variables: Box<[String]>,
//     pub instance: Box<[ScalarField]>,
//     pub interface_wtns: Box<[Box<[ScalarField]>]>,
//     pub interface_wtns: Box<[Box<[ScalarField]>]>,
// }

// impl GlobalVariables {
//     pub fn from_placement_variables(local_var: PlacementVariables) -> io::Result<Self> {
//         let abs_path = env::current_dir()?.join(path);
//         let file = File::open(abs_path)?;
//         let reader = BufReader::new(file);
//         let data = from_reader(reader)?;
//         Ok(data)
//     }

    
// // }

macro_rules! define_gen_qapXY {
    ($func_name:ident, $mat_field:ident, $wires_field:ident) => {
        pub fn $func_name(
            placement_variables: &Box<[PlacementVariables]>,
            compact_library_R1CS: &Vec<SubcircuitR1CS>,
            setup_params: &SetupParams,
        ) -> DensePolynomialExt {
            let s_d = setup_params.s_D;
            let n = setup_params.n;
            let s_max = setup_params.s_max;
            if compact_library_R1CS.len() != s_d {
                panic!("Invalid subcircuit library composition");
            }

            let mut eval = vec![ScalarField::zero(); s_max * n];
            for i in 0..placement_variables.len() {
                let subcircuit_id = placement_variables[i].subcircuitId;
                let compact_mat = &compact_library_R1CS[subcircuit_id].$mat_field;
                let active_wires = &compact_library_R1CS[subcircuit_id].$wires_field;
                let variables = &placement_variables[i].variables;
                let d_len = active_wires.len();
                if d_len > 0 {
                    let mut d_vec = vec![ScalarField::zero(); d_len].into_boxed_slice();
                    for (compact_idx, &local_idx) in active_wires.iter().enumerate() {
                        d_vec[compact_idx] = ScalarField::from_hex(&variables[local_idx]);
                    }
                    let mut frag_eval = vec![ScalarField::zero(); n].into_boxed_slice();
                    matrix_matrix_mul(&d_vec, compact_mat, 1, d_len, n, &mut frag_eval);
                    eval[i*n .. (i+1)*n].clone_from_slice(&frag_eval);
                }
            }

            transpose_inplace(&mut eval, s_max, n);

            DensePolynomialExt::from_rou_evals(
                HostSlice::from_slice(&eval),
                n,
                s_max,
                None,
                None
            )
        }
    };
}

impl Instance {
    pub fn gen_a_pub_X(&self, setup_params: &SetupParams) -> DensePolynomialExt {
        let l_pub = setup_params.l_pub_in + setup_params.l_pub_out;
        let mut public_instance = vec![ScalarField::zero(); l_pub];
        for i in 0..l_pub {
            public_instance[i] = ScalarField::from_hex(&self.a[i]);
        }
        return DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&public_instance),
            l_pub,
            1,
            None,
            None
        )
    }
}

pub fn gen_bXY(placement_variables: &Box<[PlacementVariables]>, subcircuit_infos: &Box<[SubcircuitInfo]>, setup_params: &SetupParams) -> DensePolynomialExt {
    let l = setup_params.l;
    let l_d = setup_params.l_D;
    let s_max = setup_params.s_max;
    let m_i = l_d - l;
    let mut interface_witness  = vec![ScalarField::zero(); m_i * s_max].into_boxed_slice();
    for i in 0..placement_variables.len() {
        let local_variables = &placement_variables[i].variables;
        let global_idx_set = &subcircuit_infos[placement_variables[i].subcircuitId].flattenMap;
        if local_variables.len() != global_idx_set.len(){
            panic!("Corrupted placement variables.")
        }
        for j in 0..global_idx_set.len() {
            let global_idx = global_idx_set[j];
            let val_str: &str = &local_variables[j];
            if global_idx >= l && global_idx < l_d && val_str != "0x0" {
                interface_witness[(global_idx-l) * s_max + i] = ScalarField::from_hex(val_str);
            } 
        }
    }
    return DensePolynomialExt::from_rou_evals(
        HostSlice::from_slice(&interface_witness),
        m_i,
        s_max,
        None,
        None
    )
}

define_gen_qapXY!(gen_uXY, A_compact_col_mat, A_active_wires);
define_gen_qapXY!(gen_vXY, B_compact_col_mat, B_active_wires);
define_gen_qapXY!(gen_wXY, C_compact_col_mat, C_active_wires);