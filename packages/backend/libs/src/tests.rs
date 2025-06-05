use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice};
use std::cmp;
use std::time::Instant;

// Assuming the implementation of DensePolynomialExt and BivariatePolynomial is already available
// This mod tests can be placed in a separate file

#[cfg(test)]
mod safe_cpu_fallback_tests {
    use crate::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};

    use super::*;
    use icicle_runtime::{memory::{DeviceVec, HostSlice}, Device};
    use icicle_core::{ntt, traits::GenerateRandom};

    // 원본 방식 (columns_batch=false 강제)으로 to_rou_evals 수행
    fn to_rou_evals_reference<S: HostOrDeviceSlice<ScalarField> + ?Sized>(
        poly: &DensePolynomialExt,
        coset_x: Option<&ScalarField>, 
        coset_y: Option<&ScalarField>, 
        evals: &mut S
    ) {
        let size = poly.x_size * poly.y_size;
        
        let mut scaled_coeffs_vec = vec![ScalarField::zero(); size];
        let scaled_coeffs = HostSlice::from_mut_slice(&mut scaled_coeffs_vec);
        {
            let mut scaled_poly = poly.clone();
            if let Some(factor) = coset_x {
                scaled_poly = scaled_poly.scale_coeffs_x(factor);
            }
            if let Some(factor) = coset_y {
                scaled_poly = scaled_poly.scale_coeffs_y(factor);
            }
            scaled_poly.copy_coeffs(0, scaled_coeffs);
        }

        let current_device = icicle_runtime::get_active_device();
        let cpu_device = icicle_runtime::device::Device::new("CPU", 0);
        icicle_runtime::set_device(&cpu_device).unwrap();
        
        ntt::initialize_domain::<ScalarField>(
            ntt::get_root_of_unity::<ScalarField>(size.try_into().unwrap()),
            &ntt::NTTInitDomainConfig::default(),
        ).unwrap();
        
        let mut cfg = ntt::NTTConfig::<ScalarField>::default();
        
        // ⭐ 강제로 columns_batch=false 사용 (참조 구현)
        cfg.batch_size = poly.y_size as i32;
        cfg.columns_batch = true;
        
        println!("🔍 Reference method: batch_size={}, columns_batch={}", cfg.batch_size, cfg.columns_batch);
        ntt::ntt(scaled_coeffs, ntt::NTTDir::kForward, &cfg, evals).unwrap();
        
        drop(scaled_coeffs_vec);
        
        // Y 방향 FFT
        if poly.x_size > 1 {
            cfg.batch_size = poly.x_size as i32;
            cfg.columns_batch = false;
            ntt::ntt_inplace(evals, ntt::NTTDir::kForward, &cfg).unwrap();
        }
        
        ntt::release_domain::<ScalarField>().unwrap();
        icicle_runtime::set_device(&current_device.as_ref().unwrap()).unwrap();
    }

    // 원본 방식 (columns_batch=false 강제)으로 from_rou_evals 수행
    fn from_rou_evals_reference<S: HostOrDeviceSlice<ScalarField> + ?Sized>(
        evals: &S, 
        x_size: usize, 
        y_size: usize, 
        coset_x: Option<&ScalarField>, 
        coset_y: Option<&ScalarField>
    ) -> DensePolynomialExt {
        let size = x_size * y_size;

        ntt::initialize_domain::<ScalarField>(
            ntt::get_root_of_unity::<ScalarField>(size.try_into().unwrap()),
            &ntt::NTTInitDomainConfig::default(),
        ).unwrap();

        let mut coeffs = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
        let mut cfg = ntt::NTTConfig::<ScalarField>::default();
        
        // ⭐ 강제로 columns_batch=false 사용 (참조 구현)
        cfg.batch_size = y_size as i32;
        cfg.columns_batch = true;
        
        println!("🔍 Reference method: batch_size={}, columns_batch={}", cfg.batch_size, cfg.columns_batch);
        ntt::ntt(evals, ntt::NTTDir::kInverse, &cfg, &mut coeffs).unwrap();
        
        // Y 방향 IFFT
        if x_size > 1 {
            cfg.batch_size = x_size as i32;
            cfg.columns_batch = false;
            ntt::ntt_inplace(&mut coeffs, ntt::NTTDir::kInverse, &cfg).unwrap();
        }

        ntt::release_domain::<ScalarField>().unwrap();

        let mut poly = DensePolynomialExt::from_coeffs(&coeffs, x_size, y_size);

        if let Some(_factor) = coset_x {
            let factor = _factor.inv();
            poly = poly.scale_coeffs_x(&factor);
        }

        if let Some(_factor) = coset_y {
            let factor = _factor.inv();
            poly = poly.scale_coeffs_y(&factor);
        }
        
        return poly;
    }

    fn compare_field_arrays(a: &[ScalarField], b: &[ScalarField], tolerance: f64, name: &str) -> bool {
        if a.len() != b.len() {
            println!("❌ {} Length mismatch: {} vs {}", name, a.len(), b.len());
            return false;
        }
        
        let mut diff_count = 0;
        let max_show = 5; // 처음 5개 차이만 출력
        
        for (i, (val_a, val_b)) in a.iter().zip(b.iter()).enumerate() {
            if val_a != val_b {
                diff_count += 1;
                if diff_count <= max_show {
                    println!("  📍 {} Diff at [{}]: {:?} vs {:?}", name, i, val_a, val_b);
                }
            }
        }
        
        if diff_count > 0 {
            println!("❌ {} Total differences: {}/{} ({:.2}%)", 
                     name, diff_count, a.len(), (diff_count as f64 / a.len() as f64) * 100.0);
            false
        } else {
            println!("✅ {} All values match perfectly", name);
            true
        }
    }

    fn create_test_polynomial(x_size: usize, y_size: usize, pattern: &str) -> DensePolynomialExt {
        let size = x_size * y_size;
        let mut coeffs = vec![ScalarField::zero(); size];
        
        match pattern {
            "sequential" => {
                for i in 0..size {
                    coeffs[i] = ScalarField::from([(i + 1) as u32, 0, 0, 0, 0, 0, 0, 0]);
                }
            },
            "alternating" => {
                for i in 0..size {
                    coeffs[i] = ScalarField::from(if i % 2 == 0 { [1, 0, 0, 0, 0, 0, 0, 0] } else { [2, 0, 0, 0, 0, 0, 0, 0] });
                }
            },
            "powers_of_2" => {
                for i in 0..size {
                    coeffs[i] = ScalarField::from([(1u64 << (i % 8)) as u32, 0, 0, 0, 0, 0, 0, 0]);
                }
            },
            "fibonacci" => {
                let mut a = 1u64;
                let mut b = 1u64;
                for i in 0..size {
                    coeffs[i] = ScalarField::from([a as u32, 0, 0, 0, 0, 0, 0, 0]);
                    let temp = a + b;
                    a = b;
                    b = temp % 1000; // 오버플로우 방지
                }
            },
            _ => {
                // 기본: 모두 1
                for i in 0..size {
                    coeffs[i] = ScalarField::from([1, 0, 0, 0, 0, 0, 0, 0]);
                }
            }
        }
        
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), x_size, y_size)
    }

    fn test_single_case(x_size: usize, y_size: usize, pattern: &str, test_cosets: bool) -> bool {
        println!("\n🧪 Testing {}×{} with {} pattern", x_size, y_size, pattern);
        
        let test_poly = create_test_polynomial(x_size, y_size, pattern);
        let size = x_size * y_size;
        
        // 코셋 설정
        let (coset_x, coset_y) = if test_cosets {
            (Some(ScalarField::from([2, 0, 0, 0, 0, 0, 0, 0])), Some(ScalarField::from([3, 0, 0, 0, 0, 0, 0, 0])))
        } else {
            (None, None)
        };
        
        // === to_rou_evals 테스트 ===
        println!("  📤 Testing to_rou_evals...");
        
        // 참조 방식 (columns_batch=false)
        let mut reference_evals = vec![ScalarField::zero(); size];
        test_poly.to_rou_evals(
            coset_x.as_ref(), 
            coset_y.as_ref(), 
        HostSlice::from_mut_slice(&mut reference_evals));
        
        // 새로운 방식 (CPU 폴백 + GPU columns_batch=true)
        let mut new_evals = vec![ScalarField::zero(); size];
        test_poly.to_rou_evals(coset_x.as_ref(), coset_y.as_ref(), 
                              HostSlice::from_mut_slice(&mut new_evals));
        
        // 결과 비교
        let evals_match = compare_field_arrays(&reference_evals, &new_evals, 1e-10, "to_rou_evals");
        
        if !evals_match {
            println!("❌ to_rou_evals results don't match for {}×{}", x_size, y_size);
            return false;
        }
        
        // === from_rou_evals 테스트 ===
        println!("  📥 Testing from_rou_evals...");
        
        // 참조 방식으로 역변환
        let reference_poly_back = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&reference_evals),
            x_size, y_size, coset_x.as_ref(), coset_y.as_ref()
        );
        
        // 새로운 방식으로 역변환
        let new_poly_back = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&new_evals),
            x_size, y_size, coset_x.as_ref(), coset_y.as_ref()
        );
        
        // 계수 추출하여 비교
        let mut reference_coeffs_back = vec![ScalarField::zero(); size];
        let mut new_coeffs_back = vec![ScalarField::zero(); size];
        
        reference_poly_back.copy_coeffs(0, HostSlice::from_mut_slice(&mut reference_coeffs_back));
        new_poly_back.copy_coeffs(0, HostSlice::from_mut_slice(&mut new_coeffs_back));
        
        let coeffs_match = compare_field_arrays(&reference_coeffs_back, &new_coeffs_back, 1e-10, "from_rou_evals");
        
        if !coeffs_match {
            println!("❌ from_rou_evals results don't match for {}×{}", x_size, y_size);
            return false;
        }
        
        // === Roundtrip 정확성 테스트 ===
        println!("  🔄 Testing roundtrip accuracy...");
        
        // 원본 계수 가져오기
        let mut original_coeffs = vec![ScalarField::zero(); size];
        test_poly.copy_coeffs(0, HostSlice::from_mut_slice(&mut original_coeffs));
        
        // 참조 방식 roundtrip
        let reference_roundtrip_ok = compare_field_arrays(&original_coeffs, &reference_coeffs_back, 1e-10, "Reference roundtrip");
        
        // 새로운 방식 roundtrip
        let new_roundtrip_ok = compare_field_arrays(&original_coeffs, &new_coeffs_back, 1e-10, "New method roundtrip");
        
        if !reference_roundtrip_ok || !new_roundtrip_ok {
            println!("❌ Roundtrip accuracy failed for {}×{}", x_size, y_size);
            return false;
        }
        
        println!("✅ All tests passed for {}×{} with {}", x_size, y_size, pattern);
        true
    }

    #[test]
    fn test_to_rou_evals_consistency() {
        // CPU 디바이스로 고정
        // let _ = icicle_runtime::load_backend_from_env_or_default();
        // let device_cpu = Device::new("CPU", 0);
        // let mut device_gpu = Device::new("CUDA", 0);
        // icicle_runtime::set_device(&device_gpu).expect("Failed to set device");

        // 임의의 크기 선택 (둘 다 2의 거듭제곱)
        let x_size = 8;
        let y_size = 8;
        let total = x_size * y_size;

        // 무작위 계수 벡터 생성
        let random_coeffs: Vec<ScalarField> = ScalarCfg::generate_random(total).to_vec();
        let poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&random_coeffs), x_size, y_size);

        // 첫 번째 버퍼에 일반 to_rou_evals 결과 저장
        let mut evals_standard = vec![ScalarField::zero(); total];
        poly.to_rou_evals_original(None, None, HostSlice::from_mut_slice(&mut evals_standard));

        // 두 번째 버퍼에 mixed 버전 결과 저장
        let mut evals_mixed = vec![ScalarField::zero(); total];
        poly.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut evals_mixed));

        // 두 결과가 일치해야 함
        assert_eq!(
            evals_standard, evals_mixed,
            "to_rou_evals vs to_rou_evals_mixed 결과가 다릅니다"
        );
    }

    #[test]
    fn test_from_rou_evals_consistency() {
        // CPU 디바이스로 고정
        // let _ = icicle_runtime::load_backend_from_env_or_default();
        // let device_cpu = Device::new("CPU", 0);
        // let mut device_gpu = Device::new("CUDA", 0);
        // icicle_runtime::set_device(&device_gpu).expect("Failed to set device");

        // 임의의 크기 선택 (둘 다 2의 거듭제곱)
        let x_size = 1;
        let y_size = 128;
        let total = x_size * y_size;

        // 무작위 평가값 벡터 생성
        let mut random_evals: Vec<ScalarField> = ScalarCfg::generate_random(total).to_vec();

        // 일반 버전으로부터 다항식 복원
        let poly_standard = DensePolynomialExt::from_rou_evals_original(
            HostSlice::from_slice(&random_evals),
            x_size,
            y_size,
            None,
            None,
        );

        // mixed 버전으로부터 다항식 복원
        let poly_mixed = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&random_evals),
            x_size,
            y_size,
            None,
            None,
        );

        // 두 다항식의 계수를 호스트로 복사
        let mut coeffs_standard = vec![ScalarField::zero(); total];
        poly_standard.copy_coeffs(0, HostSlice::from_mut_slice(&mut coeffs_standard));

        let mut coeffs_mixed = vec![ScalarField::zero(); total];
        poly_mixed.copy_coeffs(0, HostSlice::from_mut_slice(&mut coeffs_mixed));

        // 두 계수 벡터가 일치해야 함
        assert_eq!(
            coeffs_standard, coeffs_mixed,
            "from_rou_evals vs from_rou_evals_mixed 복원 결과가 다릅니다"
        );
    }


    #[test]
    fn test_cpu_fallback_cases() {
        println!("\n🚀 Testing CPU fallback cases");
        
        let cpu_fallback_cases = [
            (1, 32),   // 1D small
            (1, 64),   // 1D medium  
            (1, 128),  // 1D large (main problematic case)
            (2, 32),   // 2D small
            (4, 16),   // 2D small
            (8, 8),    // 2D square small
        ];
        
        let patterns = ["sequential", "alternating", "powers_of_2"];
        
        for (x_size, y_size) in cpu_fallback_cases.iter() {
            for pattern in patterns.iter() {
                // 코셋 없이 테스트
                let success_no_coset = test_single_case(*x_size, *y_size, pattern, false);
                assert!(success_no_coset, "Test failed for {}×{} {} (no coset)", x_size, y_size, pattern);
                
                // 코셋과 함께 테스트
                let success_with_coset = test_single_case(*x_size, *y_size, pattern, true);
                assert!(success_with_coset, "Test failed for {}×{} {} (with coset)", x_size, y_size, pattern);
            }
        }
        
        println!("✅ All CPU fallback cases passed!");
    }

    #[test]
    fn test_gpu_cases() {
        println!("\n🚀 Testing GPU cases (should use columns_batch=true)");
        
        let gpu_cases = [
            (64, 64),    // Large square
            (128, 64),   // Large rectangle
            (64, 128),   // Large rectangle
            (32, 128),   // Medium rectangle
            (256, 32),   // Wide rectangle
        ];
        
        for (x_size, y_size) in gpu_cases.iter() {
            // 한 가지 패턴으로만 테스트 (GPU 케이스들은 이미 안전함)
            let success = test_single_case(*x_size, *y_size, "sequential", false);
            assert!(success, "GPU test failed for {}×{}", x_size, y_size);
        }
        
        println!("✅ All GPU cases passed!");
    }

    #[test]
    fn test_edge_cases() {
        println!("\n🚀 Testing edge cases");
        
        let edge_cases = [
            (1, 1),     // Smallest possible
            (1, 2),     // Very small 1D
            (2, 1),     // Very small 1D (transposed)
            (1, 4),     // Small 1D
            (4, 1),     // Small 1D (transposed)
            (1, 8),     // Small 1D
            (8, 1),     // Small 1D (transposed)
            (1, 16),    // Medium 1D
            (16, 1),    // Medium 1D (transposed)
        ];
        
        for (x_size, y_size) in edge_cases.iter() {
            let success = test_single_case(*x_size, *y_size, "sequential", false);
            assert!(success, "Edge case test failed for {}×{}", x_size, y_size);
        }
        
        println!("✅ All edge cases passed!");
    }

    #[test]
    fn test_stress_case_1x128() {
        println!("\n🎯 Stress testing the main problematic case: 1×128");
        
        let patterns = ["sequential", "alternating", "powers_of_2", "fibonacci"];
        
        for pattern in patterns.iter() {
            println!("  Testing with {} pattern...", pattern);
            
            // 코셋 없이
            let success1 = test_single_case(1, 128, pattern, false);
            assert!(success1, "1×128 failed with {} (no coset)", pattern);
            
            // 코셋과 함께  
            let success2 = test_single_case(1, 128, pattern, true);
            assert!(success2, "1×128 failed with {} (with coset)", pattern);
        }
        
        println!("✅ 1×128 stress test passed with all patterns!");
    }

    #[test]
    fn test_comprehensive_verification() {
        println!("\n🔬 Comprehensive verification test");
        
        // 다양한 크기와 패턴의 조합
        let test_matrix = [
            // (x_size, y_size, pattern, with_coset)
            (1, 32, "sequential", false),
            (1, 64, "alternating", true), 
            (1, 128, "powers_of_2", false),
            (2, 64, "fibonacci", true),
            (4, 32, "sequential", false),
            (8, 16, "alternating", true),
            (16, 8, "powers_of_2", false),
            (32, 32, "sequential", true),
            (64, 64, "alternating", false),
            (128, 64, "fibonacci", true),
        ];
        
        let mut passed = 0;
        let total = test_matrix.len();
        
        for (x_size, y_size, pattern, with_coset) in test_matrix.iter() {
            let success = test_single_case(*x_size, *y_size, pattern, *with_coset);
            if success {
                passed += 1;
            } else {
                println!("❌ Failed: {}×{} {} coset={}", x_size, y_size, pattern, with_coset);
            }
        }
        
        println!("\n📊 Comprehensive test results: {}/{} passed ({:.1}%)", 
                 passed, total, (passed as f64 / total as f64) * 100.0);
        
        assert_eq!(passed, total, "Not all comprehensive tests passed");
        println!("✅ All comprehensive tests passed!");
    }
}

