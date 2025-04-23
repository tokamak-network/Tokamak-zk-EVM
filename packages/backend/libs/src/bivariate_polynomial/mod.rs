use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
use icicle_core::traits::{Arithmetic, FieldImpl, FieldConfig, GenerateRandom};
use icicle_core::polynomials::UnivariatePolynomial;
use icicle_core::ntt;
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice, DeviceSlice, DeviceVec};
use std::{
    cmp,
    ops::{Add, AddAssign, Mul, Sub, Neg},
};
use super::vector_operations::{*};
use rayon::prelude::*;

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
        //let (x_degree, y_degree) = DensePolynomialExt::find_degree(&out_poly, x_size, y_size);
        DensePolynomialExt {
            poly: out_poly,
            x_degree: x_size as i64 - 1,
            y_degree: y_size as i64 - 1,
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
        //let (x_degree, y_degree) = DensePolynomialExt::find_degree(&self.poly, self.x_size, self.y_size);
        self.x_degree = self.x_size as i64 - 1;
        self.y_degree = self.y_size as i64 - 1;
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
        //let (x_degree, y_degree) = DensePolynomialExt::find_degree(&out_poly, x_size, y_size);
        DensePolynomialExt {
            poly: out_poly,
            x_degree: x_size as i64 - 1,
            y_degree: y_size as i64 - 1,
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
        let mut coeffs = DeviceVec::<ScalarField>::device_malloc(self.x_size * self.y_size).unwrap();
        self.copy_coeffs(0, &mut coeffs);
        let vec_ops_cfg = VecOpsConfig::default();
        let scaler_vec = [*rhs];
        let scaler = HostSlice::from_slice(&scaler_vec);
        let mut res_coeffs = DeviceVec::<ScalarField>::device_malloc(self.x_size * self.y_size).unwrap();
        ScalarCfg::scalar_mul(scaler, &coeffs, &mut res_coeffs, &vec_ops_cfg).unwrap();
        DensePolynomialExt::from_coeffs(&res_coeffs, self.x_size, self.y_size)
    }
}

// scalar * poly
impl Mul<&DensePolynomialExt> for &ScalarField {
    type Output = DensePolynomialExt;

    fn mul(self: Self, rhs: &DensePolynomialExt) -> Self::Output {
        let mut coeffs = DeviceVec::<ScalarField>::device_malloc(rhs.x_size * rhs.y_size).unwrap();
        rhs.copy_coeffs(0, &mut coeffs);
        let vec_ops_cfg = VecOpsConfig::default();
        let scaler_vec = [*self];
        let scaler = HostSlice::from_slice(&scaler_vec);
        let mut res_coeffs = DeviceVec::<ScalarField>::device_malloc(rhs.x_size * rhs.y_size).unwrap();
        ScalarCfg::scalar_mul(scaler, &coeffs, &mut res_coeffs, &vec_ops_cfg).unwrap();
        DensePolynomialExt::from_coeffs(&res_coeffs, rhs.x_size, rhs.y_size)
    }
}

// scalar + poly
impl Add<&DensePolynomialExt> for &ScalarField {
    type Output = DensePolynomialExt;

    fn add(self: Self, rhs: &DensePolynomialExt) -> Self::Output {
        let mut coeffs_vec = vec![ScalarField::zero(); rhs.x_size * rhs.y_size];
        let coeffs = HostSlice::from_mut_slice(&mut coeffs_vec);
        rhs.copy_coeffs(0, coeffs);
        coeffs_vec[0] = coeffs_vec[0] + *self;
        let res_coeffs = coeffs_vec.clone();
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&res_coeffs), rhs.x_size, rhs.y_size)
    }
}

// poly + scalar
impl Add<&ScalarField> for &DensePolynomialExt {
    type Output = DensePolynomialExt;

    fn add(self: Self, rhs: &ScalarField) -> Self::Output {
        let mut coeffs_vec = vec![ScalarField::zero(); self.x_size * self.y_size];
        let coeffs = HostSlice::from_mut_slice(&mut coeffs_vec);
        self.copy_coeffs(0, coeffs);
        coeffs_vec[0] = coeffs_vec[0] + *rhs;
        let res_coeffs = coeffs_vec.clone();
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&res_coeffs), self.x_size, self.y_size)
    }
}

