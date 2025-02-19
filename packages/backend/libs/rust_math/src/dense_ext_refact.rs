extern crate icicle_bls12_381;
extern crate icicle_core;
extern crate icicle_runtime;
use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
use icicle_bls12_381::vec_ops;
use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};
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

fn _find_size_as_twopower(target_x_size: usize, target_y_size: usize) -> (usize, usize) {
    // Problem: find min{m: x_size*2^m >= target_x_size} and min{n: y_size*2^n >= target_y_size}
    if target_x_size == 0 || target_y_size == 0 {
        panic!("Invalid target sizes for resize")
    }
    let mut new_x_size = target_x_size;
    let mut new_y_size = target_y_size;
    if target_x_size.is_power_of_two() == false {
        new_x_size = 1 << (usize::BITS - target_x_size.leading_zeros());
    }
    if target_y_size.is_power_of_two() == false {
        new_y_size = 1 << (usize::BITS - target_y_size.leading_zeros());
    }
    (new_x_size, new_y_size)
}


pub struct DensePolynomialExt {
    pub poly: DensePolynomial,
    pub x_degree: i64,
    pub y_degree: i64,
    pub x_size: usize,
    pub y_size: usize,
}

impl DensePolynomialExt {
    // Inherit DensePolynomial
    pub fn print(&self) {
        unsafe {
            self.poly.print()
        }
    }
    // Inherit DensePolynomial
    pub fn coeffs_mut_slice(&mut self) -> &mut DeviceSlice<ScalarField> {
        unsafe {
            self.poly.coeffs_mut_slice()          
        }
    }

    // Method to get the degree of the polynomial.
    pub fn degree(&self) -> (i64, i64) {
        (self.x_degree, self.y_degree)
    }
}

// impl Drop for DensePolynomialExt {
//     fn drop(&mut self) {
//         unsafe {
//             delete(self.poly);
//             delete(self.x_degree);
//             delete(self.y_degree);
//         }
//     }
// }

impl Clone for DensePolynomialExt {
    fn clone(&self) -> Self {
        Self {
            poly: self.poly.clone(),
            x_degree: self.x_degree.clone(),
            y_degree: self.y_degree.clone(),
            x_size: self.x_size.clone(),
            y_size: self.y_size.clone(),
        }
    }
}

impl Add for &DensePolynomialExt {
    type Output = DensePolynomialExt;
    fn add(self: Self, rhs: Self) -> Self::Output {
        let mut lhs_ext = self.clone();
        let mut rhs_ext = rhs.clone();
        if self.x_size != rhs.x_size || self.y_size != rhs.y_size {
            let target_x_size = cmp::max(self.x_size, rhs.x_size);
            let target_y_size = cmp::max(self.y_size, rhs.y_size);
            lhs_ext.resize(target_x_size, target_y_size);
            rhs_ext.resize(target_x_size, target_y_size);
        }
        let out_poly = &lhs_ext.poly + &rhs_ext.poly;
        let x_size = lhs_ext.x_size;
        let y_size = lhs_ext.y_size;
        let (x_degree, y_degree) = DensePolynomialExt::_find_degree(&out_poly, x_size, y_size);
        DensePolynomialExt {
            poly: out_poly,
            x_degree,
            y_degree,
            x_size,
            y_size,
        }
    }
}

impl AddAssign<&DensePolynomialExt> for DensePolynomialExt {
    fn add_assign(&mut self, rhs: &DensePolynomialExt) {
        let mut lhs_ext = self.clone();
        let mut rhs_ext = rhs.clone();
        if self.x_size != rhs.x_size || self.y_size != rhs.y_size {
            let target_x_size = cmp::max(self.x_size, rhs.x_size);
            let target_y_size = cmp::max(self.y_size, rhs.y_size);
            lhs_ext.resize(target_x_size, target_y_size);
            rhs_ext.resize(target_x_size, target_y_size);
        }
        self.poly = &lhs_ext.poly + &rhs_ext.poly;
        self.x_size = lhs_ext.x_size;
        self.y_size = lhs_ext.y_size;
        let (x_degree, y_degree) = DensePolynomialExt::_find_degree(&self.poly, self.x_size, self.y_size);
        self.x_degree = x_degree;
        self.y_degree = y_degree;
    }
}

