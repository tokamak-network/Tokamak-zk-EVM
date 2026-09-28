//! Direct ICICLE-backed coefficient operations required by U24--U30.
//!
//! The type is univariate by construction.

use crate::ntt_domain::init_ntt_domain_for_size;
use crate::vector_operations::point_mul_two_vecs;
use icicle_bls12_381::curve::ScalarField;
use icicle_core::ntt::{self, NTTConfig, NTTDir};
use icicle_core::traits::FieldImpl;
use icicle_runtime::errors::eIcicleError;
use icicle_runtime::memory::HostSlice;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum UnivariatePolynomialError {
    #[error("polynomial coefficient vector must not be empty")]
    Empty,
    #[error("polynomial operation length overflow")]
    LengthOverflow,
    #[error("polynomial is not divisible by Z^{{domain_size}} - 1")]
    NonzeroVanishingRemainder,
    #[error("ICICLE NTT failed: {0:?}")]
    Ntt(eIcicleError),
}

/// Canonical coefficient representation with trailing zeroes removed.
#[derive(Clone, Debug, PartialEq)]
pub struct DenseUnivariatePolynomial {
    coefficients: Box<[ScalarField]>,
}

impl DenseUnivariatePolynomial {
    pub fn new(
        coefficients: impl Into<Box<[ScalarField]>>,
    ) -> Result<Self, UnivariatePolynomialError> {
        let mut coefficients = coefficients.into().into_vec();
        trim(&mut coefficients);
        if coefficients.is_empty() {
            return Err(UnivariatePolynomialError::Empty);
        }
        Ok(Self {
            coefficients: coefficients.into_boxed_slice(),
        })
    }

    pub fn zero() -> Self {
        Self {
            coefficients: vec![ScalarField::zero()].into_boxed_slice(),
        }
    }

    pub fn coefficients(&self) -> &[ScalarField] {
        &self.coefficients
    }

    pub fn degree(&self) -> usize {
        self.coefficients.len() - 1
    }

    pub fn evaluate(&self, point: ScalarField) -> ScalarField {
        self.coefficients
            .iter()
            .rev()
            .fold(ScalarField::zero(), |accumulator, coefficient| {
                accumulator * point + *coefficient
            })
    }

    pub fn add(&self, rhs: &Self) -> Self {
        let mut out =
            vec![ScalarField::zero(); self.coefficients.len().max(rhs.coefficients.len())];
        for (index, coefficient) in self.coefficients.iter().enumerate() {
            out[index] = out[index] + *coefficient;
        }
        for (index, coefficient) in rhs.coefficients.iter().enumerate() {
            out[index] = out[index] + *coefficient;
        }
        Self::new(out.into_boxed_slice()).expect("sum of nonempty polynomials is representable")
    }

    pub fn sub(&self, rhs: &Self) -> Self {
        let mut out =
            vec![ScalarField::zero(); self.coefficients.len().max(rhs.coefficients.len())];
        for (index, coefficient) in self.coefficients.iter().enumerate() {
            out[index] = out[index] + *coefficient;
        }
        for (index, coefficient) in rhs.coefficients.iter().enumerate() {
            out[index] = out[index] - *coefficient;
        }
        Self::new(out.into_boxed_slice())
            .expect("difference of nonempty polynomials is representable")
    }

    pub fn scale(&self, scalar: ScalarField) -> Self {
        let coefficients = self
            .coefficients
            .iter()
            .map(|coefficient| scalar * *coefficient)
            .collect::<Vec<_>>();
        Self::new(coefficients.into_boxed_slice()).expect("scaled polynomial is representable")
    }

    pub fn shift(&self, exponent: usize) -> Result<Self, UnivariatePolynomialError> {
        let length = self
            .coefficients
            .len()
            .checked_add(exponent)
            .ok_or(UnivariatePolynomialError::LengthOverflow)?;
        let mut coefficients = vec![ScalarField::zero(); length];
        coefficients[exponent..].copy_from_slice(&self.coefficients);
        Self::new(coefficients.into_boxed_slice())
    }

    /// Uses direct ICICLE NTTs and pointwise multiplication for nontrivial
    /// products.  Small products avoid transform setup overhead.
    pub fn multiply(&self, rhs: &Self) -> Result<Self, UnivariatePolynomialError> {
        let product_len = self
            .coefficients
            .len()
            .checked_add(rhs.coefficients.len())
            .and_then(|length| length.checked_sub(1))
            .ok_or(UnivariatePolynomialError::LengthOverflow)?;
        if product_len <= 64 {
            return Ok(Self::new(
                naive_product(&self.coefficients, &rhs.coefficients)?.into_boxed_slice(),
            )?);
        }
        let transform_size = product_len.next_power_of_two();
        init_ntt_domain_for_size(transform_size).map_err(UnivariatePolynomialError::Ntt)?;
        let mut left = vec![ScalarField::zero(); transform_size];
        let mut right = vec![ScalarField::zero(); transform_size];
        left[..self.coefficients.len()].copy_from_slice(&self.coefficients);
        right[..rhs.coefficients.len()].copy_from_slice(&rhs.coefficients);
        let mut left_evaluations = vec![ScalarField::zero(); transform_size];
        let mut right_evaluations = vec![ScalarField::zero(); transform_size];
        ntt::ntt(
            HostSlice::from_slice(&left),
            NTTDir::kForward,
            &NTTConfig::<ScalarField>::default(),
            HostSlice::from_mut_slice(&mut left_evaluations),
        )
        .map_err(UnivariatePolynomialError::Ntt)?;
        ntt::ntt(
            HostSlice::from_slice(&right),
            NTTDir::kForward,
            &NTTConfig::<ScalarField>::default(),
            HostSlice::from_mut_slice(&mut right_evaluations),
        )
        .map_err(UnivariatePolynomialError::Ntt)?;
        let mut product_evaluations = vec![ScalarField::zero(); transform_size];
        point_mul_two_vecs(
            &left_evaluations,
            &right_evaluations,
            &mut product_evaluations,
        );
        let mut coefficients = vec![ScalarField::zero(); transform_size];
        ntt::ntt(
            HostSlice::from_slice(&product_evaluations),
            NTTDir::kInverse,
            &NTTConfig::<ScalarField>::default(),
            HostSlice::from_mut_slice(&mut coefficients),
        )
        .map_err(UnivariatePolynomialError::Ntt)?;
        coefficients.truncate(product_len);
        Self::new(coefficients.into_boxed_slice())
    }

