use criterion::{black_box, criterion_group, criterion_main, Criterion};
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_core::polynomials::UnivariatePolynomial;
use std::time::{Duration, Instant};
use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
use icicle_runtime::memory::{HostSlice};
use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};

// Original implementation (paste.txt)
use rust_math::dense_ext::{BivariatePolynomial as originalBipolynomial, DensePolynomialExt as originalDensePolynomial};
use rust_math::dense_ext_refact::{BivariatePolynomial as optimizedBipolynomial, DensePolynomialExt as optimizedDensePolynomial};

fn generate_random_polynomial(x_size: usize, y_size: usize) -> Vec<ScalarField> {
    let size = x_size * y_size;
    ScalarCfg::generate_random(size)
}

fn benchmark_resize(c: &mut Criterion) {
    let mut group = c.benchmark_group("resize");
    
    for size in [64, 128, 256, 512].iter() {
        group.bench_function(format!("original_resize_{}", size), |b| {
            let coeffs = generate_random_polynomial(*size, *size);
            let coeffs_slice = HostSlice::from_slice(&coeffs);
            let mut poly = originalDensePolynomial::from_coeffs(coeffs_slice, *size, *size);
            
            b.iter(|| {
                let mut test_poly = poly.clone();
                test_poly.resize(black_box(*size * 2), black_box(*size * 2));
            });
        });

        group.bench_function(format!("optimized_resize_{}", size), |b| {
            let coeffs = generate_random_polynomial(*size, *size);
            let coeffs_slice = HostSlice::from_slice(&coeffs);
            let mut poly = optimizedDensePolynomial::from_coeffs(coeffs_slice, *size, *size);
            
            b.iter(|| {
                let mut test_poly = poly.clone();
                test_poly.resize(black_box(*size * 2), black_box(*size * 2));
            });
        });
    }
    
    group.finish();
}

fn benchmark_multiplication(c: &mut Criterion) {
    let mut group = c.benchmark_group("multiplication");
    
    for size in [32, 64, 128].iter() {
        group.bench_function(format!("original_mul_{}", size), |b| {
            let coeffs1 = generate_random_polynomial(*size, *size);
            let coeffs2 = generate_random_polynomial(*size, *size);
            let coeffs1_slice = HostSlice::from_slice(&coeffs1);
            let coeffs2_slice = HostSlice::from_slice(&coeffs2);
            let poly1 = originalDensePolynomial::from_coeffs(coeffs1_slice, *size, *size);
            let poly2 = originalDensePolynomial::from_coeffs(coeffs2_slice, *size, *size);
            
            b.iter(|| {
                black_box(&poly1 * &poly2);
            });
        });

        group.bench_function(format!("optimized_mul_{}", size), |b| {
            let coeffs1 = generate_random_polynomial(*size, *size);
            let coeffs2 = generate_random_polynomial(*size, *size);
            let coeffs1_slice = HostSlice::from_slice(&coeffs1);
            let coeffs2_slice = HostSlice::from_slice(&coeffs2);
            let poly1 = optimizedDensePolynomial::from_coeffs(coeffs1_slice, *size, *size);
            let poly2 = optimizedDensePolynomial::from_coeffs(coeffs2_slice, *size, *size);
            
            b.iter(|| {
                black_box(&poly1 * &poly2);
            });
        });
    }
    
    group.finish();
}

fn benchmark_div_by_vanishing(c: &mut Criterion) {
    let mut group = c.benchmark_group("div_by_vanishing");
    
    for size in [32, 64, 128].iter() {
        group.bench_function(format!("original_div_{}", size), |b| {
            let coeffs = generate_random_polynomial(*size * 2, *size * 2);
            let coeffs_slice = HostSlice::from_slice(&coeffs);
            let poly = originalDensePolynomial::from_coeffs(coeffs_slice, *size * 2, *size * 2);
            
            b.iter(|| {
                poly.div_by_vanishing(black_box(*size as i64), black_box(*size as i64));
            });
        });

        group.bench_function(format!("optimized_div_{}", size), |b| {
            let coeffs = generate_random_polynomial(*size * 2, *size * 2);
            let coeffs_slice = HostSlice::from_slice(&coeffs);
            let poly = optimizedDensePolynomial::from_coeffs(coeffs_slice, *size * 2, *size * 2);
            
            b.iter(|| {
                poly.div_by_vanishing(black_box(*size as i64), black_box(*size as i64));
            });
        });
    }
    
    group.finish();
}

fn benchmark_find_degree(c: &mut Criterion) {
    let mut group = c.benchmark_group("find_degree");
    
    for size in [64, 128, 256, 512].iter() {
        group.bench_function(format!("original_find_degree_{}", size), |b| {
            let coeffs = generate_random_polynomial(*size, *size);
            let coeffs_slice = HostSlice::from_slice(&coeffs);
            let poly = DensePolynomial::from_coeffs(coeffs_slice, size * size);
            
            b.iter(|| {
                originalDensePolynomial::_find_degree(&poly, *size, *size);
            });
        });

        group.bench_function(format!("optimized_find_degree_{}", size), |b| {
            let coeffs = generate_random_polynomial(*size, *size);
            let coeffs_slice = HostSlice::from_slice(&coeffs);
            let poly = DensePolynomial::from_coeffs(coeffs_slice, size * size);
            
            b.iter(|| {
                optimizedDensePolynomial::_find_degree(&poly, *size, *size);
            });
        });
    }
    
    group.finish();
}

// 전체 벤치마크 실행을 위한 매크로 설정
criterion_group!(
    benches,
    benchmark_resize,
    benchmark_multiplication,
    benchmark_div_by_vanishing,
    benchmark_find_degree
);
criterion_main!(benches);

// 간단한 기능 테스트를 위한 단위 테스트
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resize_correctness() {
        let size = 64;
        let coeffs = generate_random_polynomial(size, size);
        let coeffs_slice = HostSlice::from_slice(&coeffs);
        
        let mut original_poly = originalDensePolynomial::from_coeffs(coeffs_slice.clone(), size, size);
        let mut optimized_poly = optimizedDensePolynomial::from_coeffs(coeffs_slice, size, size);
        
        original_poly.resize(size * 2, size * 2);
        optimized_poly.resize(size * 2, size * 2);
        
        // 결과 검증 로직 추가
        assert_eq!(original_poly.x_size, optimized_poly.x_size);
        assert_eq!(original_poly.y_size, optimized_poly.y_size);
    }

    #[test]
    fn test_multiplication_correctness() {
        let size = 32;
        let coeffs1 = generate_random_polynomial(size, size);
        let coeffs2 = generate_random_polynomial(size, size);
        
        let coeffs1_slice = HostSlice::from_slice(&coeffs1);
        let coeffs2_slice = HostSlice::from_slice(&coeffs2);
        
        let original_poly1 = originalDensePolynomial::from_coeffs(coeffs1_slice.clone(), size, size);
        let original_poly2 = originalDensePolynomial::from_coeffs(coeffs2_slice.clone(), size, size);
        
        let optimized_poly1 = optimizedDensePolynomial::from_coeffs(coeffs1_slice, size, size);
        let optimized_poly2 = optimizedDensePolynomial::from_coeffs(coeffs2_slice, size, size);
        
        let original_result = &original_poly1 * &original_poly2;
        let optimized_result = &optimized_poly1 * &optimized_poly2;
        
        // 결과 검증 로직 추가
        assert_eq!(original_result.x_degree, optimized_result.x_degree);
        assert_eq!(original_result.y_degree, optimized_result.y_degree);
    }
}