impl Sub for &DensePolynomialExt {
    type Output = DensePolynomialExt;

    fn sub(self: Self, rhs: Self) -> Self::Output {
        let mut lhs_ext = self.clone();
        let mut rhs_ext = rhs.clone();
        if self.x_size != rhs.x_size || self.y_size != rhs.y_size {
            let target_x_size = cmp::max(self.x_size, rhs.x_size);
            let target_y_size = cmp::max(self.y_size, rhs.y_size);
            lhs_ext.resize(target_x_size, target_y_size);
            rhs_ext.resize(target_x_size, target_y_size);
        }
        let out_poly = &lhs_ext.poly - &rhs_ext.poly;
        let x_size = lhs_ext.x_size;
        let y_size = lhs_ext.y_size;
        let (x_degree, y_degree) = DensePolynomialExt::_find_degree(&out_poly, x_size, y_size);
        DensePolynomialExt {
            poly: out_poly,
            x_degree,
            y_degree,
            x_size,
            y_size,
        }
    }
}

impl Mul for &DensePolynomialExt {
    type Output = DensePolynomialExt;

    fn mul(self: Self, rhs: Self) -> Self::Output {
        self._mul(rhs)
    }
}

// poly * scalar
impl Mul<&ScalarField> for &DensePolynomialExt {
    type Output = DensePolynomialExt;

    fn mul(self: Self, rhs: &ScalarField) -> Self::Output {
        DensePolynomialExt {
            poly: &self.poly * rhs,
            x_degree: self.x_degree,
            y_degree: self.y_degree,
            x_size: self.x_size,
            y_size: self.y_size,
        }
    }
}

// scalar * poly
impl Mul<&DensePolynomialExt> for &ScalarField {
    type Output = DensePolynomialExt;

    fn mul(self: Self, rhs: &DensePolynomialExt) -> Self::Output {
        DensePolynomialExt {
            poly: self * &rhs.poly,
            x_degree: rhs.x_degree,
            y_degree: rhs.y_degree,
            x_size: rhs.x_size,
            y_size: rhs.y_size,
        }
    }
}