    pub fn multiply_vanishing(
        &self,
        domain_size: usize,
    ) -> Result<Self, UnivariatePolynomialError> {
        let shifted = self.shift(domain_size)?;
        Ok(shifted.sub(self))
    }

    /// Divides by `Z^domain_size - 1`, rejecting a nonzero remainder rather
    /// than hiding an invalid quotient relation.
    pub fn divide_vanishing_exact(
        &self,
        domain_size: usize,
    ) -> Result<Self, UnivariatePolynomialError> {
        if domain_size == 0 {
            return Err(UnivariatePolynomialError::LengthOverflow);
        }
        if self.coefficients.len() <= domain_size {
            return if self
                .coefficients
                .iter()
                .all(|value| *value == ScalarField::zero())
            {
                Ok(Self::zero())
            } else {
                Err(UnivariatePolynomialError::NonzeroVanishingRemainder)
            };
        }
        let mut remainder = self.coefficients.to_vec();
        let mut quotient = vec![ScalarField::zero(); remainder.len() - domain_size];
        for degree in (domain_size..remainder.len()).rev() {
            let factor = remainder[degree];
            quotient[degree - domain_size] = quotient[degree - domain_size] + factor;
            remainder[degree] = remainder[degree] - factor;
            remainder[degree - domain_size] = remainder[degree - domain_size] + factor;
        }
        if remainder[..domain_size]
            .iter()
            .any(|value| *value != ScalarField::zero())
        {
            return Err(UnivariatePolynomialError::NonzeroVanishingRemainder);
        }
        Self::new(quotient.into_boxed_slice())
    }

    /// Returns `(P(Z) - P(point)) / (Z - point)` and the exact evaluation.
    pub fn ruffini(&self, point: ScalarField) -> (Self, ScalarField) {
        if self.coefficients.len() == 1 {
            return (Self::zero(), self.coefficients[0]);
        }
        let mut quotient = vec![ScalarField::zero(); self.coefficients.len() - 1];
        let mut accumulator = *self.coefficients.last().expect("nonempty polynomial");
        for index in (0..quotient.len()).rev() {
            quotient[index] = accumulator;
            accumulator = self.coefficients[index] + accumulator * point;
        }
        (
            Self::new(quotient.into_boxed_slice()).expect("Ruffini quotient is nonempty"),
            accumulator,
        )
    }
}

fn naive_product(
    left: &[ScalarField],
    right: &[ScalarField],
) -> Result<Vec<ScalarField>, UnivariatePolynomialError> {
    let length = left
        .len()
        .checked_add(right.len())
        .and_then(|length| length.checked_sub(1))
        .ok_or(UnivariatePolynomialError::LengthOverflow)?;
    let mut result = vec![ScalarField::zero(); length];
    for (left_index, left_value) in left.iter().enumerate() {
        for (right_index, right_value) in right.iter().enumerate() {
            result[left_index + right_index] =
                result[left_index + right_index] + *left_value * *right_value;
        }
    }
    Ok(result)
}

fn trim(coefficients: &mut Vec<ScalarField>) {
    while coefficients.len() > 1 && coefficients.last() == Some(&ScalarField::zero()) {
        coefficients.pop();
    }
}

#[cfg(test)]
mod tests {
    use super::DenseUnivariatePolynomial;
    use icicle_bls12_381::curve::ScalarField;
    use icicle_core::traits::FieldImpl;

    fn polynomial(values: &[u32]) -> DenseUnivariatePolynomial {
        DenseUnivariatePolynomial::new(
            values
                .iter()
                .copied()
                .map(ScalarField::from_u32)
                .collect::<Vec<_>>()
                .into_boxed_slice(),
        )
        .unwrap()
    }

    #[test]
    fn direct_univariate_operations_preserve_exact_relations() {
        let left = polynomial(&[1, 2, 3]);
        let right = polynomial(&[4, 5]);
        let product = left.multiply(&right).unwrap();
        assert_eq!(
            product.coefficients(),
            &[
                ScalarField::from_u32(4),
                ScalarField::from_u32(13),
                ScalarField::from_u32(22),
                ScalarField::from_u32(15)
            ]
        );
        let vanishing_product = left.multiply_vanishing(4).unwrap();
        assert_eq!(vanishing_product.divide_vanishing_exact(4).unwrap(), left);
        let (quotient, value) = left.ruffini(ScalarField::from_u32(2));
        assert_eq!(value, ScalarField::from_u32(17));
        assert_eq!(
            quotient.coefficients(),
            &[ScalarField::from_u32(8), ScalarField::from_u32(3)]
        );
    }
}
