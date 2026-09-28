//! Concrete arithmetic choices for one shared proving schedule. Polynomials
//! retain their library-native types; only ingress/egress crosses byte boundaries.
use super::UnivariateProverError;
use backend_univariate_crs_interface::UnivariateG1Rkyv;
use libs::univariate_field::ProtocolField;

pub trait Engine {
    type F: ProtocolField;
    type P;
    fn initialize(size: usize) -> Result<(), UnivariateProverError>;
    fn polynomial(values: &[Self::F]) -> Self::P;
    fn coefficients(p: &Self::P) -> Vec<Self::F>;
    fn interpolate(values: &[Self::F], root: Self::F) -> Self::P;
    fn add(a: &Self::P, b: &Self::P) -> Self::P;
    fn sub(a: &Self::P, b: &Self::P) -> Self::P;
    fn mul(a: &Self::P, b: &Self::P) -> Self::P;
    fn scale(a: &Self::P, b: Self::F) -> Self::P;
    fn eval(a: &Self::P, z: Self::F) -> Self::F;
    fn divide_vanishing(
        p: &Self::P,
        n: usize,
        relation: &'static str,
    ) -> Result<Self::P, UnivariateProverError>;
    fn invert(values: &mut [Self::F]) -> Result<(), UnivariateProverError>;
    fn msm(
        bases: &[UnivariateG1Rkyv],
        scalars: &[Self::F],
    ) -> Result<[u8; 96], UnivariateProverError>;
    fn cofactor_sums(
        cofactors: &[Self::F],
        witness: &[Self::F],
        s: usize,
    ) -> Result<Vec<Self::F>, UnivariateProverError>;
}

pub struct Cpu;
pub struct Icicle;

impl Engine for Cpu {
    type F = ark_bls12_381::Fr;
    type P = ark_poly::univariate::DensePolynomial<Self::F>;
    fn initialize(_: usize) -> Result<(), UnivariateProverError> {
        Ok(())
    }
    fn polynomial(values: &[Self::F]) -> Self::P {
        use ark_poly::DenseUVPolynomial;
        Self::P::from_coefficients_slice(values)
    }
    fn coefficients(p: &Self::P) -> Vec<Self::F> {
        if p.coeffs.is_empty() {
            vec![Self::F::zero()]
        } else {
            p.coeffs.clone()
        }
    }
    fn interpolate(values: &[Self::F], root: Self::F) -> Self::P {
        use ark_poly::{EvaluationDomain, Radix2EvaluationDomain};
        let mut domain = Radix2EvaluationDomain::<Self::F>::new(values.len())
            .expect("validated radix-two domain");
        // Multiplication may use any compatible NTT root, but interpolation
        // must retain the protocol's ordered evaluation domain.
        domain.group_gen = root;
        domain.group_gen_inv = root.inv();
        Self::polynomial(&domain.ifft(values))
    }
    fn add(a: &Self::P, b: &Self::P) -> Self::P {
        a + b
    }
    fn sub(a: &Self::P, b: &Self::P) -> Self::P {
        a - b
    }
    fn mul(a: &Self::P, b: &Self::P) -> Self::P {
        a * b
    }
    fn scale(a: &Self::P, b: Self::F) -> Self::P {
        a * b
    }
    fn eval(a: &Self::P, z: Self::F) -> Self::F {
        use ark_poly::Polynomial;
        a.evaluate(&z)
    }
    fn divide_vanishing(
        p: &Self::P,
        n: usize,
        relation: &'static str,
    ) -> Result<Self::P, UnivariateProverError> {
        use ark_ff::Zero;
        use ark_poly::{EvaluationDomain, Radix2EvaluationDomain};
        let domain = Radix2EvaluationDomain::<Self::F>::new(n).expect("validated radix-two domain");
        let (q, r) = p.divide_by_vanishing_poly(domain);
        if !r.is_zero() {
            return Err(UnivariateProverError::Unsatisfied { relation });
        }
        Ok(q)
    }
    fn invert(values: &mut [Self::F]) -> Result<(), UnivariateProverError> {
        ark_ff::batch_inversion(values);
        Ok(())
    }
    fn msm(
        bases: &[UnivariateG1Rkyv],
        scalars: &[Self::F],
    ) -> Result<[u8; 96], UnivariateProverError> {
        use ark_bls12_381::{Fq, G1Affine};
        use ark_ec::AffineRepr;
        use ark_ff::{BigInteger, PrimeField};
        use rayon::prelude::*;
        if bases.len() != scalars.len() {
            return Err("MSM length mismatch".to_owned().into());
        }
        let selected = scalars.iter().any(|s| *s == Self::F::zero()).then(|| {
            let mut points = Vec::with_capacity(bases.len());
            let mut values = Vec::with_capacity(scalars.len());
            for (point, scalar) in bases.iter().zip(scalars) {
                if *scalar != Self::F::zero() {
                    points.push(*point);
                    values.push(*scalar);
                }
            }
            (points, values)
        });
        let (bases, scalars) = selected
            .as_ref()
            .map_or((bases, scalars), |(p, s)| (p.as_slice(), s.as_slice()));
        #[cfg(feature = "timing")]
        let decoding = crate::timing::SpanGuard::new("univariate.commit.decode", "prepare", vec![]);
        let points: Vec<_> = bases
            .par_iter()
            .map(|p| {
                if p.x == [0; 48] && p.y == [0; 48] {
                    G1Affine::identity()
                } else {
                    G1Affine::new_unchecked(
                        Fq::from_le_bytes_mod_order(&p.x),
                        Fq::from_le_bytes_mod_order(&p.y),
                    )
                }
            })
            .collect();
        #[cfg(feature = "timing")]
        drop(decoding);
        #[cfg(feature = "timing")]
        let _msm = crate::timing::SpanGuard::new(
            "univariate.msm",
            "msm",
            vec![crate::timing::SizeInfo {
                label: "bases",
                dims: vec![bases.len()],
            }],
        );
        let p = super::msm_kernel::msm(&points, scalars);
        let mut bytes = [0; 96];
        if !p.is_zero() {
            bytes[..48].copy_from_slice(&p.x.into_bigint().to_bytes_le());
            bytes[48..].copy_from_slice(&p.y.into_bigint().to_bytes_le());
        }
        Ok(bytes)
    }
    fn cofactor_sums(
        cofactors: &[Self::F],
        witness: &[Self::F],
        s: usize,
    ) -> Result<Vec<Self::F>, UnivariateProverError> {
        use rayon::prelude::*;
        let mut result = vec![Self::F::zero(); witness.len()];
        result
            .par_chunks_mut(s)
            .zip(witness.par_chunks(s))
            .for_each(|(out, values)| {
                for (value, row) in values.iter().zip(cofactors.chunks_exact(s)) {
                    if *value != Self::F::zero() {
                        for (q, basis) in out.iter_mut().zip(row) {
                            *q = *q + *value * *basis;
                        }
                    }
                }
            });
        Ok(result)
    }
}

