use super::math::{DensePolynomialExt, BivariatePolynomial};

use icicle_bls12_381::curve::ScalarField;
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_core::polynomials::UnivariatePolynomial;
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::HostSlice;
use serde::Deserialize;
use serde_json::from_reader;
use std::fs::File;
use std::io::{self, BufReader};
use std::env;
use std::collections::{HashMap, HashSet};
use num_bigint::BigUint;

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

    let vec_of_vecs: Vec<Vec<usize>> = from_reader(reader)?;
    let boxed_outer = vec_of_vecs
        .into_iter()
        .map(|inner_vec| inner_vec.into_boxed_slice()) // `Vec<usize>` → `Box<[usize]>`
        .collect::<Vec<Box<[usize]>>>() 
        .into_boxed_slice(); 
    Ok(boxed_outer) 
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

pub struct SubcircuitQAP{
    pub u_evals: Box<[Box<[ScalarField]>]>,
    pub v_evals: Box<[Box<[ScalarField]>]>,
    pub w_evals: Box<[Box<[ScalarField]>]>,
    pub u_active_wires: HashSet<usize>,
    pub v_active_wires: HashSet<usize>,
    pub w_active_wires: HashSet<usize>,
}

impl SubcircuitQAP{
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