// scalar - poly
impl Sub<&DensePolynomialExt> for &ScalarField {
    type Output = DensePolynomialExt;

    fn sub(self: Self, rhs: &DensePolynomialExt) -> Self::Output {
        let neg_rhs = -rhs;
        let mut coeffs_vec = vec![ScalarField::zero(); rhs.x_size * rhs.y_size];
        let coeffs = HostSlice::from_mut_slice(&mut coeffs_vec);
        neg_rhs.copy_coeffs(0, coeffs);
        coeffs[0] = *self + coeffs[0];
        
        DensePolynomialExt::from_coeffs(coeffs, rhs.x_size, rhs.y_size)
    }
}

// poly - scalar
impl Sub<&ScalarField> for &DensePolynomialExt {
    type Output = DensePolynomialExt;

    fn sub(self: Self, rhs: &ScalarField) -> Self::Output {
        let mut coeffs_vec = vec![ScalarField::zero(); self.x_size * self.y_size];
        let coeffs = HostSlice::from_mut_slice(&mut coeffs_vec);
        self.copy_coeffs(0, coeffs);
        coeffs_vec[0] = coeffs_vec[0] - *rhs;
        let res_coeffs = coeffs_vec.clone();
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&res_coeffs), self.x_size, self.y_size)
    }
}

impl Neg for &DensePolynomialExt {
    type Output = DensePolynomialExt;

    fn neg(self: Self) -> Self::Output {
        self._neg()
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
    fn from_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(evals: &S, x_size: usize, y_size: usize, coset_x: Option<&Self::Field>, coset_y: Option<&Self::Field>) -> Self;
    // Method to evaluate the polynomial over the roots-of-unity domain for power-of-two sized domain
    fn to_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, coset_x: Option<&Self::Field>, coset_y: Option<&Self::Field>, evals: &mut S);
    
    fn update_degree(&mut self);

    // Method to divide this polynomial by vanishing polynomials 'X^{x_degree}-1' and 'Y^{y_degree}-1'.
    fn div_by_vanishing(&mut self, x_degree: i64, y_degree: i64) -> (Self, Self) where Self: Sized;

    // Method to divide this polynomial by (X-x) and (Y-y)
    fn div_by_ruffini(&self, x: &Self::Field, y: &Self::Field) -> (Self, Self, Self::Field) where Self: Sized;

    // // Methods to add or subtract a monomial in-place.
    // fn add_monomial_inplace(&mut self, monomial_coeff: &Self::Field, monomial: u64);
    // fn sub_monomial_inplace(&mut self, monomial_coeff: &Self::Field, monomial: u64);

    // Method to shift coefficient indicies. The same effect as multiplying a monomial X^iY^j.
    fn mul_monomial(&self, x_exponent: usize, y_exponent: usize) -> Self;

    fn resize(&mut self, target_x_size: usize, target_y_size: usize);
    fn optimize_size(&mut self);

    // Method to slice the polynomial, creating a sub-polynomial.
    fn _slice_coeffs_into_blocks(&self, num_blocks_x: usize, num_blocks_y: usize, blocks_raw: &mut Vec<Vec<Self::Field>> );

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