pub trait BivariatePolynomial
where
    Self::Field: FieldImpl,
    Self::FieldConfig: FieldConfig,
{
    type Field: FieldImpl;
    type FieldConfig: FieldConfig;

    // Methods to create polynomials from coefficients or roots-of-unity evaluations.
    fn from_coeffs<S: HostOrDeviceSlice<Self::Field> + ?Sized>(coeffs: &S, x_size: usize, y_size: usize) -> Self;
    fn from_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(evals: &S, x_size: usize, y_size: usize) -> Self;

    fn _find_degree(coeffs: &DensePolynomial, x_size: usize, y_size: usize) -> (i64, i64);

    // // Method to divide this polynomial by the vanishing polynomial 'X^N-1'.
    // fn div_by_vanishing_x(&self, degree: u64) -> Self;

    // // Method to divide this polynomial by the vanishing polynomial 'X^N-1'.
    // fn div_by_vanishing_y(&self, degree: u64) -> Self;

    // // Methods to add or subtract a monomial in-place.
    // fn add_monomial_inplace(&mut self, monomial_coeff: &Self::Field, monomial: u64);
    // fn sub_monomial_inplace(&mut self, monomial_coeff: &Self::Field, monomial: u64);

    // Method to shift coefficient indicies. The same effect as multiplying a monomial X^iY^j.
    fn mul_monomial(&self, x_exponent: usize, y_exponent: usize) -> Self;

    fn resize(&mut self, target_x_size: usize, target_y_size: usize);

    // Method to slice the polynomial, creating a sub-polynomial.
    fn _slice_coeffs_into_blocks(&self, num_blocks_x: usize, num_blocks_y: usize, blocks_raw: &mut Vec<Self::Field> );

    // // Methods to return new polynomials containing only the even or odd terms.
    // fn even_x(&self) -> Self;
    // fn even_y(&self) -> Self;
    // fn odd_y(&self) -> Self;
    // fn odd_y(&self) -> Self;

    // Method to evaluate the polynomial at a given domain point.
    fn eval_x(&self, x: &Self::Field) -> Self;

    // Method to evaluate the polynomial at a given domain point.
    fn eval_y(&self, y: &Self::Field) -> Self;

    fn eval(&self, x: &Self::Field, y: &Self::Field) -> Self::Field;

    fn to_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, evals: &mut S);

    // // Method to evaluate the polynomial over a domain and store the results.
    // fn eval_on_domain<D_x: HostOrDeviceSlice<Self::Field> + ?Sized, D_y: HostOrDeviceSlice<Self::Field> + ?Sized, E: HostOrDeviceSlice<Self::Field> + ?Sized>(
    //     &self,
    //     domain_x: &D_x,
    //     domain_y: &D_y,
    //     evals: &mut E,
    // );

    // // Method to evaluate the polynomial over the roots-of-unity domain for power-of-two sized domain
    // fn eval_on_rou_domain<E: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, domain_log_size: u64, evals: &mut E);

    // Method to retrieve a coefficient at a specific index.
    fn get_coeff(&self, idx_x: u64, idx_y: u64) -> Self::Field;
    // fn get_nof_coeffs_x(&self) -> u64;
    // fn get_nof_coeffs_y(&self) -> u64;
    
    // Method to retrieve a univariate polynomial of x as the coefficient of the 'idx_y'-th power of y.
    fn get_univariate_polynomial_x(&self, idx_y:u64) -> Self;
    // Method to retrieve a univariate polynomial of y as the coefficient of the 'idx_x'-th power of x.
    fn get_univariate_polynomial_y(&self, idx_x:u64) -> Self;

    // Method to copy coefficients into a provided slice.
    fn copy_coeffs<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, start_idx: u64, coeffs: &mut S);

    fn _mul(&self, rhs: &Self) -> Self;
    // Method to divide this polynomial by another, returning quotient and remainder.
    fn divide_x(&self, denominator: &Self) -> (Self, Self) where Self: Sized;

    // Method to divide this polynomial by another, returning quotient and remainder.
    fn divide_y(&self, denominator: &Self) -> (Self, Self) where Self: Sized;

}

impl BivariatePolynomial for DensePolynomialExt {
    type Field = ScalarField;
    type FieldConfig = ScalarCfg;

    fn _find_degree(poly: &DensePolynomial, x_size: usize, y_size: usize) -> (i64, i64) {
        let mut x_degree: i64 = -1;
        let mut y_degree: i64 = 0;
        let mut found_nonzero = false;
    
        // 각 행(y값)에 대해 처리
        for y in 0..y_size {
            // 현재 행에서 가장 높은 x 차수 찾기
            for x in (0..x_size).rev() {
                let idx = x + y * x_size;
                if !Self::Field::eq(&Self::Field::zero(), &poly.get_coeff(idx as u64)) {
                    found_nonzero = true;
                    x_degree = x_degree.max(x as i64);
                    y_degree = y_degree.max(y as i64);
                    break;
                }
            }
        }
    
        // 모든 계수가 0인 경우 (0,0) 반환
        if !found_nonzero {
            return (0, 0);
        }
    
        // x_degree가 설정되지 않은 경우 0으로 설정
        if x_degree == -1 {
            x_degree = 0;
        }
    
        (x_degree, y_degree)
    }

    fn from_coeffs<S: HostOrDeviceSlice<Self::Field> + ?Sized>(coeffs: &S, x_size: usize, y_size: usize) -> Self {
        if x_size == 0 || y_size == 0 {
            panic!("Invalid matrix size for from_coeffs");
        }
        let poly = DensePolynomial::from_coeffs(coeffs, x_size * y_size);
        let (x_degree, y_degree) = DensePolynomialExt::_find_degree(&poly, x_size, y_size);
        
        let target_x_size = cmp::max(x_size, x_degree as usize + 1);
        let target_y_size = cmp::max(y_size, y_degree as usize + 1);
        let (new_x_size, new_y_size) = _find_size_as_twopower(target_x_size, target_y_size);

        let mut bipoly = Self {
            poly,
            x_degree,
            y_degree,
            x_size,
            y_size,
        };

        if new_x_size != x_size || new_y_size != y_size {
            bipoly.resize(new_x_size, new_y_size);
        }

        bipoly
    }

