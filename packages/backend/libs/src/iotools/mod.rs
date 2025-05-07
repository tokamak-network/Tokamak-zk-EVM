use icicle_bls12_381::curve::{ScalarField, ScalarCfg, G1Affine, G2Affine, BaseField, G2BaseField, G1Projective, CurveCfg};
use icicle_core::ntt;
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_core::msm::{self, MSMConfig};
use crate::field_structures::FieldSerde;
use crate::group_structures::{G1serde, G2serde, PartialSigma1, PartialSigma1Verify, Sigma, Sigma1, Sigma2, SigmaPreprocess, SigmaVerify, Preprocess};
use crate::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use crate::polynomial_structures::{from_subcircuit_to_QAP, QAP};
use crate::vector_operations::transpose_inplace;

use super::vector_operations::{*};

use icicle_runtime::memory::{HostSlice, DeviceVec};
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, stdout, Write};
use std::{env, fmt};
use std::collections::{HashMap, HashSet};
use std::time::Instant;
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use serde::ser::{Serializer, SerializeStruct};
use serde::de::{Deserializer, Visitor, Error};
use serde_json::{from_reader, to_writer_pretty};

const QAP_COMPILER_PATH_PREFIX: &str = "../frontend/qap-compiler/subcircuits/library";
const SYNTHESIZER_PATH_PREFIX: &str = "../frontend/synthesizer/examples/outputs";

macro_rules! impl_read_from_json {
    ($t:ty) => {
        impl $t {
            pub fn read_from_json(path: &str) -> io::Result<Self> {
                let abs_path = env::current_dir()?.join(path);
                let file = File::open(abs_path)?;
                let reader = BufReader::new(file);
                let res: Self = from_reader(reader)?;
                Ok(res)
            }
        }
    };
}

macro_rules! impl_write_into_json {
    ($t:ty) => {
        impl $t {
            pub fn write_into_json(&self, path: &str) -> io::Result<()> {
                let abs_path = env::current_dir()?.join(path);
                if let Some(parent) = abs_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                let file = File::create(&abs_path)?;
                let writer = BufWriter::new(file);
                to_writer_pretty(writer, self)?;
                Ok(())
            }
        }
    };
}

fn g1_vec_to_code(v: &Box<[G1serde]>) -> String {
    let inner = v.iter()
        .map(|g| g.to_rust_code())
        .collect::<Vec<_>>()
        .join(",\n        ");
    format!("Box::new([\n        {}\n    ])", inner)
}

fn g1_mat_to_code(vv: &Box<[Box<[G1serde]>]>) -> String {
    let rows = vv.iter()
        .map(|row| g1_vec_to_code(row))
        .collect::<Vec<_>>()
        .join(",\n    ");
    format!("Box::new([\n    {}\n])", rows)
}

fn byte_slice_to_literal(bytes: &[u8]) -> String {
    bytes.iter()
        .map(|b| format!("{}", b))
        .collect::<Vec<_>>()
        .join(", ")
}

#[derive(Debug, Deserialize)]
pub struct SetupParams {
    pub l: usize,
    pub l_in: usize,
    pub l_out: usize,
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

impl_read_from_json!(Sigma);
impl_read_from_json!(SigmaPreprocess);
impl_read_from_json!(SigmaVerify);
impl_read_from_json!(Preprocess);
impl_write_into_json!(Sigma);
impl_write_into_json!(Preprocess);

impl Sigma {
    /// Write verifier CRS into JSON
    pub fn write_into_json_for_verify(&self, path: &str) -> io::Result<()> {
        let abs_path = env::current_dir()?.join(path);
        if let Some(parent) = abs_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let file = File::create(&abs_path)?;
        let writer = BufWriter::new(file);
        let partial_sigma1_verify: PartialSigma1Verify = PartialSigma1Verify { x: self.sigma_1.x, y: self.sigma_1.y };
        let sigma_verify: SigmaVerify = SigmaVerify {
            G: self.G,
            H: self.H,
            sigma_1: partial_sigma1_verify,
            sigma_2: self.sigma_2
        };
        to_writer_pretty(writer, &sigma_verify)?;
        Ok(())
    }

    /// Write preprocess CRS into JSON
    pub fn write_into_json_for_preprocess(&self, path: &str) -> io::Result<()> {
        let abs_path = env::current_dir()?.join(path);
        if let Some(parent) = abs_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let file = File::create(&abs_path)?;
        let writer = BufWriter::new(file);
        let partial_sigma_1: PartialSigma1 = PartialSigma1 { xy_powers: self.sigma_1.xy_powers.clone() };
        let sigma_preprocess: SigmaPreprocess = SigmaPreprocess {
            sigma_1: partial_sigma_1
        };
        to_writer_pretty(writer, &sigma_preprocess)?;
        Ok(())
    }

