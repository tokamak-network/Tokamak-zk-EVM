//! Only the operations needed to run one admission schedule on two native
//! arithmetic libraries. No dependency on the prover's execution pipeline.
use crate::PreprocessError;
use backend_univariate_crs_interface::{UnivariateG1Rkyv, UnivariateG2Rkyv};
use libs::univariate_field::ProtocolField;

pub(crate) trait Engine {
    type F: ProtocolField;
    type P;
    fn initialize(size: usize) -> Result<(), PreprocessError>;
    fn polynomial(values: &[Self::F]) -> Self::P;
    fn coefficients(p: &Self::P) -> Vec<Self::F>;
    fn interpolate(values: &[Self::F], root: Self::F) -> Self::P;
    fn mul(a: &Self::P, b: &Self::P) -> Self::P;
    fn divide_exact(a: &Self::P, b: &Self::P) -> Result<Self::P, PreprocessError>;
    fn msm_g1(bases: &[UnivariateG1Rkyv], scalars: &[Self::F])
        -> Result<[u8; 96], PreprocessError>;
    fn msm_g2(
        bases: &[UnivariateG2Rkyv],
        scalars: &[Self::F],
    ) -> Result<[u8; 192], PreprocessError>;
}

pub(crate) struct Cpu;
pub(crate) struct Icicle;

impl Engine for Cpu {
    type F = ark_bls12_381::Fr;
    type P = ark_poly::univariate::DensePolynomial<Self::F>;
    fn initialize(_: usize) -> Result<(), PreprocessError> {
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
        let mut domain =
            Radix2EvaluationDomain::<Self::F>::new(values.len()).expect("admitted domain");
        domain.group_gen = root;
        domain.group_gen_inv = root.inv();
        Self::polynomial(&domain.ifft(values))
    }
    fn mul(a: &Self::P, b: &Self::P) -> Self::P {
        a * b
    }
    fn divide_exact(a: &Self::P, b: &Self::P) -> Result<Self::P, PreprocessError> {
        use ark_ff::Zero;
        use ark_poly::univariate::DenseOrSparsePolynomial;
        let (q, r) = DenseOrSparsePolynomial::from(a)
            .divide_with_q_and_r(&DenseOrSparsePolynomial::from(b))
            .ok_or("zero selection divisor".to_owned())?;
        if !r.is_zero() {
            return Err("nonzero selection-division remainder".to_owned().into());
        }
        Ok(q)
    }
    fn msm_g1(
        bases: &[UnivariateG1Rkyv],
        scalars: &[Self::F],
    ) -> Result<[u8; 96], PreprocessError> {
        use ark_bls12_381::{Fq, G1Affine, G1Projective};
        use ark_ec::{AffineRepr, CurveGroup, VariableBaseMSM};
        use ark_ff::{BigInteger, PrimeField};
        use rayon::prelude::*;
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
        let p = G1Projective::msm(&points, scalars)
            .map_err(|_| "G1 MSM length mismatch".to_owned())?
            .into_affine();
        let mut bytes = [0; 96];
        if !p.is_zero() {
            bytes[..48].copy_from_slice(&p.x.into_bigint().to_bytes_le());
            bytes[48..].copy_from_slice(&p.y.into_bigint().to_bytes_le());
        }
        Ok(bytes)
    }
    fn msm_g2(
        bases: &[UnivariateG2Rkyv],
        scalars: &[Self::F],
    ) -> Result<[u8; 192], PreprocessError> {
        use ark_bls12_381::{Fq, Fq2, G2Affine, G2Projective};
        use ark_ec::{AffineRepr, CurveGroup, VariableBaseMSM};
        use ark_ff::{BigInteger, PrimeField};
        use rayon::prelude::*;
        let coordinate = |bytes: &[u8; 96]| {
            Fq2::new(
                Fq::from_le_bytes_mod_order(&bytes[..48]),
                Fq::from_le_bytes_mod_order(&bytes[48..]),
            )
        };
        let points: Vec<_> = bases
            .par_iter()
            .map(|p| {
                if p.x == [0; 96] && p.y == [0; 96] {
                    G2Affine::identity()
                } else {
                    G2Affine::new_unchecked(coordinate(&p.x), coordinate(&p.y))
                }
            })
            .collect();
        let p = G2Projective::msm(&points, scalars)
            .map_err(|_| "G2 MSM length mismatch".to_owned())?
            .into_affine();
        let mut bytes = [0; 192];
        if !p.is_zero() {
            for (out, value) in bytes
                .chunks_exact_mut(48)
                .zip([p.x.c0, p.x.c1, p.y.c0, p.y.c1])
            {
                out.copy_from_slice(&value.into_bigint().to_bytes_le());
            }
        }
        Ok(bytes)
    }
}

