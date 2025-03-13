use libs::tools::{Tau, SetupParams, SubcircuitInfo, MixedSubcircuitQAPEvaled};
use libs::tools::{read_json_as_boxed_boxed_numbers, gen_cached_pows};
use libs::group_structures::{SigmaArithAndIP, SigmaCopy, SigmaVerify};
use icicle_bls12_381::curve::{
    ScalarField as Field, ScalarCfg, G1Affine, G2Affine, CurveCfg, G2CurveCfg,
};
use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};
use icicle_core::ntt;
use icicle_core::curve::Curve;
use std::time::Instant;
use std::vec;
use libs::s_max;  // 상수 (예: 최대 서브서킷 수 또는 opcode 개수)

fn main() {
    let total_start = Instant::now();

    // Step 1: G1, G2 상의 임의의 affine 점 생성
    let g1_gen = CurveCfg::generate_random_affine_points(1)[0];
    let g2_gen = G2CurveCfg::generate_random_affine_points(1)[0];

    // Step 2: 비밀 파라미터 tau 생성 ("toxic waste")
    let tau = Tau::gen();

    // Step 3: JSON 파일에서 setup 파라미터 로드
    let mut path: &str = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/setupParams.json";
    let setup_params = SetupParams::from_path(path).unwrap();

    // 주요 파라미터 추출
    let m_d = setup_params.m_D;
    let s_d = setup_params.s_D;
    let n   = setup_params.n;

    if !n.is_power_of_two() {
        panic!("n is not a power of two.");
    }

    let l   = setup_params.l;
    let l_d = setup_params.l_D;
    if l % 2 == 1 {
        panic!("l is not even.");
    }
    let _l_in = l / 2; // 필요시 사용

    if !s_max.is_power_of_two() {
        panic!("s_max is not a power of two.");
    }
    let z_dom_length = l_d - l;
    if !z_dom_length.is_power_of_two() {
        panic!("l_D - l is not a power of two.");
    }

    // Step 4: 서브서킷 정보 및 글로벌 와이어 리스트 로드
    path = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(path).unwrap();

    path = "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/globalWireList.json";
    let globalWireList = read_json_as_boxed_boxed_numbers(path).unwrap();

    let start = Instant::now();

    // Step 5: 각 글로벌 와이어에 대응하는 QAP 폴리노미얼 평가값 계산
    let mut o_evaled_vec = vec![Field::zero(); m_d].into_boxed_slice();
    let mut nonzero_wires = Vec::<usize>::new();

    {
        // tau.x의 거듭제곱을 미리 계산 (중복 exponentiation 방지)
        let mut cached_x_pows_vec = vec![Field::zero(); n].into_boxed_slice();
        gen_cached_pows(&tau.x, n, &mut cached_x_pows_vec);

        // 서브서킷을 순차적으로 처리 (병렬화 없이)
        for i in 0..s_d {
            println!("Processing subcircuit id {:?}", i);
            let _path = format!(
                "/Users/jason/workspace/Ooo/Tokamak-zk-EVM/packages/backend/setup/trusted-setup/inputs/json/subcircuit{}.json",
                i
            );
            let evaled_qap = MixedSubcircuitQAPEvaled::from_r1cs_to_evaled_qap(
                &_path,
                &setup_params,
                &subcircuit_infos[i],
                &tau,
                &cached_x_pows_vec,
            );
            let flatten_map = &subcircuit_infos[i].flattenMap;

            for (j, local_idx) in evaled_qap.active_wires.iter().enumerate() {
                let global_idx = flatten_map[*local_idx];
                // globalWireList와 flatten_map 간의 일관성 검사
                if (globalWireList[global_idx][0] != subcircuit_infos[i].id)
                    || (globalWireList[global_idx][1] != *local_idx)
                {
                    panic!("GlobalWireList is not the inverse of flattenMap.");
                }
                let wire_val = evaled_qap.o_evals[j];
                if !wire_val.eq(&Field::zero()) {
                    nonzero_wires.push(global_idx);
                    o_evaled_vec[global_idx] = wire_val;
                }
            }
        }
    }
    println!(
        "Number of nonzero wires: {} out of {} total wires",
        nonzero_wires.len(),
        m_d
    );

    // Step 6: Lagrange 및 보간 폴리노미얼 평가값 계산
    let mut l_evaled_vec = vec![Field::zero(); s_max].into_boxed_slice();
    gen_cached_pows(&tau.y, s_max, &mut l_evaled_vec);

    let mut k_evaled_vec = vec![Field::zero(); z_dom_length].into_boxed_slice();
    gen_cached_pows(&tau.z, z_dom_length, &mut k_evaled_vec);

    // Step 7: M_i(x, z) 폴리노미얼 평가값 계산 (불필요한 반복 계산 제거)
    let mut m_evaled_vec = vec![Field::zero(); z_dom_length].into_boxed_slice();
    {
        // z-domain 길이에 맞는 NTT 루트 ω 획득
        let omega = ntt::get_root_of_unity::<Field>(z_dom_length as u64);

        // ω의 거듭제곱 벡터 캐싱: 0번 원소는 1로 초기화
        let mut omega_pows_vec = vec![Field::zero(); l_d];
        omega_pows_vec[0] = Field::one();
        for i in 1..l_d {
            omega_pows_vec[i] = omega_pows_vec[i - 1] * omega;
        }
        // (l_d - l)는 상수이므로 미리 역원 계산
        let inv_ld_minus_l = Field::from_u32((l_d - l) as u32).inv();

        for i in 0..z_dom_length {
            let j = i + l;
            let mut m_eval = Field::zero();
            for k in l..l_d {
                if j != k {
                    let factor1 = o_evaled_vec[k] * inv_ld_minus_l;

                    let factor2_term1 = omega_pows_vec[k] * k_evaled_vec[j - l];
                    let factor2_term2 = omega_pows_vec[j] * k_evaled_vec[i];
                    // (omega_pows_vec[j] - omega_pows_vec[k])는 k에 따라 달라지하므로 각 반복에서 계산
                    let factor2 = (factor2_term1 + factor2_term2)
                        * (omega_pows_vec[j] - omega_pows_vec[k]).inv();
                    m_eval = m_eval + factor1 * factor2;
                }
            }
            m_evaled_vec[i] = m_eval;
        }
    }
    let duration = start.elapsed();
    println!("Loading and eval time: {:.6} seconds", duration.as_secs_f64());

    // Step 8: Sigma 증명 생성 (순차적으로 실행)
    println!("Generating sigma_A,I...");
    let start = Instant::now();
    let sigma_ai = SigmaArithAndIP::gen(
        &setup_params,
        &tau,
        &o_evaled_vec,
        &m_evaled_vec,
        &l_evaled_vec,
        &k_evaled_vec,
        &g1_gen,
    );
    let lap = start.elapsed();
    println!("sigma_A,I generation time: {:.6} seconds", lap.as_secs_f64());

    println!("Generating sigma_C...");
    let start = Instant::now();
    let sigma_c = SigmaCopy::gen(
        &setup_params,
        &tau,
        &l_evaled_vec,
        &k_evaled_vec,
        &g1_gen,
    );
    let lap = start.elapsed();
    println!("sigma_C generation time: {:.6} seconds", lap.as_secs_f64());

    println!("Generating sigma_V...");
    let start = Instant::now();
    let sigma_v = SigmaVerify::gen(
        &setup_params,
        &tau,
        &o_evaled_vec,
        &k_evaled_vec,
        &g2_gen,
    );
    let lap = start.elapsed();
    println!("sigma_V generation time: {:.6} seconds", lap.as_secs_f64());

    let total_duration = total_start.elapsed();
    println!("Total time: {:.6} seconds", total_duration.as_secs_f64());
}
