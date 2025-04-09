use icicle_bls12_381::curve::{ScalarField, ScalarCfg, G1Affine, G2Affine, BaseField, G2BaseField};
use icicle_core::traits::{FieldImpl, GenerateRandom};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use super::vectors::scaled_outer_product;

use icicle_runtime::memory::{HostSlice, DeviceVec};
use serde_json::from_reader;
use std::fs::File;
use std::io::{self, BufReader};
use std::env;
use std::collections::{HashMap, HashSet};
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use serde::ser::{Serializer, SerializeStruct};

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

#[derive(Debug, Deserialize)]
pub struct SetupParams {
    pub l: usize,
    pub l_D: usize, //m_I = l_D - 1
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
        let mut constraints = Constraints::from_path(path)?;
        Constraints::convert_values_to_hex(&mut constraints);
    
        let column_size = subcircuit_info.Nconsts;
        let row_size = subcircuit_info.Nwires;
        let matrix_size = column_size * row_size;
        
        let mut a_mat_vec = vec![ScalarField::zero(); matrix_size].into_boxed_slice();
        let mut b_mat_vec = vec![ScalarField::zero(); matrix_size].into_boxed_slice();
        let mut c_mat_vec = vec![ScalarField::zero(); matrix_size].into_boxed_slice();
    
        // active wire indices를 직접 확장합니다.
        let mut a_active_wire_indices = HashSet::<usize>::new();
        let mut b_active_wire_indices = HashSet::<usize>::new();
        let mut c_active_wire_indices = HashSet::<usize>::new();
        
        for const_idx in 0..column_size {
            let constraint = &constraints.constraints[const_idx];
            let a_constraint = &constraint[0];
            let b_constraint = &constraint[1];
            let c_constraint = &constraint[2];
        
            // 각 constraint의 키들을 active set에 확장(재할당 없이)
            a_active_wire_indices.extend(a_constraint.keys().copied());
            b_active_wire_indices.extend(b_constraint.keys().copied());
            c_active_wire_indices.extend(c_constraint.keys().copied());
        
            // a_constraint 처리: 각 wire_idx에 대해 'wire_idx * column_size'를 한 번만 계산하도록 함.
            for (&wire_idx, hex_val) in a_constraint {
                let base = wire_idx * column_size;  // wire_idx * column_size를 캐시
                let idx = const_idx + base;
                a_mat_vec[idx] = ScalarField::from_hex(hex_val);
            }
            // b_constraint 처리
            for (&wire_idx, hex_val) in b_constraint {
                let base = wire_idx * column_size;
                let idx = const_idx + base;
                b_mat_vec[idx] = ScalarField::from_hex(hex_val);
            }
            // c_constraint 처리
            for (&wire_idx, hex_val) in c_constraint {
                let base = wire_idx * column_size;
                let idx = const_idx + base;
                c_mat_vec[idx] = ScalarField::from_hex(hex_val);
            }
        }
        

        let n = setup_params.n;
        if n < column_size {
            panic!("n is smaller than the actual number of constraints.");
        }
        
        let new_zeros = |n: usize| vec![ScalarField::zero(); n].into_boxed_slice();
        let zeros_vec = new_zeros(n);
        
        let u_len = a_active_wire_indices.len();
        let v_len = b_active_wire_indices.len();
        let w_len = c_active_wire_indices.len();
        
        let mut u_evals = vec![zeros_vec.clone(); u_len].into_boxed_slice();
        let mut v_evals = vec![zeros_vec.clone(); v_len].into_boxed_slice();
        let mut w_evals = vec![zeros_vec.clone(); w_len].into_boxed_slice();
        
        for (i, &wire_idx) in a_active_wire_indices.iter().enumerate() {
            let start = wire_idx * column_size;
            let end = start + column_size;
            u_evals[i][0 .. column_size].copy_from_slice(&a_mat_vec[start .. end]);
        }
        for (i, &wire_idx) in b_active_wire_indices.iter().enumerate() {
            let start = wire_idx * column_size;
            let end = start + column_size;
            v_evals[i][0 .. column_size].copy_from_slice(&b_mat_vec[start .. end]);
        }
        for (i, &wire_idx) in c_active_wire_indices.iter().enumerate() {
            let start = wire_idx * column_size;
            let end = start + column_size;
            w_evals[i][0 .. column_size].copy_from_slice(&c_mat_vec[start .. end]);
        }
        