    fn from_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(evals: &S, x_size: usize, y_size: usize) -> Self {
        if x_size == 0 || y_size == 0 {
            panic!("Invalid matrix size for from_coeffs");
        }
        if !x_size.is_power_of_two() || !y_size.is_power_of_two() {
            panic!("The input sizes for from_rou_evals must be powers of two.")
        }
    
        let size = x_size * y_size;
        unsafe {
            ntt::initialize_domain::<ScalarField>(
                ntt::get_root_of_unity::<ScalarField>(size.try_into().unwrap()),
                &ntt::NTTInitDomainConfig::default(),
            ).unwrap();
        }
    
        // GPU 상에서 작업할 수 있도록 DeviceVec 할당
        let mut coeffs = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
        let mut cfg = ntt::NTTConfig::<ScalarField>::default();
    
        // IFFT 수행: 먼저 X 방향, 그 후 Y 방향
        cfg.batch_size = y_size as i32;
        cfg.columns_batch = false;
        ntt::ntt(evals, ntt::NTTDir::kInverse, &cfg, &mut coeffs).unwrap();
    
        cfg.batch_size = x_size as i32;
        cfg.columns_batch = true;
        ntt::ntt_inplace(&mut coeffs, ntt::NTTDir::kInverse, &cfg).unwrap();
    
        DensePolynomialExt::from_coeffs(&coeffs, x_size, y_size)
    }

