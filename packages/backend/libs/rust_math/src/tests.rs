#[cfg(test)]
mod tests {
    use crate::{bipolynomial::BivariatePolynomial, dense_ext::DensePolynomialExt};

    use super::*;
    use std::time::{Duration, Instant};
    use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
    use icicle_core::traits::{FieldImpl, FieldConfig, GenerateRandom};
    use icicle_core::polynomials::UnivariatePolynomial;
    use icicle_core::{ntt, ntt::NTTInitDomainConfig};
    use icicle_core::vec_ops::{VecOps, VecOpsConfig};
    use icicle_bls12_381::polynomials::DensePolynomial;
    use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice, DeviceSlice, DeviceVec};
    use std::ops::Deref;
    use std::{
        clone, cmp,
        ops::{Add, AddAssign, Div, Mul, Rem, Sub},
        ptr, slice,
    };

    // Helper function to measure execution time
    fn measure_time<F>(f: F) -> Duration 
    where
        F: FnOnce(),
    {
        let start = Instant::now();
        f();
        start.elapsed()
    }

    #[test]
    fn test_basic_operations() {
        // Test polynomial creation and basic operations
        let p1_coeffs_vec = ScalarCfg::generate_random(8);
        let p1_coeffs = HostSlice::from_slice(&p1_coeffs_vec);
        let p1 = DensePolynomialExt::from_coeffs(p1_coeffs, 4, 2);

        let p2_coeffs_vec = ScalarCfg::generate_random(8);
        let p2_coeffs = HostSlice::from_slice(&p2_coeffs_vec);
        let p2 = DensePolynomialExt::from_coeffs(p2_coeffs, 4, 2);

        // Test addition
        let p3 = &p1 + &p2;
        assert_eq!(p3.degree(), p1.degree());

        // Test subtraction
        let p4 = &p1 - &p2;
        assert_eq!(p4.degree(), p1.degree());
    }

    #[test]
    fn test_polynomial_multiplication() {
        // 테스트 데이터 준비
        let mut p1_coeffs = vec![ScalarField::zero(); 4];
        p1_coeffs[0] = ScalarField::one(); // 상수항
        p1_coeffs[1] = ScalarField::one(); // x항
        let p1_coeffs = HostSlice::from_slice(&p1_coeffs);
        let p1 = DensePolynomialExt::from_coeffs(p1_coeffs, 2, 2);

        let mut p2_coeffs = vec![ScalarField::zero(); 4];
        p2_coeffs[0] = ScalarField::one(); // 상수항
        p2_coeffs[2] = ScalarField::one(); // y항
        let p2_coeffs = HostSlice::from_slice(&p2_coeffs);
        let p2 = DensePolynomialExt::from_coeffs(p2_coeffs, 2, 2);

        // 차수 출력
        let (x_deg1, y_deg1) = p1.degree();
        let (x_deg2, y_deg2) = p2.degree();
        println!("p1 degrees: x={}, y={}", x_deg1, y_deg1);
        println!("p2 degrees: x={}, y={}", x_deg2, y_deg2);

        // 곱셈 수행
        let p3 = &p1 * &p2;
        let (x_deg3, y_deg3) = p3.degree();
        println!("p3 degrees: x={}, y={}", x_deg3, y_deg3);

        // 차수 검증
        assert!(x_deg3 <= x_deg1 + x_deg2, 
            "x degree of result ({}) exceeds sum of input degrees ({} + {})",
            x_deg3, x_deg1, x_deg2);
        assert!(y_deg3 <= y_deg1 + y_deg2,
            "y degree of result ({}) exceeds sum of input degrees ({} + {})",
            y_deg3, y_deg1, y_deg2);

        // 계수 확인
        let mut p3_coeffs = vec![ScalarField::zero(); p3.x_size * p3.y_size];
        let p3_coeffs_slice = HostSlice::from_mut_slice(&mut p3_coeffs);
        p3.copy_coeffs(0, p3_coeffs_slice);
        println!("Result coefficients: {:?}", p3_coeffs);

        // 평가 지점에서의 검증
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];

        let eval_p1 = p1.eval(&x, &y);
        let eval_p2 = p2.eval(&x, &y);
        let eval_p3 = p3.eval(&x, &y);

        assert_eq!(eval_p3, eval_p1 * eval_p2, 
            "Evaluation at point does not match: {} != {} * {}", 
            eval_p3, eval_p1, eval_p2);
    }

    #[test]
    fn test_evaluation() {
        let p1_coeffs_vec = ScalarCfg::generate_random(8);
        let p1_coeffs = HostSlice::from_slice(&p1_coeffs_vec);
        let p1 = DensePolynomialExt::from_coeffs(p1_coeffs, 4, 2);

        // Generate random evaluation points
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];

        // Test evaluation
        let eval_result = p1.eval(&x, &y);
        
        // Verify evaluation matches coefficient representation
        let eval_x = p1.eval_x(&x);
        let eval_xy = eval_x.eval_y(&y);
        assert_eq!(eval_result, eval_xy.get_coeff(0, 0));
    }

    #[test]
    fn test_from_rou_evals() {
        let size = 16;
        let evals_vec = ScalarCfg::generate_random(size);
        let evals = HostSlice::from_slice(&evals_vec);

        // Create polynomial from roots of unity evaluations
        let poly = DensePolynomialExt::from_rou_evals(evals, 4, 4);

        // Verify conversion back to evaluations
        let mut result_vec = vec![ScalarField::zero(); size];
        let mut result = HostSlice::from_mut_slice(&mut result_vec);
        poly.to_rou_evals(&mut *result);

        // Check if evaluations match original
        for i in 0..size {
            assert_eq!(evals_vec[i], result_vec[i]);
        }
    }

    // #[test]
    // fn benchmark_operations() {
    //     // Test sizes
    //     let sizes = vec![(8, 8), (16, 16), (32, 32)];
        
    //     for (x_size, y_size) in sizes {
    //         let total_size = x_size * y_size;
    //         println!("\nBenchmarking size: {}x{}", x_size, y_size);

    //         // Generate random polynomials
    //         let p1_coeffs_vec = ScalarCfg::generate_random(total_size);
    //         let p1_coeffs = HostSlice::from_slice(&p1_coeffs_vec);
    //         let p2_coeffs_vec = ScalarCfg::generate_random(total_size);
    //         let p2_coeffs = HostSlice::from_slice(&p2_coeffs_vec);

    //         // Benchmark DensePolynomialExt
    //         let p1_ext = DensePolynomialExt::from_coeffs(p1_coeffs, x_size, y_size);
    //         let p2_ext = DensePolynomialExt::from_coeffs(p2_coeffs, x_size, y_size);

    //         let ext_mul_time = measure_time(|| {
    //             let _result = &p1_ext * &p2_ext;
    //         });

    //         // Benchmark regular DensePolynomial
    //         let p1_dense = DensePolynomial::from_coeffs(p1_coeffs, total_size);
    //         let p2_dense = DensePolynomial::from_coeffs(p2_coeffs, total_size);

    //         let dense_mul_time = measure_time(|| {
    //             let _result = p1_dense.mul(&p2_dense);
    //         });

    //         println!("DensePolynomialExt multiplication: {:?}", ext_mul_time);
    //         println!("DensePolynomial multiplication: {:?}", dense_mul_time);
    //         println!("Performance ratio: {:.2}x", ext_mul_time.as_nanos() as f64 / dense_mul_time.as_nanos() as f64);
    //     }
    // }

    #[test]
    fn test_monomial_multiplication() {
        // Create a small polynomial with known coefficients
        let mut coeffs = vec![ScalarField::zero(); 4]; // 2x2 polynomial
        coeffs[0] = ScalarField::one(); // constant term
        coeffs[1] = ScalarField::one(); // x term
        
        let p1_coeffs = HostSlice::from_slice(&coeffs);
        let p1 = DensePolynomialExt::from_coeffs(p1_coeffs, 2, 2);
        
        // Test multiplication by X^1Y^1
        let result = p1.mul_monomial(1, 1);
        
        // Get the coefficients of the result
        let mut result_coeffs = vec![ScalarField::zero(); result.x_size * result.y_size];
        let result_coeffs_slice = HostSlice::from_mut_slice(&mut result_coeffs);
        result.copy_coeffs(0, result_coeffs_slice);
        
        // Check size
        assert_eq!(result.x_size, 4); // Original size + x_exponent + padding to power of 2
        assert_eq!(result.y_size, 4); // Original size + y_exponent + padding to power of 2
        
        // Check degree
        let (orig_x_deg, orig_y_deg) = p1.degree();
        let (new_x_deg, new_y_deg) = result.degree();
        assert_eq!(new_x_deg, orig_x_deg + 1);
        assert_eq!(new_y_deg, orig_y_deg + 1);
    }

    #[test]
    fn test_basic_monomial_operations() {
        // Test with identity monomial (x^0 * y^0)
        let coeffs = vec![ScalarField::one(); 4];
        let p1_coeffs = HostSlice::from_slice(&coeffs);
        let p1 = DensePolynomialExt::from_coeffs(p1_coeffs, 2, 2);
        
        let result = p1.mul_monomial(0, 0);
        assert_eq!(result.x_size, p1.x_size);
        assert_eq!(result.y_size, p1.y_size);
        
        // Test evaluation after monomial multiplication
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];
        
        let orig_eval = p1.eval(&x, &y);
        let shifted_eval = result.eval(&x, &y);
        assert_eq!(orig_eval, shifted_eval);
    }

    #[test]
    fn test_resize() {
        let p1_coeffs_vec = ScalarCfg::generate_random(8);
        let p1_coeffs = HostSlice::from_slice(&p1_coeffs_vec);
        let mut p1 = DensePolynomialExt::from_coeffs(p1_coeffs, 4, 2);

        // Test resizing to next power of two
        p1.resize(5, 3);
        assert!(p1.x_size.is_power_of_two());
        assert!(p1.y_size.is_power_of_two());
        assert!(p1.x_size >= 5);
        assert!(p1.y_size >= 3);
    }
}