    pub fn write_into_rust_code(&self, path: &str) -> io::Result<()> {
        let abs_path = env::current_dir()?.join(path);

        if let Some(parent) = abs_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut f = File::create(&abs_path)?;

        writeln!(
            f,
            "// This file is auto-generated by setup.\n\npub static SIGMA: Sigma = {};\n",
            self.to_rust_code()
        )?;

        println!("Sigma Rust code saved at {:?}", abs_path);
        Ok(())
    }

    pub fn to_rust_code(&self) -> String {
        format!(
            "Sigma {{
                G: {},
                H: {},
                sigma_1: {},
                sigma_2: {}
            }}",
            self.G.to_rust_code(),
            self.H.to_rust_code(),
            self.sigma_1.to_rust_code(),
            self.sigma_2.to_rust_code()
        )
    }
}

impl Sigma1 {
    pub fn to_rust_code(&self) -> String {
        format!(
            "Sigma1 {{
                xy_powers: {},
                delta: {},
                eta: {},
                gamma_inv_o_pub_mj: {},
                eta_inv_li_o_inter_alpha4_kj: {},
                delta_inv_li_o_prv: {},
                delta_inv_alphak_xh_tx: {},
                delta_inv_alpha4_xj_tx: {},
                delta_inv_alphak_yi_ty: {}
            }}",
            g1_vec_to_code(&self.xy_powers),
            self.delta.to_rust_code(),
            self.eta.to_rust_code(),
            g1_vec_to_code(&self.gamma_inv_o_pub_mj),
            g1_mat_to_code(&self.eta_inv_li_o_inter_alpha4_kj),
            g1_mat_to_code(&self.delta_inv_li_o_prv),
            g1_mat_to_code(&self.delta_inv_alphak_xh_tx),
            g1_vec_to_code(&self.delta_inv_alpha4_xj_tx),
            g1_mat_to_code(&self.delta_inv_alphak_yi_ty),
        )
    }
}

impl Sigma2 {
    pub fn to_rust_code(&self) -> String {
        format!(
            "Sigma2 {{
                alpha: {},
                alpha2: {},
                alpha3: {},
                alpha4: {},
                gamma: {},
                delta: {},
                eta: {},
                x: {},
                y: {}
            }}",
            self.alpha.to_rust_code(),
            self.alpha2.to_rust_code(),
            self.alpha3.to_rust_code(),
            self.alpha4.to_rust_code(),
            self.gamma.to_rust_code(),
            self.delta.to_rust_code(),
            self.eta.to_rust_code(),
            self.x.to_rust_code(),
            self.y.to_rust_code(),
        )
    }
}


#[derive(Debug, Deserialize, Clone)]
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
pub struct PublicInstance {
    pub a: Vec<String>,
}

