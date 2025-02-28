use super::polynomials::{DensePolynomialExt, BivariatePolynomial};

use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_core::polynomials::UnivariatePolynomial;
use icicle_core::traits::{FieldImpl, GenerateRandom};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};

use icicle_runtime::memory::{HostSlice, DeviceVec};
use serde::Deserialize;
use serde_json::from_reader;
use std::fs::File;
use std::io::{self, BufReader};
use std::env;
use std::collections::{HashMap, HashSet};
use num_bigint::BigUint;

macro_rules! impl_tau_struct {
    ($name:ident { $($ScalarField:ident),* }) => {
        pub struct $name {
            $(pub $ScalarField: ScalarField),*
        }

        impl $name {
            pub fn gen() -> Self {
                Self {
                    $($ScalarField: ScalarCfg::generate_random(1)[0]),*
                }
            }
        }
    };
}
impl_tau_struct!(Tau {x, y, z, alpha, beta, gamma, delta, eta0, eta1, mu, nu, psi0, psi1, psi2, psi3, kappa});

#[derive(Debug, Deserialize)]
pub struct SetupParams {
    pub l: usize,
    pub l_D: usize,
    pub m_D: usize,
    pub n: usize,
    pub s_D: usize
}

impl SetupParams {
    pub fn from_path(path: &str) -> io::Result<Self> {
        let abs_path = env::current_dir()?.join(path);
        let file = File::open(abs_path)?;
        let reader = BufReader::new(file);
        let data = from_reader(reader)?;
        Ok(data)
    }
}
#[derive(Debug, Deserialize)]
pub struct SubcircuitInfo {
    pub id: usize,
    pub name: String,
    pub Nwires: usize,
    pub Nconsts: usize,
    pub Out_idx: Box<[usize]>,
    pub In_idx: Box<[usize]>,
    pub flattenMap: Box<[usize]>,
}
impl SubcircuitInfo {
    pub fn from_path(path: &str) -> io::Result<Box<[Self]>> {
        let abs_path = env::current_dir()?.join(path);
        let file = File::open(abs_path)?;
        let reader = BufReader::new(file);
        let vec_data: Vec<Self> = from_reader(reader)?;
        Ok(vec_data.into_boxed_slice())
    }
}

pub fn read_json_as_boxed_boxed_numbers(path: &str) -> io::Result<Box<[Box<[usize]>]>> {
    let abs_path = env::current_dir()?.join(path);
    let file = File::open(abs_path)?;
    let reader = BufReader::new(file);

    let vec_of_vecs:Vec<Vec<i32>> = serde_json::from_reader(reader)?;
    let boxed_matrix: Box<[Box<[usize]>]> = vec_of_vecs
        .into_iter()
        .map(|row| row.into_iter().map(|x| x as usize).collect::<Vec<_>>().into_boxed_slice())
        .collect::<Vec<_>>()
        .into_boxed_slice();
    Ok(boxed_matrix)
}

#[derive(Debug, Deserialize)]
struct Constraints {
    constraints: Vec<Vec<HashMap<usize, String>>>,
}

impl Constraints {
    fn from_path(path: &str) -> io::Result<Self> {
        let abs_path = env::current_dir()?.join(path);
        let file = File::open(abs_path)?;
        let reader = BufReader::new(file);
        let constraints = from_reader(reader)?;
        Ok(constraints)
    }

    fn convert_values_to_hex(constraints: &mut Self) {
        for constraint_group in constraints.constraints.iter_mut() {
            for hashmap in constraint_group.iter_mut() {
                for (_, value) in hashmap.iter_mut() {
                    if let Ok(num) = value.parse::<BigUint>() {
                        let hex = format!("{:X}", num);
                        *value = if hex.len() % 2 == 1 {
                            let mut s = String::with_capacity(hex.len() + 1);
                            s.push('0');
                            s.push_str(&hex);
                            s
                        } else {
                            hex
                        };
                    }
                }
            }
        }
    }
}

pub struct SubcircuitQAPRaw{
    pub u_evals: Box<[Box<[ScalarField]>]>,
    pub v_evals: Box<[Box<[ScalarField]>]>,
    pub w_evals: Box<[Box<[ScalarField]>]>,
    pub u_active_wires: HashSet<usize>,
    pub v_active_wires: HashSet<usize>,
    pub w_active_wires: HashSet<usize>,
}