impl Engine for Icicle {
    type F = icicle_bls12_381::curve::ScalarField;
    type P = icicle_bls12_381::polynomials::DensePolynomial;
    fn initialize(size: usize) -> Result<(), PreprocessError> {
        libs::ntt_domain::init_ntt_domain_for_size(size)
            .map_err(|e| format!("ICICLE NTT initialization: {e:?}").into())
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
        let mut values = vec![Self::F::zero(); (p.degree() + 1).max(1) as usize];
        p.copy_coeffs(
            0,
            icicle_runtime::memory::HostSlice::from_mut_slice(&mut values),
        );
        values
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
    fn mul(a: &Self::P, b: &Self::P) -> Self::P {
        use icicle_core::polynomials::UnivariatePolynomial;
        a.mul(b)
    }
    fn divide_exact(a: &Self::P, b: &Self::P) -> Result<Self::P, PreprocessError> {
        use icicle_core::polynomials::UnivariatePolynomial;
        let (q, r) = a.divide(b);
        if Self::coefficients(&r).iter().any(|v| *v != Self::F::zero()) {
            return Err("nonzero selection-division remainder".to_owned().into());
        }
        Ok(q)
    }
    fn msm_g1(
        bases: &[UnivariateG1Rkyv],
        scalars: &[Self::F],
    ) -> Result<[u8; 96], PreprocessError> {
        use icicle_bls12_381::curve::{BaseField, G1Affine, G1Projective};
        use icicle_core::{
            msm::{msm, MSMConfig},
            traits::FieldImpl,
        };
        use icicle_runtime::memory::HostSlice;
        if bases.len() != scalars.len() {
            return Err("G1 MSM length mismatch".to_owned().into());
        }
        if bases.is_empty() {
            return Ok([0; 96]);
        }
        let points: Vec<_> = bases
            .iter()
            .map(|p| {
                G1Affine::from_limbs(
                    BaseField::from_bytes_le(&p.x).into(),
                    BaseField::from_bytes_le(&p.y).into(),
                )
            })
            .collect();
        let mut output = [G1Projective::zero()];
        msm(
            HostSlice::from_slice(scalars),
            HostSlice::from_slice(&points),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut output),
        )
        .map_err(|e| format!("ICICLE G1 MSM: {e:?}"))?;
        let p = G1Affine::from(output[0]);
        let mut bytes = [0; 96];
        bytes[..48].copy_from_slice(&p.x.to_bytes_le());
        bytes[48..].copy_from_slice(&p.y.to_bytes_le());
        Ok(bytes)
    }
    fn msm_g2(
        bases: &[UnivariateG2Rkyv],
        scalars: &[Self::F],
    ) -> Result<[u8; 192], PreprocessError> {
        use icicle_bls12_381::curve::{G2Affine, G2BaseField, G2Projective};
        use icicle_core::{
            msm::{msm, MSMConfig},
            traits::FieldImpl,
        };
        use icicle_runtime::memory::HostSlice;
        if bases.len() != scalars.len() {
            return Err("G2 MSM length mismatch".to_owned().into());
        }
        if bases.is_empty() {
            return Ok([0; 192]);
        }
        let points: Vec<_> = bases
            .iter()
            .map(|p| {
                G2Affine::from_limbs(
                    G2BaseField::from_bytes_le(&p.x).into(),
                    G2BaseField::from_bytes_le(&p.y).into(),
                )
            })
            .collect();
        let mut output = [G2Projective::zero()];
        msm(
            HostSlice::from_slice(scalars),
            HostSlice::from_slice(&points),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut output),
        )
        .map_err(|e| format!("ICICLE G2 MSM: {e:?}"))?;
        let p = G2Affine::from(output[0]);
        let mut bytes = [0; 192];
        bytes[..96].copy_from_slice(&p.x.to_bytes_le());
        bytes[96..].copy_from_slice(&p.y.to_bytes_le());
        Ok(bytes)
    }
}