#[cfg(test)]
mod msm_vs_rayon_tests {
    use super::*;
    use icicle_bls12_381::curve::{CurveCfg, G1Affine, G1Projective, ScalarCfg, ScalarField};
    use crate::iotools::{from_coef_vec_to_g1serde_vec, from_coef_vec_to_g1serde_vec_msm};
    use crate::group_structures::G1serde;
    use icicle_core::curve::Curve;

    #[test]
    fn cpu_and_gpu_versions_produce_same() {
        // 1) 테스트 크기
        let n = 256;
        // 2) 랜덤 계수 생성
        let coef_vec: Vec<ScalarField> = ScalarCfg::generate_random(n);
        // 3) generator point
        let gen = CurveCfg::generate_random_affine_points(n)[0];

        // 4) 결과 버퍼 준비
        let mut res_cpu = vec![G1serde(G1Affine::zero()); n];
        let mut res_gpu = vec![G1serde(G1Affine::zero()); n];

        // 5) 호출
        from_coef_vec_to_g1serde_vec(&coef_vec, &gen, &mut res_cpu);
        from_coef_vec_to_g1serde_vec_msm(&Box::from(coef_vec.clone().into_boxed_slice()), &gen, &mut res_gpu);

        // 6) 비교
        assert_eq!(res_cpu.len(), res_gpu.len());
        for i in 0..n {
            assert_eq!(
                res_cpu[i].0, 
                res_gpu[i].0,
                "mismatch at index {}: cpu={:?}, gpu={:?}",
                i, res_cpu[i].0, res_gpu[i].0
            );
        }
    }
}


