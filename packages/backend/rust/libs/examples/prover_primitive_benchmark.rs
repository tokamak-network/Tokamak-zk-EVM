//! CPU-only, release-only operation comparisons; does not change prover dispatch.
//! Usage: prover_primitive_benchmark {msm|multiply|divide} TAU_FILE [trials]
use ark_bls12_381::{Fr, G1Affine as ArkPoint, G1Projective as ArkProjective};
use ark_ec::{CurveGroup, VariableBaseMSM};
use ark_ff::{BigInteger, PrimeField};
use ark_poly::{
    univariate::{DenseOrSparsePolynomial, DensePolynomial as ArkPoly},
    DenseUVPolynomial, EvaluationDomain, GeneralEvaluationDomain,
};
use backend_univariate_crs_interface::{archive, TauSequenceRkyv};
use icicle_bls12_381::{
    curve::{BaseField, G1Affine, G1Projective, ScalarField},
    polynomials::DensePolynomial,
};
use icicle_core::{
    msm::{msm, MSMConfig},
    polynomials::UnivariatePolynomial,
    traits::FieldImpl,
};
use icicle_runtime::memory::HostSlice;
use rayon::prelude::*;
use sha2::{Digest, Sha256};
use std::{hint::black_box, time::Instant};

fn ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.
}
fn to_ark(x: &ScalarField) -> Fr {
    Fr::from_le_bytes_mod_order(&x.to_bytes_le())
}
fn to_icicle(x: &Fr) -> ScalarField {
    ScalarField::from_bytes_le(&x.into_bigint().to_bytes_le())
}
fn values(n: usize, seed: u64) -> Vec<ScalarField> {
    (0..n)
        .map(|i| {
            let mut h = Sha256::new();
            h.update(seed.to_le_bytes());
            h.update((i as u64).to_le_bytes());
            to_icicle(&Fr::from_le_bytes_mod_order(&h.finalize()))
        })
        .collect()
}
fn poly(v: &[ScalarField]) -> DensePolynomial {
    DensePolynomial::from_coeffs(HostSlice::from_slice(v), v.len())
}
fn coeffs(p: &DensePolynomial) -> Vec<ScalarField> {
    let mut v = vec![ScalarField::zero(); (p.degree() + 1).max(1) as usize];
    p.copy_coeffs(0, HostSlice::from_mut_slice(&mut v));
    v
}
fn canonical(mut v: Vec<ScalarField>) -> Vec<ScalarField> {
    while v.last() == Some(&ScalarField::zero()) {
        v.pop();
    }
    v
}
fn ark_div(a: &ArkPoly<Fr>, b: &ArkPoly<Fr>) -> (ArkPoly<Fr>, ArkPoly<Fr>) {
    DenseOrSparsePolynomial::from(a)
        .divide_with_q_and_r(&DenseOrSparsePolynomial::from(b))
        .unwrap()
}

