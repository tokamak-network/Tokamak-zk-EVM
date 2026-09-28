//! Test-only signed-window/half-bucket experiment. No production kernel override.
//! Usage: msm_window_benchmark TAU_FILE COUNT TRIALS
use ark_bls12_381::{Fq, Fr, G1Affine, G1Projective};
use ark_ec::{AffineRepr, CurveGroup, VariableBaseMSM};
use ark_ff::{AdditiveGroup, PrimeField, UniformRand, Zero};
use backend_univariate_crs_interface::{archive, TauSequenceRkyv};
use rand::{rngs::StdRng, SeedableRng};
use rayon::prelude::*;
use std::time::Instant;
#[path = "../src/univariate/msm_kernel.rs"]
mod selected_kernel;

fn signed_msm(
    bases: &[G1Affine],
    scalars: &[Fr],
    width: usize,
    transpose: bool,
) -> (G1Affine, f64, f64) {
    assert_eq!(bases.len(), scalars.len());
    let recode = Instant::now();
    let windows = (Fr::MODULUS_BIT_SIZE as usize).div_ceil(width);
    let mask = (1u64 << width) - 1;
    let mut digits: Vec<i32> = scalars
        .par_iter()
        .flat_map_iter(|s| {
            let mut b = s.into_bigint();
            let mut carry = 0;
            (0..windows).map(move |i| {
                let value = (b.0[0] & mask) + carry;
                b >>= width as u32;
                carry = (value + (1 << (width - 1))) >> width;
                if i + 1 == windows {
                    value as i32
                } else {
                    value as i32 - (carry << width) as i32
                }
            })
        })
        .collect();
    if transpose {
        digits = (0..windows * scalars.len())
            .into_par_iter()
            .map(|i| digits[(i % scalars.len()) * windows + i / scalars.len()])
            .collect();
    }
    let recode_seconds = recode.elapsed().as_secs_f64();
    let start = Instant::now();
    let sums: Vec<_> = (0..windows)
        .into_par_iter()
        .map(|w| {
            // Signed nonfinal windows need only half the unsigned bucket range.
            let size = if w + 1 == windows {
                1 << width
            } else {
                1 << (width - 1)
            };
            let mut buckets = vec![G1Projective::zero(); size];
            for (j, base) in bases.iter().enumerate() {
                let d = if transpose {
                    digits[w * bases.len() + j]
                } else {
                    digits[j * windows + w]
                };
                if d > 0 {
                    buckets[d as usize - 1] += base;
                }
                if d < 0 {
                    buckets[(-d) as usize - 1] -= base;
                }
            }
            let mut running = G1Projective::zero();
            let mut sum = G1Projective::zero();
            for bucket in buckets.into_iter().rev() {
                running += bucket;
                sum += running;
            }
            sum
        })
        .collect();
    let mut result = G1Projective::zero();
    for sum in sums.into_iter().rev() {
        for _ in 0..width {
            result.double_in_place();
        }
        result += sum;
    }
    (
        result.into_affine(),
        recode_seconds,
        start.elapsed().as_secs_f64(),
    )
}

fn main() {
    assert!(!cfg!(debug_assertions), "use --release");
    let args: Vec<_> = std::env::args().skip(1).collect();
    assert_eq!(args.len(), 3, "TAU_FILE COUNT TRIALS");
    let n: usize = args[1].parse().unwrap();
    let trials: usize = args[2].parse().unwrap();
    let mut rng = StdRng::seed_from_u64(134);
    let edge_bases = [
        G1Affine::identity(),
        G1Affine::generator(),
        G1Affine::generator(),
    ];
    for values in [
        [Fr::zero(); 3],
        [Fr::from(1u64); 3],
        [-Fr::from(1u64); 3],
        [Fr::rand(&mut rng), Fr::zero(), -Fr::from(1u64)],
    ] {
        let expected = G1Projective::msm(&edge_bases, &values)
            .unwrap()
            .into_affine();
        assert_eq!(selected_kernel::msm(&edge_bases, &values), expected);
        for w in [3, 12, 13, 14, 15, 16] {
            for transposed in [false, true] {
                assert_eq!(signed_msm(&edge_bases, &values, w, transposed).0, expected);
            }
        }
    }
    let tau = archive::from_bytes::<TauSequenceRkyv, archive::rancor::Error>(
        &std::fs::read(&args[0]).unwrap(),
    )
    .unwrap();
    let bases: Vec<_> = tau
        .sxi_g1
        .iter()
        .chain(&tau.spsi_g1)
        .take(n)
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
    assert_eq!(bases.len(), n);
    drop(tau);
    let width = if n < 32 {
        3
    } else {
        ((usize::BITS - (n - 1).leading_zeros()) as usize * 69 / 100) + 2
    };
    for nonzero in [n, n * 2 / 5] {
        let values: Vec<_> = (0..n)
            .map(|i| {
                if i < nonzero {
                    Fr::rand(&mut rng)
                } else {
                    Fr::zero()
                }
            })
            .collect();
        let expected = G1Projective::msm(&bases, &values).unwrap().into_affine();
        assert_eq!(selected_kernel::msm(&bases, &values), expected);
        let variants = [
            (0, false),
            (width - 1, false),
            (width, false),
            (width + 1, false),
            (width, true),
        ];
        for trial in 0..=trials {
            for offset in 0..variants.len() {
                let (w, transpose) = variants[(trial + offset) % variants.len()];
                let start = Instant::now();
                let (result, recode, buckets) = if w == 0 {
                    (
                        G1Projective::msm(&bases, &values).unwrap().into_affine(),
                        0.0,
                        0.0,
                    )
                } else {
                    signed_msm(&bases, &values, w, transpose)
                };
                let seconds = start.elapsed().as_secs_f64();
                assert_eq!(result, expected);
                println!(
                    "{}",
                    serde_json::json!({"n":n,"nonzero":nonzero,"trial":trial,"width":w,"transpose":transpose,"recodeSeconds":recode,"bucketSeconds":buckets,"seconds":seconds,"equal":true,"threads":rayon::current_num_threads()})
                );
            }
        }
    }
}
