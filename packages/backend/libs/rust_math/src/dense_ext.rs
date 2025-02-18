extern crate icicle_bls12_381;
extern crate icicle_core;
extern crate icicle_runtime;
use icicle_bls12_381::curve::ScalarField;
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_runtime::memory::DeviceSlice;
use std::{
    clone, cmp,
    ops::{Add, AddAssign, Div, Mul, Rem, Sub},
    ptr, slice,
};

use crate::bipolynomial::BivariatePolynomial;

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