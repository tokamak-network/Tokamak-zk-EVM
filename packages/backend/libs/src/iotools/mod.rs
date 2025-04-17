use icicle_bls12_381::curve::{ScalarField, ScalarCfg, G1Affine, G2Affine, BaseField, G2BaseField};
use icicle_core::ntt;
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use crate::group_structures::Sigma;
use crate::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use crate::vector_operations::transpose_inplace;

use super::vector_operations::{*};

use icicle_runtime::memory::{HostSlice, DeviceVec};
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, stdout, Write};
use std::env;
use std::collections::{HashMap, HashSet};
use std::time::Instant;
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use serde::ser::{Serializer, SerializeStruct};
use serde_json::{from_reader, to_writer_pretty};

const QAP_COMPILER_PATH_PREFIX: &str = "../frontend/qap-compiler/subcircuits/library";
const SYNTHESIZER_PATH_PREFIX: &str = "../frontend/synthesizer/examples/outputs";

#[derive(Debug, Deserialize)]
pub struct SetupParams {
    pub l: usize,
    pub l_D: usize, //m_I = l_D - 1
    pub m_D: usize,
    pub n: usize,
    pub s_D: usize,
    pub s_max: usize
}

impl SetupParams {
    pub fn from_path(path: &str) -> io::Result<Self> { 
        let abs_path = env::current_dir()?.join(QAP_COMPILER_PATH_PREFIX).join(path);
        let file = File::open(abs_path)?;
        let reader = BufReader::new(file);
        let data = from_reader(reader)?;
        Ok(data)
    }
}

impl Sigma {
    /// Write full CRS from JSON
    pub fn read_from_json(path: &str) -> io::Result<Self> {
        let abs_path = env::current_dir()?.join(path);
        let file = File::open(abs_path)?;
        let reader = BufReader::new(file);
        let sigma: Self = from_reader(reader)?;
        Ok(sigma)
    }
    
