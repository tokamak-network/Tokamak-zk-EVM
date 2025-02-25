use libs::tools::{Tau, SetupParams, SubcircuitInfo, SubcircuitQAPEvaled};
use libs::tools::{read_json_as_boxed_boxed_numbers, gen_cached_pows};
use libs::math::{DensePolynomialExt, BivariatePolynomial};
// use libs::group_structures::{SigmaArithAndIP, SigmaCopy, SigmaVerify};

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
use libs::s_max;

fn main() {
    let tau = Tau::gen();
    
    let mut path: &str = "";
    path = "setup/trusted-setup/inputs/setupParams.json";
    let setup_params = SetupParams::from_path(path).unwrap();
    // println!("{:?}", setup_params);
    let m_d = setup_params.m_D;
    let s_d = setup_params.s_D;
    let n = setup_params.n;
    if !setup_params.n.is_power_of_two() {
        panic!{"n is not a power of two."}
    }
    let l = setup_params.l;
    let l_d = setup_params.l_D;
    if l%2 == 1 {
        panic!{"l is not even."}
    }
    let l_in = l/2;
    if !s_max.is_power_of_two() {
        panic!{"s_max is not a power of two."}
    }
    let z_dom_length = l_d-l;
    if !z_dom_length.is_power_of_two() {
        panic!{"l_D - l is not a pwer of two."}
    }

    path = "setup/trusted-setup/inputs/subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(path).unwrap();
    // for subcircuit in subcircuit_infos.iter() {
    //     println!("{:?}", subcircuit);
    // }
    path = "setup/trusted-setup/inputs/globalWireList.json";
    let globalWireList = read_json_as_boxed_boxed_numbers(path).unwrap();
    // println!("{:?}", globalWireList);
    // path = "setup/trusted-setup/inputs/json/subcircuit0.json";
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

    
    let mut cached_x_pows_vec = vec![Field::zero(); setup_params.n].into_boxed_slice();
    gen_cached_pows(&tau.x, setup_params.n, &mut cached_x_pows_vec);
    // Todo: Cached 방법과 보통 방법 시간 재보기

    // Building o_i(x) for i in [0..m_D-1]
    let mut o_evaled_vec = vec![Field::zero(); m_d].into_boxed_slice();
    for i in 0..s_d {
    // for i in [3,4] {
        println!("Processing subcircuit id {:?}", i);
        let _path = format!("setup/trusted-setup/inputs/json/subcircuit{i}.json");
        let evaled_qap = SubcircuitQAPEvaled::from_r1cs_to_evaled_qap(
            &_path,
            &setup_params,
            &subcircuit_infos[i],
            &tau,
            &cached_x_pows_vec,
        );
        let flatten_map = &subcircuit_infos[i].flattenMap;
        for (i, local_idx) in evaled_qap.active_wires.iter().enumerate(){
            let global_idx = flatten_map[*local_idx];
            o_evaled_vec[global_idx] = evaled_qap.o_evals[i];
        }
    }

    // Building Lagranges L_i(y) for i in [0..s_max-1] and K_i(z) for i in [0..l_D-1]
    let mut l_evaled_vec = vec![Field::zero(); s_max].into_boxed_slice();
    gen_cached_pows(&tau.y, s_max, &mut l_evaled_vec);
    let mut k_evaled_vec = vec![Field::zero(); z_dom_length].into_boxed_slice();
    gen_cached_pows(&tau.z, z_dom_length, &mut k_evaled_vec);

    //building M_i(x,z) for i in [l .. l_D]
    let mut m_evaled_vec = vec![Field::zero(); z_dom_length].into_boxed_slice();
    let omega = ntt::get_root_of_unity::<Field>(z_dom_length as u64);
    let mut omega_pows_vec = vec![Field::zero(); l_d];
    for i in 1..l_d { omega_pows_vec[i] = omega_pows_vec[i-1] * omega };
    for i in 0..z_dom_length {
        let j = i + l;
        let mut m_eval = Field::zero();
        for k in l .. l_d {
            if j != k {
                let factor1 = o_evaled_vec[k] * Field::from_u32((l_d- l) as u32).inv();
                let factor2_term1 = omega_pows_vec[k] * k_evaled_vec[j-l];
                let factor2_term2 = omega_pows_vec[j] * k_evaled_vec[i];
                let factor2 = ( factor2_term1 + factor2_term2 ) * (omega_pows_vec[j] - omega_pows_vec[k]).inv();
                m_eval = m_eval + factor1 * factor2;
            }
        }
        m_evaled_vec[i] = m_eval;
    }


}