impl SubcircuitQAPRaw{
    pub fn from_path(path: &str, setup_params: &SetupParams, subcircuit_info: &SubcircuitInfo) -> io::Result<Self> {
        let mut constraints = Constraints::from_path(path).unwrap();
        Constraints::convert_values_to_hex(&mut constraints);
        let column_size = subcircuit_info.Nconsts;
        let row_size = subcircuit_info.Nwires;
        let matrix_size = column_size * row_size;
        let mut a_mat_vec = vec![ScalarField::zero(); matrix_size ].into_boxed_slice();
        let mut b_mat_vec = vec![ScalarField::zero(); matrix_size ].into_boxed_slice();
        let mut c_mat_vec = vec![ScalarField::zero(); matrix_size ].into_boxed_slice();

        let mut a_active_wire_indices = HashSet::<usize>::new();
        let mut b_active_wire_indices = HashSet::<usize>::new();
        let mut c_active_wire_indices = HashSet::<usize>::new();

        for const_idx in 0..column_size {
            let constraint = &constraints.constraints[const_idx];
            let a_constraint = &constraint[0];
            let b_constraint = &constraint[1];
            let c_constraint = &constraint[2];
            let a_set:HashSet<usize> = a_constraint.keys().copied().collect();
            let b_set:HashSet<usize> = b_constraint.keys().copied().collect();
            let c_set:HashSet<usize> = c_constraint.keys().copied().collect();
            for wire_idx in &a_set{
                let hex_val = a_constraint.get(wire_idx).unwrap();
                a_mat_vec[const_idx + *wire_idx * column_size] = ScalarField::from_hex(hex_val);
            }
            for wire_idx in &b_set{
                let hex_val = b_constraint.get(wire_idx).unwrap();
                b_mat_vec[const_idx + *wire_idx * column_size] = ScalarField::from_hex(hex_val);
            }
            for wire_idx in &c_set{
                let hex_val = c_constraint.get(wire_idx).unwrap();
                c_mat_vec[const_idx + *wire_idx * column_size] = ScalarField::from_hex(hex_val);
            }
            a_active_wire_indices = a_active_wire_indices.union(&a_set).copied().collect();
            b_active_wire_indices = b_active_wire_indices.union(&b_set).copied().collect();
            c_active_wire_indices = c_active_wire_indices.union(&c_set).copied().collect();
        }
        // n >= column_size
        let n = setup_params.n;
        if n < column_size {
            panic!("n is smaller than the actual number of constraints.");
        }
        let zeros_vec = vec![ScalarField::zero(); n].into_boxed_slice();
        // let zero_poly = DensePolynomial::from_coeffs(HostSlice::from_slice(&zeros_vec), n);
        // let mut u_polys = vec![zero_poly.clone(); a_active_wire_indices.len()].into_boxed_slice();
        // let mut v_polys = vec![zero_poly.clone(); b_active_wire_indices.len()].into_boxed_slice();
        // let mut w_polys = vec![zero_poly.clone(); c_active_wire_indices.len()].into_boxed_slice();
        let mut u_evals = vec![zeros_vec.clone(); a_active_wire_indices.len()].into_boxed_slice();
        let mut v_evals = vec![zeros_vec.clone(); b_active_wire_indices.len()].into_boxed_slice();
        let mut w_evals = vec![zeros_vec.clone(); c_active_wire_indices.len()].into_boxed_slice();
        for (i, wire_idx) in a_active_wire_indices.iter().enumerate() {
            // let mut u_poly_eval_vec = zeros_vec.clone();
            // u_poly_eval_vec[0 .. column_size].copy_from_slice(&a_mat_vec[*wire_idx*column_size .. (*wire_idx + 1)*column_size]);
            // let u_poly_eval = HostSlice::from_slice(&u_poly_eval_vec);
            // u_polys[i] = DensePolynomialExt::from_rou_evals(u_poly_eval, n, 1, None, None).poly;
            u_evals[i][0 .. column_size].copy_from_slice(&a_mat_vec[*wire_idx*column_size .. (*wire_idx + 1)*column_size]);
        }
        for (i, wire_idx) in b_active_wire_indices.iter().enumerate() {
            // let mut v_poly_eval_vec = zeros_vec.clone();
            // v_poly_eval_vec[0 .. column_size].copy_from_slice(&b_mat_vec[*wire_idx*column_size .. (*wire_idx + 1)*column_size]);
            // let v_poly_eval = HostSlice::from_slice(&v_poly_eval_vec);
            // v_polys[i] = DensePolynomialExt::from_rou_evals(v_poly_eval, n, 1, None, None).poly;
            v_evals[i][0 .. column_size].copy_from_slice(&b_mat_vec[*wire_idx*column_size .. (*wire_idx + 1)*column_size]);
        }
        for (i, wire_idx) in c_active_wire_indices.iter().enumerate() {
            // let mut w_poly_eval_vec = zeros_vec.clone();
            // w_poly_eval_vec[0 .. column_size].copy_from_slice(&c_mat_vec[*wire_idx*column_size .. (*wire_idx + 1)*column_size]);
            // let w_poly_eval = HostSlice::from_slice(&w_poly_eval_vec);
            // w_polys[i] = DensePolynomialExt::from_rou_evals(w_poly_eval, n, 1, None, None).poly; 
            w_evals[i][0 .. column_size].copy_from_slice(&c_mat_vec[*wire_idx*column_size .. (*wire_idx + 1)*column_size]);
        }
        Ok(
            Self {
            u_evals,
            v_evals,
            w_evals,
            u_active_wires: a_active_wire_indices,
            v_active_wires: b_active_wire_indices,
            w_active_wires: c_active_wire_indices,
        })

    }
}