impl PublicInstance {
    pub fn from_path(path: &str) -> io::Result<Self> {
        let abs_path = env::current_dir()?.join(SYNTHESIZER_PATH_PREFIX).join(path);
        let file = File::open(abs_path)?;
        let reader = BufReader::new(file);
        let res: Self = from_reader(reader)?;
        Ok(res)
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
    pub fn from_path(path: &str) -> io::Result<Box<[Self]>> {
        let abs_path = env::current_dir()?.join(SYNTHESIZER_PATH_PREFIX).join(path);
        let file = File::open(abs_path)?;
        let reader = BufReader::new(file);
        let vec_data: Box<[Self]> = from_reader(reader)?;
        Ok(vec_data)
    }
    pub fn to_poly(perm_raw: &Box<[Self]>, m_i: usize, s_max: usize) -> (DensePolynomialExt, DensePolynomialExt) {
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

impl QAP{
    pub fn gen_from_R1CS(
        subcircuit_infos: &Box<[SubcircuitInfo]>,
        setup_params: &SetupParams,
    ) -> Self {
        let m_d = setup_params.m_D;
        let s_d = setup_params.s_D;

        let global_wire_file_name = "globalWireList.json";
        let global_wire_list = read_global_wire_list_as_boxed_boxed_numbers(global_wire_file_name).unwrap();

        let zero_coef_vec = [ScalarField::zero()];
        let zero_coef = HostSlice::from_slice(&zero_coef_vec);
        let zero_poly = DensePolynomialExt::from_coeffs(zero_coef, 1, 1);
        let mut u_j_X = vec![zero_poly.clone(); m_d];
        let mut v_j_X = vec![zero_poly.clone(); m_d];
        let mut w_j_X = vec![zero_poly.clone(); m_d];

        for i in 0..s_d {
            println!("Processing subcircuit id {}", i);
            let r1cs_path: String = format!("json/subcircuit{i}.json");

            let compact_r1cs = SubcircuitR1CS::from_path(&r1cs_path, &setup_params, &subcircuit_infos[i]).unwrap();
            let (u_j_X_local, v_j_X_local, w_j_X_local) = from_subcircuit_to_QAP(
                &compact_r1cs,
                &setup_params,
                &subcircuit_infos[i]
            );
            
            // Map local wire indices to global wire indices
            let flatten_map = &subcircuit_infos[i].flattenMap;

            for local_idx in 0..subcircuit_infos[i].Nwires {
                let global_idx = flatten_map[local_idx];

                // Verify global wire list consistency with flatten map
                if (global_wire_list[global_idx][0] != subcircuit_infos[i].id) || 
                   (global_wire_list[global_idx][1] != local_idx) {
                    panic!("GlobalWireList is not the inverse of flattenMap.");
                }

                u_j_X[global_idx] = u_j_X_local[local_idx].clone();
                v_j_X[global_idx] = v_j_X_local[local_idx].clone();
                w_j_X[global_idx] = w_j_X_local[local_idx].clone();
            }
        }
        return Self {u_j_X, v_j_X, w_j_X}
    }

    
}

impl Serialize for FieldSerde {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        let bytes = self.0.to_bytes_le();
        serializer.serialize_bytes(&bytes)
    }
}

impl<'de> Deserialize<'de> for FieldSerde {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where D: Deserializer<'de>
    {
        struct FieldVisitor;

        impl<'de> Visitor<'de> for FieldVisitor {
            type Value = FieldSerde;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a byte array representing ScalarField")
            }

            fn visit_bytes<E>(self, v: &[u8]) -> Result<Self::Value, E>
            where E: Error,
            {
                const EXPECTED_LEN: usize = 32; // For ICICLE BLS12-381

                if v.len() != EXPECTED_LEN {
                    return Err(E::custom(format!(
                        "expected {} bytes, got {}",
                        EXPECTED_LEN,
                        v.len()
                    )));
                }

                let scalar = ScalarField::from_bytes_le(v);
                Ok(FieldSerde(scalar))
            }
        }

        deserializer.deserialize_bytes(FieldVisitor)
    }
}

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
    pub fn to_rust_code(&self) -> String {
        let x_bytes = self.0.x.to_bytes_le();
        let y_bytes = self.0.y.to_bytes_le();
        
        format!(
            "G1serde(G1Affine::from_limbs(BaseField::from_bytes_le(&[{}]).into(),BaseField::from_bytes_le(&[{}]).into()))",
            byte_slice_to_literal(&x_bytes),
            byte_slice_to_literal(&y_bytes),
        )
    }
}

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
impl G2serde {
    pub fn to_rust_code(&self) -> String {
        let x_bytes = self.0.x.to_bytes_le();
        let y_bytes = self.0.y.to_bytes_le();
        
        format!(
            "G2serde(G2Affine::from_limbs(G2BaseField::from_bytes_le(&[{}]).into(),G2BaseField::from_bytes_le(&[{}]).into()))",
            byte_slice_to_literal(&x_bytes),
            byte_slice_to_literal(&y_bytes),
        )
    }
}


