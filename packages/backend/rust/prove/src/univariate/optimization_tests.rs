//! Independent, release-only P13 experiments. No production randomizers are fixed.
use super::*;
use engine::{Cpu, Icicle};
use std::time::Instant;

fn boundary_candidate<E: Engine>(r: &E::P, n: usize) -> Result<E::P, UnivariateProverError> {
    boundary_quotient::<E>(r, n)
}

fn boundary_control<E: Engine>(r: &E::P, n: usize) -> Result<E::P, UnivariateProverError> {
    let l0 = E::polynomial(&vec![E::F::from_usize(n).inv(); n]);
    E::divide_vanishing(
        &E::mul(&E::sub(r, &E::polynomial(&[E::F::one()])), &l0),
        n,
        "copy boundary",
    )
}

#[test]
fn boundary_equivalence_and_invalid_remainders() {
    fn check<E: Engine>() {
        E::initialize(1024).unwrap();
        for n in [1, 2, 4, 16, 64] {
            for extra in [0, 1, 4] {
                let mut c: Vec<_> = (0..n + extra).map(|i| E::F::from_usize(i + 3)).collect();
                c[0] = E::F::one() - c[1..].iter().fold(E::F::zero(), |a, b| a + *b);
                let r = E::polynomial(&c);
                assert_eq!(
                    E::coefficients(&boundary_candidate::<E>(&r, n).unwrap()),
                    E::coefficients(&boundary_control::<E>(&r, n).unwrap())
                );
                c[0] = c[0] + E::F::one();
                let invalid = E::polynomial(&c);
                assert!(boundary_candidate::<E>(&invalid, n).is_err());
                assert!(boundary_control::<E>(&invalid, n).is_err());
            }
            let constant = E::polynomial(&[E::F::one()]);
            assert_eq!(
                E::coefficients(&boundary_candidate::<E>(&constant, n).unwrap()),
                vec![E::F::zero()]
            );
        }
    }
    check::<Cpu>();
    check::<Icicle>();
}

#[test]
#[ignore = "release-only P13.2 full-domain experiment"]
fn benchmark_boundary() {
    assert!(!cfg!(debug_assertions));
    use ark_bls12_381::Fr;
    use ark_ff::UniformRand;
    use rand::{rngs::StdRng, SeedableRng};
    let mut rng = StdRng::seed_from_u64(132);
    for n in [64, 262144] {
        let mut c: Vec<_> = (0..n + 4).map(|_| Fr::rand(&mut rng)).collect();
        c[0] = Fr::one() - c[1..].iter().copied().fold(Fr::zero(), |a, b| a + b);
        let r = Cpu::polynomial(&c);
        let expected = boundary_control::<Cpu>(&r, n).unwrap();
        for trial in 0..=5 {
            for offset in 0..2 {
                let candidate = (trial + offset) % 2 == 0;
                let start = Instant::now();
                let result = if candidate {
                    boundary_candidate::<Cpu>(&r, n)
                } else {
                    boundary_control::<Cpu>(&r, n)
                }
                .unwrap();
                let seconds = start.elapsed().as_secs_f64();
                assert_eq!(result, expected);
                println!(
                    "P13 {}",
                    serde_json::json!({"experiment":"boundary", "n":n,"trial":trial,"candidate":candidate,"seconds":seconds,"equal":true})
                );
            }
        }
    }
}

fn unfiltered_msm(
    bases: &[UnivariateG1Rkyv],
    scalars: &[ark_bls12_381::Fr],
) -> Result<[u8; 96], UnivariateProverError> {
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
        .map_err(|_| "MSM length mismatch".to_owned())?
        .into_affine();
    let mut bytes = [0; 96];
    if !p.is_zero() {
        bytes[..48].copy_from_slice(&p.x.into_bigint().to_bytes_le());
        bytes[48..].copy_from_slice(&p.y.into_bigint().to_bytes_le());
    }
    Ok(bytes)
}