pub struct MixedSubcircuitQAPEvaled {
    pub o_evals: Box<[ScalarField]>,
    pub active_wires: HashSet<usize>,
}

impl MixedSubcircuitQAPEvaled {
    pub fn from_r1cs_to_evaled_qap(
        path :&str, 
        setup_params: &SetupParams, 
        subcircuit_info: &SubcircuitInfo, 
        tau: &Tau, 
        cached_x_pows_vec: &Box<[ScalarField]>
    ) -> Self {
        let qap_polys = SubcircuitQAPRaw::from_path(path, setup_params, subcircuit_info).unwrap();
        let mut u_evals_long = vec![ScalarField::zero(); subcircuit_info.Nwires].into_boxed_slice();
        let mut v_evals_long = u_evals_long.clone();
        let mut w_evals_long = u_evals_long.clone();
        let cached_x_pows = HostSlice::from_slice(cached_x_pows_vec);
        let vec_ops_cfg = VecOpsConfig::default();
        for (i, wire_idx) in qap_polys.u_active_wires.iter().enumerate() {
            // u_evals_long[*wire_idx] = qap_polys.u_polys[i].eval(&tau.x);
            let u_evals = HostSlice::from_slice(&qap_polys.u_evals[i]);
            let mut mul_res_vec = vec![ScalarField::zero(); setup_params.n].into_boxed_slice();
            let mul_res = HostSlice::from_mut_slice(&mut mul_res_vec);
            ScalarCfg::mul(u_evals, cached_x_pows, mul_res, &vec_ops_cfg).unwrap();
            let mut sum = ScalarField::zero();
            for val in mul_res_vec {
                sum = sum + val;
            }
            u_evals_long[*wire_idx] = sum;
        }
        for (i, wire_idx) in qap_polys.v_active_wires.iter().enumerate() {
            // v_evals_long[*wire_idx] = qap_polys.v_polys[i].eval(&tau.x);
            let v_evals = HostSlice::from_slice(&qap_polys.v_evals[i]);
            let mut mul_res_vec = vec![ScalarField::zero(); setup_params.n].into_boxed_slice();
            let mul_res = HostSlice::from_mut_slice(&mut mul_res_vec);
            ScalarCfg::mul(v_evals, cached_x_pows, mul_res, &vec_ops_cfg).unwrap();
            let mut sum = ScalarField::zero();
            for val in mul_res_vec {
                sum = sum + val;
            }
            v_evals_long[*wire_idx] = sum;
        }
        for (i, wire_idx) in qap_polys.w_active_wires.iter().enumerate() {
            // w_evals_long[*wire_idx] = qap_polys.w_polys[i].eval(&tau.x);
            let w_evals = HostSlice::from_slice(&qap_polys.w_evals[i]);
            let mut mul_res_vec = vec![ScalarField::zero(); setup_params.n].into_boxed_slice();
            let mul_res = HostSlice::from_mut_slice(&mut mul_res_vec);
            ScalarCfg::mul(w_evals, cached_x_pows, mul_res, &vec_ops_cfg).unwrap();
            let mut sum = ScalarField::zero();
            for val in mul_res_vec {
                sum = sum + val;
            }
            w_evals_long[*wire_idx] = sum;
        }
        
        let mut active_wires = HashSet::new();
        active_wires = active_wires.union(&qap_polys.u_active_wires).copied().collect();
        active_wires = active_wires.union(&qap_polys.v_active_wires).copied().collect();
        active_wires = active_wires.union(&qap_polys.w_active_wires).copied().collect();
        let length = active_wires.len();
        if length != subcircuit_info.Nwires {
            for i in 0..subcircuit_info.Nwires {
                if !active_wires.contains(&i) {
                    println!("Not counted wire id: {:?}", i);
                }
            }
        }
        let mut u_evals_vec = vec![ScalarField::zero(); length].into_boxed_slice();
        let mut v_evals_vec = u_evals_vec.clone();
        let mut w_evals_vec = u_evals_vec.clone();

        for (i, wire_idx) in active_wires.iter().enumerate() {
            if qap_polys.u_active_wires.contains(wire_idx){
                u_evals_vec[i] = u_evals_long[*wire_idx]; 
            }
            if qap_polys.v_active_wires.contains(wire_idx){
                v_evals_vec[i] = v_evals_long[*wire_idx]; 
            }
            if qap_polys.w_active_wires.contains(wire_idx){
                w_evals_vec[i] = w_evals_long[*wire_idx]; 
            }
        }
        let alpha_scaler_vec = vec![tau.alpha; length].into_boxed_slice();
        let alpha_scaler = HostSlice::from_slice(&alpha_scaler_vec);
        let beta_scaler_vec = vec![tau.beta; length].into_boxed_slice();
        let beta_scaler = HostSlice::from_slice(&beta_scaler_vec);
        let u_evals = HostSlice::from_slice(&u_evals_vec);
        let v_evals = HostSlice::from_slice(&v_evals_vec);
        let w_evals = HostSlice::from_slice(&w_evals_vec);
        
        let vec_ops_cfg = VecOpsConfig::default();
        let mut first_term = DeviceVec::<ScalarField>::device_malloc(length).unwrap();
        ScalarCfg::mul(beta_scaler, u_evals, &mut first_term, &vec_ops_cfg).unwrap();
        let mut second_term = DeviceVec::<ScalarField>::device_malloc(length).unwrap();
        ScalarCfg::mul(alpha_scaler, v_evals, &mut second_term, &vec_ops_cfg).unwrap();
        let mut third_term = DeviceVec::<ScalarField>::device_malloc(length).unwrap();
        ScalarCfg::add(&first_term, &second_term, &mut third_term, &vec_ops_cfg).unwrap();
        let mut o_evaled_local_vec = vec![ScalarField::zero(); length].into_boxed_slice();
        let o_evaled_local = HostSlice::from_mut_slice(&mut o_evaled_local_vec);
        ScalarCfg::add(&third_term, w_evals, o_evaled_local, &vec_ops_cfg).unwrap();
        
        Self {
            o_evals: o_evaled_local_vec,
            active_wires,
        }
    }
}

pub fn gen_cached_pows(val: &ScalarField, size: usize, res: &mut Box<[ScalarField]>) {
    let mut val_pows = vec![ScalarField::one(); size].into_boxed_slice();
    for i in 1..size {
        val_pows[i] = val_pows[i-1] * *val;
    }
    let temp_evals = HostSlice::from_slice(&val_pows);
    let temp_poly = DensePolynomialExt::from_rou_evals(temp_evals, size, 1, None, None);
    let cached_val_pows = HostSlice::from_mut_slice(res);
    temp_poly.copy_coeffs(0, cached_val_pows);
}