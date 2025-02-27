use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};
use icicle_core::polynomials::UnivariatePolynomial;
use icicle_core::ntt;
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice, DeviceSlice, DeviceVec};
use std::{
    clone, cmp,
    ops::{Add, AddAssign, Div, Mul, Rem, Sub, Neg},
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
    
    fn find_degree(coeffs: &DensePolynomial, x_size: usize, y_size: usize) -> (i64, i64);

    // Method to divide this polynomial by vanishing polynomials 'X^{x_degree}-1' and 'Y^{y_degree}-1'.
    fn div_by_vanishing(&self, x_degree: i64, y_degree: i64) -> (Self, Self) where Self: Sized;

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

    fn _mul(&self, rhs: &Self) -> Self;
    // Method to divide this polynomial by another, returning quotient and remainder.
    fn divide_x(&self, denominator: &Self) -> (Self, Self) where Self: Sized;

    // Method to divide this polynomial by another, returning quotient and remainder.
    fn divide_y(&self, denominator: &Self) -> (Self, Self) where Self: Sized;

    fn _neg(&self) -> Self;

}

impl BivariatePolynomial for DensePolynomialExt {
    type Field = ScalarField;
    type FieldConfig = ScalarCfg;

    fn find_degree(poly: &DensePolynomial, x_size: usize, y_size: usize) -> (i64, i64) {
        let (min_size, is_min_x) = if x_size <= y_size {
            (x_size, true)
        } else {
            (y_size, false)
        };

        let mut max_x_degree: i64 = -1;
        let mut max_y_degree: i64 = -1;

        for ind in 0..min_size as i64 {
            let sub_poly = if is_min_x {
                // sub-polynomial of y
                poly.slice(ind as u64, x_size as u64, y_size as u64)
            } else {
                // sub-polynomial of x
                poly.slice(ind as u64 * x_size as u64, 1, (ind as u64 + 1) * x_size as u64)
            };
            // DensePolynomial::degree() returns -1 if the poly is zero.
            let curr_degree = sub_poly.degree() as i64;
            if sub_poly.degree() > -1 {
                if is_min_x {
                    max_y_degree = std::cmp::max(curr_degree, max_y_degree);
                    max_x_degree = std::cmp::max(ind, max_x_degree);
                } else {
                    max_x_degree = std::cmp::max(curr_degree, max_x_degree);
                    max_y_degree = std::cmp::max(ind, max_y_degree);
                }
            }
        }
        (std::cmp::max(max_x_degree, 0), std::cmp::max(max_y_degree, 0))
    }