fn polynomials(operation: &str, a: Vec<ScalarField>, b: Vec<ScalarField>, n: usize, trials: usize) {
    let mut modes = vec!["icicle-api", "arkworks-api"];
    if operation == "divide-vanishing" {
        modes.push("icicle-field-linear");
    }
    let domain = (n > 0).then(|| GeneralEvaluationDomain::<Fr>::new(n).unwrap());
    let expected = {
        let aa = ArkPoly::from_coefficients_vec(a.iter().map(to_ark).collect());
        let bb = ArkPoly::from_coefficients_vec(b.iter().map(to_ark).collect());
        let (q, r) = if operation == "multiply" {
            (&aa * &bb, ArkPoly::from_coefficients_vec(vec![]))
        } else if let Some(d) = domain {
            aa.divide_by_vanishing_poly(d)
        } else {
            ark_div(&aa, &bb)
        };
        (
            canonical(q.coeffs.iter().map(to_icicle).collect()),
            canonical(r.coeffs.iter().map(to_icicle).collect()),
        )
    };
    // One warm-up per candidate, then rotated ordering with fresh input objects.
    for trial in 0..=trials {
        for offset in 0..modes.len() {
            let mode = modes[(trial + offset) % modes.len()];
            let start = Instant::now();
            let (q, r, prepare_ms, kernel_ms, output_ms) = if mode == "arkworks-api" {
                let aa = ArkPoly::from_coefficients_vec(a.par_iter().map(to_ark).collect());
                let bb = (n == 0)
                    .then(|| ArkPoly::from_coefficients_vec(b.par_iter().map(to_ark).collect()));
                let prepare = ms(start);
                let kernel = Instant::now();
                let (q, r) = if operation == "multiply" {
                    (
                        &aa * bb.as_ref().unwrap(),
                        ArkPoly::from_coefficients_vec(vec![]),
                    )
                } else if let Some(d) = domain {
                    aa.divide_by_vanishing_poly(d)
                } else {
                    ark_div(&aa, bb.as_ref().unwrap())
                };
                black_box((&q, &r));
                let kernel_ms = ms(kernel);
                let output = Instant::now();
                let qq = q.coeffs.par_iter().map(to_icicle).collect();
                let rr = r.coeffs.par_iter().map(to_icicle).collect();
                (qq, rr, prepare, kernel_ms, ms(output))
            } else if mode == "icicle-field-linear" {
                // Same coefficient recurrence as the native prover, including remainder output.
                let mut r = a.clone();
                let prepare = ms(start);
                let kernel = Instant::now();
                let mut q = vec![ScalarField::zero(); a.len() - n];
                for i in (n..r.len()).rev() {
                    let v = r[i];
                    q[i - n] = v;
                    r[i] = ScalarField::zero();
                    r[i - n] = r[i - n] + v;
                }
                r.truncate(n);
                black_box((&q, &r));
                (q, r, prepare, ms(kernel), 0.)
            } else {
                let aa = poly(&a);
                let bb = (n == 0).then(|| poly(&b));
                let prepare = ms(start);
                let kernel = Instant::now();
                let (q, r) = if operation == "multiply" {
                    (aa.mul(bb.as_ref().unwrap()), None)
                } else if operation == "divide-vanishing" {
                    (aa.div_by_vanishing(n as u64), None)
                } else {
                    let (q, r) = aa.divide(bb.as_ref().unwrap());
                    (q, Some(r))
                };
                // CPU calls are synchronous; coefficient materialization is measured separately.
                black_box(&q);
                let kernel_ms = ms(kernel);
                let output = Instant::now();
                let qq = coeffs(&q);
                let rr = r.as_ref().map(coeffs).unwrap_or_default();
                (qq, rr, prepare, kernel_ms, ms(output))
            };
            assert_eq!(
                canonical(q),
                expected.0,
                "{operation} {mode} quotient/product"
            );
            assert_eq!(canonical(r), expected.1, "{operation} {mode} remainder");
            println!(
                "{}",
                serde_json::json!({"operation":operation,"leftCoefficients":a.len(),"rightCoefficients":b.len(),
                "domain":n,"mode":mode,"trial":trial,"warmup":trial==0,"prepareMs":prepare_ms,"kernelMs":kernel_ms,
                "outputMs":output_ms,"totalMs":prepare_ms+kernel_ms+output_ms,"equal":true,
                "remainderReturned":operation!="divide-vanishing" || mode!="icicle-api"})
            );
        }
    }
}