    /// Write full CRS into JSON
    pub fn write_into_json(&self, path: &str) -> io::Result<()> {
        let abs_path = env::current_dir()?.join(path);
        if let Some(parent) = abs_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let file = File::create(&abs_path)?;
        let writer = BufWriter::new(file);
        to_writer_pretty(writer, self)?;
        println!("Sigma has been saved at {:?}", abs_path);
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
pub struct PlacementVariables {
    pub subcircuitId: usize,
    pub variables: Box<[String]>,
}

impl PlacementVariables {
    pub fn from_path(path: &str) -> io::Result<Box<[Self]>> {
        let abs_path = env::current_dir()?.join(SYNTHESIZER_PATH_PREFIX).join(path);
        let file = File::open(abs_path)?;
        let reader = BufReader::new(file);
        let box_data: Box<[Self]> = from_reader(reader)?;
        Ok(box_data)
    }
}

#[derive(Debug, Deserialize)]
pub struct Permutation {
    pub row: usize,
    pub col: usize,
    pub X: usize,
    pub Y: usize,
}

impl Permutation {
    pub fn from_path(path: &str) -> io::Result<Vec<Self>> {
        let abs_path = env::current_dir()?.join(SYNTHESIZER_PATH_PREFIX).join(path);
        let file = File::open(abs_path)?;
        let reader = BufReader::new(file);
        let vec_data: Vec<Self> = from_reader(reader)?;
        Ok(vec_data)
    }
    pub fn to_poly(perm_raw: &Vec<Self>, m_i: usize, s_max: usize) -> (DensePolynomialExt, DensePolynomialExt) {
        let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
        let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
        let mut s0_evals_vec = vec![ScalarField::zero(); m_i * s_max];
        let mut s1_evals_vec = vec![ScalarField::zero(); m_i * s_max];
        // Initialization
        for row_idx in 0..m_i {
            for col_idx in 0..s_max {
                s0_evals_vec[row_idx * s_max + col_idx] = omega_m_i.pow(row_idx);
                s1_evals_vec[row_idx * s_max + col_idx] = omega_s_max.pow(col_idx);
            }
        }
        // Reflecting the actual values
        for i in 0..perm_raw.len() {
            let idx = perm_raw[i].row * s_max + perm_raw[i].col;
            s0_evals_vec[idx] = omega_m_i.pow(perm_raw[i].X);
            s1_evals_vec[idx] = omega_s_max.pow(perm_raw[i].Y);            
        }
        let s0_evals = HostSlice::from_slice(&s0_evals_vec);
        let s1_evals = HostSlice::from_slice(&s1_evals_vec);
        return (
            DensePolynomialExt::from_rou_evals(s0_evals, m_i, s_max, None, None),
            DensePolynomialExt::from_rou_evals(s1_evals, m_i, s_max, None, None),
        ) 
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
        let abs_path = env::current_dir()?.join(QAP_COMPILER_PATH_PREFIX).join(path);
        let file = File::open(abs_path)?;
        let reader = BufReader::new(file);
        let vec_data: Vec<Self> = from_reader(reader)?;
        Ok(vec_data.into_boxed_slice())
    }
}

pub fn read_global_wire_list_as_boxed_boxed_numbers(path: &str) -> io::Result<Box<[Box<[usize]>]>> {
    let abs_path = env::current_dir()?.join(QAP_COMPILER_PATH_PREFIX).join(path);
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
        let abs_path = env::current_dir()?.join(QAP_COMPILER_PATH_PREFIX).join(path);
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

pub struct SubcircuitR1CS{
    pub A_compact_col_mat: Vec<ScalarField>,
    pub B_compact_col_mat: Vec<ScalarField>,
    pub C_compact_col_mat: Vec<ScalarField>,
    pub A_active_wires: Vec<usize>,
    pub B_active_wires: Vec<usize>,
    pub C_active_wires: Vec<usize>,
}

impl SubcircuitR1CS{
    pub fn from_path(path: &str, setup_params: &SetupParams, subcircuit_info: &SubcircuitInfo) -> io::Result<Self> {
        let mut constraints = Constraints::from_path(path)?;
        Constraints::convert_values_to_hex(&mut constraints);

        // active wire indices를 직접 확장합니다.
        let mut A_active_wire_indices_set = HashSet::<usize>::new();
        let mut B_active_wire_indices_set = HashSet::<usize>::new();
        let mut C_active_wire_indices_set = HashSet::<usize>::new();

        for const_idx in 0..subcircuit_info.Nconsts {
            let constraint = &constraints.constraints[const_idx];
            // 각 constraint의 키들을 active set에 확장(재할당 없이)
            A_active_wire_indices_set.extend(constraint[0].keys().copied());
            B_active_wire_indices_set.extend(constraint[1].keys().copied());
            C_active_wire_indices_set.extend(constraint[2].keys().copied());
        }

        let mut A_active_wire_indices: Vec<usize> = A_active_wire_indices_set.iter().map(|&idx| idx).collect();
        A_active_wire_indices.sort();
        let mut B_active_wire_indices: Vec<usize> = B_active_wire_indices_set.iter().map(|&idx| idx).collect();
        B_active_wire_indices.sort();
        let mut C_active_wire_indices: Vec<usize> = C_active_wire_indices_set.iter().map(|&idx| idx).collect();
        C_active_wire_indices.sort();     

        let n = setup_params.n; // used as the number of rows.
        if n < subcircuit_info.Nconsts {
            panic!("n is smaller than the actual number of constraints.");
        }
        // used as the numbers of columns (different by the R1CS matrices).
        let A_len = A_active_wire_indices.len();
        let B_len = B_active_wire_indices.len();
        let C_len = C_active_wire_indices.len();
        if A_len > subcircuit_info.Nwires || B_len > subcircuit_info.Nwires || C_len > subcircuit_info.Nwires{
            panic!("Incorrectly counted number of wires.");
        }
        
        // Each of a_mat_vec, b_mat_vec, and c_mat_vec is, respectively, not a matrix but just a vector of vectors (of irregular lengths).
        let mut A_compact_col_mat = vec![ScalarField::zero(); n * A_len];
        let mut B_compact_col_mat = vec![ScalarField::zero(); n * B_len];
        let mut C_compact_col_mat = vec![ScalarField::zero(); n * C_len];
        
        for row_idx in 0..subcircuit_info.Nconsts {
            let constraint = &constraints.constraints[row_idx];
            let a_constraint = &constraint[0];
            let b_constraint = &constraint[1];
            let c_constraint = &constraint[2];
        
            // a_constraint 처리: 각 wire_idx에 대해 'wire_idx * column_size'를 한 번만 계산하도록 함.
            for col_idx in 0..A_len {
                if let Some(hex_val) = a_constraint.get(&A_active_wire_indices[col_idx]) {
                    let idx = A_len * row_idx + col_idx;
                    A_compact_col_mat[idx] = ScalarField::from_hex(hex_val);
                }
            }
            // b_constraint 처리
            for col_idx in 0..B_len {
                if let Some(hex_val) = b_constraint.get(&B_active_wire_indices[col_idx]) {
                    let idx = B_len * row_idx + col_idx;
                    B_compact_col_mat[idx] = ScalarField::from_hex(hex_val);
                }
            }
            // c_constraint 처리
            for col_idx in 0..C_len {
                if let Some(hex_val) = c_constraint.get(&C_active_wire_indices[col_idx]) {
                    let idx = C_len * row_idx + col_idx;
                    C_compact_col_mat[idx] = ScalarField::from_hex(hex_val);
                }
            }
        }
        // IMPORTANT: A, B, C matrices are of size A_len-by-n, B_len-by-n, and C_len-by-n, respectively.
        // They must be transposed before being converted into bivariate polynomials.
        transpose_inplace(&mut A_compact_col_mat, n, A_len);
        transpose_inplace(&mut B_compact_col_mat, n, B_len);
        transpose_inplace(&mut C_compact_col_mat, n, C_len);
        
        Ok(Self {
            A_compact_col_mat,
            B_compact_col_mat,
            C_compact_col_mat,
            A_active_wires: A_active_wire_indices,
            B_active_wires: B_active_wire_indices,
            C_active_wires: C_active_wire_indices,
        })
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

pub fn from_coef_vec_to_g1serde_vec(coef: &Box<[ScalarField]>, gen: &G1Affine, res: &mut Box<[G1serde]>) {
    use std::sync::atomic::{AtomicU32, Ordering};
    use rayon::prelude::*;
    use std::io::{stdout, Write};

    if res.len() != coef.len() {
        panic!("Not enough buffer length.")
    }
    if coef.len() == 0 {
        return
    }

    let gen_proj = gen.to_projective(); 

    let cnt = AtomicU32::new(1);
    let progress = AtomicU32::new(0);
    let _tick: u32 = std::cmp::max(coef.len() as u32 / 10, 1);
    let tick = AtomicU32::new(_tick);
    res.par_iter_mut()
        .zip(coef.par_iter())
        .for_each(|(r, &c)| {
            *r = G1serde(G1Affine::from(gen_proj * c));
            let current_cnt = cnt.fetch_add(1, Ordering::Relaxed);
            let target_tick = tick.load(Ordering::Relaxed);
            if current_cnt >= target_tick {
                if tick
                .compare_exchange(target_tick, target_tick + _tick, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
                {
                    progress.fetch_add(10, Ordering::Relaxed);
                    let new_progress = progress.load(Ordering::Relaxed);
                    print!("\rProgress: {}%, {} elements out of {}.", new_progress, current_cnt, coef.len());
                    stdout().flush().unwrap();
                }
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