    fn from_coeffs<S: HostOrDeviceSlice<Self::Field> + ?Sized>(coeffs: &S, x_size: usize, y_size: usize) -> Self {
        if x_size == 0 || y_size == 0 {
            panic!("Invalid matrix size for from_coeffs");
        }
        if x_size.is_power_of_two() == false || y_size.is_power_of_two() == false {
            panic!("The input sizes for from_coeffs must be powers of two.")
        }
        let poly = DensePolynomial::from_coeffs(coeffs, x_size as usize * y_size as usize);
        //let (x_degree, y_degree) = DensePolynomialExt::_find_degree(&poly, x_size, y_size);
        Self {
            poly,
            x_degree: x_size as i64 - 1,
            y_degree: y_size as i64 - 1,
            x_size,
            y_size,
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
        cfg.columns_batch = false;
        ntt::ntt(evals, ntt::NTTDir::kInverse, &cfg, &mut coeffs).unwrap();
        // IFFT along Y
        cfg.batch_size = x_size as i32;
        cfg.columns_batch = true;
        ntt::ntt_inplace(&mut coeffs, ntt::NTTDir::kInverse, &cfg).unwrap();

        let mut scaled_coeffs = coeffs;
        let vec_ops_cfg = VecOpsConfig::default();

        if let Some(_factor) = coset_x {
            let factor = _factor.inv();
            let mut _right_scale = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
            let mut scaler = Self::Field::one();
            for ind in 0..x_size {
                _right_scale[ind * y_size .. (ind+1) * y_size].copy_from_host(HostSlice::from_slice(&vec![scaler; y_size])).unwrap();
                scaler = scaler.mul(factor);
            }
            let mut right_scale = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
            Self::FieldConfig::transpose(&_right_scale, x_size as u32, y_size as u32, &mut right_scale, &vec_ops_cfg).unwrap();
            let mut temp = DeviceVec::<Self::Field>::device_malloc( size ).unwrap();
            Self::FieldConfig::mul(&scaled_coeffs, &right_scale, &mut temp, &vec_ops_cfg).unwrap();
            scaled_coeffs = temp;
        }

        if let Some(_factor) = coset_y {
            let factor = _factor.inv();
            let mut left_scale = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
            let mut scaler = Self::Field::one();
            for ind in 0..y_size {
                left_scale[ind * x_size .. (ind+1) * x_size].copy_from_host(HostSlice::from_slice(&vec![scaler; x_size])).unwrap();
                scaler = scaler.mul(factor);
            }
            let mut temp = DeviceVec::<Self::Field>::device_malloc(size ).unwrap();
            Self::FieldConfig::mul(&scaled_coeffs, &left_scale, &mut temp, &vec_ops_cfg).unwrap();
            scaled_coeffs = temp;
        }

        DensePolynomialExt::from_coeffs(&scaled_coeffs, x_size, y_size)
    }

    fn to_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, coset_x: Option<&Self::Field>, coset_y: Option<&Self::Field>, evals: &mut S) {
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
        
        let mut coeffs = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
        self.copy_coeffs(0, &mut coeffs);

        let mut scaled_coeffs = coeffs;
        let vec_ops_cfg = VecOpsConfig::default();

        if let Some(factor) = coset_x {
            let mut _right_scale = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
            let mut scaler = Self::Field::one();
            for ind in 0..self.x_size {
                _right_scale[ind * self.y_size .. (ind+1) * self.y_size].copy_from_host(HostSlice::from_slice(&vec![scaler; self.y_size])).unwrap();
                scaler = scaler.mul(*factor);
            }
            let mut right_scale = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
            Self::FieldConfig::transpose(&_right_scale, self.x_size as u32, self.y_size as u32, &mut right_scale, &vec_ops_cfg).unwrap();
            let mut temp = DeviceVec::<Self::Field>::device_malloc( size ).unwrap();
            Self::FieldConfig::mul(&scaled_coeffs, &mut right_scale, &mut temp, &vec_ops_cfg).unwrap();
            scaled_coeffs = temp;
        }

        if let Some(factor) = coset_y {
            let mut left_scale = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
            let mut scaler = Self::Field::one();
            for ind in 0..self.y_size {
                left_scale[ind * self.x_size .. (ind+1) * self.x_size].copy_from_host(HostSlice::from_slice(&vec![scaler; self.x_size])).unwrap();
                scaler = scaler.mul(*factor);
            }
            let mut temp = DeviceVec::<Self::Field>::device_malloc(size ).unwrap();
            Self::FieldConfig::mul(&scaled_coeffs, &mut left_scale, &mut temp, &vec_ops_cfg).unwrap();
            scaled_coeffs = temp;
        }

        let mut cfg = ntt::NTTConfig::<Self::Field>::default();
        // FFT along X
        cfg.batch_size = self.y_size as i32;
        cfg.columns_batch = false;
        ntt::ntt(&scaled_coeffs, ntt::NTTDir::kForward, &cfg, evals).unwrap();
        // FFT along Y
        cfg.batch_size = self.x_size as i32;
        cfg.columns_batch = true;
        ntt::ntt_inplace(evals, ntt::NTTDir::kForward, &cfg).unwrap();
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

        for row_idx in 0..self.y_size{
            let row_vec = &orig_coeffs_vec[row_idx * self.x_size .. (row_idx + 1) * self.x_size];
            for col_idx in 0..self.x_size {
                let block_idx = (col_idx / block_x_size) + num_blocks_x * (row_idx / block_y_size);
                let in_block_idx = (col_idx % block_x_size) + block_x_size * (row_idx % block_y_size);
                blocks[block_idx][in_block_idx] = row_vec[col_idx].clone();
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

    fn optimize_size(&mut self) {
        let target_x_size = self.x_degree as usize + 1;
        let target_y_size = self.y_degree as usize + 1;
        self.resize(target_x_size, target_y_size);
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
            let new_size: usize = new_x_size * new_y_size;
            
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

    fn div_by_vanishing(&self, denom_x_degree: i64, denom_y_degree: i64) -> (Self, Self) {
        if !( (denom_x_degree as usize).is_power_of_two() && (denom_y_degree as usize).is_power_of_two() ) {
            panic!("The denominators must have degress as powers of two.")
        }
        let numer_x_size = self.x_size;
        let numer_y_size = self.y_size;
        let numer_x_degree = self.x_degree;
        let numer_y_degree = self.y_degree;
        if numer_x_degree < denom_x_degree || numer_y_degree < denom_y_degree {
            panic!("The numerator must have grater degrees than denominators.")
        }
        // Assume that self's sizes are powers of two and optimized.
        let m = numer_x_size / denom_x_degree as usize;
        let n = numer_y_size / denom_y_degree as usize;
        let c = denom_x_degree as usize;
        let d = denom_y_degree as usize;
        if m != 2 || n < 2 {
            panic!("div_by_vanishing currently does not support this numerator (x_degree is too large). Use divide_x and divide_y, instead.");
        }

        let zeta = Self::FieldConfig::generate_random(1)[0];
        let xi = zeta;
        let vec_ops_cfg: VecOpsConfig = VecOpsConfig::default();
        if n == 2 { // A faster method for n==2, but not cover n>2.
            let block = vec![Self::Field::zero(); c * d];
            let mut blocks = vec![block; m * n];
            self._slice_coeffs_into_blocks(m,n, &mut blocks);
            // Computing A' (accumulation of blocks of the numerator)
            let mut scaled_acc_block_vec = vec![Self::Field::zero(); c * d];
            let scaled_acc_block = HostSlice::from_mut_slice(&mut scaled_acc_block_vec);

            let xi_d = xi.pow(d);
            let mut acc_xi_d = Self::Field::one();
            for i in 0..n {
                let mut sub_acc_block_vec = vec![Self::Field::zero(); c * d];
                let sub_acc_block = unsafe{DeviceSlice::from_mut_slice(&mut sub_acc_block_vec)};
                for j in 0..m {
                    Self::FieldConfig::accumulate(
                        sub_acc_block, 
                        HostSlice::from_slice(&blocks[j + i*m]), 
                        &vec_ops_cfg
                    ).unwrap();
                }
                let mut sub_scaled_acc_block = DeviceVec::<Self::Field>::device_malloc(c * d).unwrap();
                let acc_xi_d_vec = vec![acc_xi_d; c * d];
                Self::FieldConfig::mul(
                    sub_acc_block,
                    HostSlice::<Self::Field>::from_slice(&acc_xi_d_vec),
                    &mut sub_scaled_acc_block,
                    &vec_ops_cfg
                ).unwrap();
                Self::FieldConfig::accumulate(
                    scaled_acc_block, 
                    &sub_scaled_acc_block, 
                    &vec_ops_cfg
                ).unwrap();

                acc_xi_d = acc_xi_d * xi_d;
            }
            let acc_block_poly = DensePolynomialExt::from_coeffs(scaled_acc_block, c, d);
            // Computing R_tilde (eval of A' on rou-X and coset-Y)
            let mut acc_block_eval = DeviceVec::<Self::Field>::device_malloc(c * d).unwrap();
            acc_block_poly.to_rou_evals(None, Some(&xi), &mut acc_block_eval);
            // Computing Q_Z_tilde (eval of quo_y on rou-X and coset-Y)
            let _denom_vec = vec![xi_d - Self::Field::one(); c * d];
            let _denom = HostSlice::from_slice(&_denom_vec);
            let mut quo_y_eval = DeviceVec::<Self::Field>::device_malloc(c * d).unwrap();
            Self::FieldConfig::div(&acc_block_eval, _denom, &mut quo_y_eval, &vec_ops_cfg).unwrap();
            // Computing Q_Z (quo_y polynomial)
            let quo_y = DensePolynomialExt::from_rou_evals(&quo_y_eval, c, d, None, Some(&xi));
            // Computing R = quo_y * (y^d - 1)
            let mut rem_x = &quo_y.mul_monomial(0, d) - &quo_y;
            rem_x.resize(m*c, n*d);
            // Computing B = quo_x * (x^c - 1)
            let lhs = self - &rem_x;
            // Computing B' (accumulation of blocks of B)
            let block = vec![Self::Field::zero(); c * (n*d)];
            let mut blocks = vec![block; m];
            lhs._slice_coeffs_into_blocks(m,1, &mut blocks);

            let mut scaled_acc_block_vec = vec![Self::Field::zero(); c * (n*d)];
            let scaled_acc_block = HostSlice::from_mut_slice(&mut scaled_acc_block_vec);

            let zeta_c = zeta.pow(c);
            let mut acc_zeta_c = Self::Field::one();
            for i in 0..m {
                let acc_zeta_c_vec = vec![acc_zeta_c; c * (n*d)];
                let mut scaled_block = DeviceVec::<Self::Field>::device_malloc(c * (n*d)).unwrap();
                Self::FieldConfig::mul(
                    HostSlice::from_slice(&blocks[i]),
                    HostSlice::<Self::Field>::from_slice(&acc_zeta_c_vec),
                    &mut scaled_block,
                    &vec_ops_cfg
                ).unwrap(); 
                Self::FieldConfig::accumulate(
                    scaled_acc_block, 
                    &scaled_block, 
                    &vec_ops_cfg
                ).unwrap();

                acc_zeta_c = acc_zeta_c * zeta_c;
            }
            let acc_block_poly = DensePolynomialExt::from_coeffs(scaled_acc_block, c, n*d);
            //Computing B_tilde (eval of B' on coset-X and rou-Y)
            let mut acc_block_eval = DeviceVec::device_malloc(c * (n*d)).unwrap();
            acc_block_poly.to_rou_evals(Some(&zeta), None, &mut acc_block_eval);
            // Computing Q_Y_tilde (eval of quo_x on coset-X and rou-Y)
            let _denom_vec = vec![zeta_c - Self::Field::one(); c * (n*d)];
            let _denom = HostSlice::from_slice(&_denom_vec);
            let mut quo_x_eval = DeviceVec::<Self::Field>::device_malloc(c * (n*d)).unwrap();
            Self::FieldConfig::div(&acc_block_eval, _denom, &mut quo_x_eval, &vec_ops_cfg).unwrap();
            // Computing Q_Y (quo_x)
            let quo_x = DensePolynomialExt::from_rou_evals(&quo_x_eval, c, n*d, Some(&zeta), None);
            (quo_x, quo_y)
            
        } else { // More general method for n>=2, which also covers n=2 but maybe slower.
            let block = vec![Self::Field::zero(); c * (n*d)];
            let mut blocks = vec![block; m];
            self._slice_coeffs_into_blocks(m,1, &mut blocks);
            // Computing A' (accumulation of blocks of the numerator)
            let mut acc_block_vec = vec![Self::Field::zero(); c * (n*d)];
            let acc_block = HostSlice::from_mut_slice(&mut acc_block_vec);
            for i in 0..m {
                Self::FieldConfig::accumulate(
                    acc_block, 
                    HostSlice::from_slice(&blocks[i]), 
                    &vec_ops_cfg
                ).unwrap();
            }
            let acc_block_poly = DensePolynomialExt::from_coeffs(acc_block, c,n*d);
            // Computing R_tilde (eval of A' on rou-X and coset-nY)
            let mut acc_block_eval = DeviceVec::<Self::Field>::device_malloc(c * (n*d)).unwrap();
            acc_block_poly.to_rou_evals(None, Some(&xi), &mut acc_block_eval);
            // Computing Q_Z_tilde (eval of quo_y on rou-X and coset-nY)
            let mut denom_coeffs_vec = vec![Self::Field::zero(); 1 * (n*d)];
            denom_coeffs_vec[0] = Self::Field::zero() - Self::Field::one();
            denom_coeffs_vec[d] = Self::Field::one();
            let denom_coeffs = unsafe{DeviceSlice::from_slice(&denom_coeffs_vec)};
            //let denom_coeffs = HostSlice::from_slice(&denom_coeffs_vec);
            let denom_poly = DensePolynomialExt::from_coeffs(denom_coeffs, 1, n*d);
            let mut denom_evals_vec = vec![Self::Field::zero(); n*d];
            //let denom_evals = unsafe{DeviceSlice::from_mut_slice(&mut denom_evals_vec)};
            let denom_evals = HostSlice::from_mut_slice(&mut denom_evals_vec);
            denom_poly.to_rou_evals(None, Some(&xi), denom_evals);
            let mut denom_evals_ext_vec = vec![Self::Field::zero(); c * (n*d)];
            for ind in 0..(n*d) {
                denom_evals_ext_vec[ind*c .. (ind + 1)*c].copy_from_slice(&vec![denom_evals_vec[ind]; c]);
            }
            let denom_evals_ext = unsafe{DeviceSlice::from_slice(&denom_evals_ext_vec)};
            let mut quo_y_eval = DeviceVec::<Self::Field>::device_malloc(c * (n*d)).unwrap();
            Self::FieldConfig::div(&acc_block_eval, denom_evals_ext, &mut quo_y_eval, &vec_ops_cfg).unwrap();
            // Computing Q_Z (quo_y polynomial)
            let quo_y = DensePolynomialExt::from_rou_evals(&quo_y_eval, c, n*d, None, Some(&xi));
            // Computing R = quo_y * (y^d - 1)
            let mut rem_x = &quo_y.mul_monomial(0, d) - &quo_y;
            rem_x.resize(m*c, n*d);
            // Computing B = quo_x * (x^c - 1)
            let lhs = self - &rem_x;
            // Computing B' (accumulation of blocks of B)
            let block = vec![Self::Field::zero(); c * (n*d)];
            let mut blocks = vec![block; m];
            lhs._slice_coeffs_into_blocks(m,1, &mut blocks);

            let mut scaled_acc_block_vec = vec![Self::Field::zero(); c * (n*d)];
            let scaled_acc_block = HostSlice::from_mut_slice(&mut scaled_acc_block_vec);

            let zeta_c = zeta.pow(c);
            let mut acc_zeta_c = Self::Field::one();
            for i in 0..m {
                let acc_zeta_c_vec = vec![acc_zeta_c; c * (n*d)];
                let mut scaled_block = DeviceVec::<Self::Field>::device_malloc(c * (n*d)).unwrap();
                Self::FieldConfig::mul(
                    HostSlice::from_slice(&blocks[i]),
                    HostSlice::<Self::Field>::from_slice(&acc_zeta_c_vec),
                    &mut scaled_block,
                    &vec_ops_cfg
                ).unwrap(); 
                Self::FieldConfig::accumulate(
                    scaled_acc_block, 
                    &scaled_block, 
                    &vec_ops_cfg
                ).unwrap();

                acc_zeta_c = acc_zeta_c * zeta_c;
            }
            let acc_block_poly = DensePolynomialExt::from_coeffs(scaled_acc_block, c, n*d);
            //Computing B_tilde (eval of B' on coset-X and rou-Y)
            let mut acc_block_eval = DeviceVec::device_malloc(c * (n*d)).unwrap();
            acc_block_poly.to_rou_evals(Some(&zeta), None, &mut acc_block_eval);
            // Computing Q_Y_tilde (eval of quo_x on coset-X and rou-Y)
            let _denom_vec = vec![zeta_c - Self::Field::one(); c * (n*d)];
            let _denom = HostSlice::from_slice(&_denom_vec);
            let mut quo_x_eval = DeviceVec::<Self::Field>::device_malloc(c * (n*d)).unwrap();
            Self::FieldConfig::div(&acc_block_eval, _denom, &mut quo_x_eval, &vec_ops_cfg).unwrap();
            // Computing Q_Y (quo_x)
            let quo_x = DensePolynomialExt::from_rou_evals(&quo_x_eval, c, n*d, Some(&zeta), None);
            (quo_x, quo_y)
        }

    }
}