        Ok(Self {
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
        x_evaled_lagrange_vec: &Box<[ScalarField]>
    ) -> Self {
        let qap_polys = SubcircuitQAPRaw::from_path(path, setup_params, subcircuit_info).unwrap();
        let mut u_evals_long = vec![ScalarField::zero(); subcircuit_info.Nwires].into_boxed_slice();
        let mut v_evals_long = u_evals_long.clone();
        let mut w_evals_long = u_evals_long.clone();
        let x_evaled_lagrange = HostSlice::from_slice(x_evaled_lagrange_vec);
        let vec_ops_cfg = VecOpsConfig::default();
        
        // Evaluate u polynomials at tau.x
        for (i, wire_idx) in qap_polys.u_active_wires.iter().enumerate() {
            let u_evals = HostSlice::from_slice(&qap_polys.u_evals[i]);
            let mut mul_res_vec = vec![ScalarField::zero(); setup_params.n].into_boxed_slice();
            let mul_res = HostSlice::from_mut_slice(&mut mul_res_vec);
            ScalarCfg::mul(u_evals, x_evaled_lagrange, mul_res, &vec_ops_cfg).unwrap();
            let mut sum = ScalarField::zero();
            for val in mul_res_vec {
                sum = sum + val;
            }
            u_evals_long[*wire_idx] = sum;
        }
        
        // Evaluate v polynomials at tau.x
        for (i, wire_idx) in qap_polys.v_active_wires.iter().enumerate() {
            let v_evals = HostSlice::from_slice(&qap_polys.v_evals[i]);
            let mut mul_res_vec = vec![ScalarField::zero(); setup_params.n].into_boxed_slice();
            let mul_res = HostSlice::from_mut_slice(&mut mul_res_vec);
            ScalarCfg::mul(v_evals, x_evaled_lagrange, mul_res, &vec_ops_cfg).unwrap();
            let mut sum = ScalarField::zero();
            for val in mul_res_vec {
                sum = sum + val;
            }
            v_evals_long[*wire_idx] = sum;
        }
        
        // Evaluate w polynomials at tau.x
        for (i, wire_idx) in qap_polys.w_active_wires.iter().enumerate() {
            let w_evals = HostSlice::from_slice(&qap_polys.w_evals[i]);
            let mut mul_res_vec = vec![ScalarField::zero(); setup_params.n].into_boxed_slice();
            let mul_res = HostSlice::from_mut_slice(&mut mul_res_vec);
            ScalarCfg::mul(w_evals, x_evaled_lagrange, mul_res, &vec_ops_cfg).unwrap();
            let mut sum = ScalarField::zero();
            for val in mul_res_vec {
                sum = sum + val;
            }
            w_evals_long[*wire_idx] = sum;
        }
        
        // Collect all active wires
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
        
        // Prepare vectors for final evaluation
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
        
        // Setup for final calculation using tau.alpha (no tau.beta in updated paper)
        let alpha_scaler_vec = vec![tau.alpha; length].into_boxed_slice();
        let alpha_scaler = HostSlice::from_slice(&alpha_scaler_vec);
        let u_evals = HostSlice::from_slice(&u_evals_vec);
        let v_evals = HostSlice::from_slice(&v_evals_vec);
        let w_evals = HostSlice::from_slice(&w_evals_vec);
        
        // Calculate o_evaled_local using alpha instead of alpha and beta
        let vec_ops_cfg = VecOpsConfig::default();
        
        // First, calculate alpha * v
        let mut alpha_v_term = DeviceVec::<ScalarField>::device_malloc(length).unwrap();
        ScalarCfg::mul(alpha_scaler, v_evals, &mut alpha_v_term, &vec_ops_cfg).unwrap();
        
        // Then, add u to it
        let mut combined_term = DeviceVec::<ScalarField>::device_malloc(length).unwrap();
        ScalarCfg::add(u_evals, &alpha_v_term, &mut combined_term, &vec_ops_cfg).unwrap();
        
        // Finally, add w to get the result
        let mut o_evaled_local_vec = vec![ScalarField::zero(); length].into_boxed_slice();
        let o_evaled_local = HostSlice::from_mut_slice(&mut o_evaled_local_vec);
        ScalarCfg::add(&combined_term, w_evals, o_evaled_local, &vec_ops_cfg).unwrap();
        
        Self {
            o_evals: o_evaled_local_vec,
            active_wires,
        }
    }
}


#[derive(Clone, Debug, Copy)]
pub struct G1serde(pub G1Affine);
impl Serialize for G1serde {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        let mut s = serializer.serialize_struct("G1serde", 2)?;
        let x_coord = &self.0.x.to_string();
        let y_coord = &self.0.y.to_string();
        s.serialize_field("x", x_coord)?;
        s.serialize_field("y", y_coord)?;
        s.end()
    }
}
impl<'de> Deserialize<'de> for G1serde {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where D: serde::Deserializer<'de> {
        #[derive(Deserialize)]
        struct G1Coords {
            x: String,
            y: String,
        }
        let G1Coords { x, y } = G1Coords::deserialize(deserializer)?;
        let x_field = BaseField::from_hex(&x).into();
        let y_field = BaseField::from_hex(&y).into();
        let point = G1Affine::from_limbs(x_field, y_field);
        Ok(G1serde(point))
    }
}
impl G1serde {
    pub fn zero() -> Self {
        G1serde(G1Affine::zero())
    }
}