    // // Method to evaluate the polynomial over a domain and store the results.
    // fn eval_on_domain<D_x: HostOrDeviceSlice<Self::Field> + ?Sized, D_y: HostOrDeviceSlice<Self::Field> + ?Sized, E: HostOrDeviceSlice<Self::Field> + ?Sized>(
    //     &self,
    //     domain_x: &D_x,
    //     domain_y: &D_y,
    //     evals: &mut E,
    // );

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
    // Scale a polynomial's coefficients of X by powers of a scaler.
    fn scale_coeffs_x(&self, scaler: &Self::Field) -> Self;
    fn scale_coeffs_y(&self, scaler: &Self::Field) -> Self;
    fn _scale_coeffs<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, scaler: &Self::Field, y_dir: bool, scaled_coeffs: &mut S);

    fn _mul(&self, rhs: &Self) -> Self;
    // Method to divide this polynomial by another, returning quotient and remainder.
    fn divide_x(&self, denominator: &Self) -> (Self, Self) where Self: Sized;

    // Method to divide this polynomial by another, returning quotient and remainder.
    fn divide_y(&self, denominator: &Self) -> (Self, Self) where Self: Sized;

    fn _divide_uni(&self, denom: &Self, y_dir: bool) -> (Self, Self) where Self: Sized;

    fn _neg(&self) -> Self;

    // Method to divide a univariate polynomial by (X-x)
    fn _div_uni_coeffs_by_ruffini(poly_coeffs_vec: &[Self::Field], x: &Self::Field) -> (Vec<Self::Field>, Self::Field);

}

impl BivariatePolynomial for DensePolynomialExt {
    type Field = ScalarField;
    type FieldConfig = ScalarCfg;

    fn update_degree(&mut self) {
        // find X degree
        let mut x_deg: i64 = -1;
        let mut y_deg: i64 = -1;
        for i in (0..self.x_size).rev() {
            let sub_poly = self.get_univariate_polynomial_y(i as u64);
            if sub_poly.poly.degree() >= 0 {
                x_deg = i as i64;
                break;
            }
        }
        for i in (0..self.y_size).rev() {
            let sub_poly = self.get_univariate_polynomial_x(i as u64);
            if sub_poly.poly.degree() >= 0 {
                y_deg = i as i64;
                break;
            }
        }

        self.x_degree = x_deg;
        self.y_degree = y_deg;
    }

    fn from_coeffs<S: HostOrDeviceSlice<Self::Field> + ?Sized>(coeffs: &S, x_size: usize, y_size: usize) -> Self {
        if x_size == 0 || y_size == 0 {
            panic!("Invalid matrix size for from_coeffs");
        }
        if x_size * y_size != coeffs.len() {
            panic!("Mismatch between the coefficient vector and the polynomial size")
        }
        if x_size.is_power_of_two() == false || y_size.is_power_of_two() == false {
            panic!("The input sizes for from_coeffs must be powers of two.")
        }
        let poly = DensePolynomial::from_coeffs(coeffs, x_size * y_size);
        //let (x_degree, y_degree) = DensePolynomialExt::_find_degree(&poly, x_size, y_size);
        Self {
            poly,
            x_degree: x_size as i64 - 1,
            y_degree: y_size as i64 - 1,
            x_size,
            y_size,
        }
    }

    fn scale_coeffs_x(&self, x_factor: &Self::Field) -> Self {
        let mut scaled_coeffs_vec = vec![Self::Field::zero(); self.x_size * self.y_size];
        let scaled_coeffs = HostSlice::from_mut_slice(&mut scaled_coeffs_vec);
        self._scale_coeffs(x_factor, false, scaled_coeffs);
        return DensePolynomialExt::from_coeffs(
            scaled_coeffs,
            self.x_size, 
            self.y_size
        )
    }

    fn scale_coeffs_y(&self, y_factor: &Self::Field) -> Self {
        let mut scaled_coeffs_vec = vec![Self::Field::zero(); self.x_size * self.y_size];
        let scaled_coeffs = HostSlice::from_mut_slice(&mut scaled_coeffs_vec);
        self._scale_coeffs(y_factor, true, scaled_coeffs);
        return DensePolynomialExt::from_coeffs(
            scaled_coeffs,
            self.x_size, 
            self.y_size
        )
    }