fn msm_compare(path: &str, trials: usize) {
    let tau = archive::from_bytes::<TauSequenceRkyv, archive::rancor::Error>(
        &std::fs::read(path).unwrap(),
    )
    .unwrap();
    for n in [17, 256, 1024, 262146, 786438] {
        // Actual ordinary/xi/psi sequence prefixes, as combined commitments use them.
        let mut bases = Vec::with_capacity(n);
        for family in [&tau.s0_g1, &tau.sxi_g1, &tau.spsi_g1] {
            let take = (n - bases.len()).min(if n > 262146 { 262146 } else { n });
            bases.extend(family[..take].iter().map(|p| {
                G1Affine::from_limbs(
                    BaseField::from_bytes_le(&p.x).into(),
                    BaseField::from_bytes_le(&p.y).into(),
                )
            }));
            if bases.len() == n {
                break;
            }
        }
        assert_eq!(bases.len(), n);
        let mut scalars = values(n, 10);
        scalars[0] = ScalarField::zero();
        scalars[1] = ScalarField::one();
        scalars[2] = ScalarField::zero() - ScalarField::one();
        let mut expected: Option<ArkPoint> = None;
        for trial in 0..=trials {
            for offset in 0..2 {
                let ark = (trial + offset) % 2 == 1;
                let start = Instant::now();
                let (result, prepare, kernel, output) = if ark {
                    let points = bases
                        .par_iter()
                        .map(libs::group_structures::icicle_g1_affine_to_ark)
                        .collect::<Vec<_>>();
                    let s = scalars.par_iter().map(to_ark).collect::<Vec<_>>();
                    let prepare = ms(start);
                    let k = Instant::now();
                    let result = ArkProjective::msm(&points, &s).unwrap().into_affine();
                    let _ = black_box(result);
                    let kernel = ms(k);
                    (result, prepare, kernel, 0.)
                } else {
                    let prepare = ms(start);
                    let k = Instant::now();
                    let mut result = [G1Projective::zero()];
                    msm(
                        HostSlice::from_slice(&scalars),
                        HostSlice::from_slice(&bases),
                        &MSMConfig::default(),
                        HostSlice::from_mut_slice(&mut result),
                    )
                    .unwrap();
                    let affine = G1Affine::from(result[0]);
                    black_box(affine);
                    let kernel = ms(k);
                    let o = Instant::now();
                    let result = libs::group_structures::icicle_g1_affine_to_ark(&affine);
                    (result, prepare, kernel, ms(o))
                };
                if let Some(e) = expected {
                    assert_eq!(result, e);
                } else {
                    expected = Some(result);
                }
                println!(
                    "{}",
                    serde_json::json!({"operation":"msm-g1","count":n,"trial":trial,"warmup":trial==0,
                "mode":if ark {"arkworks-api"}else{"icicle-api"},"prepareMs":prepare,"kernelMs":kernel,"outputMs":output,
                "totalMs":prepare+kernel+output,"equal":true})
                );
            }
        }
    }
}

fn main() {
    assert!(!cfg!(debug_assertions), "use --release");
    libs::utils::try_check_device().unwrap();
    assert!(!libs::utils::cuda_msm_is_available(), "CPU comparison only");
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let trials = args.get(2).map_or(6, |s| s.parse::<usize>().unwrap());
    assert!(trials > 0);
    libs::ntt_domain::init_ntt_domain_for_size(1 << 22).unwrap();
    println!(
        "{}",
        serde_json::json!({"metadata":true,"trials":trials,"rayonThreads":rayon::current_num_threads(),
        "device":"ICICLE CPU","icicle":"3.8.0","arkworks":"0.5.0","arkParallel":true,"seed":"SHA256(seed-u64-le || index-u64-le) mod Fr","domainInitializationTimed":false})
    );
    match args.first().map(String::as_str) {
        Some("msm") => msm_compare(&args[1], trials),
        Some("multiply") => {
            for (a, b) in [
                (16, 16),
                (256, 256),
                (1024, 1024),
                (262146, 262146),
                (262148, 262144),
            ] {
                polynomials("multiply", values(a, 1), values(b, 2), 0, trials);
            }
        }
        Some("divide") => {
            for (a, b) in [(16, 8), (256, 128), (4096, 2048), (262148, 2)] {
                let mut divisor = values(b, 4);
                if b == 2 {
                    divisor[1] = ScalarField::one();
                }
                polynomials("divide-general", values(a, 3), divisor, 0, trials);
            }
            for n in [256, 1024, 262144] {
                for extra in [0, 3] {
                    let q = values(n + extra, 5);
                    let mut a = vec![ScalarField::zero(); q.len() + n];
                    for (i, v) in q.iter().enumerate() {
                        a[i] = a[i] - *v;
                        a[i + n] = a[i + n] + *v;
                    }
                    let mut b = vec![ScalarField::zero(); n + 1];
                    b[0] = ScalarField::zero() - ScalarField::one();
                    b[n] = ScalarField::one();
                    polynomials("divide-vanishing", a, b, n, trials);
                }
            }
        }
        _ => panic!("expected msm, multiply or divide, then TAU_FILE and optional trials"),
    }
}