#[derive(Clone, Debug, Copy)]
pub struct G2serde(pub G2Affine);
impl Serialize for G2serde {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        let mut s = serializer.serialize_struct("G2", 2)?;
        let x_coord = &self.0.x.to_string();
        let y_coord = &self.0.y.to_string();
        s.serialize_field("x", x_coord)?;
        s.serialize_field("y", y_coord)?;
        s.end()
    }
}
impl<'de> Deserialize<'de> for G2serde {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where D: serde::Deserializer<'de> {
        #[derive(Deserialize)]
        struct G2Coords {
            x: String,
            y: String,
        }
        let G2Coords { x, y } = G2Coords::deserialize(deserializer)?;
        let x_field = G2BaseField::from_hex(&x).into();
        let y_field = G2BaseField::from_hex(&y).into();
        let point = G2Affine::from_limbs(x_field, y_field);
        Ok(G2serde(point))
    }
}


pub fn scaled_outer_product_2d(
    col_vec: &Box<[ScalarField]>, 
    row_vec: &Box<[ScalarField]>, 
    g1_gen: &G1Affine, 
    scaler: Option<&ScalarField>, 
    res: &mut Box<[Box<[G1serde]>]>
) {
    let col_size = col_vec.len();
    let row_size = row_vec.len();
    let size = col_size * row_size;
    if res.len() > 0 {
        if res.len() * res[0].len() != size {
            panic!("Insufficient buffer length");
        }
    } else {
        panic!("Empty buffer");
    }
    
    let mut res_coef = vec![ScalarField::zero(); size].into_boxed_slice();
    scaled_outer_product(col_vec, row_vec, scaler, &mut res_coef);
    from_coef_vec_to_g1serde_mat(
        &res_coef,
        row_size,
        col_size,
        g1_gen,
        res,
    );
}

pub fn scaled_outer_product_1d(
    col_vec: &Box<[ScalarField]>, 
    row_vec: &Box<[ScalarField]>, 
    g1_gen: &G1Affine, 
    scaler: Option<&ScalarField>, 
    res: &mut Box<[G1serde]>
) {
    let col_size = col_vec.len();
    let row_size = row_vec.len();
    let size = col_size * row_size;
    if res.len() != size {
        panic!("Insufficient buffer length");
    }
    let mut res_coef = vec![ScalarField::zero(); size].into_boxed_slice();
    scaled_outer_product(col_vec, row_vec, scaler, &mut res_coef);
    from_coef_vec_to_g1serde_vec(
        &res_coef,
        g1_gen,
        res,
    );
}

