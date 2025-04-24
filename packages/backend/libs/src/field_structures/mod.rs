use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use crate::iotools::{PlacementVariables, SetupParams, SubcircuitInfo, SubcircuitR1CS};
use super::vector_operations::{*};
use rand::Rng;
use std::ops::{Add, Mul, Sub};
use icicle_runtime::memory::HostSlice;
use icicle_core::hash::HashConfig;
use icicle_hash::keccak::Keccak256;

pub fn hashing(seed: &Vec<u8>) -> ScalarField {
    let keccak_hasher = Keccak256::new(0 /* default input size */).unwrap();
    let mut res_bytes = vec![0u8; 32]; // 32-byte output buffer
    keccak_hasher
    .hash(
        HostSlice::from_slice(seed),  // Input data
        &HashConfig::default(),                       // Default configuration
        HostSlice::from_mut_slice(&mut res_bytes),       // Output buffer
    )
    .unwrap();
    res_bytes[31] &= 0b0011_1111;
    return ScalarField::from_bytes_le(&res_bytes)
}

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

impl PlacementVariables {
    pub fn gen_dummy(setup_params: &SetupParams, subcircuit_infos: &[SubcircuitInfo]) -> Box<[Self]> {
        let dummy = Self { subcircuitId: 0, variables: vec!['0'.to_string()].into_boxed_slice() };
        let mut placement_variables_dummy: Box<[Self]> = vec![ dummy; setup_params.s_max].into_boxed_slice();
        for i in 0..setup_params.s_max {
            let mut rng = rand::thread_rng();
            let subcircuit_id: usize = if i == 0 {
                1
            } else if i== 1 {
                0
            } else {
                rng.gen_range(2..setup_params.s_D)
            };

            let variables_val = ScalarCfg::generate_random(subcircuit_infos[subcircuit_id].Nwires);
            let variables_hex: Vec<String> = variables_val.iter().map(|x| x.to_string()).collect();
            placement_variables_dummy[i] = Self {
                subcircuitId: subcircuit_id,
                variables: variables_hex.into_boxed_slice()
            };
        }

        return  placement_variables_dummy
    }
}
#[derive(Clone, Debug, Copy, PartialEq)]
pub struct FieldSerde(pub ScalarField);
impl Add for FieldSerde {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        FieldSerde(self.0 + other.0)
    }
}

impl Sub for FieldSerde {
    type Output = Self;

    fn sub(self, other: Self) -> Self {
        FieldSerde(self.0 - other.0)
    }
}

impl Mul for FieldSerde {
    type Output = Self;

    fn mul(self, other: Self) -> Self {
        FieldSerde(self.0 * other.0)
    }
}

// serde - original
impl Sub<ScalarField> for FieldSerde {
    type Output = Self;

    fn sub(self, other: ScalarField) -> Self {
        FieldSerde(self.0 - other)
    }
}

// original - serde
impl Sub<FieldSerde> for ScalarField {
    type Output = FieldSerde;

    fn sub(self, other: FieldSerde) -> Self::Output {
        FieldSerde(self - other.0)
    }
}

// serde + original
impl Add<ScalarField> for FieldSerde {
    type Output = Self;

    fn add(self, other: ScalarField) -> Self {
        FieldSerde(self.0 + other)
    }
}

// original + serde
impl Add<FieldSerde> for ScalarField {
    type Output = FieldSerde;

    fn add(self, other: FieldSerde) -> Self::Output {
        FieldSerde(self + other.0)
    }
}

// serde * original
impl Mul<ScalarField> for FieldSerde {
    type Output = Self;

    fn mul(self, other: ScalarField) -> Self {
        FieldSerde(self.0 * other)
    }
}

// original * serde
impl Mul<FieldSerde> for ScalarField {
    type Output = FieldSerde;

    fn mul(self, other: FieldSerde) -> Self::Output {
        FieldSerde(self * other.0)
    }
}