fn filtered_msm(
    bases: &[UnivariateG1Rkyv],
    scalars: &[ark_bls12_381::Fr],
) -> Result<[u8; 96], UnivariateProverError> {
    if bases.len() != scalars.len() {
        return Err("MSM length mismatch".to_owned().into());
    }
    if scalars.iter().all(|v| *v != ark_bls12_381::Fr::zero()) {
        return unfiltered_msm(bases, scalars);
    }
    let mut selected = Vec::with_capacity(bases.len());
    let mut values = Vec::with_capacity(scalars.len());
    for (base, value) in bases.iter().zip(scalars) {
        if *value != ark_bls12_381::Fr::zero() {
            selected.push(*base);
            values.push(*value);
        }
    }
    unfiltered_msm(&selected, &values)
}

#[test]
fn zero_filter_preserves_msm_and_rejects_length_mismatch() {
    use ark_bls12_381::{Fr, G1Affine};
    use ark_ec::AffineRepr;
    use ark_ff::{BigInteger, PrimeField};
    let g = G1Affine::generator();
    let p = UnivariateG1Rkyv {
        x: g.x.into_bigint().to_bytes_le().try_into().unwrap(),
        y: g.y.into_bigint().to_bytes_le().try_into().unwrap(),
    };
    let zero = UnivariateG1Rkyv {
        x: [0; 48],
        y: [0; 48],
    };
    let bases = [zero, p, p, zero];
    for values in [
        [Fr::zero(); 4],
        [Fr::one(); 4],
        [-Fr::one(); 4],
        [Fr::one(), Fr::zero(), -Fr::one(), Fr::from_usize(3)],
    ] {
        assert_eq!(
            unfiltered_msm(&bases, &values).unwrap(),
            filtered_msm(&bases, &values).unwrap()
        );
        assert_eq!(
            unfiltered_msm(&bases, &values).unwrap(),
            Cpu::msm(&bases, &values).unwrap()
        );
    }
    assert_eq!(filtered_msm(&[], &[]).unwrap(), [0; 96]);
    assert!(filtered_msm(&bases, &[]).is_err());
}

#[test]
#[ignore = "release-only P13.3 experiment requiring PROVE_BENCH_TAU"]
fn benchmark_zero_filter() {
    assert!(!cfg!(debug_assertions));
    use ark_bls12_381::Fr;
    use ark_ff::UniformRand;
    use backend_univariate_crs_interface::{archive, TauSequenceRkyv};
    use rand::{rngs::StdRng, SeedableRng};
    let tau = archive::from_bytes::<TauSequenceRkyv, archive::rancor::Error>(
        &std::fs::read(std::env::var("PROVE_BENCH_TAU").unwrap()).unwrap(),
    )
    .unwrap();
    let mut rng = StdRng::seed_from_u64(133);
    for (n, nonzero) in [
        (64, 64),
        (64, 0),
        (78190, 30199),
        (262401, 261121),
        (524548, 524548),
    ] {
        let gathered: Vec<_> = tau
            .sxi_g1
            .iter()
            .chain(&tau.spsi_g1)
            .take(n)
            .copied()
            .collect();
        assert_eq!(gathered.len(), n);
        let bases = gathered.as_slice();
        let scalars: Vec<_> = (0..n)
            .map(|i| {
                if i * nonzero / n != (i + 1) * nonzero / n {
                    Fr::rand(&mut rng)
                } else {
                    Fr::zero()
                }
            })
            .collect();
        let expected = unfiltered_msm(bases, &scalars).unwrap();
        for trial in 0..=5 {
            for offset in 0..2 {
                let candidate = (trial + offset) % 2 == 0;
                let start = Instant::now();
                let output = if candidate {
                    filtered_msm(bases, &scalars)
                } else {
                    unfiltered_msm(bases, &scalars)
                }
                .unwrap();
                let seconds = start.elapsed().as_secs_f64();
                assert_eq!(output, expected);
                println!(
                    "P13 {}",
                    serde_json::json!({"experiment":"zero-filter","n":n,"nonzero":nonzero,"trial":trial,"candidate":candidate,"seconds":seconds,"equal":true})
                );
            }
        }
    }
}
