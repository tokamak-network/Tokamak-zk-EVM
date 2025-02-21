use libs::tools::{SetupParams, SubcircuitInfo, SubcircuitQAP};
use libs::tools::read_json_as_boxed_boxed_numbers;
use libs::math::{DensePolynomialExt, BivariatePolynomial};

use icicle_bls12_381::curve::{ScalarField as Field, ScalarCfg, G1Affine as G1, G2Affine as G2, CurveCfg};
use icicle_bls12_381::vec_ops;
use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};
use icicle_core::polynomials::UnivariatePolynomial;
use icicle_core::{ntt, ntt::NTTInitDomainConfig};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice, DeviceSlice, DeviceVec};
use icicle_runtime::Device;
use std::collections::HashSet;
use std::ops::Deref;
use std::vec;
use std::{
    clone, cmp,
    ops::{Add, AddAssign, Div, Mul, Rem, Sub, Neg},
    ptr, slice,
};

macro_rules! impl_tau_struct {
    ($name:ident { $($field:ident),* }) => {
        struct $name {
            $(pub $field: Field),*
        }

        impl $name {
            fn gen() -> Self {
                Self {
                    $($field: ScalarCfg::generate_random(1)[0]),*
                }
            }
        }
    };
}

impl_tau_struct!(Tau {x, y, z, alpha, beta, gamma, delta, eta0, eta1, mu, nu, psi0, psi1, psi2, psi3, kappa});

struct SubcircuitQAPEvaled {
    o_evals: Box<[Field]>,
    active_wires: HashSet<usize>,
}

