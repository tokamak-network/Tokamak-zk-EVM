use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
use icicle_core::traits::{Arithmetic, FieldImpl, FieldConfig, GenerateRandom};
use icicle_core::polynomials::UnivariatePolynomial;
use icicle_core::ntt;
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice, DeviceSlice, DeviceVec};
use icicle_runtime::Device;
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
        if rhs.eq(&ScalarField::one()) {
            return self.clone()
        }
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
        if self.eq(&ScalarField::one()) {
            return rhs.clone()
        }
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

    fn from_rou_evals_original<S: HostOrDeviceSlice<Self::Field> + ?Sized>(evals: &S, x_size: usize, y_size: usize, coset_x: Option<&Self::Field>, coset_y: Option<&Self::Field>) -> Self;
    // fn copy_result_to_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
    //     final_result: &[Self::Field],
    //     original_size: usize,
    //     evals: &mut S
    // );

    fn copy_evals_to_host<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        &self,
        evals: &S,
        buffer: &mut [Self::Field]
    );

    fn copy_result_to_evals_256<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        &self,
        final_result: &[Self::Field],
        original_size: usize,
        evals: &mut S
    );

    fn from_rou_evals_cpu_fallback<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        evals: &S,
        x_size: usize,
        y_size: usize,
        coset_x: Option<&Self::Field>, 
        coset_y: Option<&Self::Field>
    ) -> Self;

    fn safe_device_to_host_copy<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        device_slice: &S,
        host_buffer: &mut [Self::Field]
    );

    fn from_rou_evals_safe_cpu_complete<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        evals: &S,
        x_size: usize,
        y_size: usize,
        coset_x: Option<&Self::Field>, 
        coset_y: Option<&Self::Field>
    ) -> Self;

    fn to_rou_evals_safe_cpu_complete<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        &self,
        coset_x: Option<&Self::Field>, 
        coset_y: Option<&Self::Field>, 
        evals: &mut S
    );

    fn safe_host_to_device_copy<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        &self,
        host_data: &[Self::Field],
        device_evals: &mut S
    );
   
    fn calculate_safe_padding_to_256(original_x_size: usize, original_y_size: usize) -> (usize, usize);
    // fn determine_reshape_dimensions(&self, original_x_size: usize, original_y_size: usize) -> (usize, usize);
    fn to_rou_evals_with_padding_to_256<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        &self,
        coset_x: Option<&Self::Field>, 
        coset_y: Option<&Self::Field>, 
        evals: &mut S
    );

    fn from_rou_evals_with_padding_to_256<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        evals: &S,
        x_size: usize,
        y_size: usize,
        coset_x: Option<&Self::Field>, 
        coset_y: Option<&Self::Field>
    ) -> Self;
    fn is_problematic_combination(x_size: usize, y_size: usize) -> bool;

    // Method to evaluate the polynomial over the roots-of-unity domain for power-of-two sized domain
    fn to_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, coset_x: Option<&Self::Field>, coset_y: Option<&Self::Field>, evals: &mut S);
    fn to_rou_evals_original<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, coset_x: Option<&Self::Field>, coset_y: Option<&Self::Field>, evals: &mut S);
    
    fn find_degree(&self) -> (i64, i64);

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

    // fn update_degree(&mut self) {
    //     // find X degree
    //     let mut x_deg: i64 = -1;
    //     let mut y_deg: i64 = -1;
    //     for i in (0..self.x_size).rev() {
    //         let sub_poly = self.get_univariate_polynomial_y(i as u64);
    //         if sub_poly.poly.degree() >= 0 {
    //             x_deg = i as i64;
    //             break;
    //         }
    //     }
    //     for i in (0..self.y_size).rev() {
    //         let sub_poly = self.get_univariate_polynomial_x(i as u64);
    //         if sub_poly.poly.degree() >= 0 {
    //             y_deg = i as i64;
    //             break;
    //         }
    //     }

    //     self.x_degree = x_deg;
    //     self.y_degree = y_deg;
    // }

    fn find_degree(&self) -> (i64, i64) {
        let size = self.x_size * self.y_size;
        let mut buf = vec![ScalarField::zero(); size];
        {
            let mut slice = HostSlice::from_mut_slice(&mut buf);
            self.poly.copy_coeffs(0, slice);
        }
        let x_size = self.x_size;
        let y_size = self.y_size;
    
        let (x_deg, y_deg) = rayon::join(
            || {
                (0..x_size)
                    .into_par_iter()
                    .rev() 
                    .find_first(|&i| {
                        let row = &buf[i * y_size .. (i+1) * y_size];
                        row.iter().any(|c| *c != ScalarField::zero())
                    })
                    .map(|i| i as i64)
                    .unwrap_or(-1)
            },
            || {
                (0..y_size)
                    .into_par_iter()
                    .rev()
                    .find_first(|&j| {
                        (0..x_size).any(|i| buf[i * y_size + j] != ScalarField::zero())
                    })
                    .map(|j| j as i64)
                    .unwrap_or(-1)
            },
        );
    
        (x_deg, y_deg)
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

    fn from_rou_evals_original<S: HostOrDeviceSlice<Self::Field> + ?Sized>(evals: &S, x_size: usize, y_size: usize, coset_x: Option<&Self::Field>, coset_y: Option<&Self::Field>) -> Self {
        if x_size == 0 || y_size == 0 {
            panic!("Invalid matrix size for from_rou_evals");
        }
        // println!("from rou");
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
        // cfg.columns_batch = 
        // if evals.len() == y_size && size > 128 {
        //     println!("from_rou_evals evals_len {:?}, y_size {:?}, x_size {:?}", evals.len(), y_size, x_size);
        // } 
        cfg.columns_batch = true ;
        // cfg.columns_batch = if size > 128 { true } else  { false };
        // println!("batch size in from_rou: {:?}", y_size);
        // println!("evals size: {:?}", evals.len());
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

    fn to_rou_evals_original<S: HostOrDeviceSlice<Self::Field> + ?Sized>(&self, coset_x: Option<&Self::Field>, coset_y: Option<&Self::Field>, evals: &mut S) {
        let size = self.x_size * self.y_size;

        if evals.len() < size {
            panic!("Insufficient buffer length for to_rou_evals")
        }
        let mut scaled_coeffs_vec = vec![Self::Field::zero(); self.x_size * self.y_size];
        let scaled_coeffs = HostSlice::from_mut_slice(&mut scaled_coeffs_vec);
        {
            let mut scaled_poly = self.clone();

            if let Some(factor) = coset_x {
                scaled_poly = scaled_poly.scale_coeffs_x(factor);
            }

            if let Some(factor) = coset_y {
                scaled_poly = scaled_poly.scale_coeffs_y(factor);
            }

            
            scaled_poly.copy_coeffs(0, scaled_coeffs);
        }
        
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
        // if evals.len() == self.y_size && size > 128 {
        //     println!("to_rou_evals evals_len {:?}, y_size {:?}, x_size {:?}", evals.len(), self.y_size, self.x_size);
        // }
        cfg.columns_batch = true;
        // cfg.columns_batch = if size > 128 { true } else  { false };
        // cfg.columns_batch = if scaled_coeffs.len() == self.y_size || self.y_size < 4 { false } else { true };
        // println!("batch size in to_rou: {:?}, {:?}, {:?}", self.y_size, scaled_coeffs.len(), self.y_size == scaled_coeffs.len());

        ntt::ntt(scaled_coeffs, ntt::NTTDir::kForward, &cfg, evals).unwrap();
        // println!("aaa");
        drop(scaled_coeffs_vec);
        
        // FFT along Y
        cfg.batch_size = self.x_size as i32;
        cfg.columns_batch = false;
        
        ntt::ntt_inplace(evals, ntt::NTTDir::kForward, &cfg).unwrap();
        ntt::release_domain::<Self::Field>().unwrap();
    }


    fn from_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        evals: &S, 
        x_size: usize, 
        y_size: usize, 
        coset_x: Option<&Self::Field>, 
        coset_y: Option<&Self::Field>
    ) -> Self {
        if x_size == 0 || y_size == 0 {
            panic!("Invalid matrix size for from_rou_evals");
        }
        if x_size * y_size != evals.len() {
            panic!("Mismatch between the coefficient vector and the polynomial size")
        }
        if x_size.is_power_of_two() == false || y_size.is_power_of_two() == false {
            panic!("The input sizes for from_rou_evals must be powers of two.")
        }
        
        let size = x_size * y_size;
        let needs_cpu_fallback = size <= 128 || size == y_size;
        // let needs_cpu_fallback = false;
        println!("from_rou_evals evals_len {:?}, x_size {:?}, y_size {:?}", evals.len(), x_size, y_size);
        if needs_cpu_fallback {
            // ⭐ CPU 폴백으로 정확한 결과 보장
            return Self::from_rou_evals_safe_cpu_complete(evals, x_size, y_size, coset_x, coset_y);
        }
    
        // GPU에서 안전한 경우만 일반 처리
        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(size.try_into().unwrap()),
            &ntt::NTTInitDomainConfig::default(),
        ).unwrap();
    
        let mut coeffs = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
        let mut cfg = ntt::NTTConfig::<Self::Field>::default();
        
        cfg.batch_size = y_size as i32;
        cfg.columns_batch = true;  
        
        ntt::ntt(evals, ntt::NTTDir::kInverse, &cfg, &mut coeffs).unwrap();
        
        if x_size > 1 {
            cfg.batch_size = x_size as i32;
            cfg.columns_batch = false;
            ntt::ntt_inplace(&mut coeffs, ntt::NTTDir::kInverse, &cfg).unwrap();
        }
    
        ntt::release_domain::<Self::Field>().unwrap();
    
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

    fn to_rou_evals<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        &self, 
        coset_x: Option<&Self::Field>, 
        coset_y: Option<&Self::Field>, 
        evals: &mut S
    ) {
        let original_size = self.x_size * self.y_size;
        let needs_cpu_fallback = original_size <= 128 || original_size == self.y_size;
        
        println!("to_rou_evals evals_len {:?}, x_size {:?}, y_size {:?}", evals.len(), self.x_size, self.y_size);
        if needs_cpu_fallback {
            // ⭐ CPU 폴백으로 정확한 결과 보장
            self.to_rou_evals_safe_cpu_complete(coset_x, coset_y, evals);
            return;
        }
        
        // GPU에서 안전한 경우만 일반 처리
        if evals.len() < original_size {
            panic!("Insufficient buffer length for to_rou_evals")
        }
        
        let mut scaled_coeffs_vec = vec![Self::Field::zero(); original_size];
        let scaled_coeffs = HostSlice::from_mut_slice(&mut scaled_coeffs_vec);
        {
            let mut scaled_poly = self.clone();
            if let Some(factor) = coset_x {
                scaled_poly = scaled_poly.scale_coeffs_x(factor);
            }
            if let Some(factor) = coset_y {
                scaled_poly = scaled_poly.scale_coeffs_y(factor);
            }
            scaled_poly.copy_coeffs(0, scaled_coeffs);
        }
        
        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(original_size.try_into().unwrap()),
            &ntt::NTTInitDomainConfig::default(),
        ).unwrap();
        
        let mut cfg = ntt::NTTConfig::<Self::Field>::default();
        cfg.batch_size = self.y_size as i32;
        cfg.columns_batch = true;  // GPU에서 안전한 경우만
        
        ntt::ntt(scaled_coeffs, ntt::NTTDir::kForward, &cfg, evals).unwrap();
        
        drop(scaled_coeffs_vec);
        
        if self.x_size > 1 {
            cfg.batch_size = self.x_size as i32;
            cfg.columns_batch = false;
            ntt::ntt_inplace(evals, ntt::NTTDir::kForward, &cfg).unwrap();
        }
        
        ntt::release_domain::<Self::Field>().unwrap();
    }


    fn from_rou_evals_safe_cpu_complete<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        evals: &S,
        x_size: usize,
        y_size: usize,
        coset_x: Option<&Self::Field>,
        coset_y: Option<&Self::Field>,
    ) -> Self {
        println!("🔄 Safe CPU fallback for from_rou_evals {}×{}", x_size, y_size);
    
        let size = x_size * y_size;
    
        // ─── 1단계: evals 데이터를 호스트 메모리로 복사 ─────────────────────────
        // evals가 GPU(DeviceSlice) 위에 올라 있을 수 있으므로, 반드시 HostSlice로 꺼내야 함
        let mut input_evals = vec![Self::Field::zero(); size];
        {
            // evals → input_evals (host Vec)로 안전하게 복사
            // safe_device_to_host_copy 내부에서 “identity NTT”를 이용하여 변형 없이 복사
            Self::safe_device_to_host_copy(evals, &mut input_evals);
        }
    
        // ─── 2단계: 현재 활성 디바이스를 기억해 두고, CPU로 전환 ────────────────
        let current_device = icicle_runtime::get_active_device();
        let cpu_device = icicle_runtime::device::Device::new("CPU", 0);
        icicle_runtime::set_device(&cpu_device).unwrap();
        println!("🖥️  Switched to CPU device");
    
        // ─── 3단계: CPU 상에서 완전히 호스트 메모리만 써서 IFFT 수행 ────────
        let final_coeffs: Vec<Self::Field> = {
            // CPU 도메인 초기화
            ntt::initialize_domain::<Self::Field>(
                ntt::get_root_of_unity::<Self::Field>(size.try_into().unwrap()),
                &ntt::NTTInitDomainConfig::default(),
            )
            .unwrap();
    
            let mut coeffs_result = vec![Self::Field::zero(); size];
            {
                // 첫 번째 방향(IFFT X-방향)
                let mut cfg = ntt::NTTConfig::<Self::Field>::default();
                cfg.batch_size = y_size as i32;
                cfg.columns_batch = true; // CPU에서는 columns_batch=true가 안전합니다.
                println!(
                    "from_rou_evals cpu evals_len {:?}, x_size {:?}, y_size {:?}",
                    input_evals.len(),
                    x_size,
                    y_size
                );
    
                // HostSlice::from_slice(&input_evals) → HostSlice::from_mut_slice(&mut coeffs_result)
                ntt::ntt(
                    HostSlice::from_slice(&input_evals),
                    ntt::NTTDir::kInverse,
                    &cfg,
                    HostSlice::from_mut_slice(&mut coeffs_result),
                )
                .unwrap();
    
                // 두 번째 방향(IFFT Y-방향)
                cfg.batch_size = x_size as i32;
                cfg.columns_batch = false;
                ntt::ntt_inplace(HostSlice::from_mut_slice(&mut coeffs_result), ntt::NTTDir::kInverse, &cfg)
                    .unwrap();
            }
    
            // CPU 도메인 해제
            ntt::release_domain::<Self::Field>().unwrap();
            coeffs_result
        };
    
        // ─── 4단계: 원래 활성 디바이스(=GPU)로 복원 ────────────────────────────
        icicle_runtime::set_device(&current_device.as_ref().unwrap()).unwrap();
        println!("🔙 Restored to GPU device: {:?}", current_device);
    
        // ─── 5단계: coset 인버스 적용 후, 다항식 생성 ──────────────────────────
        let mut poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&final_coeffs), x_size, y_size);
        if let Some(_factor) = coset_x {
            let factor = _factor.inv();
            poly = poly.scale_coeffs_x(&factor);
        }
        if let Some(_factor) = coset_y {
            let factor = _factor.inv();
            poly = poly.scale_coeffs_y(&factor);
        }
    
        println!("✅ Safe CPU fallback completed");
        poly
    }
    
    fn safe_device_to_host_copy<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        device_slice: &S,
        host_buffer: &mut [Self::Field],
    ) {
        let size = host_buffer.len();
        assert_eq!(
            device_slice.len(),
            size,
            "safe_device_to_host_copy: device_slice.len={} vs host_buffer.len={}",
            device_slice.len(),
            size
        );
    
        // 1) 임시 DeviceVec 할당 (GPU 메모리 혹은 현재 활성 디바이스 메모리)
        let mut temp_device = DeviceVec::<Self::Field>::device_malloc(size)
            .expect("DeviceVec 할당 실패");
    
        // 2) device_slice → temp_device로 복사 (GPU→GPU 혹은 CPU→CPU)
        temp_device
            .copy_from_host(HostSlice::from_slice(host_buffer))
            .unwrap_or_else(|_| {
                // 만약 device_slice가 GPU(DeviceSlice)이면 여기서 HostSlice→DeviceVec 복사,
                // 만약 HostSlice라면, 그냥 동일한 버퍼 복사가 이루어집니다.
                panic!("safe_device_to_host_copy: copy_from_host 실패")
            });
    
        // 3) “도메인 크기 = 1짜리 NTT” 초기화
        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(1),
            &ntt::NTTInitDomainConfig::default(),
        )
        .unwrap();
    
        // 4) identity NTT 설정: N→1→N 로 복사만 해 주기
        let mut cfg = ntt::NTTConfig::<Self::Field>::default();
        cfg.batch_size = size as i32;
        cfg.columns_batch = false;
    
        // 5) temp_device → host_buffer(HostSlice)로 “길이 1짜리 NTT를 size개 배치로 돌리는” 꼴로 복사
        println!("safe_device_to_host_copy: NTT 시작, size={}", size);
        ntt::ntt(
            &temp_device,
            ntt::NTTDir::kForward,
            &cfg,
            HostSlice::from_mut_slice(host_buffer),
        )
        .unwrap();
    
        ntt::release_domain::<Self::Field>().unwrap();
        // temp_device는 scope를 벗어나면 drop→메모리 해제
    }
    
    
    fn from_rou_evals_cpu_fallback<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        evals: &S,
        x_size: usize,
        y_size: usize,
        coset_x: Option<&Self::Field>, 
        coset_y: Option<&Self::Field>
    ) -> Self {
        println!("Using CPU fallback for from_rou_evals {}×{}", x_size, y_size);
        
        // CPU로 전환하여 정확한 처리
        let current_device = icicle_runtime::get_active_device();
        let cpu_device = Device::new("CPU", 0);
        icicle_runtime::set_device(&cpu_device).unwrap();
        
        // CPU에서 동일한 로직으로 처리 (columns_batch=true 안전)
        let size = x_size * y_size;
    
        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(size.try_into().unwrap()),
            &ntt::NTTInitDomainConfig::default(),
        ).unwrap();
    
        let mut coeffs = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
        let mut cfg = ntt::NTTConfig::<Self::Field>::default();
        
        cfg.batch_size = y_size as i32;
        cfg.columns_batch = true;  // CPU에서는 안전
        println!("from_rou_evals cpu evals_len {:?}, x_size {:?}, y_size {:?}", evals.len(), x_size, y_size);
        ntt::ntt(evals, ntt::NTTDir::kInverse, &cfg, &mut coeffs).unwrap();
        
        cfg.batch_size = x_size as i32;
        cfg.columns_batch = false;
        ntt::ntt_inplace(&mut coeffs, ntt::NTTDir::kInverse, &cfg).unwrap();
    
        ntt::release_domain::<Self::Field>().unwrap();
    
        let mut poly = DensePolynomialExt::from_coeffs(&coeffs, x_size, y_size);
    
        if let Some(_factor) = coset_x {
            let factor = _factor.inv();
            poly = poly.scale_coeffs_x(&factor);
        }
    
        if let Some(_factor) = coset_y {
            let factor = _factor.inv();
            poly = poly.scale_coeffs_y(&factor);
        }
        
        // GPU로 복원
        icicle_runtime::set_device(current_device.as_ref().unwrap()).unwrap();
        
        return poly;
    }

    
    
    fn to_rou_evals_safe_cpu_complete<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        &self,
        coset_x: Option<&Self::Field>,
        coset_y: Option<&Self::Field>,
        evals: &mut S,
    ) {
        println!("🔄 Safe CPU fallback for to_rou_evals {}×{}", self.x_size, self.y_size);

        let size = self.x_size * self.y_size;

        // ─── 1단계: 모든 데이터를 호스트 벡터로 꺼냅니다 ─────────────────────────────
        let mut input_coeffs = vec![Self::Field::zero(); size];
        {
            // 코셋이 주어졌다면 계수를 스케일링
            let mut scaled_poly = self.clone();
            if let Some(f) = coset_x {
                scaled_poly = scaled_poly.scale_coeffs_x(f);
            }
            if let Some(f) = coset_y {
                scaled_poly = scaled_poly.scale_coeffs_y(f);
            }
            // 호스트 메모리에 복사
            scaled_poly.copy_coeffs(0, HostSlice::from_mut_slice(&mut input_coeffs));
        }

        // ─── 2단계: 현재 활성 디바이스를 저장한 뒤, CPU(“CPU”, 0)로 전환 ─────────────────
        let current_device = icicle_runtime::get_active_device();
        println!("💾 Current device saved: {:?}", current_device);

        let cpu_device = icicle_runtime::device::Device::new("CPU", 0);
        icicle_runtime::set_device(&cpu_device).unwrap();
        println!("🖥️  Switched to CPU device");

        // ─── 3단계: 호스트 메모리 완전 NTT(Forward) 수행 ─────────────────────────────────
        // (원본 to_rou_evals는 “Forward NTT X-방향 → Forward NTT Y-방향” 순서였음)
        let final_result = {
            // CPU 쪽 Domain 초기화
            ntt::initialize_domain::<Self::Field>(
                ntt::get_root_of_unity::<Self::Field>(size.try_into().unwrap()),
                &ntt::NTTInitDomainConfig::default(),
            )
            .unwrap();

            // 중간 결과 저장용 벡터
            let mut intermediate = vec![Self::Field::zero(); size];

            {
                let mut cfg = ntt::NTTConfig::<Self::Field>::default();
                // X-방향 FFT
                cfg.batch_size = self.y_size as i32;
                cfg.columns_batch = true; // CPU에서는 안전
                println!(
                    "🧮 CPU NTT X-direction: batch_size={}, columns_batch=true",
                    cfg.batch_size
                );
                ntt::ntt(
                    HostSlice::from_slice(&input_coeffs),
                    ntt::NTTDir::kForward,
                    &cfg,
                    HostSlice::from_mut_slice(&mut intermediate),
                )
                .unwrap();

                // Y-방향 FFT
                cfg.batch_size = self.x_size as i32;
                cfg.columns_batch = false;
                println!(
                    "🧮 CPU NTT Y-direction: batch_size={}, columns_batch=false",
                    cfg.batch_size
                );
                ntt::ntt_inplace(
                    HostSlice::from_mut_slice(&mut intermediate),
                    ntt::NTTDir::kForward,
                    &cfg,
                )
                .unwrap();
            }

            ntt::release_domain::<Self::Field>().unwrap();
            println!("✅ CPU NTT completed");
            intermediate
        };

        // ─── 4단계: 원래 디바이스로 복원 ───────────────────────────────────────────────
        if let Ok(dev) = current_device.as_ref() {
            icicle_runtime::set_device(dev).unwrap();
            println!("🔙 Restored to GPU device: {:?}", current_device);
        }

        // ─── 5단계: 최종 결과를 `evals`(HostSlice 또는 DeviceSlice)에 복사 ──────────────
        //
        // 만약 `evals`가 실제로 HostSlice라면, 아래 copy 과정 또한 자동으로 “호스트 복사” 경로를 통해
        // HostSlice에 데이터를 채워 넣습니다. 반대로 `evals`가 DeviceSlice라면 GPU로 안전히 전송됩니다.
        self.safe_host_to_device_copy(&final_result, evals);

        println!("✅ Safe CPU fallback completed successfully");
        println!(
            " final_result.len() = {}, evals.len() = {}",
            final_result.len(),
            evals.len()
        );
    }
    
    fn safe_host_to_device_copy<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        &self,
        host_data: &[Self::Field],  // 길이가 N
        device_evals: &mut S,       // 길이가 동일한 HostOrDeviceSlice
    ) {
        let size = host_data.len();
        assert_eq!(
            device_evals.len(),
            size,
            "safe_host_to_device_copy: device_evals.len={} vs host_data.len={}",
            device_evals.len(),
            size
        );

        // 1) 임시 DeviceVec을 size 길이만큼 할당 (실제로 GPU 메모리나 DeviceSlice 메모리)
        let mut temp_device = DeviceVec::<Self::Field>::device_malloc(size)
            .expect("DeviceVec 할당 실패");

        // 2) 호스트 데이터를 한 번 “temp_device”로 복사
        temp_device
            .copy_from_host(HostSlice::from_slice(host_data))
            .unwrap();

        // 3) “도메인 크기 1짜리 NTT”용으로 초기화
        //    → get_root_of_unity::<Field>(1) 을 써서 길이 1짜리 도메인을 만든다
        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(1), // 도메인 크기 = 1
            &ntt::NTTInitDomainConfig::default(),
        )
        .unwrap();

        // 4) batch_size = size, columns_batch = true 로 설정하면,
        //    “길이 1 NTT”를 size번 반복해서 수행하는 꼴이 된다.
        let mut cfg = ntt::NTTConfig::<Self::Field>::default();
        cfg.batch_size = size as i32;
        cfg.columns_batch = false;

        // 5) 이 identity NTT를 통해 temp_device → device_evals에 복사한다
        //
        //    - 만약 `device_evals`가 GPU(DeviceSlice)라면, GPU 상에서 “길이 1짜리 NTT”를
        //      size번 돌려서 각 요소를 그대로 복사해 준다. (실제 계산량은 0)
        //
        //    - 만약 `device_evals`가 HostSlice라면, 내부적으로 ntt() 호출이 “호스트 경로”를
        //      타고 가서 최종적으로 HostSlice를 덮어쓰게 된다. (역시 계산량은 0)
        ntt::ntt(&temp_device, ntt::NTTDir::kForward, &cfg, device_evals)
            .unwrap();

        ntt::release_domain::<Self::Field>().unwrap();
        // temp_device는 scope를 벗어나면 drop → 메모리 해제
    }

    fn copy_result_to_evals_256<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        &self,
        final_result: &[Self::Field],
        original_size: usize,
        evals: &mut S
    ) {
        // DeviceVec을 통한 간접 복사
        let mut temp_device = DeviceVec::<Self::Field>::device_malloc(original_size).unwrap();
        temp_device.copy_from_host(HostSlice::from_slice(final_result)).unwrap();
        
        // identity 변환을 통해 evals에 복사
        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(original_size.try_into().unwrap()),
            &ntt::NTTInitDomainConfig::default(),
        ).unwrap();
        
        let mut identity_cfg = ntt::NTTConfig::<Self::Field>::default();
        identity_cfg.batch_size = 1;
        identity_cfg.columns_batch = false;
        
        // "identity" NTT를 통한 복사
        ntt::ntt(&temp_device, ntt::NTTDir::kForward, &identity_cfg, evals).unwrap();
        
        ntt::release_domain::<Self::Field>().unwrap();
    }

    fn copy_evals_to_host<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        &self,
        evals: &S,
        buffer: &mut [Self::Field]
    ) {
        // HostOrDeviceSlice에서 데이터를 host로 복사하는 안전한 방법
        // DeviceVec을 중간 매개체로 사용
        let size = buffer.len();
        let mut temp_device = DeviceVec::<Self::Field>::device_malloc(size).unwrap();
        
        // evals에서 temp_device로 복사하는 identity NTT
        let mut identity_cfg = ntt::NTTConfig::<Self::Field>::default();
        identity_cfg.batch_size = 1;
        identity_cfg.columns_batch = false;
        
        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(size.try_into().unwrap()),
            &ntt::NTTInitDomainConfig::default(),
        ).unwrap();
        
        ntt::ntt(evals, ntt::NTTDir::kForward, &identity_cfg, &mut temp_device).unwrap();
        
        ntt::release_domain::<Self::Field>().unwrap();
        
        // temp_device에서 host buffer로 복사
        temp_device.copy_to_host(HostSlice::from_mut_slice(buffer)).unwrap();
    }
    

    fn calculate_safe_padding_to_256(original_x_size: usize, original_y_size: usize) -> (usize, usize) {
        let total_original = original_x_size * original_y_size;
        
        // ⭐ 1D 케이스는 1D 구조 유지하면서 패딩
        if original_x_size == 1 {
            // 1×N → 1×(더 큰 크기)로 패딩
            let safe_y_size = if original_y_size <= 64 {
                256  // 1×256
            } else if original_y_size <= 128 {
                512  // 1×512  
            } else if original_y_size <= 256 {
                1024 // 1×1024
            } else {
                original_y_size.next_power_of_two() * 4
            };
            
            println!("1D case: {}×{} → 1×{} (keeping 1D structure)", 
                     original_x_size, original_y_size, safe_y_size);
            return (1, safe_y_size);
        }
        
        // 2D 케이스만 2D 패딩 적용
        if total_original <= 512 {
            (32, 32)   // 1024 total
        } else if total_original <= 1024 {
            (64, 32)   // 2048 total
        } else {
            (64, 64)   // 4096 total
        }
    }
    
    fn is_problematic_combination(x_size: usize, y_size: usize) -> bool {
        let total = x_size * y_size;
        
        // 알려진 문제 조합들
        let problematic = [
            (4, 64),   // 256 total - 문제 발생 확인됨
            (64, 4),   // 256 total 
            (2, 128),  // 256 total
            (128, 2),  // 256 total
            (4, 32),   // 128 total
            (32, 4),   // 128 total
            (8, 16),   // 128 total
            (16, 8),   // 128 total
        ];
        
        for (prob_x, prob_y) in problematic.iter() {
            if x_size == *prob_x && y_size == *prob_y {
                return true;
            }
        }
        
        // 일반적인 안전 조건
        if total <= 128 || x_size == 1 || (x_size < 8 && y_size > 32) {
            return true;
        }
        
        false
    }

    fn to_rou_evals_with_padding_to_256<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        &self,
        coset_x: Option<&Self::Field>, 
        coset_y: Option<&Self::Field>, 
        evals: &mut S
    ) {
        let original_x_size = self.x_size;
        let original_y_size = self.y_size;
        let original_size = original_x_size * original_y_size;
        
        // 256으로 패딩할 때 항상 2D가 되도록 보장
        let (padded_x_size, padded_y_size) = Self::calculate_safe_padding_to_256(original_x_size, original_y_size);
        let padded_size = padded_x_size * padded_y_size; // = 256
        
        // 패딩된 계수 배열 준비
        let mut padded_coeffs = vec![Self::Field::zero(); padded_size];
        
        {
            let mut scaled_poly = self.clone();
            if let Some(factor) = coset_x {
                scaled_poly = scaled_poly.scale_coeffs_x(factor);
            }
            if let Some(factor) = coset_y {
                scaled_poly = scaled_poly.scale_coeffs_y(factor);
            }
            
            // 원본 데이터 가져오기
            let mut original_coeffs = vec![Self::Field::zero(); original_size];
            scaled_poly.copy_coeffs(0, HostSlice::from_mut_slice(&mut original_coeffs));
            
            // 1D → 2D 재배열 적용
            if original_x_size == 1 && padded_x_size == 1 {
                // ⭐ 1D → 1D 패딩 (구조 유지)
                for y in 0..original_y_size {
                    if y < padded_y_size {
                        padded_coeffs[y] = original_coeffs[y];  // 1D 인덱싱
                    }
                }
                // 나머지는 0으로 패딩 (이미 초기화됨)
                println!("1D→1D: {} elements → {} elements (padded)", 
                         original_y_size, padded_y_size);
            } else if original_x_size == 1 {
                // 1D → 2D factorization (기존 로직)
                for i in 0..original_y_size {
                    let target_x = i % padded_x_size;
                    let target_y = i / padded_x_size;
                    if target_y < padded_y_size {
                        padded_coeffs[target_y * padded_x_size + target_x] = original_coeffs[i];
                    }
                }
                println!("1D→2D proper: {} elements → {}×{} factorized", 
                         original_y_size, padded_x_size, padded_y_size);
            } else {
                // 2D → 2D (기존 로직)
                for y in 0..original_y_size.min(padded_y_size) {
                    for x in 0..original_x_size.min(padded_x_size) {
                        padded_coeffs[y * padded_x_size + x] = original_coeffs[y * original_x_size + x];
                    }
                }
            }
        }
        
        // 256 크기로 NTT 수행
        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(padded_size.try_into().unwrap()),
            &ntt::NTTInitDomainConfig::default(),
        ).unwrap();
        
        let mut cfg = ntt::NTTConfig::<Self::Field>::default();
        let padded_coeffs_slice = HostSlice::from_slice(&padded_coeffs);
        
        let mut padded_evals = DeviceVec::<Self::Field>::device_malloc(padded_size).unwrap();
        
        // X 방향 FFT - 패딩된 크기로 columns_batch=true 사용
        cfg.batch_size = original_y_size as i32;
        cfg.columns_batch = true;  // 이제 항상 x_size > 1이므로 안전
        println!("to_rou_evals evals_len {:?}, y_size {:?}, x_size {:?}", evals.len(), self.y_size, self.x_size);
        println!("to_rou_evals reshape evals_len {:?}, y_size {:?}, x_size {:?}", padded_coeffs_slice.len(), padded_y_size, padded_x_size);
        ntt::ntt(padded_coeffs_slice, ntt::NTTDir::kForward, &cfg, &mut padded_evals).unwrap();
        
        // Y 방향 FFT
        cfg.batch_size = padded_x_size as i32;
        cfg.columns_batch = false;
        ntt::ntt_inplace(&mut padded_evals, ntt::NTTDir::kForward, &cfg).unwrap();
        
        ntt::release_domain::<Self::Field>().unwrap();
        
        // 결과에서 원본 크기만 추출하여 evals에 복사
        let mut padded_result = vec![Self::Field::zero(); padded_size];
        padded_evals.copy_to_host(HostSlice::from_mut_slice(&mut padded_result)).unwrap();
        
        // 2D → 1D 역재배열 적용
        let mut final_result = vec![Self::Field::zero(); original_size];
        if original_x_size == 1 && padded_x_size == 1 {
            // ⭐ 1D → 1D 추출
            for y in 0..original_y_size {
                if y < padded_y_size {
                    final_result[y] = padded_result[y];  // 1D 인덱싱
                }
            }
            println!("1D→1D: {} elements extracted from {} elements", 
                     original_y_size, padded_y_size);
        } else if original_x_size == 1 {
            // 2D → 1D reverse factorization (기존 로직)
            for i in 0..original_y_size {
                let source_x = i % padded_x_size;
                let source_y = i / padded_x_size;
                if source_y < padded_y_size {
                    final_result[i] = padded_result[source_y * padded_x_size + source_x];
                }
            }
        } else {
            // 2D → 2D (기존 로직)
            for y in 0..original_y_size {
                for x in 0..original_x_size {
                    final_result[y * original_x_size + x] = padded_result[y * padded_x_size + x];
                }
            }
        }
        
        // ⭐ self를 통해 메서드 호출
        self.copy_result_to_evals_256(&final_result, original_size, evals);
    }
    
    fn from_rou_evals_with_padding_to_256<S: HostOrDeviceSlice<Self::Field> + ?Sized>(
        evals: &S,
        x_size: usize,
        y_size: usize,
        coset_x: Option<&Self::Field>, 
        coset_y: Option<&Self::Field>
    ) -> Self {
        let original_size = x_size * y_size;
        
        // ⭐ Y 크기를 유지하면서 안전한 패딩 크기 계산
        let (padded_x_size, padded_y_size) = Self::calculate_safe_padding_to_256(x_size, y_size);
        let padded_size = padded_x_size * padded_y_size;
        
        // 원본 evals를 패딩된 크기로 확장
        let mut padded_evals = vec![Self::Field::zero(); padded_size];
        
        // evals에서 host로 데이터 복사
        let mut temp_evals = vec![Self::Field::zero(); original_size];
        
        let temp_poly = DensePolynomialExt {
            poly: DensePolynomial::from_coeffs(HostSlice::from_slice(&vec![Self::Field::zero(); 1]), 1),
            x_degree: 0,
            y_degree: 0,
            x_size: 1,
            y_size: 1,
        };
        temp_poly.copy_evals_to_host(evals, &mut temp_evals);
        
        // ⭐ Y 크기 유지하면서 X 방향만 확장
        if x_size == 1 && padded_x_size == 1 {
            // 1D → 1D 패딩 (구조 유지)
            for y in 0..y_size {
                if y < padded_y_size {
                    padded_evals[y] = temp_evals[y];  // 1D 인덱싱
                }
            }
            // 나머지는 0으로 패딩 (이미 초기화됨)
            println!("1D→1D evals: {} elements → {} elements (padded)", y_size, padded_y_size);
        } else if x_size == 1 {
            // 1D → 2D factorization
            for i in 0..y_size {
                let target_x = i % padded_x_size;
                let target_y = i / padded_x_size;
                if target_y < padded_y_size {
                    padded_evals[target_y * padded_x_size + target_x] = temp_evals[i];
                }
            }
            println!("1D→2D evals: {} elements → {}×{} factorized", y_size, padded_x_size, padded_y_size);
        } else {
            // 2D → 2D 직접 복사
            for y in 0..y_size.min(padded_y_size) {
                for x in 0..x_size.min(padded_x_size) {
                    padded_evals[y * padded_x_size + x] = temp_evals[y * x_size + x];
                }
            }
            println!("2D→2D evals: {}×{} → {}×{}", x_size, y_size, padded_x_size, padded_y_size);
        }
            
        // 패딩된 크기로 IFFT 수행
        ntt::initialize_domain::<Self::Field>(
            ntt::get_root_of_unity::<Self::Field>(padded_size.try_into().unwrap()),
            &ntt::NTTInitDomainConfig::default(),
        ).unwrap();
    
        let mut coeffs = DeviceVec::<Self::Field>::device_malloc(padded_size).unwrap();
        let mut cfg = ntt::NTTConfig::<Self::Field>::default();
        
        cfg.batch_size = y_size as i32;
        cfg.columns_batch = true;
        println!("from_rou_evals evals_len {:?}, y_size {:?}, x_size {:?}", evals.len(), y_size, x_size);
        println!("from_rou_evals reshape evals_len {:?}, y_size {:?}, x_size {:?}", padded_evals.len(), padded_y_size, padded_x_size);
        println!("Y size preserved: {} → {} (same: {})", y_size, padded_y_size, y_size <= padded_y_size);
        
        ntt::ntt(HostSlice::from_slice(&padded_evals), ntt::NTTDir::kInverse, &cfg, &mut coeffs).unwrap();
        
        // Y 방향 IFFT
        cfg.batch_size = padded_x_size as i32;
        cfg.columns_batch = false;
        ntt::ntt_inplace(&mut coeffs, ntt::NTTDir::kInverse, &cfg).unwrap();
    
        ntt::release_domain::<Self::Field>().unwrap();
    
        // 결과에서 원본 크기만 추출
        let mut padded_coeffs = vec![Self::Field::zero(); padded_size];
        coeffs.copy_to_host(HostSlice::from_mut_slice(&mut padded_coeffs)).unwrap();
        
        let mut final_coeffs = vec![Self::Field::zero(); original_size];
        
        // ⭐ 수정된 역재배열 로직
        if x_size == 1 && padded_x_size == 1 {
            // 1D → 1D 추출
            for y in 0..y_size {
                if y < padded_y_size {
                    final_coeffs[y] = padded_coeffs[y];  // 1D 인덱싱
                }
            }
            println!("1D→1D coeffs: {} elements extracted from {} elements", y_size, padded_y_size);
        } else if x_size == 1 {
            // 2D → 1D reverse factorization
            for i in 0..y_size {
                let source_x = i % padded_x_size;
                let source_y = i / padded_x_size;
                if source_y < padded_y_size {
                    final_coeffs[i] = padded_coeffs[source_y * padded_x_size + source_x];
                }
            }
            println!("2D→1D coeffs: {}×{} factorized → {} elements", padded_x_size, padded_y_size, y_size);
        } else {
            // 2D → 2D 직접 복사
            for y in 0..y_size {
                for x in 0..x_size {
                    final_coeffs[y * x_size + x] = padded_coeffs[y * padded_x_size + x];
                }
            }
            println!("2D→2D coeffs: {}×{} → {}×{}", padded_x_size, padded_y_size, x_size, y_size);
        }
        let mut poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&final_coeffs), x_size, y_size);
    
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
        let (updated_x_degree, updated_y_degree) = self.find_degree();
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
        let (lhs_x_degree, lhs_y_degree) = self.find_degree();
        let (rhs_x_degree, rhs_y_degree) = rhs.find_degree();
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
        let target_x_size = (lhs_x_degree + rhs_x_degree + 1) as usize;
        let target_y_size = (lhs_y_degree + rhs_y_degree + 1) as usize;
        let mut lhs_ext = self.clone();
        lhs_ext.resize(target_x_size, target_y_size);
        let x_size = lhs_ext.x_size;
        let y_size = lhs_ext.y_size;
        let extended_size = x_size * y_size;
        let mut lhs_evals = DeviceVec::<Self::Field>::device_malloc(extended_size).unwrap();
        lhs_ext.to_rou_evals(None, None, &mut lhs_evals);
        drop(lhs_ext);
        let mut rhs_ext = rhs.clone();
        rhs_ext.resize(target_x_size, target_y_size);
        let mut rhs_evals = DeviceVec::<Self::Field>::device_malloc(extended_size).unwrap();
        rhs_ext.to_rou_evals(None, None, &mut rhs_evals);
        drop(rhs_ext);
        let cfg_vec_ops = VecOpsConfig::default();
        // Element-wise mult. of evaluations
        let mut out_evals = DeviceVec::<Self::Field>::device_malloc(extended_size).unwrap();
        ScalarCfg::mul(&lhs_evals, &rhs_evals, &mut out_evals, &cfg_vec_ops).unwrap();
        drop(lhs_evals);
        drop(rhs_evals);

        let mut res = DensePolynomialExt::from_rou_evals(&out_evals, x_size, y_size, None, None);
        res.optimize_size();
        return res
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

        let mut acc_block_eval = DeviceVec::<Self::Field>::device_malloc(c * n*d).unwrap();
        {
            let mut acc_block_vec = vec![Self::Field::zero(); c * n*d];
            let acc_block = HostSlice::from_mut_slice(&mut acc_block_vec);
            {
                let block = vec![Self::Field::zero(); c * n*d];
                let mut blocks = vec![block; m];
                self._slice_coeffs_into_blocks(m,1, &mut blocks);
                // Computing A' (accumulation of blocks of the numerator)
                
                for i in 0..m {
                    Self::FieldConfig::accumulate(
                        acc_block, 
                        HostSlice::from_slice(&blocks[i]), 
                        &vec_ops_cfg
                    ).unwrap();
                }
            }
            let acc_block_poly = DensePolynomialExt::from_coeffs(acc_block, c, n*d);
            // Computing R_tilde (eval of A' on rou-X and coset-Y)
        
            acc_block_poly.to_rou_evals(None, Some(&xi), &mut acc_block_eval);
        }
        
        // Computing Q_Y_tilde (eval of quo_y on rou-X and coset-Y)
        let quo_y = {
            let mut quo_y_tilde = DeviceVec::<Self::Field>::device_malloc(c * n*d).unwrap();
            {
                let mut denom = DeviceVec::<Self::Field>::device_malloc(c * n*d).unwrap();
                {
                    let mut t_d_coeffs = vec![ScalarField::zero(); 2*d];
                    t_d_coeffs[0] = ScalarField::zero() - ScalarField::one();
                    t_d_coeffs[d] = ScalarField::one();
                    let mut t_d = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_d_coeffs), 1, 2*d); 
                    t_d.resize(c, n*d);
                    t_d.to_rou_evals(None, Some(&xi), &mut denom);
                }
                Self::FieldConfig::div(&acc_block_eval, &denom, &mut quo_y_tilde, &vec_ops_cfg).unwrap();
            }
            // Computing Q_Y
            DensePolynomialExt::from_rou_evals(&quo_y_tilde, c, n*d, None, Some(&xi))
        };

        // Computing Q_X
        let quo_x = {
            // Computing Q_X_tilde (eval of quo_x on coset-X and extended-rou-Y)
            let mut quo_x_tilde = DeviceVec::<Self::Field>::device_malloc(m*c * n*d).unwrap();
            {
                let mut b_tilde = DeviceVec::<Self::Field>::device_malloc(m*c * n*d).unwrap();
                {
                    // Computing R = quo_y * t_d
                    let r = &quo_y.mul_monomial(0, d) - &quo_y;
                    // Computing B
                    let mut b = &*self - &r;
                    drop(r);
                    b.resize(m*c, n*d);
                    // Computinb B_tilde (eval of B on coset-X and extended-rou-Y)
                    
                    b.to_rou_evals(Some(&zeta), None, &mut b_tilde);
                }
                let mut denom = DeviceVec::<Self::Field>::device_malloc(m*c * n*d).unwrap();
                {
                    let mut t_c_coeffs = vec![ScalarField::zero(); 2*c];
                    t_c_coeffs[0] = ScalarField::zero() - ScalarField::one();
                    t_c_coeffs[c] = ScalarField::one();
                    let mut t_c = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_c_coeffs), 2*c, 1);
                    t_c.resize(m*c, n*d);
                    t_c.to_rou_evals(Some(&zeta), None, &mut denom);
                }
                Self::FieldConfig::div(&b_tilde, &denom, &mut quo_x_tilde, &vec_ops_cfg).unwrap();
            }
            DensePolynomialExt::from_rou_evals(&quo_x_tilde, m*c, n*d, Some(&zeta), None)
        };
        return (quo_x, quo_y)

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