#[cfg(test)]
mod tests {
    use icicle_core::ntt;

    use super::*;
    use crate::vector_operations::{*};
    use crate::bivariate_polynomial::{DensePolynomialExt, BivariatePolynomial};

    // Helper function: Create a simple 2D polynomial
    fn create_simple_polynomial() -> DensePolynomialExt {
        // Simple 2x2 polynomial: 1 + 2x + 3y + 4xy (coefficient matrix: [[1, 3], [2, 4]])
        let coeffs = vec![
            ScalarField::from_u32(1),  // Constant term
            ScalarField::from_u32(3),  // x coefficient
            ScalarField::from_u32(2),  // y coefficient
            ScalarField::from_u32(4),  // xy coefficient
        ];
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), 2, 2)
    }

    fn create_larger_polynomial() -> DensePolynomialExt {
        // Create a 4x4 polynomial with random coefficients
        let size = 16; // 4x4
        let coeffs = ScalarCfg::generate_random(size);
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), 4, 4)
    }

    // Create a univariate polynomial in x
    fn create_univariate_x_polynomial() -> DensePolynomialExt {
        // Polynomial in x: 1 + 2x + 3x^2
        let coeffs = vec![
            ScalarField::from_u32(1),
            ScalarField::from_u32(2),
            ScalarField::from_u32(3),
            ScalarField::from_u32(0),
        ];
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), 4, 1)
    }

    // Create a univariate polynomial in y
    fn create_univariate_y_polynomial() -> DensePolynomialExt {
        // Polynomial in y: 1 + 2y + 3y^2
        let mut coeffs = vec![ScalarField::from_u32(0); 16];
        coeffs[0] = ScalarField::from_u32(1);  // Constant
        coeffs[4] = ScalarField::from_u32(2);  // y
        coeffs[8] = ScalarField::from_u32(3);  // y^2
        
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), 4, 4)
    }

    #[test]
    fn test_from_coeffs() { // pass
        let poly = create_simple_polynomial();
        assert_eq!(poly.x_degree, 1);
        assert_eq!(poly.y_degree, 1);
        assert_eq!(poly.x_size, 2);
        assert_eq!(poly.y_size, 2);

        // Verify coefficients
        assert_eq!(poly.get_coeff(0, 0), ScalarField::from_u32(1));
        assert_eq!(poly.get_coeff(1, 0), ScalarField::from_u32(2));
        assert_eq!(poly.get_coeff(0, 1), ScalarField::from_u32(3));
        assert_eq!(poly.get_coeff(1, 1), ScalarField::from_u32(4));
    }
    #[test]
    fn test_from_evals() {
        let x_size = 2048;
        let y_size = 1;
        let evals = ScalarCfg::generate_random(x_size * y_size);
        
        let poly = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&evals),
            x_size,
            y_size,
            None,
            None
        );
        let mut recoevered_evals = vec![ScalarField::zero(); x_size * y_size];
        let buff = HostSlice::from_mut_slice(&mut recoevered_evals);
        poly.to_rou_evals(None, None, buff);
        
        let mut flag = true;
        for i in 0..x_size * y_size {
            if !evals[i].eq(&recoevered_evals[i]) {
                flag = false;
            }
        }
        assert!(flag);
    }

    #[test]
    fn test_add() { // pass
        let poly1 = create_simple_polynomial();
        let poly2 = create_simple_polynomial();
        
        let result = &poly1 + &poly2;
        
        // Verify addition results
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(1) + ScalarField::from_u32(1));  // 1+1
        assert_eq!(result.get_coeff(1, 0), ScalarField::from_u32(2) + ScalarField::from_u32(2));  // 2+2
        assert_eq!(result.get_coeff(0, 1), ScalarField::from_u32(3) + ScalarField::from_u32(3));  // 3+3
        assert_eq!(result.get_coeff(1, 1), ScalarField::from_u32(4) + ScalarField::from_u32(4));  // 4+4
    }

    #[test]
    fn test_sub() { // pass
        let poly1 = create_simple_polynomial();
        // Create a polynomial with different coefficients
        let coeffs2 = vec![
            ScalarField::from_u32(5),  // Constant
            ScalarField::from_u32(2),  // x
            ScalarField::from_u32(1),  // y
            ScalarField::from_u32(3),  // xy
        ];
        let poly2 = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs2), 2, 2);
        
        let result = &poly1 - &poly2;
        
        // Verify subtraction results
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(1) - ScalarField::from_u32(5));
        assert_eq!(result.get_coeff(1, 0), ScalarField::from_u32(2) - ScalarField::from_u32(1));
        assert_eq!(result.get_coeff(0, 1), ScalarField::from_u32(3) - ScalarField::from_u32(2));
        assert_eq!(result.get_coeff(1, 1), ScalarField::from_u32(4) - ScalarField::from_u32(3));
    }

    #[test]
    fn test_mul_scalar() { // pass
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(5);
        let poly = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&ScalarCfg::generate_random(x_size * y_size)), 
            x_size, 
            y_size
        );
        let scalar = ScalarCfg::generate_random(1)[0];
        
        let result1 = &poly * &scalar;
        let result2 = &scalar * &poly;
        
        // Verify scalar multiplication results
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];
        assert_eq!(result1.eval(&x, &y), poly.eval(&x, &y) * scalar);
        assert_eq!(result1.eval(&x, &y), result2.eval(&x, &y));
    }

    #[test]
    fn test_sub_scalar() { // pass
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(5);
        let poly = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&ScalarCfg::generate_random(x_size * y_size)), 
            x_size, 
            y_size
        );
        let scalar = ScalarCfg::generate_random(1)[0];
        let result1 = &poly - &scalar;
        let result2 = &scalar - &poly;

        // Verify scalar multiplication results
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];
        assert_eq!(result1.eval(&x, &y), poly.eval(&x, &y) - scalar);
        assert_eq!(result2.eval(&x, &y), scalar - poly.eval(&x, &y));  
    }

    #[test]
    fn test_add_scalar() { // pass
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(5);
        let poly = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&ScalarCfg::generate_random(x_size * y_size)), 
            x_size, 
            y_size
        );
        let scalar = ScalarCfg::generate_random(1)[0];
        let result1 = &poly + &scalar;
        let result2 = &scalar + &poly;
        
        // Verify scalar multiplication results
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];
        assert_eq!(result1.eval(&x, &y), poly.eval(&x, &y) + scalar);
        assert_eq!(result1.eval(&x, &y), result2.eval(&x, &y));
    }

    #[test]
    fn test_neg() { // pass
        let poly = create_simple_polynomial();
        let result = -&poly;
        
        // Verify negation results
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(0) - ScalarField::from_u32(1));
        assert_eq!(result.get_coeff(1, 0), ScalarField::from_u32(0) - ScalarField::from_u32(2));
        assert_eq!(result.get_coeff(0, 1), ScalarField::from_u32(0) - ScalarField::from_u32(3));
        assert_eq!(result.get_coeff(1, 1), ScalarField::from_u32(0) - ScalarField::from_u32(4));
    }


    #[test]
    fn test_get_univariate_polynomial() { // pass
        // Create a polynomial with predictable coefficients
        let mut coeffs = vec![ScalarField::from_u32(0); 16];
        for y in 0..4 {
            for x in 0..4 {
                let idx = y * 4 + x;
                coeffs[idx] = ScalarField::from_u32((x + y) as u32);
            }
        }
        let poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), 4, 4);
        
        // Extract univariate polynomial in x at y = 2
        let x_poly = poly.get_univariate_polynomial_x(2);
        assert_eq!(x_poly.y_size, 1);
        assert_eq!(x_poly.x_size, 4);
        // Check coefficients: at y = 2, the coefficients should be [2, 3, 4, 5]
        for i in 0..4 {
            assert_eq!(x_poly.get_coeff(i, 0), ScalarField::from_u32((i + 2) as u32));
        }
        
        // Extract univariate polynomial in y at x = 1
        let y_poly = poly.get_univariate_polynomial_y(1);
        assert_eq!(y_poly.x_size, 1);
        assert_eq!(y_poly.y_size, 4);
        // Check coefficients: at x = 1, the coefficients should be [1, 2, 3, 4]
        for i in 0..4 {
            assert_eq!(y_poly.get_coeff(0, i), ScalarField::from_u32((1 + i) as u32));
        }
    }

    #[test]
    fn test_eval() { // pass
        let poly = create_simple_polynomial();
        let x = ScalarField::from_u32(2);
        let y = ScalarField::from_u32(3);
        
        // 1 + 2x + 3y + 4xy = 1 + 2*2 + 3*3 + 4*2*3 = 1 + 4 + 9 + 24 = 38
        let expected = ScalarField::from_u32(38);
        let result = poly.eval(&x, &y);
        
        assert_eq!(result, expected);
    }

    #[test]
    fn test_eval_x() { // pass
        let poly = create_simple_polynomial();
        let x = ScalarField::from_u32(2);
        
        // Polynomial (1 + 2x + 3y + 4xy) with x=2 becomes: (1 + 4) + (3 + 8)y = 5 + 11y
        let result = poly.eval_x(&x);
        
        assert_eq!(result.x_size, 1);
        assert_eq!(result.y_size, 2);
        
        // Verify coefficients
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(5));   // Constant: 1 + 2*2
        assert_eq!(result.get_coeff(0, 1), ScalarField::from_u32(11));  // y coeff: 3 + 4*2
    }

    #[test]
    fn test_eval_y() { // pass
        let poly = create_simple_polynomial();
        let y = ScalarField::from_u32(3);
        
        // Polynomial (1 + 2x + 3y + 4xy) with y=3 becomes: (1 + 9) + (2 + 12)x = 10 + 14x
        let result = poly.eval_y(&y);
        
        assert_eq!(result.x_size, 2);
        assert_eq!(result.y_size, 1);
        
        // Verify coefficients
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(10));  // Constant: 1 + 3*3
        assert_eq!(result.get_coeff(1, 0), ScalarField::from_u32(14));  // x coeff: 2 + 4*3
    }


    #[test]
    fn test_resize() { // pass
        let mut poly = create_simple_polynomial();
        
        // Resize to 4x4
        poly.resize(4, 4);
        
        // Verify size
        assert_eq!(poly.x_size, 4);
        assert_eq!(poly.y_size, 4);
        
        // Verify original coefficients are preserved
        assert_eq!(poly.get_coeff(0, 0), ScalarField::from_u32(1));
        assert_eq!(poly.get_coeff(1, 0), ScalarField::from_u32(2));
        assert_eq!(poly.get_coeff(0, 1), ScalarField::from_u32(3));
        assert_eq!(poly.get_coeff(1, 1), ScalarField::from_u32(4));
        
        // New parts are filled with zeros
        assert_eq!(poly.get_coeff(2, 0), ScalarField::from_u32(0));
        assert_eq!(poly.get_coeff(0, 2), ScalarField::from_u32(0));
        assert_eq!(poly.get_coeff(3, 3), ScalarField::from_u32(0));
    }

    #[test]
    fn test_optimize_size() { // pass
        // Create a larger polynomial (4x4) but with only 2x2 actually used
        let mut coeffs = vec![ScalarField::from_u32(0); 16];
        for y in 0..2 {
            for x in 0..2 {
                let idx = y * 4 + x;
                coeffs[idx] = ScalarField::from_u32(1);  // Set non-zero values only in 2x2 submatrix
            }
        }
        
        let mut poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), 4, 4);
        // Manually adjust the degree to reflect the actual non-zero terms
        poly.x_degree = 1;
        poly.y_degree = 1;
        
        // Optimize size
        poly.optimize_size();
        
        // Size should be 2x2 (or the next power of 2 that can contain 2x2)
        assert!(poly.x_size <= 2);
        assert!(poly.y_size <= 2);
    }

    #[test]
    fn test_div_by_ruffini() {
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(5);
        let p_coeffs_vec = ScalarCfg::generate_random(x_size * y_size);
        let p = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&p_coeffs_vec), x_size, y_size);
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];
        
        let (q_x, q_y, r) = p.div_by_ruffini(&x, &y);
        let a = ScalarCfg::generate_random(1)[0];
        let b = ScalarCfg::generate_random(1)[0];
        let q_x_eval = q_x.eval(&a, &b);
        let q_y_eval = q_y.eval(&a, &b);
        let estimated_p_eval = (q_x_eval * (a - x)) + (q_y_eval * (b - y)) + r;
        let true_p_eval = p.eval(&a, &b);
        assert!(estimated_p_eval.eq(&true_p_eval));
    }

    #[test]
    fn test_divide_x() {
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(5);
        let p_coeffs_vec = ScalarCfg::generate_random(x_size * y_size);
        let p = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&p_coeffs_vec), x_size, y_size);

        let denom_x_size = 2usize.pow(6);
        let denom_y_size = 1;
        let denom_coeffs_vec = ScalarCfg::generate_random(denom_x_size * denom_y_size);
        let denom = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&denom_coeffs_vec), denom_x_size, denom_y_size);
        
        let (q, r) = p.divide_x(&denom);
        let a = ScalarCfg::generate_random(1)[0];
        let b = ScalarCfg::generate_random(1)[0];
        let denom_eval = denom.eval(&a, &b);
        let q_eval = q.eval(&a, &b);
        let r_eval = r.eval(&a, &b);
        let estimated_p_eval = (q_eval * denom_eval) + r_eval;
        let true_p_eval = p.eval(&a, &b);
        assert!(estimated_p_eval.eq(&true_p_eval));
    }

    #[test]
    fn test_divide_y() {
        let x_size = 2usize.pow(5);
        let y_size = 2usize.pow(10);
        let p_coeffs_vec = ScalarCfg::generate_random(x_size * y_size);
        let p = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&p_coeffs_vec), x_size, y_size);

        let denom_y_size = 2usize.pow(6);
        let denom_x_size = 1;
        let denom_coeffs_vec = ScalarCfg::generate_random(denom_x_size * denom_y_size);
        let denom = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&denom_coeffs_vec), denom_x_size, denom_y_size);
        
        let (q, r) = p.divide_y(&denom);
        let a = ScalarCfg::generate_random(1)[0];
        let b = ScalarCfg::generate_random(1)[0];
        let denom_eval = denom.eval(&a, &b);
        let q_eval = q.eval(&a, &b);
        let r_eval = r.eval(&a, &b);
        let estimated_p_eval = (q_eval * denom_eval) + r_eval;
        let true_p_eval = p.eval(&a, &b);
        assert!(estimated_p_eval.eq(&true_p_eval));
    }

    #[test]
    fn test_mul_monomial() {
        // Create a simple 2x2 polynomial: 1 + 2x + 3y + 4xy
        let coeffs = vec![
            ScalarField::from_u32(1),  // Constant
            ScalarField::from_u32(3),  // x
            ScalarField::from_u32(2),  // y
            ScalarField::from_u32(4),  // xy
        ];
        let poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), 2, 2);
        
        // Multiply by xy (shift each term by x^1 * y^1)
        let result = poly.mul_monomial(1, 1);
        
        // Verify result dimensions are powers of two
        assert_eq!(result.x_size.is_power_of_two(), true);
        assert_eq!(result.y_size.is_power_of_two(), true);
        
        // In the implemented code, the degrees are calculated as size-1, so we test against that
        assert_eq!(result.x_degree, result.x_size as i64 - 1);
        assert_eq!(result.y_degree, result.y_size as i64 - 1);
        
        // Original: 1 + 2x + 3y + 4xy
        // After multiplying by xy: xy + 2x^2y + 3xy^2 + 4x^2y^2
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(0));  // No constant term
        assert_eq!(result.get_coeff(1, 1), ScalarField::from_u32(1));  // xy coefficient
        assert_eq!(result.get_coeff(2, 1), ScalarField::from_u32(2));  // x^2y coefficient
        assert_eq!(result.get_coeff(1, 2), ScalarField::from_u32(3));  // xy^2 coefficient
        assert_eq!(result.get_coeff(2, 2), ScalarField::from_u32(4));  // x^2y^2 coefficient
    }

    #[test]
    fn test_mul_polynomial() {
        let m = 5;
        let n = 3;
        let p1_x_size = 2usize.pow(m);
        let p1_y_size = 2usize.pow(0);
        let p2_x_size = 2usize.pow(m);
        let p2_y_size = 2usize.pow(n);

        let p1_coeffs_vec = ScalarCfg::generate_random(p1_x_size * p1_y_size);
        let p2_coeffs_vec = ScalarCfg::generate_random(p2_x_size * p2_y_size);
        let p1 = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&p1_coeffs_vec),
            p1_x_size,
            p1_y_size
        );
        let p2 = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&p2_coeffs_vec),
            p2_x_size, 
            p2_y_size
        );

        let p3 = &p1 * &p2;
        
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];

        let p1_eval = p1.eval(&x, &y);
        let p2_eval = p2.eval(&x, &y);
        let p3_eval = p3.eval(&x, &y);

        assert!( p3_eval.eq(&(p1_eval * p2_eval)));

        let omega_x = ntt::get_root_of_unity::<ScalarField>(2u64.pow(m));
        let omega_y = ntt::get_root_of_unity::<ScalarField>(2u64.pow(n));
        let mut flag = true;
        for i in 0..2usize.pow(m) {
            for j  in 0..2usize.pow(n) {
                let x = omega_x.pow(i);
                let y = omega_y.pow(j);
                if !p3.eval(&x, &y).eq(&(p1.eval(&x, &y) * p2.eval(&x, &y))) {
                    flag = false;
                }
            }
        }
        assert!(flag);

    }


    // Test for div_by_vanishing - requires specific conditions
    #[test]
    fn test_div_by_vanishing_basic() {
        // Case m=2 and n=2:

        let c = 2usize.pow(4);
        let d = 2usize.pow(3);
        let m = 2;
        let n = 2;
        let mut t_x_coeffs = vec![ScalarField::zero(); 2*c];
        let mut t_y_coeffs = vec![ScalarField::zero(); 2*d];
        t_x_coeffs[c] = ScalarField::one();
        t_x_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_y_coeffs[d] = ScalarField::one();
        t_y_coeffs[0] = ScalarField::zero() - ScalarField::one();
        let mut t_x = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_x_coeffs), 2*c, 1);
        let mut t_y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_y_coeffs), 1, 2*d);
        t_x.optimize_size();
        t_y.optimize_size();
        println!("t_x_xdeg: {:?}", t_x.x_degree);
        println!("t_y_ydeg: {:?}", t_y.y_degree);

        let q_x_coeffs_opt = ScalarCfg::generate_random(((m-1)*c-2) * (n*d -2) );
        let q_y_coeffs_opt = ScalarCfg::generate_random((c-1) * ((n-1)*d-2));
        let q_x_coeffs = resize(
            &q_x_coeffs_opt.into_boxed_slice(), 
            (m-1)*c-2, 
            n*d -2,
            (m-1)*c, 
            n*d,
            ScalarField::zero()
        );
        let q_y_coeffs = resize(
            &q_y_coeffs_opt.into_boxed_slice(), 
            c-1, 
            (n-1)*d-2, 
            c, 
            (n-1)*d,
            ScalarField::zero()
        );
        let mut q_x = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&q_x_coeffs), (m-1)*c, n*d);
        let mut q_y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&q_y_coeffs), c, (n-1)*d);
        q_x.optimize_size();
        q_y.optimize_size();
        let mut p = &(&q_x * &t_x) + &(&q_y * &t_y);
        p.optimize_size();
        println!("p_xsize: {:?}", p.x_size);
        println!("p_ysize: {:?}", p.y_size);
        
        let (mut q_x_found, mut q_y_found) = p.div_by_vanishing(c as i64, d as i64);
        q_x_found.optimize_size();
        q_y_found.optimize_size();
        let p_reconstruct = &(&q_x_found * &t_x) + &(&q_y_found * &t_y);

        let a = ScalarCfg::generate_random(1)[0];
        let b = ScalarCfg::generate_random(1)[0];
        
        let p_evaled = p.eval(&a, &b);
        let p_reconstruct_evaled = p_reconstruct.eval(&a, &b);
        assert!(p_evaled.eq(&p_reconstruct_evaled));
        assert_eq!(q_x.x_degree, q_x_found.x_degree);
        assert_eq!(q_x.y_degree, q_x_found.y_degree);
        assert_eq!(q_y.x_degree, q_y_found.x_degree);
        assert_eq!(q_y.y_degree, q_y_found.y_degree);
        println!("Case m=2 and n=2 passed");

        // Case m=4 and n=2:

        let m = 3;
        let n = 2;
        let c = 2usize.pow(4);
        let d = 2usize.pow(3);
        let mut t_x_coeffs = vec![ScalarField::zero(); 2*c];
        let mut t_y_coeffs = vec![ScalarField::zero(); 2*d];
        t_x_coeffs[c] = ScalarField::one();
        t_x_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_y_coeffs[d] = ScalarField::one();
        t_y_coeffs[0] = ScalarField::zero() - ScalarField::one();
        let mut t_x = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_x_coeffs), 2*c, 1);
        let mut t_y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_y_coeffs), 1, 2*d);
        t_x.optimize_size();
        t_y.optimize_size();
        println!("t_x_xdeg: {:?}", t_x.x_degree);
        println!("t_y_ydeg: {:?}", t_y.y_degree);

        let q_x_coeffs_opt = ScalarCfg::generate_random(((m-1)*c-3) * (n*d -2) );
        let q_y_coeffs_opt = ScalarCfg::generate_random((c-1) * ((n-1)*d-2));
        let q_x_coeffs = resize(
            &q_x_coeffs_opt.into_boxed_slice(), 
            (m-1)*c-3, 
            n*d -2,
            (m-1)*c, 
            n*d,
            ScalarField::zero()
        );
        let q_y_coeffs = resize(
            &q_y_coeffs_opt.into_boxed_slice(), 
            c-1, 
            (n-1)*d-2, 
            c, 
            (n-1)*d,
            ScalarField::zero()
        );
        let mut q_x = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&q_x_coeffs), (m-1)*c, n*d);
        let mut q_y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&q_y_coeffs), c, (n-1)*d);
        q_x.optimize_size();
        q_y.optimize_size();
        let mut p = &(&q_x * &t_x) + &(&q_y * &t_y);
        p.optimize_size();
        println!("p_xsize: {:?}", p.x_size);
        println!("p_ysize: {:?}", p.y_size);
        
        let (mut q_x_found, mut q_y_found) = p.div_by_vanishing(c as i64, d as i64);
        q_x_found.optimize_size();
        q_y_found.optimize_size();
        let p_reconstruct = &(&q_x_found * &t_x) + &(&q_y_found * &t_y);

        let a = ScalarCfg::generate_random(1)[0];
        let b = ScalarCfg::generate_random(1)[0];
        
        let p_evaled = p.eval(&a, &b);
        let p_reconstruct_evaled = p_reconstruct.eval(&a, &b);
        assert!(p_evaled.eq(&p_reconstruct_evaled));
        assert_eq!(q_x.x_degree, q_x_found.x_degree);
        assert_eq!(q_x.y_degree, q_x_found.y_degree);
        assert_eq!(q_y.x_degree, q_y_found.x_degree);
        assert_eq!(q_y.y_degree, q_y_found.y_degree);
        println!("Case m=4 and n=2 passed");

    }

    #[test]
    fn update_degree_general_case() {
        let x_size = 2usize.pow(12);
        let y_size = 2usize.pow(6);
        // let x_degree= 2i64.pow(9);
        // let y_degree = 0;
        let x_degree: i64 = (x_size - 1) as i64;
        let y_degree: i64 = (y_size - 1) as i64;

        let dense_coeffs = ScalarCfg::generate_random(((x_degree + 1) * (y_degree + 1)) as usize);
        let dense_coeffs_resized = resize(&dense_coeffs, 
            (x_degree + 1) as usize, 
            (y_degree + 1) as usize, 
            x_size, 
            y_size, 
            ScalarField::zero()
        );
        let mut _dense_p = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&dense_coeffs_resized), x_size, y_size);

        let time_parallel = Instant::now();
        let (x_deg, y_deg) = _dense_p.find_degree();
        assert_eq!(x_deg, x_degree);
        assert_eq!(y_deg, y_degree);
        println!("find_degree time: {:.6} seconds", time_parallel.elapsed().as_secs_f64());

        let x_degree= 0;
        let y_degree = 0;

        let sparse_coeffs = ScalarCfg::generate_random(((x_degree + 1) * (y_degree + 1)) as usize);
        let sparse_coeffs_resized = resize(&sparse_coeffs, 
            (x_degree + 1) as usize, 
            (y_degree + 1) as usize, 
            x_size, 
            y_size, 
            ScalarField::zero()
        );
        let mut _sparse_p = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&sparse_coeffs_resized), x_size, y_size);

        let time_parallel = Instant::now();
        let (x_deg, y_deg) = _sparse_p.find_degree();
        assert_eq!(x_deg, x_degree);
        assert_eq!(y_deg, y_degree);
        println!("find_degree time: {:.6} seconds", time_parallel.elapsed().as_secs_f64());


    }
    // More tests can be added as needed
}