    fn to_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, evals: &mut S) {
        let size = self.x_size * self.y_size;
        if evals.len() < size {
            panic!("Insufficient buffer length for to_rou_evals")
        }
        unsafe {
            ntt::initialize_domain::<ScalarField>(
                ntt::get_root_of_unity::<ScalarField>(size.try_into().unwrap()),
                &ntt::NTTInitDomainConfig::default(),
            ).unwrap();
        }
    
        let mut coeffs_vec = vec![ScalarField::zero(); size];
        let coeffs = HostSlice::from_mut_slice(&mut coeffs_vec);
        self.copy_coeffs(0, coeffs);
        let mut cfg = ntt::NTTConfig::<ScalarField>::default();
    
        // Forward NTT 수행: 먼저 X 방향, 그 후 Y 방향
        cfg.batch_size = self.y_size as i32;
        cfg.columns_batch = false;
        ntt::ntt(coeffs, ntt::NTTDir::kForward, &cfg, evals).unwrap();
    
        cfg.batch_size = self.x_size as i32;
        cfg.columns_batch = true;
        ntt::ntt_inplace(evals, ntt::NTTDir::kForward, &cfg).unwrap();
    }

    fn copy_coeffs<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, start_idx: u64, coeffs: &mut S) {
        self.poly.copy_coeffs(start_idx, coeffs);
    }

    fn _slice_coeffs_into_blocks(&self, num_blocks_x: usize, num_blocks_y: usize, blocks_raw: &mut Vec<Self::Field> ) {

        if self.x_size % num_blocks_x != 0 || self.y_size % num_blocks_y != 0 {
            panic!("Matrix size must be exactly divisible by the number of blocks.");
        }
        if blocks_raw.len() != self.x_size * self.y_size {
            panic!("Incorrect length of the vector to store the result.")
        }
        let block_x_size = self.x_size / num_blocks_x;
        let block_y_size = self.y_size / num_blocks_y;
        let block_size = block_x_size * block_y_size;

        let mut orig_coeffs_vec = vec![Self::Field::zero(); self.x_size * self.y_size];
        let orig_coeffs = HostSlice::from_mut_slice(&mut orig_coeffs_vec);
        self.poly.copy_coeffs(0, orig_coeffs);

        for row_idx in 0..self.y_size{
            let row_vec = &orig_coeffs_vec[row_idx * self.x_size .. (row_idx + 1) * self.x_size];
            for col_idx in 0..self.x_size {
                let block_idx = (col_idx / block_x_size) + num_blocks_x * (row_idx / block_y_size);
                let in_block_idx = (col_idx % block_x_size) + block_x_size * (row_idx % block_y_size);
                blocks_raw[block_idx * block_size + in_block_idx] = row_vec[col_idx].clone();
            }
        }

    }

    fn eval_x(&self, x: &Self::Field) -> Self {
        let mut result_slice = vec![Self::Field::zero(); self.y_size];
        let result = HostSlice::from_mut_slice(&mut result_slice);

        for offset in 0..self.y_degree as usize + 1 {
            let sub_xpoly = self.get_univariate_polynomial_x(offset as u64);
            result[offset] = sub_xpoly.poly.eval(x);
        }

        DensePolynomialExt::from_coeffs(result, 1, self.y_size)
    }

    fn eval_y(&self, y: &Self::Field) -> Self {
        let mut result_slice = vec![Self::Field::zero(); self.x_size];
        let result = HostSlice::from_mut_slice(&mut result_slice);

        for offset in 0..self.x_degree as usize + 1 {
            let sub_ypoly = self.get_univariate_polynomial_y(offset as u64); 
            result[offset] = sub_ypoly.poly.eval(y);
        }
        DensePolynomialExt::from_coeffs(result, self.x_size, 1)
    }

    fn eval(&self, x: &Self::Field, y: &Self::Field) -> Self::Field {
        let res1 = self.eval_x(x);
        let res2 = res1.eval_y(y);
        if !(res2.x_degree == 0 && res2.y_degree == 0) {
            panic!("The evaluation is not a constant.");
        } else {
            res2.get_coeff(0,0)
        }
    }

    fn get_coeff(&self, idx_x: u64, idx_y: u64) -> Self::Field {
        if !(idx_x <= self.x_size as u64 && idx_y <= self.y_size as u64){
            panic!("The index at which to get a coefficient exceeds the coefficient size.");
        }
        let idx = idx_x + idx_y * self.x_size as u64;
        self.poly.get_coeff(idx)
    }

    fn get_univariate_polynomial_x(&self, idx_y:u64) -> Self {
        Self {
            poly: self.poly.slice(idx_y * self.x_size as u64, 1, self.x_size as u64),
            x_size: self.x_size.clone(),
            y_size: 1,
            x_degree: self.x_degree.clone(),
            y_degree: 0,
        }
    }

    fn get_univariate_polynomial_y(&self, idx_x:u64) -> Self {
        Self {
            poly: self.poly.slice(idx_x, self.x_size as u64, self.y_size as u64),
            x_size: 1,
            y_size: self.y_size.clone(),
            x_degree: 0,
            y_degree: self.y_degree.clone(),
        }
    }

    
    fn resize(&mut self, target_x_size: usize, target_y_size: usize) {
        let (new_x_size, new_y_size) = _find_size_as_twopower(target_x_size, target_y_size);
        if self.x_size == new_x_size && self.y_size == new_y_size {
            return;
        }

        let mut orig_coeffs_vec = vec![Self::Field::zero(); self.x_size * self.y_size];
        let orig_coeffs = HostSlice::from_mut_slice(&mut orig_coeffs_vec);
        self.copy_coeffs(0, orig_coeffs);

        let new_size = new_x_size * new_y_size;
        let mut res_coeffs_vec = vec![Self::Field::zero(); new_size];
        
        for y in 0..cmp::min(self.y_size, new_y_size) {
            let src_start = y * self.x_size;
            let dst_start = y * new_x_size;
            let copy_width = cmp::min(self.x_size, new_x_size);
            
            res_coeffs_vec[dst_start..dst_start + copy_width]
                .copy_from_slice(&orig_coeffs_vec[src_start..src_start + copy_width]);
        }

        let res_coeffs = HostSlice::from_mut_slice(&mut res_coeffs_vec);
        self.poly = DensePolynomial::from_coeffs(res_coeffs, new_size);
        self.x_size = new_x_size;
        self.y_size = new_y_size;
    }

    fn _mul(&self, rhs: &Self) -> Self {
        use std::cmp;
        // 상수 다항식 처리
        let (lhs_x_degree, lhs_y_degree) = self.degree();
        let (rhs_x_degree, rhs_y_degree) = rhs.degree();
        if lhs_x_degree + lhs_y_degree == 0 && rhs_x_degree + rhs_y_degree > 0 {
            return rhs.mul(&self.get_coeff(0, 0));
        }
        if rhs_x_degree + rhs_y_degree == 0 && lhs_x_degree + lhs_y_degree > 0 {
            return self.mul(&rhs.get_coeff(0, 0));
        }
        if rhs_x_degree + rhs_y_degree == 0 && lhs_x_degree + lhs_y_degree == 0 {
            let prod = self.get_coeff(0, 0) * rhs.get_coeff(0, 0);
            let out_coeffs_vec = vec![prod; 1];
            let out_coeffs = HostSlice::from_slice(&out_coeffs_vec);
            return DensePolynomialExt::from_coeffs(out_coeffs, 1, 1);
        }
        // 목표 다항식 크기 결정
        let x_degree = lhs_x_degree + rhs_x_degree;
        let y_degree = lhs_y_degree + rhs_y_degree;
        let target_x_size = x_degree as usize + 1;
        let target_y_size = y_degree as usize + 1;
        let mut lhs_ext = self.clone();
        let mut rhs_ext = rhs.clone();
        lhs_ext.resize(target_x_size, target_y_size);
        rhs_ext.resize(target_x_size, target_y_size);
        let x_size = lhs_ext.x_size;
        let y_size = lhs_ext.y_size;
        let total_len = x_size * y_size;
        let size = total_len.next_power_of_two();
    
        // Device 메모리에 입력 계수 복사 (NTT 수행을 위해)
        let mut lhs_dev = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
        let mut rhs_dev = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
        lhs_ext.poly.copy_coeffs(0, &mut lhs_dev);
        rhs_ext.poly.copy_coeffs(0, &mut rhs_dev);
        // 0 패딩
        for i in total_len..size {
            lhs_dev[i] = ScalarField::zero();
            rhs_dev[i] = ScalarField::zero();
        }
    
        // GPU 상에서 in-place NTT 변환
        unsafe {
            ntt_inplace_kernel(lhs_dev.as_mut_ptr(), size, get_twiddle_factors(size).as_ptr());
            ntt_inplace_kernel(rhs_dev.as_mut_ptr(), size, get_twiddle_factors(size).as_ptr());
        }
    
        // 주파수 영역에서 점별 곱셈 (각 원소 곱)
        let threads_per_block = 256;
        let blocks = (size + threads_per_block - 1) / threads_per_block;
        unsafe {
            launch_elementwise_mul_kernel(lhs_dev.as_mut_ptr(), rhs_dev.as_ptr(), size);
        }
    
        // GPU 상에서 역NTT 변환하여 결과 복원
        unsafe {
            intt_inplace_kernel(lhs_dev.as_mut_ptr(), size, get_inv_twiddle_factors(size).as_ptr());
        }
    
        // 결과 다항식 생성 (총 total_len 개 계수)
        let result_coeffs = DeviceVec::<ScalarField>::from_slice(&lhs_dev[..total_len]);
        let (new_x_degree, new_y_degree) = DensePolynomialExt::_find_degree(&result_coeffs, x_size, y_size);
        DensePolynomialExt {
            poly: DensePolynomial::from_coeffs(result_coeffs.as_slice(), total_len),
            x_degree: new_x_degree,
            y_degree: new_y_degree,
            x_size,
            y_size,
        }
    }
    
    /// Optimized mul_monomial: 단항식 곱셈을 GPU 커널을 이용해 계수들을 shift 처리
    fn mul_monomial(&self, x_exponent: usize, y_exponent: usize) -> Self {
        if x_exponent == 0 && y_exponent == 0 {
            return self.clone();
        }
    
        let orig_total = self.x_size * self.y_size;
        let new_x_size = self.x_size + x_exponent;
        let new_y_size = self.y_size + y_exponent;
        let (final_x_size, final_y_size) = _find_size_as_twopower(new_x_size, new_y_size);
        let new_total = final_x_size * final_y_size;
    
        // 원래 다항식 계수를 GPU 메모리로 복사
        let mut orig_dev = DeviceVec::<ScalarField>::device_malloc(orig_total).unwrap();
        self.poly.copy_coeffs(0, &mut orig_dev);
    
        // 결과를 저장할 버퍼 할당 및 0으로 초기화
        let mut result_dev = DeviceVec::<ScalarField>::device_malloc(new_total).unwrap();
        for i in 0..new_total {
            result_dev[i] = ScalarField::zero();
        }
    
        // GPU 커널을 호출하여, 각 계수를 (x_exponent, y_exponent)만큼 shift
        let threads = 256;
        let blocks = (orig_total + threads - 1) / threads;
        unsafe {
            // (예시: 1차원 배열 상에서 shift는 (x_exponent + y_exponent)로 처리)
            launch_shift_kernel(result_dev.as_mut_ptr(), orig_dev.as_ptr(), orig_total, x_exponent + y_exponent, ScalarField::one());
        }
    
        // 결과 다항식 생성 (새로운 차원에 맞게)
        let mut result_poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&result_dev.to_host_vec()), final_x_size, final_y_size);
        result_poly.x_degree = self.x_degree + x_exponent as i64;
        result_poly.y_degree = self.y_degree + y_exponent as i64;
        result_poly
    }
    
    /// Optimized divide_x: X-univariate 나눗셈을 GPU 커널로 병렬 처리 (synthetic division)
    fn divide_x(&self, denominator: &Self) -> (Self, Self) where Self: Sized {
        let (numer_x_degree, numer_y_degree) = self.degree();
        let (denom_x_degree, denom_y_degree) = denominator.degree();
        if denom_y_degree != 0 {
            panic!("Denominator for divide_x must be X-univariate");
        }
        if numer_x_degree < denom_x_degree {
            panic!("Numer.degree < Denom.degree for divide_x");
        }
        if denom_x_degree == 0 {
            if ScalarField::eq(&denominator.get_coeff(0, 0).inv(), &ScalarField::zero()) {
                panic!("Divide by zero")
            }
            let rem_coeffs_vec = vec![ScalarField::zero(); 1];
            let rem_coeffs = HostSlice::from_slice(&rem_coeffs_vec);
            return (
                &(self.clone()) * &(denominator.get_coeff(0, 0).inv()),
                DensePolynomialExt::from_coeffs(rem_coeffs, 1, 1),
            );
        }
    
        let quo_x_degree = numer_x_degree - denom_x_degree;
        let quo_y_degree = numer_y_degree;
        let rem_x_degree = denom_x_degree - 1;
        let rem_y_degree = numer_y_degree;
        let quo_x_size = quo_x_degree as usize + 1;
        let quo_y_size = quo_y_degree as usize + 1;
        let rem_x_size = rem_x_degree as usize + 1;
        let rem_y_size = rem_y_degree as usize + 1;
        let quo_size = quo_x_size * quo_y_size;
        let rem_size = rem_x_size * rem_y_size;
    
        // Device 메모리 할당
        let mut quo_dev = DeviceVec::<ScalarField>::device_malloc(quo_size).unwrap();
        let mut rem_dev = DeviceVec::<ScalarField>::device_malloc(rem_size).unwrap();
    
        // GPU 커널을 호출하여, 다항식 나눗셈(장항 나눗셈)을 병렬 처리
        let threads = 128;
        let blocks = ((self.y_degree as usize + 1) + threads - 1) / threads;
        unsafe {
            launch_poly_long_div_kernel(
                self.poly.coeffs_device_ptr(), self.x_size * self.y_size,
                denominator.poly.coeffs_device_ptr(), denominator.poly.len(),
                quo_dev.as_mut_ptr(), quo_size
            );
        }
    
        // 결과를 Host 메모리로 복사하여 새로운 다항식 생성
        let quo_coeffs = HostSlice::from_mut_slice(&mut quo_dev.to_host_vec());
        let rem_coeffs = HostSlice::from_mut_slice(&mut rem_dev.to_host_vec());
        (
            DensePolynomialExt::from_coeffs(quo_coeffs, quo_x_size, quo_y_size),
            DensePolynomialExt::from_coeffs(rem_coeffs, rem_x_size, rem_y_size)
        )
    }
    
    /// Optimized divide_y: Y-univariate 나눗셈을 GPU 커널로 병렬 처리
    fn divide_y(&self, denominator: &Self) -> (Self, Self) where Self: Sized {
        let (numer_x_degree, numer_y_degree) = self.degree();
        let (denom_x_degree, denom_y_degree) = denominator.degree();
        if denom_x_degree != 0 {
            panic!("Denominator for divide_y must be Y-univariate");
        }
        if numer_y_degree < denom_y_degree {
            panic!("Numer.y_degree < Denom.y_degree for divide_y");
        }
        if denom_y_degree == 0 {
            if ScalarField::eq(&denominator.get_coeff(0, 0).inv(), &ScalarField::zero()) {
                panic!("Divide by zero")
            }
            let rem_coeffs_vec = vec![ScalarField::zero(); 1];
            let rem_coeffs = HostSlice::from_slice(&rem_coeffs_vec);
            return (
                &(self.clone()) * &(denominator.get_coeff(0, 0).inv()),
                DensePolynomialExt::from_coeffs(rem_coeffs, 1, 1),
            );
        }
    
        let quo_x_degree = numer_x_degree;
        let quo_y_degree = numer_y_degree - denom_y_degree;
        let rem_x_degree = numer_x_degree;
        let rem_y_degree = denom_y_degree - 1;
        let quo_x_size = quo_x_degree as usize + 1;
        let quo_y_size = quo_y_degree as usize + 1;
        let rem_x_size = rem_x_degree as usize + 1;
        let rem_y_size = rem_y_degree as usize + 1;
        let quo_size = quo_x_size * quo_y_size;
        let rem_size = rem_x_size * rem_y_size;
    
        let mut quo_dev = DeviceVec::<ScalarField>::device_malloc(quo_size).unwrap();
        let mut rem_dev = DeviceVec::<ScalarField>::device_malloc(rem_size).unwrap();
    
        // GPU 커널로 행 단위 나눗셈을 병렬 처리
        let threads = 128;
        let blocks = ((self.x_degree as usize + 1) + threads - 1) / threads;
        unsafe {
            launch_poly_long_div_kernel(
                self.poly.coeffs_device_ptr(), self.poly.len(),
                denominator.poly.coeffs_device_ptr(), denominator.poly.len(),
                quo_dev.as_mut_ptr(), quo_size
            );
        }
    
        // 결과는 필요시 전치(transpose) 처리 (cuBLAS의 transpose 커널 사용)
        let quo_coeffs_tr = HostSlice::from_slice(&quo_dev.to_host_vec());
        let rem_coeffs_tr = HostSlice::from_slice(&rem_dev.to_host_vec());
        let mut quo_coeffs_vec2 = quo_dev.to_host_vec();
        let mut rem_coeffs_vec2 = rem_dev.to_host_vec();
        let vec_ops_cfg = VecOpsConfig::default();
        unsafe {
            ScalarCfg::transpose(HostSlice::from_slice(&quo_coeffs_vec2), quo_x_size as u32, quo_y_size as u32,
                                   HostSlice::from_mut_slice(&mut quo_coeffs_vec2), &vec_ops_cfg).unwrap();
            ScalarCfg::transpose(HostSlice::from_slice(&rem_coeffs_vec2), rem_x_size as u32, rem_y_size as u32,
                                   HostSlice::from_mut_slice(&mut rem_coeffs_vec2), &vec_ops_cfg).unwrap();
        }
    
        (
            DensePolynomialExt::from_coeffs(HostSlice::from_slice(&quo_coeffs_vec2), quo_x_size, quo_y_size),
            DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rem_coeffs_vec2), rem_x_size, rem_y_size)
        )
    }
}