pub fn gen_monomial_matrix(x_size: usize, y_size: usize, x: &ScalarField, y: &ScalarField, res_vec: &mut Box<[ScalarField]>) {
    // x_size: column size
    // y_size: row size
    if res_vec.len() != x_size * y_size {
        panic!("Not enough buffer length.")
    }
    let vec_ops_cfg = VecOpsConfig::default();
    let min_len = std::cmp::min(x_size, y_size);
    let max_len = std::cmp::max(x_size, y_size);
    let max_dir = if max_len == x_size {true } else {false};
    let mut base_row_vec = vec![ScalarField::one(); max_len];
    for ind in 1..max_len {
        if max_dir {
            base_row_vec[ind] = base_row_vec[ind-1] * *x;
        }
        else {
            base_row_vec[ind] = base_row_vec[ind-1] * *y;
        }
    }
    let mut res_vec_untransposed = res_vec.clone();
    let val_dup_vec = if max_dir {vec![*y; max_len].into_boxed_slice()} else {vec![*x; max_len].into_boxed_slice()};
    let val_dup = HostSlice::from_slice(&val_dup_vec);
    res_vec_untransposed[0 .. max_len].copy_from_slice(&base_row_vec);
    for ind in 1..min_len {
        let curr_row_view = HostSlice::from_slice(&res_vec_untransposed[(ind-1) * max_len .. (ind) * max_len]);
        let mut next_row_vec = vec![ScalarField::zero(); max_len].into_boxed_slice();
        let next_row = HostSlice::from_mut_slice(&mut next_row_vec); 
        ScalarCfg::mul(curr_row_view, val_dup, next_row, &vec_ops_cfg).unwrap();
        res_vec_untransposed[ind*max_len .. (ind+1)*max_len].copy_from_slice(&next_row_vec);
    }
    
    if !max_dir {
        let res_untranposed_buf = HostSlice::from_slice(&res_vec_untransposed);
        let res_buf = HostSlice::from_mut_slice(res_vec);
        ScalarCfg::transpose(
            res_untranposed_buf,
            min_len as u32,
            max_len as u32,
            res_buf,
            &vec_ops_cfg).unwrap();
    } else {
        res_vec.clone_from(&res_vec_untransposed);
    }
}

pub fn from_coef_vec_to_g1serde_vec(coef: &Box<[ScalarField]>, gen: &G1Affine, res: &mut Box<[G1serde]>) {
    use std::sync::atomic::{AtomicU16, Ordering};
    use rayon::prelude::*;
    use std::io::{stdout, Write};

    if res.len() != coef.len() {
        panic!("Not enough buffer length.")
    }
    if coef.len() == 0 {
        return
    }

    let gen_proj = gen.to_projective();

    let cnt = AtomicU16::new(1);
    let progress = AtomicU16::new(0);
    let indi: u16 = std::cmp::max(coef.len() as u16 / 20, 1);
    res.par_iter_mut()
        .zip(coef.par_iter())
        .for_each(|(r, &c)| {
            *r = G1serde(G1Affine::from(gen_proj * c));
            let current_cnt = cnt.fetch_add(1, Ordering::Relaxed);
            if current_cnt % indi == 0 {
                let new_progress = progress.fetch_add(5, Ordering::Relaxed);
                print!("\rProgress: {}%", new_progress);
                stdout().flush().unwrap(); 
            }
        });
    print!("\r");

    // println!("Number of nonzero coefficients: {:?}", coef.len() - nzeros);
}

pub fn from_coef_vec_to_g1serde_mat(coef: &Box<[ScalarField]>, r_size: usize, c_size: usize, gen: &G1Affine, res: &mut Box<[Box<[G1serde]>]>) {
    if res.len() != r_size || res.len() == 0 {
        panic!("Not enough buffer row length.")
    }
    let mut temp_vec = vec![G1serde::zero(); r_size * c_size].into_boxed_slice();
    from_coef_vec_to_g1serde_vec(coef, gen, &mut temp_vec);
    for i in 0..r_size {
        if res[i].len() != c_size {
            panic!("Not enough buffer column length.")
        }
        res[i].copy_from_slice(&temp_vec[i * c_size .. (i + 1) * c_size]);
    }
}