impl SubcircuitQAPEvaled {
    fn from_r1cs_to_evaled_qap(
        path :&str, 
        setup_params: &SetupParams, 
        subcircuit_info: &SubcircuitInfo, 
        tau: &Tau, 
        cashed_x_pows_vec: &Box<[Field]>
    ) -> Self {
        let qap_polys = SubcircuitQAP::from_path(path, setup_params, subcircuit_info).unwrap();
        let mut u_evals_long = vec![Field::zero(); subcircuit_info.Nwires].into_boxed_slice();
        let mut v_evals_long = u_evals_long.clone();
        let mut w_evals_long = u_evals_long.clone();
        let cashed_x_pows = HostSlice::from_slice(cashed_x_pows_vec);
        let vec_ops_cfg = VecOpsConfig::default();
        for (i, wire_idx) in qap_polys.u_active_wires.iter().enumerate() {
            // u_evals_long[*wire_idx] = qap_polys.u_polys[i].eval(&tau.x);
            let u_evals = HostSlice::from_slice(&qap_polys.u_evals[i]);
            let mut mul_res_vec = vec![Field::zero(); setup_params.n].into_boxed_slice();
            let mul_res = HostSlice::from_mut_slice(&mut mul_res_vec);
            ScalarCfg::mul(u_evals, cashed_x_pows, mul_res, &vec_ops_cfg).unwrap();
            let mut sum = Field::zero();
            for val in mul_res_vec {
                sum = sum + val;
            }
            u_evals_long[*wire_idx] = sum;
        }
        for (i, wire_idx) in qap_polys.v_active_wires.iter().enumerate() {
            // v_evals_long[*wire_idx] = qap_polys.v_polys[i].eval(&tau.x);
            let v_evals = HostSlice::from_slice(&qap_polys.v_evals[i]);
            let mut mul_res_vec = vec![Field::zero(); setup_params.n].into_boxed_slice();
            let mul_res = HostSlice::from_mut_slice(&mut mul_res_vec);
            ScalarCfg::mul(v_evals, cashed_x_pows, mul_res, &vec_ops_cfg).unwrap();
            let mut sum = Field::zero();
            for val in mul_res_vec {
                sum = sum + val;
            }
            v_evals_long[*wire_idx] = sum;
        }
        for (i, wire_idx) in qap_polys.w_active_wires.iter().enumerate() {
            // w_evals_long[*wire_idx] = qap_polys.w_polys[i].eval(&tau.x);
            let w_evals = HostSlice::from_slice(&qap_polys.w_evals[i]);
            let mut mul_res_vec = vec![Field::zero(); setup_params.n].into_boxed_slice();
            let mul_res = HostSlice::from_mut_slice(&mut mul_res_vec);
            ScalarCfg::mul(w_evals, cashed_x_pows, mul_res, &vec_ops_cfg).unwrap();
            let mut sum = Field::zero();
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
        let mut u_evals_vec = vec![Field::zero(); length].into_boxed_slice();
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
        let mut first_term = DeviceVec::<Field>::device_malloc(length).unwrap();
        ScalarCfg::mul(beta_scaler, u_evals, &mut first_term, &vec_ops_cfg).unwrap();
        let mut second_term = DeviceVec::<Field>::device_malloc(length).unwrap();
        ScalarCfg::mul(alpha_scaler, v_evals, &mut second_term, &vec_ops_cfg).unwrap();
        let mut third_term = DeviceVec::<Field>::device_malloc(length).unwrap();
        ScalarCfg::add(&first_term, &second_term, &mut third_term, &vec_ops_cfg).unwrap();
        let mut o_evaled_local_vec = vec![Field::zero(); length].into_boxed_slice();
        let o_evaled_local = HostSlice::from_mut_slice(&mut o_evaled_local_vec);
        ScalarCfg::add(&third_term, w_evals, o_evaled_local, &vec_ops_cfg).unwrap();

        Self {
            o_evals: o_evaled_local_vec,
            active_wires,
        }
    }
}


fn main() {
    let tau = Tau::gen();
    
    let mut path = "";
    path = "setup/trusted-setup/resource/setupParams.json";
    let setup_params = SetupParams::from_path(path).unwrap();
    // println!("{:?}", setup_params);
    path = "setup/trusted-setup/resource/subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(path).unwrap();
    // for subcircuit in subcircuit_infos.iter() {
    //     println!("{:?}", subcircuit);
    // }
    path = "setup/trusted-setup/resource/globalWireList.json";
    let globalWireList = read_json_as_boxed_boxed_numbers(path).unwrap();
    // println!("{:?}", globalWireList);
    // path = "setup/trusted-setup/resource/json/subcircuit0.json";
    // match Constraints::from_path(path) {
    //     Ok(mut data) => {
    //         Constraints::convert_values_to_hex(&mut data); // ✅ value를 hex로 변환
    //         println!("JSON 파일을 성공적으로 읽고 변환했습니다:");
    //         for (i, constraint_group) in data.constraints.iter().enumerate() {
    //             println!("Constraint Group {}:", i);
    //             for (j, hashmap) in constraint_group.iter().enumerate() {
    //                 println!("  Element {}: {:?}", j, hashmap);
    //             }
    //         }
    //     }
    //     Err(e) => eprintln!("JSON 파일을 읽는 중 오류가 발생했습니다: {}", e),
    // }

    let m_d = setup_params.m_D;
    let s_d = setup_params.s_D;
    let mut o_evaled_vec = vec![Field::zero(); m_d].into_boxed_slice();
    let mut x_pows = vec![Field::zero(); setup_params.n].into_boxed_slice();
    for i in 1..setup_params.n {
        x_pows[i] = x_pows[i-1] * tau.x;
    }
    let temp_evals = HostSlice::from_slice(&x_pows);
    let temp_poly = DensePolynomialExt::from_rou_evals(temp_evals, setup_params.n, 1, None, None);
    let mut cashed_x_pows_vec = vec![Field::zero(); setup_params.n].into_boxed_slice();
    let cashed_x_pows = HostSlice::from_mut_slice(&mut cashed_x_pows_vec);
    temp_poly.copy_coeffs(0, cashed_x_pows);
    // Todo: Cashed 방법과 보통 방법 시간 재보기

    for i in 0..s_d {
        println!("Processing subcircuit id {:?}", i);
        let _path = format!("setup/trusted-setup/resource/json/subcircuit{i}.json");
        let evaled_qap = SubcircuitQAPEvaled::from_r1cs_to_evaled_qap(
            &_path,
            &setup_params,
            &subcircuit_infos[i],
            &tau,
            &cashed_x_pows_vec,
        );
        let flatten_map = &subcircuit_infos[i].flattenMap;
        for (i, local_idx) in evaled_qap.active_wires.iter().enumerate(){
            let global_idx = flatten_map[*local_idx];
            o_evaled_vec[global_idx] = evaled_qap.o_evals[i];
        }
    }
}