    fn _scale_coeffs<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, factor: &Self::Field, y_dir: bool, scaled_coeffs: &mut S) {
        let x_size = self.x_size;
        let y_size = self.y_size;
        let size = x_size * y_size;
        let mut coeffs_vec = vec![Self::Field::zero(); size];
        let coeffs = HostSlice::from_mut_slice(&mut coeffs_vec);
        self.copy_coeffs(0, coeffs);
        let vec_ops_cfg = VecOpsConfig::default();

        if !y_dir {
            let mut left_scale = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
            let mut scaler = Self::Field::one();
            for ind in 0..x_size {
                left_scale[ind * y_size .. (ind+1) * y_size].copy_from_host(HostSlice::from_slice(&vec![scaler; y_size])).unwrap();
                scaler = scaler.mul(*factor);
            }
            Self::FieldConfig::mul(coeffs, &left_scale, scaled_coeffs, &vec_ops_cfg).unwrap();
        }

        if y_dir {
            let mut _right_scale = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
            let mut scaler = Self::Field::one();
            for ind in 0..y_size {
                _right_scale[ind * x_size .. (ind+1) * x_size].copy_from_host(HostSlice::from_slice(&vec![scaler; x_size])).unwrap();
                scaler = scaler.mul(*factor);
            }
            let mut right_scale = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
            Self::FieldConfig::transpose(&_right_scale, y_size as u32, x_size as u32, &mut right_scale, &vec_ops_cfg).unwrap();
            Self::FieldConfig::mul(coeffs, &right_scale, scaled_coeffs, &vec_ops_cfg).unwrap();
        }
    }

    fn from_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(evals: &S, x_size: usize, y_size: usize, coset_x: Option<&Self::Field>, coset_y: Option<&Self::Field>) -> Self {
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
        cfg.columns_batch = true;
        ntt::ntt(evals, ntt::NTTDir::kInverse, &cfg, &mut coeffs).unwrap();
        // IFFT along Y
        cfg.batch_size = x_size as i32;
        cfg.columns_batch = false;
        ntt::ntt_inplace(&mut coeffs, ntt::NTTDir::kInverse, &cfg).unwrap();

        ntt::release_domain::<Self::Field>().unwrap();

        let mut poly = DensePolynomialExt::from_coeffs(
            &coeffs,
            x_size,
            y_size
        );

        if let Some(_factor) = coset_x {
            let factor = _factor.inv();
            poly = poly.scale_coeffs_x(&factor);
        }

        if let Some(_factor) = coset_y {
            let factor = _factor.inv();
            poly = poly.scale_coeffs_y(&factor);
        }
        return poly
    }

    fn to_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, coset_x: Option<&Self::Field>, coset_y: Option<&Self::Field>, evals: &mut S) {
        let size = self.x_size * self.y_size;
        if evals.len() < size {
            panic!("Insufficient buffer length for to_rou_evals")
        }

        let mut scaled_poly = self.clone();

        if let Some(factor) = coset_x {
            scaled_poly = scaled_poly.scale_coeffs_x(factor);
        }

        if let Some(factor) = coset_y {
            scaled_poly = scaled_poly.scale_coeffs_y(factor);
        }

        let mut scaled_coeffs_vec = vec![Self::Field::zero(); self.x_size * self.y_size];
        let scaled_coeffs = HostSlice::from_mut_slice(&mut scaled_coeffs_vec);
        scaled_poly.copy_coeffs(0, scaled_coeffs);

        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(
                size.try_into()
                    .unwrap(),
            ),
            &ntt::NTTInitDomainConfig::default(),
        )
        .unwrap();
        let mut cfg = ntt::NTTConfig::<Self::Field>::default();
        // FFT along X
        cfg.batch_size = self.y_size as i32;
        cfg.columns_batch = true;
        ntt::ntt(scaled_coeffs, ntt::NTTDir::kForward, &cfg, evals).unwrap();
        
        // FFT along Y
        cfg.batch_size = self.x_size as i32;
        cfg.columns_batch = false;
        ntt::ntt_inplace(evals, ntt::NTTDir::kForward, &cfg).unwrap();

        ntt::release_domain::<Self::Field>().unwrap();
    }

    fn copy_coeffs<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, start_idx: u64, coeffs: &mut S) {
        self.poly.copy_coeffs(start_idx, coeffs);
    }

    fn _neg(&self) -> Self {
        let zero_vec = vec![Self::Field::zero(); 1];
        let zero_poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&zero_vec), 1, 1);
        &zero_poly - self
    }

    fn _slice_coeffs_into_blocks(&self, num_blocks_x: usize, num_blocks_y: usize, blocks: &mut Vec<Vec<Self::Field>> ) {

        if self.x_size % num_blocks_x != 0 || self.y_size % num_blocks_y != 0 {
            panic!("Matrix size must be exactly divisible by the number of blocks.");
        }
        if blocks.len() != num_blocks_x * num_blocks_y {
            panic!("Incorrect length of the vector to store the result.")
        }
        let block_x_size = self.x_size / num_blocks_x;
        let block_y_size = self.y_size / num_blocks_y;

        let mut orig_coeffs_vec = vec![Self::Field::zero(); self.x_size * self.y_size];
        let orig_coeffs = HostSlice::from_mut_slice(&mut orig_coeffs_vec);
        self.poly.copy_coeffs(0, orig_coeffs);

        for row_idx in 0..self.x_size{
            let row_vec = &orig_coeffs_vec[row_idx * self.y_size .. (row_idx + 1) * self.y_size];
            for col_idx in 0..self.y_size {
                let block_idx = num_blocks_y * (row_idx / block_x_size) + (col_idx / block_y_size);
                let in_block_idx = block_y_size * (row_idx % block_x_size) + (col_idx % block_y_size) ;
                blocks[block_idx][in_block_idx] = row_vec[col_idx].clone();
            }
        }

    }

    fn eval_x(&self, x: &Self::Field) -> Self {
        let mut result_slice = vec![Self::Field::zero(); self.y_size];
        let result = HostSlice::from_mut_slice(&mut result_slice);

        for offset in 0..(self.y_degree + 1) as usize  {
            let sub_xpoly = self.get_univariate_polynomial_x(offset as u64);
            result[offset] = sub_xpoly.poly.eval(x);
        }

        DensePolynomialExt::from_coeffs(result, 1, self.y_size)
    }

    fn eval_y(&self, y: &Self::Field) -> Self {
        let mut result_slice = vec![Self::Field::zero(); self.x_size];
        let result = HostSlice::from_mut_slice(&mut result_slice);

        for offset in 0..(self.x_degree + 1) as usize {
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
        let idx = idx_x * self.y_size as u64 + idx_y;
        self.poly.get_coeff(idx)
    }

    fn get_univariate_polynomial_x(&self, idx_y:u64) -> Self {
        Self {
            poly: self.poly.slice(idx_y, self.y_size as u64, self.x_size as u64),
            x_size: self.x_size.clone(),
            y_size: 1,
            x_degree: self.x_degree.clone(),
            y_degree: 0,
        }
    }

    fn get_univariate_polynomial_y(&self, idx_x:u64) -> Self {
        Self {
            poly: self.poly.slice(idx_x * self.y_size as u64, 1, self.y_size as u64),
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
        for i in 0 .. cmp::min(self.x_size, new_x_size) {
            let each_y_size = cmp::min(self.y_size, new_y_size);
            res_coeffs_vec[new_y_size * i .. new_y_size * i + each_y_size].copy_from_slice(
                &orig_coeffs_vec[self.y_size * i .. self.y_size * i + each_y_size]
            );  
        }

        let res_coeffs = HostSlice::from_mut_slice(&mut res_coeffs_vec);
        
        self.poly = DensePolynomial::from_coeffs(res_coeffs, new_size);
        self.x_size = new_x_size;
        self.y_size = new_y_size;
    }

    fn optimize_size(&mut self) {
        self.update_degree();
        let (updated_x_degree, updated_y_degree) = self.degree();
        self.x_degree = updated_x_degree;
        self.y_degree = updated_y_degree;
        let target_x_size = updated_x_degree + 1;
        let target_y_size = updated_y_degree + 1;
        if target_x_size == 0 || target_y_size == 0 {
            return
        }
        self.resize(target_x_size as usize, target_y_size as usize);
    }

    fn mul_monomial(&self, x_exponent: usize, y_exponent: usize) -> Self {
       if x_exponent == 0 && y_exponent == 0 {
            self.clone()
        } else {
            let mut orig_coeffs_vec = Vec::<Self::Field>::with_capacity(self.x_size * self.y_size);
            unsafe{orig_coeffs_vec.set_len(self.x_size * self.y_size);}
            let orig_coeffs = HostSlice::from_mut_slice(&mut orig_coeffs_vec);
            self.copy_coeffs(0, orig_coeffs);

            let target_x_size = (self.x_degree + 1) as usize + x_exponent;
            let target_y_size = (self.y_degree + 1) as usize + y_exponent;
            let (new_x_size, new_y_size) = _find_size_as_twopower(target_x_size, target_y_size);
            let new_size: usize = new_x_size * new_y_size;
            
            let mut res_coeffs_vec = vec![Self::Field::zero(); new_size];
            for i in 0 .. self.x_size {
                res_coeffs_vec[new_y_size * (i + x_exponent) + y_exponent .. new_y_size * (i + x_exponent) + self.y_size + y_exponent].copy_from_slice(
                    &orig_coeffs_vec[self.y_size * i .. self.y_size * (i+1)]
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
        let target_x_size = self.x_size + rhs.x_size - 1;
        let target_y_size = self.y_size + rhs.y_size - 1;
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
        lhs_ext.to_rou_evals(None, None, &mut lhs_evals);
        rhs_ext.to_rou_evals(None, None, &mut rhs_evals);

        // Element-wise mult. of evaluations
        let mut out_evals = DeviceVec::<Self::Field>::device_malloc(extended_size).unwrap();
        ScalarCfg::mul(&lhs_evals, &rhs_evals, &mut out_evals, &cfg_vec_ops).unwrap();

        DensePolynomialExt::from_rou_evals(&out_evals, x_size, y_size, None, None)
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

        return self._divide_uni(denominator, false)
    }

    fn divide_y(&self, denominator: &Self) -> (Self, Self) where Self: Sized {
        let (numer_x_degree, numer_y_degree) = self.degree();
        let (denom_x_degree, denom_y_degree) = denominator.degree();
        if denom_x_degree != 0 {
            panic!("Denominator for divide_y must be Y-univariate");
        }
        if numer_y_degree < denom_y_degree{
            panic!("Numer.degree < Denom.degree for divide_y");
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

        return self._divide_uni(denominator, true)
    }

    fn _divide_uni(&self, denominator: &Self, y_dir: bool) -> (Self, Self) where Self: Sized {       
        // Division along Y (denom is assumed to be a polynomial of Y)
        let quo_size = if y_dir {
            self.y_size
        } else {
            self.x_size
        };
        let rem_size = quo_size;
        let sweep_dir = if y_dir {
            self.x_size
        } else {
            self.y_size
        };

        let mut quo_coeffs_vec = vec![ScalarField::zero(); self.x_size * self.y_size];
        let mut rem_coeffs_vec = vec![ScalarField::zero(); self.x_size * self.y_size];

        for offset in 0..sweep_dir {
            let sub_poly = if y_dir {
                self.get_univariate_polynomial_y(offset as u64)
            } else {
                self.get_univariate_polynomial_x(offset as u64)
            };
            let (sub_quo_poly, sub_rem_poly) = sub_poly.poly.divide(&denominator.poly);
            let mut sub_quo_coeffs_vec = vec![Self::Field::zero(); quo_size];
            let mut sub_rem_coeffs_vec = vec![Self::Field::zero(); rem_size];
            let sub_quo_coeffs = HostSlice::from_mut_slice(&mut sub_quo_coeffs_vec);
            let sub_rem_coeffs = HostSlice::from_mut_slice(&mut sub_rem_coeffs_vec);
            sub_quo_poly.copy_coeffs(0, sub_quo_coeffs);
            sub_rem_poly.copy_coeffs(0, sub_rem_coeffs);
            quo_coeffs_vec[offset * quo_size .. (offset + 1) * quo_size].copy_from_slice(&sub_quo_coeffs_vec);
            rem_coeffs_vec[offset * rem_size .. (offset + 1) * rem_size].copy_from_slice(&sub_rem_coeffs_vec);
        }

        if !y_dir {
            transpose_inplace(&mut quo_coeffs_vec, self.y_size, self.x_size);
            transpose_inplace(&mut rem_coeffs_vec, self.y_size, self.x_size);
        }
        
        let quo_coeffs = HostSlice::from_mut_slice(&mut quo_coeffs_vec);
        let rem_coeffs = HostSlice::from_mut_slice(&mut rem_coeffs_vec);
        return (
            DensePolynomialExt::from_coeffs(quo_coeffs, self.x_size, self.y_size),
            DensePolynomialExt::from_coeffs(rem_coeffs, self.x_size, self.y_size)
        )
    }

    fn div_by_vanishing(&mut self, denom_x_degree: i64, denom_y_degree: i64) -> (Self, Self) {
        if !( (denom_x_degree as usize).is_power_of_two() && (denom_y_degree as usize).is_power_of_two() ) {
            panic!("The denominators must have degress as powers of two.")
        }
        self.optimize_size();
        let numer_x_size = self.x_size;
        let numer_y_size = self.y_size;
        let numer_x_degree = self.x_degree;
        let numer_y_degree = self.y_degree;
        if numer_x_degree < denom_x_degree || numer_y_degree < denom_y_degree {
            panic!("The numerator must have grater degrees than denominators.")
        }
        let m = numer_x_size / denom_x_degree as usize;
        let n = numer_y_size / denom_y_degree as usize;
        let c = denom_x_degree as usize;
        let d = denom_y_degree as usize;
        
        let zeta = Self::FieldConfig::generate_random(1)[0];
        let xi = zeta;
        let vec_ops_cfg = VecOpsConfig::default();

        let mut t_c_coeffs = vec![ScalarField::zero(); 2*c];
        t_c_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_c_coeffs[c] = ScalarField::one();
        let mut t_c = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_c_coeffs), 2*c, 1);
        let mut t_d_coeffs = vec![ScalarField::zero(); 2*d];
        t_d_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_d_coeffs[d] = ScalarField::one();
        let mut t_d = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_d_coeffs), 1, 2*d);

        let block = vec![Self::Field::zero(); c * n*d];
        let mut blocks = vec![block; m];
        self._slice_coeffs_into_blocks(m,1, &mut blocks);
        // Computing A' (accumulation of blocks of the numerator)
        let mut acc_block_vec = vec![Self::Field::zero(); c * n*d];
        let acc_block = HostSlice::from_mut_slice(&mut acc_block_vec);
        for i in 0..m {
            Self::FieldConfig::accumulate(
                acc_block, 
                HostSlice::from_slice(&blocks[i]), 
                &vec_ops_cfg
            ).unwrap();
        }
        let acc_block_poly = DensePolynomialExt::from_coeffs(acc_block, c, n*d);
        // Computing R_tilde (eval of A' on rou-X and coset-Y)
        let mut acc_block_eval = DeviceVec::<Self::Field>::device_malloc(c * n*d).unwrap();
        acc_block_poly.to_rou_evals(None, Some(&xi), &mut acc_block_eval);
        // Computing Q_Y_tilde (eval of quo_y on rou-X and coset-Y)
        t_d.resize(c, n*d);
        let mut denom = DeviceVec::<Self::Field>::device_malloc(c * n*d).unwrap();
        t_d.to_rou_evals(None, Some(&xi), &mut denom);
        let mut quo_y_tilde = DeviceVec::<Self::Field>::device_malloc(c * n*d).unwrap();
        Self::FieldConfig::div(&acc_block_eval, &denom, &mut quo_y_tilde, &vec_ops_cfg).unwrap();
        // Computing Q_Y
        let quo_y = DensePolynomialExt::from_rou_evals(&quo_y_tilde, c, n*d, None, Some(&xi));
        // Computing R = quo_y * t_d
        let r = &quo_y.mul_monomial(0, d) - &quo_y;
        // Computing B
        let mut b = &*self - &r;
        b.optimize_size();
        // Computinb B_tilde (eval of B on coset-X and extended-rou-Y)
        let mut b_tilde = DeviceVec::<Self::Field>::device_malloc(b.x_size * b.y_size).unwrap();
        b.to_rou_evals(Some(&zeta), None, &mut b_tilde);
        // Computing Q_X_tilde (eval of quo_x on coset-X and extended-rou-Y)
        t_c.resize(b.x_size, b.y_size);
        let mut denom = DeviceVec::<Self::Field>::device_malloc(t_c.x_size * t_c.y_size).unwrap();
        t_c.to_rou_evals(Some(&zeta), None, &mut denom);
        let mut quo_x_tilde = DeviceVec::<Self::Field>::device_malloc(b.x_size * b.y_size).unwrap();
        Self::FieldConfig::div(&b_tilde, &denom, &mut quo_x_tilde, &vec_ops_cfg).unwrap();
        // Computing Q_Y
        let quo_x = DensePolynomialExt::from_rou_evals(&quo_x_tilde, b.x_size, b.y_size, Some(&zeta), None);
        (quo_x, quo_y)

    }

    fn div_by_ruffini(&self, x: &Self::Field, y: &Self:: Field) -> (Self, Self, Self::Field) where Self: Sized {
        // P(X,Y) = Q_X(X,Y)(X-x) + R_X(Y)
        // R_X(Y) = Q_Y(Y)(Y-y) + R_Y
        
        // Lengths of coeffs of P
        let x_len = self.x_size;
        let y_len = self.y_size;

        // Step 1: Extract the coefficients of univariate polynomials in X for each Y-degree
        // P(X,Y) = Y^{deg-1} P_{deg-1}(X) + Y^{deg-2} P_{deg-2}(X) + ... + Y^{0} (P_{0}(X))
        let mut p_i_coeffs_iter = vec![vec![Self::Field::zero();x_len]; y_len];
        for i in 0..y_len as u64 {
            let mut temp_vec = vec![Self::Field::zero(); x_len];
            let temp_buf = HostSlice::from_mut_slice(&mut temp_vec);
            self.get_univariate_polynomial_x(i).copy_coeffs(0, temp_buf);
            p_i_coeffs_iter[i as usize].clone_from_slice(&temp_vec);
        }
        
        // Step 2: Divide each polynomial P_i(X) by (X-x).
        let (q_x_coeffs_vec, r_x_coeffs_vec): (Vec<Vec<_>>, Vec<_>) =  p_i_coeffs_iter
            .into_par_iter()
            .map(|coeffs| {
                let (q_i_x, r_i) = DensePolynomialExt::_div_uni_coeffs_by_ruffini(&coeffs, x);
                (q_i_x, r_i)
            })
            .unzip();

        // Q_X(X,Y) = Y^0 q_0_X(X) + Y^1 q_1_X(X) + ... + Y^{deg-1} q_{deg-1}_X(X)
        // Flatten q_x_coeffs_vec
        let mut q_x_coeffs_vec_flat: Vec<Self::Field> = q_x_coeffs_vec.into_par_iter().flatten().collect();
        transpose_inplace(&mut q_x_coeffs_vec_flat, y_len, x_len);
        let q_x = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&q_x_coeffs_vec_flat), x_len, y_len);

        // Divide R_X(Y) by (Y-y).
        let (q_y_coeffs_vec, r_y) = DensePolynomialExt::_div_uni_coeffs_by_ruffini(&r_x_coeffs_vec, y);
        let q_y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&q_y_coeffs_vec), 1, y_len);
        (q_x, q_y, r_y)
    }

    fn _div_uni_coeffs_by_ruffini(poly_coeffs_vec: &[Self::Field], x: &Self::Field) -> (Vec<Self::Field>, Self::Field) {
        if poly_coeffs_vec.len() < 2 {
            return (vec![ScalarField::zero()], poly_coeffs_vec[0])
        }
        let len = poly_coeffs_vec.len();
        let mut q_coeffs_vec = vec![Self::Field::zero(); len];
        let mut b = poly_coeffs_vec[len - 1];
        q_coeffs_vec[len - 2] = b;
        for i in 3.. len + 1 {
            b = poly_coeffs_vec[len - i + 1] + b * *x;
            q_coeffs_vec[len - i] = b;
        }
        let r = poly_coeffs_vec[0] + b * *x;
        (q_coeffs_vec, r)
    }

}