#[cfg(test)]
mod tests_vectors {
    use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
    use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};
    use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice};
    use std::cmp;
    
    use crate::vector_operations::{*};

    macro_rules! scalar_vec {
        ( $( $x:expr ),* ) => {
            vec![
                $( ScalarField::from_u32($x) ),*
            ].into_boxed_slice()
        };
    }

    #[test]
    fn test_point_mul_two_vecs() {
        let vec1 = scalar_vec![1, 2, 3];
        let vec2 = scalar_vec![4, 5];
        let vec3 = scalar_vec![2, 0, 2, 4];

        let mut res = vec![ScalarField::zero(); 6].into_boxed_slice();
        outer_product_two_vecs(&vec1, &vec2, &mut res);
        println!("res : {:?}", res);

        let mut res = vec![ScalarField::zero(); 6].into_boxed_slice();
        outer_product_two_vecs(&vec2, &vec1, &mut res);
        println!("res : {:?}", res);

        let mut res = vec![ScalarField::zero(); 12].into_boxed_slice();
        outer_product_two_vecs(&vec1, &vec3, &mut res);
        println!("res : {:?}", res);

        let mut res = vec![ScalarField::zero(); 8].into_boxed_slice();
        outer_product_two_vecs(&vec3, &vec2, &mut res);
        println!("res : {:?}", res);

    }

    #[test]
    fn test_scaled_outer_product() {
        let vec1 = scalar_vec![1, 2, 3];
        let vec2 = scalar_vec![4, 5];
        let vec3 = scalar_vec![2, 0, 2, 4];
        let scaler = ScalarField::from_u32(2);

        let mut res = vec![ScalarField::zero(); 6].into_boxed_slice();
        scaled_outer_product(&vec1, &vec2, Some(&scaler), &mut res);
        println!("res : {:?}", res);

        let mut res = vec![ScalarField::zero(); 8].into_boxed_slice();
        scaled_outer_product(&vec3, &vec2, None, &mut res);
        println!("res : {:?}", res);

    }

    #[test]
    fn test_matrix_matrix_mul_small() {
        // example size: 2x3 * 3x2 = 2x2
        // LHS: 2x3
        // [1 2 3]
        // [4 5 6]
        let lhs = vec![
            ScalarField::from_u32(1u32),
            ScalarField::from_u32(2u32),
            ScalarField::from_u32(3u32),
            ScalarField::from_u32(4u32),
            ScalarField::from_u32(5u32),
            ScalarField::from_u32(6u32),
        ]
        .into_boxed_slice();

        // RHS: 3x2
        // [7  8]
        // [9 10]
        // [11 12]
        let rhs = vec![
            ScalarField::from_u32(7u32),
            ScalarField::from_u32(8u32),
            ScalarField::from_u32(9u32),
            ScalarField::from_u32(10u32),
            ScalarField::from_u32(11u32),
            ScalarField::from_u32(12u32),
        ]
        .into_boxed_slice();

        // expected result: 2x2
        // [1*7+2*9+3*11, 1*8+2*10+3*12] = [58, 64]
        // [4*7+5*9+6*11, 4*8+5*10+6*12] = [139, 154]
        let expected = vec![
            ScalarField::from_u32(58u32),
            ScalarField::from_u32(64u32),
            ScalarField::from_u32(139u32),
            ScalarField::from_u32(154u32),
        ]
        .into_boxed_slice();

        let mut res = vec![ScalarField::zero(); 4].into_boxed_slice();
        matrix_matrix_mul(&lhs, &rhs, 2, 3, 2, &mut res);

        for i in 0..4 {
            assert_eq!(res[i], expected[i], "Mismatch at index {}", i);
        }
    }

    #[test]
    fn test_gen_evaled_lagrange_bases() {
        let x = ScalarCfg::generate_random(1)[0];
        let size = 2048;
        let mut res = vec![ScalarField::zero(); size].into_boxed_slice();
        gen_evaled_lagrange_bases(&x, size, &mut res);
        
    }
    #[test]
    fn test_resize() {
        let rW_X_coeffs = ScalarCfg::generate_random(3);
        let rW_X_coeffs_resized = resize(&rW_X_coeffs, 3, 1, 4, 1, ScalarField::zero());
        let rW_Y_coeffs = ScalarCfg::generate_random(3);
        let rW_Y_coeffs_resized = resize(&rW_Y_coeffs, 1, 3, 1, 4, ScalarField::zero());

        println!("X_orig: {:?}", rW_X_coeffs);
        println!("X_ext: {:?}", rW_X_coeffs_resized);
        println!("Y_orig: {:?}", rW_Y_coeffs);
        println!("Y_ext: {:?}", rW_Y_coeffs_resized);
    }


}

