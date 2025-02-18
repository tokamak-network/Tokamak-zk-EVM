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
        let mut x_degree: i64 = 0;
        let mut y_degree: i64 = 0;

        for x_offset in (0 .. x_size as u64).rev() {
            let sub_poly_y = poly.slice(x_offset, x_size as u64, y_size as u64);
            y_degree = sub_poly_y.degree() as i64;
            if y_degree > 0 {
                x_degree = x_offset as i64;
                break;
            } else if !(Self::Field::eq(&Self::Field::zero(), &sub_poly_y.get_coeff(0))){
                x_degree = x_offset as i64;
                break;
            }
        }
        (x_degree, y_degree)
    }

    fn from_coeffs<S: HostOrDeviceSlice<Self::Field> + ?Sized>(coeffs: &S, x_size: usize, y_size: usize) -> Self {
        if x_size == 0 || y_size == 0 {
            panic!("Invalid matrix size for from_coeffs");
        }
        let poly = DensePolynomial::from_coeffs(coeffs, x_size as usize * y_size as usize);
        let (x_degree, y_degree) = DensePolynomialExt::_find_degree(&poly, x_size, y_size);
        let mut bipoly = Self {
            poly,
            x_degree,
            y_degree,
            x_size,
            y_size,
        };
        // Adjusting the sizes to minimum powers of two
        let target_x_size = x_degree as usize + 1;
        let target_y_size = y_degree as usize + 1;
        bipoly.resize(target_x_size, target_y_size);
        bipoly
    }

    fn from_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(evals: &S, x_size: usize, y_size: usize) -> Self {
        if x_size == 0 || y_size == 0 {
            panic!("Invalid matrix size for from_rou_evals");
        }
        if x_size.is_power_of_two() == false || y_size.is_power_of_two() == false {
            panic!("The input sizes for from_rou_evals must be powers of two.")
        }

        let size = x_size * y_size;

        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(
                size.try_into()
                    .unwrap(),
            ),
            &ntt::NTTInitDomainConfig::default(),
        )
        .unwrap();

        let mut coeffs = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
        let mut cfg = ntt::NTTConfig::<Self::Field>::default();
        
        // IFFT along X
        cfg.batch_size = y_size as i32;
        cfg.columns_batch = false;
        ntt::ntt(evals, ntt::NTTDir::kInverse, &cfg, &mut coeffs).unwrap();
        // IFFT along Y
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
        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(
                size.try_into()
                    .unwrap(),
            ),
            &ntt::NTTInitDomainConfig::default(),
        )
        .unwrap();
        
        let mut coeffs_vec = vec![Self::Field::zero(); size];
        let coeffs = HostSlice::from_mut_slice(&mut coeffs_vec);
        self.copy_coeffs(0, coeffs);
        let mut cfg = ntt::NTTConfig::<Self::Field>::default();

        // IFFT along X
        cfg.batch_size = self.y_size as i32;
        cfg.columns_batch = false;
        ntt::ntt(coeffs, ntt::NTTDir::kForward, &cfg, evals).unwrap();
        // IFFT along Y
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

    
    fn resize(&mut self, target_x_size: usize, target_y_size: usize){
        let (new_x_size, new_y_size) = _find_size_as_twopower(target_x_size, target_y_size);
        if self.x_size == new_x_size && self.y_size == new_y_size {
            return
        }
        let new_size: usize = new_x_size * new_y_size;
        let mut orig_coeffs_vec = Vec::<Self::Field>::with_capacity(self.x_size * self.y_size);
        unsafe{orig_coeffs_vec.set_len(self.x_size * self.y_size);}
        let orig_coeffs = HostSlice::from_mut_slice(&mut orig_coeffs_vec);
        self.copy_coeffs(0, orig_coeffs);

        let mut res_coeffs_vec = vec![Self::Field::zero(); new_size];
        for i in 0 .. cmp::min(self.y_size, new_y_size) {
            let each_x_size = cmp::min(self.x_size, new_x_size);
            res_coeffs_vec[new_x_size * i .. new_x_size * i + each_x_size].copy_from_slice(
                &orig_coeffs_vec[self.x_size * i .. self.x_size * i + each_x_size]
            );  
        }

        let res_coeffs = HostSlice::from_mut_slice(&mut res_coeffs_vec);
        
        self.poly = DensePolynomial::from_coeffs(res_coeffs, new_size);
        self.x_size = new_x_size;
        self.y_size = new_y_size;
    }

    fn mul_monomial(&self, x_exponent: usize, y_exponent: usize) -> Self {
       if x_exponent == 0 && y_exponent == 0 {
            self.clone()
        } else {
            let mut orig_coeffs_vec = Vec::<Self::Field>::with_capacity(self.x_size * self.y_size);
            unsafe{orig_coeffs_vec.set_len(self.x_size * self.y_size);}
            let orig_coeffs = HostSlice::from_mut_slice(&mut orig_coeffs_vec);
            self.copy_coeffs(0, orig_coeffs);

            let target_x_size = self.x_degree as usize + x_exponent + 1;
            let target_y_size = self.y_degree as usize + y_exponent + 1;
            let (new_x_size, new_y_size) = _find_size_as_twopower(target_x_size, target_y_size);
            let new_size: usize = self.x_size * self.y_size;
            
            let mut res_coeffs_vec = vec![Self::Field::zero(); new_size];
            for i in 0 .. self.y_size {
                res_coeffs_vec[new_x_size * (i + y_exponent) + x_exponent .. new_x_size * (i + y_exponent) + self.x_size + x_exponent].copy_from_slice(
                    &orig_coeffs_vec[self.x_size * i .. self.x_size * (i+1)]
                );
            }

            let res_coeffs = HostSlice::from_slice(&res_coeffs_vec);
            
            DensePolynomialExt::from_coeffs(res_coeffs, new_x_size, new_y_size)
        }
    }

    fn _mul(&self, rhs: &Self) -> Self {
        let (lhs_x_degree, lhs_y_degree) = self.degree();
        let (rhs_x_degree, rhs_y_degree) = rhs.degree();
        if lhs_x_degree + lhs_y_degree == 0 && rhs_x_degree + rhs_y_degree > 0 {
            return &(rhs.clone()) * &(self.get_coeff(0, 0));
        }
        if rhs_x_degree + rhs_y_degree == 0 && lhs_x_degree + lhs_y_degree > 0 {
            return &(self.clone()) * &(rhs.get_coeff(0,0));
        }
        if rhs_x_degree + rhs_y_degree == 0 && lhs_x_degree + lhs_y_degree == 0 {
            let out_coeffs_vec = vec![self.get_coeff(0,0) * rhs.get_coeff(0,0); 1];
            let out_coeffs = HostSlice::from_slice(&out_coeffs_vec);
            return DensePolynomialExt::from_coeffs(out_coeffs, 1, 1);
        }
        let x_degree = lhs_x_degree + rhs_x_degree;
        let y_degree = lhs_y_degree + rhs_y_degree;
        // let target_x_size = [self.x_size, rhs.x_size, x_degree as usize + 1].into_iter().max().unwrap();
        // let target_y_size = [self.y_size, rhs.y_size, y_degree as usize + 1].into_iter().max().unwrap();
        let target_x_size = x_degree as usize + 1;
        let target_y_size = y_degree as usize +1;
        let mut lhs_ext = self.clone();
        let mut rhs_ext = rhs.clone();
        lhs_ext.resize(target_x_size, target_y_size);
        rhs_ext.resize(target_x_size, target_y_size);
        let x_size = lhs_ext.x_size;
        let y_size = lhs_ext.y_size;
        let extended_size = x_size * y_size;
        let cfg_vec_ops = VecOpsConfig::default();

        let mut lhs_evals = DeviceVec::<Self::Field>::device_malloc(extended_size).unwrap();
        let mut rhs_evals = DeviceVec::<Self::Field>::device_malloc(extended_size).unwrap();
        lhs_ext.to_rou_evals(&mut lhs_evals);
        rhs_ext.to_rou_evals(&mut rhs_evals);

        // Element-wise mult. of evaluations
        let mut out_evals = DeviceVec::<Self::Field>::device_malloc(extended_size).unwrap();
        ScalarCfg::mul(&lhs_evals, &rhs_evals, &mut out_evals, &cfg_vec_ops).unwrap();

        DensePolynomialExt::from_rou_evals(&out_evals, x_size, y_size)
    }

    fn divide_x(&self, denominator: &Self) -> (Self, Self) where Self: Sized {
        let (numer_x_degree, numer_y_degree) = self.degree();
        let (denom_x_degree, denom_y_degree) = denominator.degree();
        if denom_y_degree != 0 {
            panic!("Denominator for divide_x must be X-univariate");
        }
        if numer_x_degree < denom_x_degree{
            panic!("Numer.degree < Denom.degree for divide_x");
        }
        if denom_x_degree == 0 {
            if Self::Field::eq(&(denominator.get_coeff(0, 0).inv()), &Self::Field::zero()) {
                panic!("Divide by zero")
            }
            let rem_coeffs_vec = vec![Self::Field::zero(); 1];
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

        let mut quo_coeffs_vec = vec![Self::Field::zero(); quo_size];
        let mut rem_coeffs_vec = vec![Self::Field::zero(); rem_size];

        for offset in 0..self.y_degree as usize + 1 {
            let sub_xpoly = self.get_univariate_polynomial_x(offset as u64);
            let (sub_quo_poly, sub_rem_poly) = sub_xpoly.poly.divide(&denominator.poly);
            let mut sub_quo_coeffs_vec = vec![Self::Field::zero(); quo_x_size];
            let mut sub_rem_coeffs_vec = vec![Self::Field::zero(); rem_x_size];
            let sub_quo_coeffs = HostSlice::from_mut_slice(&mut sub_quo_coeffs_vec);
            let sub_rem_coeffs = HostSlice::from_mut_slice(&mut sub_rem_coeffs_vec);
            sub_quo_poly.copy_coeffs(0, sub_quo_coeffs);
            sub_rem_poly.copy_coeffs(0, sub_rem_coeffs);
            if offset <= quo_y_size {
                quo_coeffs_vec[offset * quo_x_size .. (offset + 1) * quo_x_size].copy_from_slice(&sub_quo_coeffs_vec);
            }
            if offset <= rem_y_size {
                rem_coeffs_vec[offset * rem_x_size .. (offset + 1) * rem_x_size].copy_from_slice(&sub_rem_coeffs_vec);
            }
        }

        let quo_coeffs = HostSlice::from_mut_slice(&mut quo_coeffs_vec);
        let rem_coeffs = HostSlice::from_mut_slice(&mut rem_coeffs_vec);
        (DensePolynomialExt::from_coeffs(quo_coeffs, quo_x_size, quo_y_size), DensePolynomialExt::from_coeffs(rem_coeffs, rem_x_size, rem_y_size))
    }

    fn divide_y(&self, denominator: &Self) -> (Self, Self) where Self: Sized {
        let (numer_x_degree, numer_y_degree) = self.degree();
        let (denom_x_degree, denom_y_degree) = denominator.degree();
        if denom_x_degree != 0 {
            panic!("Denominator for divide_y must be Y-univariate");
        }
        if numer_y_degree < denom_y_degree{
            panic!("Numer.y_degree < Denom.y_degree for divide_y");
        }
        if denom_y_degree == 0 {
            if Self::Field::eq(&(denominator.get_coeff(0, 0).inv()), &Self::Field::zero()) {
                panic!("Divide by zero")
            }
            let rem_coeffs_vec = vec![Self::Field::zero(); 1];
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

        let mut quo_coeffs_vec = vec![Self::Field::zero(); quo_size];
        let mut rem_coeffs_vec = vec![Self::Field::zero(); rem_size];

        for offset in 0..self.x_degree as usize + 1 {
            let sub_ypoly = self.get_univariate_polynomial_y(offset as u64);
            let (sub_quo_poly, sub_rem_poly) = sub_ypoly.poly.divide(&denominator.poly);
            let mut sub_quo_coeffs_vec = vec![Self::Field::zero(); quo_y_size];
            let mut sub_rem_coeffs_vec = vec![Self::Field::zero(); rem_y_size];
            let sub_quo_coeffs = HostSlice::from_mut_slice(&mut sub_quo_coeffs_vec);
            let sub_rem_coeffs = HostSlice::from_mut_slice(&mut sub_rem_coeffs_vec);
            sub_quo_poly.copy_coeffs(0, sub_quo_coeffs);
            sub_rem_poly.copy_coeffs(0, sub_rem_coeffs);
            if offset <= quo_x_size {
                quo_coeffs_vec[offset * quo_y_size .. (offset + 1) * quo_y_size].copy_from_slice(&sub_quo_coeffs_vec);
            }
            if offset <= rem_x_size {
                rem_coeffs_vec[offset * rem_y_size .. (offset + 1) * rem_y_size].copy_from_slice(&sub_rem_coeffs_vec);
            }
        }
        let quo_coeffs_tr = HostSlice::from_slice(&quo_coeffs_vec);
        let rem_coeffs_tr = HostSlice::from_slice(&rem_coeffs_vec);

        let mut quo_coeffs_vec2 = vec![Self::Field::zero(); quo_size];
        let quo_coeffs = HostSlice::from_mut_slice(&mut quo_coeffs_vec2);
        let mut rem_coeffs_vec2 = vec![Self::Field::zero(); rem_size];
        let rem_coeffs = HostSlice::from_mut_slice(&mut rem_coeffs_vec2);

        let vec_ops_cfg = VecOpsConfig::default();
        //vec_ops_cfg.batch_size = self.x_size as i32;
        ScalarCfg::transpose(quo_coeffs_tr, quo_x_size as u32, quo_y_size as u32, quo_coeffs, &vec_ops_cfg).unwrap();
        ScalarCfg::transpose(rem_coeffs_tr, rem_x_size as u32, rem_y_size as u32, rem_coeffs, &vec_ops_cfg).unwrap();
        (DensePolynomialExt::from_coeffs(quo_coeffs, quo_x_size, quo_y_size), DensePolynomialExt::from_coeffs(rem_coeffs, rem_x_size, rem_y_size))
    }
}



// TEST SCRIPT for from_coeffs, from_rou_coeffs, eval
// fn main() {
//     let x_size = 4;
//     let y_size = 2;
//     let size = x_size * y_size;
//     let mut coeffs_vec = vec![ScalarField::one(); size];
//     let coeffs = HostSlice::from_slice(&coeffs_vec);
//     let mut evals = DeviceVec::<ScalarField>::device_malloc(size).unwrap();

//     ntt::initialize_domain::<ScalarField>(
//         ntt::get_root_of_unity::<ScalarField>(size as u64),
//         &ntt::NTTInitDomainConfig::default(),
//     )
//     .unwrap();

//     // Using default config
//     let mut cfg = ntt::NTTConfig::<ScalarField>::default();
//     cfg.batch_size = y_size as i32;
//     cfg.columns_batch = false;

//     // Computing NTT columns batch
//     ntt::ntt(
//         coeffs,
//         ntt::NTTDir::kInverse,
//         &cfg,
//         &mut evals,
//     )
//     .unwrap();

//     // Using default config
//     let mut cfg = ntt::NTTConfig::<ScalarField>::default();
//     cfg.batch_size = x_size as i32;
//     cfg.columns_batch = true;

//     // Computing NTT columns batch
//     let mut evals2 = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
//     ntt::ntt(
//         &evals,
//         ntt::NTTDir::kInverse,
//         &cfg,
//         &mut evals2,
//     )
//     .unwrap();

//     let poly1 = DensePolynomialExt::from_coeffs(coeffs, x_size, y_size);
//     let poly2 = DensePolynomialExt::from_rou_evals(&evals2, x_size, y_size);

//     let mut coeff1_vec = vec![ScalarField::zero(); size];
//     let mut coeff2_vec = vec![ScalarField::zero(); size];
//     let coeff1 = HostSlice::from_mut_slice(&mut coeff1_vec);
//     let coeff2 = HostSlice::from_mut_slice(&mut coeff2_vec);
//     poly1.copy_coeffs(0, coeff1);
//     poly2.copy_coeffs(0, coeff2);
//     println!("coeffs = {:?}", coeff1_vec);
//     println!("evals2 = {:?}", coeff2_vec);

//     let x = ScalarCfg::generate_random(1)[0];
//     let y = ScalarCfg::generate_random(1)[0];

//     let eval1 = poly1.eval(&x, &y);
//     let eval2 = poly2.eval(&x, &y);
    
//     println!("eval result = {:?}", ScalarField::eq(&eval1, &eval2));
// }

//TEST SCRIPT for extend_size, slicing as a block matrix, mul_monomial
// fn main() {
//     let x_size = 4;
//     let y_size = 2;
//     let size = x_size * y_size;
//     let coeffs_vec = ScalarCfg::generate_random(size);
//     let coeffs = HostSlice::from_slice(&coeffs_vec);

//     let poly = DensePolynomialExt::from_coeffs(coeffs, x_size, y_size);

//     let mut ext_poly = poly.clone();
//     ext_poly.extend_size(8, 16);
    
//     let mut blocks_raw = vec![ScalarField::zero(); 8*16];
//     ext_poly._slice_coeffs_into_blocks(2, 8, &mut blocks_raw);
//     let split_poly:Vec<Vec<ScalarField>> = blocks_raw.chunks(8).map(|chunk| chunk.to_vec()).collect();

//     let mut ext_poly_coeffs_vec = vec![ScalarField::zero(); 8 * 16];
//     let ext_poly_coeffs = HostSlice::from_mut_slice(&mut ext_poly_coeffs_vec);
//     ext_poly.copy_coeffs(0, ext_poly_coeffs);

//     let mut shifted_poly = poly.clone();
//     shifted_poly.mul_monomial(4, 2);
//     let mut shifted_poly_coeffs_vec = vec![ScalarField::zero(); 8*4];
//     let shifted_poly_coeffs = HostSlice::from_mut_slice(&mut shifted_poly_coeffs_vec);
//     shifted_poly.copy_coeffs(0,shifted_poly_coeffs);

//     println!("poly: \n{:?}\n\n", coeffs_vec);
//     println!("ext_poly: \n{:?}\n\n", ext_poly_coeffs_vec);
//     println!("block0: \n{:?}\n\n", split_poly[0]);
//     println!("shifted: \n{:?}\n\n", shifted_poly_coeffs_vec);
    
    
// }

// TEST SCRIPT for polynomial multiplication
// fn main() {
    
//     let p1_coeffs_vec = ScalarCfg::generate_random(8);
//     let p1_coeffs = HostSlice::from_slice(&p1_coeffs_vec);
//     let p1 = DensePolynomialExt::from_coeffs(p1_coeffs, 4, 2);

//     let p2_coeffs_vec = ScalarCfg::generate_random(16);
//     let p2_coeffs = HostSlice::from_slice(&p2_coeffs_vec);
//     let p2 = DensePolynomialExt::from_coeffs(p2_coeffs,2,8);

//     let p3 = &p1 * &p2;

//     let mut p3_coeffs_vec = vec![ScalarField::zero(); 128];
//     let p3_coeffs = HostSlice::from_mut_slice(&mut p3_coeffs_vec);
//     p3.copy_coeffs(0,p3_coeffs);

//     let x = ScalarCfg::generate_random(1)[0];
//     let y = ScalarCfg::generate_random(1)[0];

//     let eval_p1 = p1.eval(&x,&y);
//     let eval_p2 = p2.eval(&x,&y);
//     let eval_p3 = p3.eval(&x,&y);

//     println!("p1_coeffs: \n{:?}\n\n", p1_coeffs_vec);
//     println!("p2_coeffs: \n{:?}\n\n", p2_coeffs_vec);
//     println!("p3_coeffs: \n{:?}\n\n", p3_coeffs_vec);
//     println!("\n");
//     println!("p1_eval: {:?}\n", eval_p1);
//     println!("p2_eval: {:?}\n", eval_p2);
//     println!("p3_eval: {:?}\n", eval_p3);
//     println!("p1*p2 == p3?: {:?}\n", eval_p3.eq(&(eval_p1 * eval_p2)));

// }

// TEST SCRIPT for from_rou_eval and to_rou_eval
fn main() {

    let p1_coeffs_number:[u32; 2] = [4, 0];
    let mut p1_coeffs_vec = vec![ScalarField::zero(); 2];
    for (ind, &num) in p1_coeffs_number.iter().enumerate() {
        p1_coeffs_vec[ind] = ScalarField::from_u32(num);
    }
    let p1_coeffs = HostSlice::from_slice(&p1_coeffs_vec);
    let p1 = DensePolynomialExt::from_coeffs(p1_coeffs, 1, 2);

    let mut evals_vec = vec![ScalarField::zero(); 2];
    let evals = HostSlice::from_mut_slice(&mut evals_vec);
    p1.to_rou_evals(evals);

    let p2 = DensePolynomialExt::from_rou_evals(evals, 1, 2);
    let mut p2_coeffs_vec = vec![ScalarField::zero(); 2];
    let p2_coeffs = HostSlice::from_mut_slice(&mut p2_coeffs_vec);
    p2.copy_coeffs(0, p2_coeffs);

    println!("p1_coeffs: \n{:?}\n\n", p1_coeffs_vec);
    println!("evals: \n{:?}\n\n", evals);
    println!("p2_coeffs: \n{:?}\n\n", p2_coeffs_vec);

}

// TEST SCRIPT for polynomial division
// fn main() {
    
//     let p1_coeffs_vec = ScalarCfg::generate_random(32);
//     let p1_coeffs = HostSlice::from_slice(&p1_coeffs_vec);
//     let p1 = DensePolynomialExt::from_coeffs(p1_coeffs, 8, 4);

//     let p2_coeffs_vec = ScalarCfg::generate_random(6);
//     let p2_coeffs = HostSlice::from_slice(&p2_coeffs_vec);
//     let p2 = DensePolynomialExt::from_coeffs(p2_coeffs,6,1);

//     let p3_coeffs_vec = ScalarCfg::generate_random(3);
//     let p3_coeffs = HostSlice::from_slice(&p3_coeffs_vec);
//     let p3 = DensePolynomialExt::from_coeffs(p3_coeffs,1,3);

//     let (quo_x, rem_x) = p1.divide_x(&p2);
//     let (quo_y, rem_y) = rem_x.divide_y(&p3);

//     let mut quo_x_coeffs_vec = vec![ScalarField::zero(); 32];
//     let quo_x_coeffs = HostSlice::from_mut_slice(&mut quo_x_coeffs_vec);
//     quo_x.copy_coeffs(0,quo_x_coeffs);
//     let mut rem_x_coeffs_vec = vec![ScalarField::zero(); 32];
//     let rem_x_coeffs = HostSlice::from_mut_slice(&mut rem_x_coeffs_vec);
//     rem_x.copy_coeffs(0,rem_x_coeffs);

//     let mut quo_y_coeffs_vec = vec![ScalarField::zero(); 32];
//     let quo_y_coeffs = HostSlice::from_mut_slice(&mut quo_y_coeffs_vec);
//     quo_y.copy_coeffs(0,quo_y_coeffs);
//     let mut rem_y_coeffs_vec = vec![ScalarField::zero(); 32];
//     let rem_y_coeffs = HostSlice::from_mut_slice(&mut rem_y_coeffs_vec);
//     rem_y.copy_coeffs(0,rem_y_coeffs);

//     let mut p1_est_coeffs_vec = vec![ScalarField::zero(); 32];
//     let p1_est_coeffs = HostSlice::from_mut_slice(&mut p1_est_coeffs_vec);
//     let p1_est = &(&(&p2 * &quo_x) + &(&p3 * &quo_y)) + &rem_y;
//     p1_est.copy_coeffs(0,p1_est_coeffs);

//     let x = ScalarCfg::generate_random(1)[0];
//     let y = ScalarCfg::generate_random(1)[0];

//     let eval_p1 = p1.eval(&x,&y);
//     let eval_p2 = p2.eval(&x,&y);
//     let eval_p3 = p3.eval(&x,&y);
//     let eval_quo_x = quo_x.eval(&x,&y);
//     let eval_rem_x = rem_x.eval(&x,&y);
//     let eval_quo_y = quo_y.eval(&x,&y);
//     let eval_rem_y = rem_y.eval(&x,&y);

//     println!("p1_coeffs: \n{:?}\n\n", p1_coeffs_vec);
//     println!("p2_coeffs: \n{:?}\n\n", p2_coeffs_vec);
//     println!("p3_coeffs: \n{:?}\n\n", p3_coeffs_vec);
//     println!("quo_x_coeffs: \n{:?}\n\n", quo_x_coeffs_vec);
//     println!("rem_x_coeffs: \n{:?}\n\n", rem_x_coeffs_vec);
//     println!("quo_y_coeffs: \n{:?}\n\n", quo_y_coeffs_vec);
//     println!("rem_y_coeffs: \n{:?}\n\n", rem_y_coeffs_vec);
//     println!("\n");
//     println!("p1_coeffs: \n{:?}\n\n", p1_coeffs_vec);
//     println!("p1_est_coeffs: \n{:?}\n\n", p1_est_coeffs_vec);
//     println!("\n");
//     println!("p1_eval: \n{:?}\n\n", eval_p1);
//     println!("p2_eval: \n{:?}\n\n", eval_p2);
//     println!("p3_eval: \n{:?}\n\n", eval_p3);
//     println!("quo_x_eval: \n{:?}\n\n", eval_quo_x);
//     println!("rem_x_eval: \n{:?}\n\n", eval_rem_x);
//     println!("quo_y_eval: \n{:?}\n\n", eval_quo_y);
//     println!("rem_y_eval: \n{:?}\n\n", eval_rem_y);
//     println!("p1_est_eval: \n{:?}\n\n", p1_est.eval(&x,&y));
//     println!("p1 == p2*quo_x + p3*quo_y + rem_y?: {:?}\n", eval_p1.eq( &(((eval_p2 * eval_quo_x) + (eval_p3 * eval_quo_y)) + eval_rem_y) ) ); 
    
// }