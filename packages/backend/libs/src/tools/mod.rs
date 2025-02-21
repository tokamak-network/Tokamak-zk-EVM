use icicle_bls12_381::curve::ScalarField;
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_core::polynomials::UnivariatePolynomial;
use icicle_core::traits::{Arithmetic, FieldImpl};
use icicle_runtime::memory::HostSlice;
use serde::Deserialize;
use serde_json::from_reader;
use std::fs::File;
use std::io::{self, BufReader};
use std::env;
use std::collections::HashMap;
use num_bigint::BigUint;

#[derive(Debug, Deserialize)]
pub struct SetupParams {
    l: usize,
    l_D: usize,
    m_D: usize,
    n: usize,
    s_D: usize
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
    id: usize,
    name: String,
    Nwires: usize,
    Nconsts: usize,
    Out_idx: Box<[usize]>,
    In_idx: Box<[usize]>,
    flattenMap: Box<[usize]>,
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
pub struct Constraints {
    pub constraints: Vec<Vec<HashMap<usize, String>>>,
}

impl Constraints {
    pub fn from_path(path: &str) -> io::Result<Self> {
        let abs_path = env::current_dir()?.join(path);
        let file = File::open(abs_path)?;
        let reader = BufReader::new(file);
        let constraints = from_reader(reader)?;
        Ok(constraints)
    }

    pub fn convert_values_to_hex(constraints: &mut Self) {
        for constraint_group in constraints.constraints.iter_mut() {
            for hashmap in constraint_group.iter_mut() {
                for (_, value) in hashmap.iter_mut() {
                    if let Ok(num) = value.parse::<BigUint>() {
                        *value = format!("{:X}", num);
                    }
                }
            }
        }
    }
}

pub struct SubcircuitQAP{
    u_polys: Box<[DensePolynomial]>,
    v_polys: Box<[DensePolynomial]>,
    w_polys: Box<[DensePolynomial]>
}

impl SubcircuitQAP{
    fn from_path(path: &str, subcircuit_info: &SubcircuitInfo) -> io::Result<Self> {
        let mut constraints = Constraints::from_path(path).unwrap();
        Constraints::convert_values_to_hex(&mut constraints);
        let column_size = subcircuit_info.Nconsts;
        let row_size = subcircuit_info.Nwires;
        let matrix_size = column_size * row_size;
        let mut a_mat_vec = vec![ScalarField::zero(); matrix_size ].into_boxed_slice();
        let mut b_mat_vec = vec![ScalarField::zero(); matrix_size ].into_boxed_slice();
        let mut c_mat_vec = vec![ScalarField::zero(); matrix_size ].into_boxed_slice();

        for const_idx in 0..column_size {
            let constraint = &constraints.constraints[const_idx];
            let a_constraint = &constraint[0];
            let b_constraint = &constraint[1];
            let c_constraint = &constraint[2];
            for wire_idx in a_constraint.keys(){
                let hex_val = a_constraint.get(wire_idx).unwrap();
                a_mat_vec[const_idx + wire_idx * column_size] = ScalarField::from_hex(hex_val);
            }
            for wire_idx in b_constraint.keys(){
                let hex_val = b_constraint.get(wire_idx).unwrap();
                b_mat_vec[const_idx + wire_idx * column_size] = ScalarField::from_hex(hex_val);
            }
            for wire_idx in c_constraint.keys(){
                let hex_val = c_constraint.get(wire_idx).unwrap();
                c_mat_vec[const_idx + wire_idx * column_size] = ScalarField::from_hex(hex_val);
            }
        }

        let temp = vec![ScalarField::zero(); n].into_boxed_slice();
        let temp_poly = DensePolynomial::from_coeffs(HostSlice::from_slice(&temp), n);
        let mut u_polys = vec![temp_poly.clone(); row_size].into_boxed_slice();
        let mut v_polys = vec![temp_poly.clone(); row_size].into_boxed_slice();
        let mut w_polys = vec![temp_poly.clone(); row_size].into_boxed_slice();
        for wire_idx in 0..row_size {
            let u_poly_eval_vec = &a_mat_vec[wire_idx*n .. (wire_idx + 1)*n];
            let u_poly_eval = HostSlice::from_slice(u_poly_eval_vec);
            let v_poly_eval_vec = &b_mat_vec[wire_idx*n .. (wire_idx + 1)*n];
            let v_poly_eval = HostSlice::from_slice(v_poly_eval_vec);
            let w_poly_eval_vec = &c_mat_vec[wire_idx*n .. (wire_idx + 1)*n];
            let w_poly_eval = HostSlice::from_slice(w_poly_eval_vec);
            u_polys[wire_idx] = DensePolynomial::from_rou_evals(u_poly_eval, n);
            v_polys[wire_idx] = DensePolynomial::from_rou_evals(v_poly_eval, n);
            w_polys[wire_idx] = DensePolynomial::from_rou_evals(w_poly_eval, n);
        }
        Ok(
            Self {
            u_polys,
            v_polys,
            w_polys,
        })

    }
}