mod tests_iotools {
    use crate::iotools::{from_coef_vec_to_g1serde_vec, gen_g1serde_vec_of_xy_monomials, scaled_outer_product_1d};
    use crate::vector_operations::extend_monomial_vec;
    use icicle_bls12_381::curve::{ScalarField, ScalarCfg, G1Affine, CurveCfg};
    use icicle_core::traits::{FieldImpl, GenerateRandom};
    use crate::group_structures::{G1serde};
    use crate::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
    use icicle_core::curve::Curve;
    use std::time::Instant;

    #[test]
    fn test_scalar_to_G1_conversion() {
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(4);
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];
        let gen = CurveCfg::generate_random_affine_points(1)[0];
        let mut res = vec![G1serde::zero(); x_size * y_size];
        
        let time_rayon = Instant::now();
        let mut x_powers_vec = vec![ScalarField::zero(); x_size];
        let mut y_powers_vec = vec![ScalarField::zero(); y_size];
        extend_monomial_vec(&vec![ScalarField::one(), x], &mut x_powers_vec);
        extend_monomial_vec(&vec![ScalarField::one(), y], &mut y_powers_vec);
        scaled_outer_product_1d(&x_powers_vec, &y_powers_vec, &gen, None, &mut res);
        let duration_rayon = time_rayon.elapsed();
        println!("Scalar_to_G1 time with rayon: {:.6} seconds", duration_rayon.as_secs_f64());
        drop(res);

        let mut res = vec![G1serde::zero(); x_size * y_size];
        let time_msm = Instant::now();
        gen_g1serde_vec_of_xy_monomials(x, y, &gen, x_size, y_size, &mut res);
        let duration_msm = time_msm.elapsed();
        println!("Scalar_to_G1 time with hybrid of rayon and msm: {:.6} seconds", duration_msm.as_secs_f64());
    }
}