impl Engine for Icicle {
    type F = icicle_bls12_381::curve::ScalarField;
    type P = icicle_bls12_381::polynomials::DensePolynomial;
    fn initialize(size: usize) -> Result<(), UnivariateProverError> {
        libs::ntt_domain::init_ntt_domain_for_size(size)
            .map_err(|e| format!("ICICLE NTT initialization failed: {e:?}").into())
    }
    fn polynomial(values: &[Self::F]) -> Self::P {
        use icicle_core::polynomials::UnivariatePolynomial;
        Self::P::from_coeffs(
            icicle_runtime::memory::HostSlice::from_slice(values),
            values.len(),
        )
    }
    fn coefficients(p: &Self::P) -> Vec<Self::F> {
        use icicle_core::polynomials::UnivariatePolynomial;
        let mut result = vec![Self::F::zero(); (p.degree() + 1).max(1) as usize];
        p.copy_coeffs(
            0,
            icicle_runtime::memory::HostSlice::from_mut_slice(&mut result),
        );
        result
    }
    fn interpolate(values: &[Self::F], root: Self::F) -> Self::P {
        use icicle_core::polynomials::UnivariatePolynomial;
        assert_eq!(
            root,
            icicle_core::ntt::get_root_of_unity::<Self::F>(values.len() as u64)
        );
        Self::P::from_rou_evals(
            icicle_runtime::memory::HostSlice::from_slice(values),
            values.len(),
        )
    }
    fn add(a: &Self::P, b: &Self::P) -> Self::P {
        use icicle_core::polynomials::UnivariatePolynomial;
        a.add(b)
    }
    fn sub(a: &Self::P, b: &Self::P) -> Self::P {
        use icicle_core::polynomials::UnivariatePolynomial;
        a.sub(b)
    }
    fn mul(a: &Self::P, b: &Self::P) -> Self::P {
        use icicle_core::polynomials::UnivariatePolynomial;
        a.mul(b)
    }
    fn scale(a: &Self::P, b: Self::F) -> Self::P {
        use icicle_core::polynomials::UnivariatePolynomial;
        a.mul_by_scalar(&b)
    }
    fn eval(a: &Self::P, z: Self::F) -> Self::F {
        use icicle_core::polynomials::UnivariatePolynomial;
        a.eval(&z)
    }
    fn divide_vanishing(
        p: &Self::P,
        n: usize,
        relation: &'static str,
    ) -> Result<Self::P, UnivariateProverError> {
        // ICICLE 3.8's specialized API rejects the blinded degree > 2*n.
        // Preserve the exact linear recurrence using ICICLE field arithmetic;
        // do not call an unsupported API and accept its empty output.
        let mut remainder = Self::coefficients(p);
        let mut quotient = vec![Self::F::zero(); remainder.len().saturating_sub(n).max(1)];
        for i in (n..remainder.len()).rev() {
            let v = remainder[i];
            quotient[i - n] = v;
            remainder[i] = Self::F::zero();
            remainder[i - n] = remainder[i - n] + v;
        }
        if remainder.iter().any(|v| *v != Self::F::zero()) {
            return Err(UnivariateProverError::Unsatisfied { relation });
        }
        Ok(Self::polynomial(&quotient))
    }
    fn invert(values: &mut [Self::F]) -> Result<(), UnivariateProverError> {
        use icicle_runtime::memory::HostSlice;
        let mut result = vec![Self::F::zero(); values.len()];
        icicle_core::vec_ops::inv_scalars(
            HostSlice::from_slice(values),
            HostSlice::from_mut_slice(&mut result),
            &icicle_core::vec_ops::VecOpsConfig::default(),
        )
        .map_err(|e| format!("ICICLE inversion failed: {e:?}"))?;
        values.copy_from_slice(&result);
        Ok(())
    }
    fn msm(
        bases: &[UnivariateG1Rkyv],
        scalars: &[Self::F],
    ) -> Result<[u8; 96], UnivariateProverError> {
        use icicle_core::traits::FieldImpl;
        let points: Vec<_> = bases.iter().map(crate::univariate_crs::point).collect();
        let point = crate::univariate_crs::msm_points(&points, scalars)?.0;
        let mut bytes = [0; 96];
        bytes[..48].copy_from_slice(&point.x.to_bytes_le());
        bytes[48..].copy_from_slice(&point.y.to_bytes_le());
        Ok(bytes)
    }
    fn cofactor_sums(
        cofactors: &[Self::F],
        witness: &[Self::F],
        s: usize,
    ) -> Result<Vec<Self::F>, UnivariateProverError> {
        use icicle_core::vec_ops::{mul_scalars, sum_scalars, VecOpsConfig};
        use icicle_runtime::memory::HostSlice;
        let mut result = vec![Self::F::zero(); witness.len()];
        // One wire at a time bounds temporary storage to s*s, not m*s*s.
        // All dot products for that wire are reduced in one ICICLE batch.
        // No arkworks arithmetic or outer Rayon wraps these provider calls.
        let mut weighted = vec![Self::F::zero(); s * s];
        let mut values = weighted.clone();
        let transposed: Vec<_> = (0..s)
            .flat_map(|a| (0..s).map(move |i| cofactors[i * s + a]))
            .collect();
        for (out, row) in result.chunks_mut(s).zip(witness.chunks_exact(s)) {
            if row.iter().all(|v| *v == Self::F::zero()) {
                continue;
            }
            for chunk in values.chunks_mut(s) {
                chunk.copy_from_slice(row);
            }
            mul_scalars(
                HostSlice::from_slice(&values),
                HostSlice::from_slice(&transposed),
                HostSlice::from_mut_slice(&mut weighted),
                &VecOpsConfig::default(),
            )
            .map_err(|e| format!("ICICLE cofactor multiplication failed: {e:?}"))?;
            sum_scalars(
                HostSlice::from_slice(&weighted),
                HostSlice::from_mut_slice(out),
                &VecOpsConfig::default(),
            )
            .map_err(|e| format!("ICICLE cofactor reduction failed: {e:?}"))?;
        }
        Ok(result)
    }
}