pub fn scaled_outer_product_2d(
    col_vec: &Box<[ScalarField]>, 
    row_vec: &Box<[ScalarField]>, 
    g1_gen: &G1Affine, 
    scaler: Option<&ScalarField>, 
    res: &mut Box<[Box<[G1serde]>]>
) {
    let row_size = col_vec.len();
    let col_size = row_vec.len();
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
    col_vec: &[ScalarField], 
    row_vec: &[ScalarField],
    g1_gen: &G1Affine, 
    scaler: Option<&ScalarField>, 
    res: &mut [G1serde]
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

pub fn from_coef_vec_to_g1serde_vec(coef: &[ScalarField], gen: &G1Affine, res: &mut [G1serde]) {
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

    // HostSlice 두개
    // coeff으 ㅣ벡터와 gen 포인트 하나.
    // coeff의 벡터 하나와 gen을 복사해서 벡터로.

    // println!("Number of nonzero coefficients: {:?}", coef.len() - nzeros);
}

pub fn gen_g1serde_vec_of_xy_monomials(
    x: ScalarField,
    y: ScalarField,
    gen: &G1Affine,
    x_size: usize,
    y_size: usize,
    res: &mut [G1serde],
) {
    use rayon::prelude::*;
    if res.len() != x_size * y_size {
        panic!("Not enough buffer length.")
    }
    if x_size * y_size == 0 {
        return
    }

    let gen_proj = G1Projective::from(*gen);

    let is_row_base = if x_size <= y_size {
        true
    } else {
        false
    };
    
    let outer_loop_len = if is_row_base { x_size } else { y_size };
    let inner_loop_len = if is_row_base { y_size } else { x_size };
    let mut res_projective = vec![G1Projective::zero(); x_size * y_size]; 

    let mut base_vec = vec![G1Projective::zero(); inner_loop_len];
    let base_multiplier = if is_row_base {y} else {x};
    base_vec
        .par_iter_mut()
        .enumerate()
        .for_each(|(i, b)| {
            *b = gen_proj * base_multiplier.pow(i);
        });

    res_projective[0..inner_loop_len].clone_from_slice(&base_vec);
    drop(base_vec);

    let acc_multiplier = if is_row_base {x} else {y};
    let mut msm_cfg = MSMConfig::default();
    msm_cfg.batch_size = inner_loop_len.try_into().unwrap();
    for i in 1..outer_loop_len {
        let (head, tail) = res_projective.split_at_mut(i * inner_loop_len);
        let prev_vec = &head[(i - 1) * inner_loop_len .. i * inner_loop_len];
        let prev_vec_affine: Vec<G1Affine> = prev_vec.iter().map(|&x| G1Affine::from(x)).collect();
        let curr_vec = &mut tail[0..inner_loop_len];
        msm::msm(
            HostSlice::from_slice(&vec![acc_multiplier; inner_loop_len]),
            HostSlice::from_slice(&prev_vec_affine),
            &msm_cfg,
            HostSlice::from_mut_slice(curr_vec)
        ).unwrap();
    }
    for i in 0..x_size {
        for j in 0..y_size {
            if is_row_base {
                res[i * y_size + j] = G1serde(G1Affine::from(res_projective[i * inner_loop_len + j]));
            }
            else {
                res[i * y_size + j] = G1serde(G1Affine::from(res_projective[j * inner_loop_len + i]));
            }
        }
    }
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

pub fn read_R1CS_gen_uvwXY(
    placement_variables: &Box<[PlacementVariables]>,
    subcircuit_infos: &Box<[SubcircuitInfo]>,
    setup_params: &SetupParams,
) -> (DensePolynomialExt, DensePolynomialExt, DensePolynomialExt)  {
    let n = setup_params.n;
    let s_max = setup_params.s_max;

    let mut u_eval = vec![ScalarField::zero(); s_max * n];
    let mut v_eval = vec![ScalarField::zero(); s_max * n];
    let mut w_eval = vec![ScalarField::zero(); s_max * n];
    for i in 0..placement_variables.len() {
        let subcircuit_id = placement_variables[i].subcircuitId;
        let r1cs_path: String = format!("json/subcircuit{subcircuit_id}.json");
        let compact_r1cs = SubcircuitR1CS::from_path(&r1cs_path, &setup_params, &subcircuit_infos[subcircuit_id]).unwrap();
        let variables = &placement_variables[i].variables;
        
        _from_r1cs_to_eval(
            &variables, 
            &compact_r1cs.A_compact_col_mat, 
            &compact_r1cs.A_active_wires, 
            i, 
            n, 
            &mut u_eval
        );
        _from_r1cs_to_eval(
            &variables, 
            &compact_r1cs.B_compact_col_mat, 
            &compact_r1cs.B_active_wires, 
            i, 
            n, 
            &mut v_eval
        );
        _from_r1cs_to_eval(
            &variables, 
            &compact_r1cs.C_compact_col_mat, 
            &compact_r1cs.C_active_wires, 
            i, 
            n, 
            &mut w_eval
        );
    }

    transpose_inplace(&mut u_eval, s_max, n);
    transpose_inplace(&mut v_eval, s_max, n);
    transpose_inplace(&mut w_eval, s_max, n);

    return (
        DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&u_eval),
            n,
            s_max,
            None,
            None
        ),
        DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&v_eval),
            n,
            s_max,
            None,
            None
        ),
        DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&w_eval),
            n,
            s_max,
            None,
            None
        )
    )
}

fn _from_r1cs_to_eval(variables: &Box<[String]>, compact_mat: &Vec<ScalarField>, active_wires: &Vec<usize>, i: usize, n: usize, eval: &mut Vec<ScalarField>)  {
    let d_len_A = active_wires.len();
    if d_len_A > 0 {
        let mut d_vec = vec![ScalarField::zero(); d_len_A].into_boxed_slice();
        for (compact_idx, &local_idx) in active_wires.iter().enumerate() {
            d_vec[compact_idx] = ScalarField::from_hex(&variables[local_idx]);
        }
        let mut frag_eval = vec![ScalarField::zero(); n].into_boxed_slice();
        matrix_matrix_mul(&d_vec, compact_mat, 1, d_len_A, n, &mut frag_eval);
        eval[i*n .. (i+1)*n].clone_from_slice(&frag_eval);
    }
}