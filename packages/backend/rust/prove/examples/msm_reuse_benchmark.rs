//! Independent CPU MSM experiment; not a production arithmetic implementation.
//! Usage: msm_reuse_benchmark TAU_FILE SOURCE COUNT REUSE TRIALS
//! SOURCE is xi, psi, or ordinary. Trial zero is a discarded warmup.
//! Measures base-only preprocessing plus sequential MSMs with distinct scalars.
use ark_bls12_381::{Fq, Fr, G1Affine, G1Projective};
use ark_ec::{AffineRepr, CurveGroup, VariableBaseMSM};
use ark_ff::{AdditiveGroup, PrimeField, UniformRand, Zero};
use backend_univariate_crs_interface::{archive, TauSequenceRkyv};
use rand::{rngs::StdRng, SeedableRng};
use rayon::prelude::*;
use std::time::Instant;

// P_j, [2^bits]P_j, ... remain independent of every proof scalar.
fn shifted_bases(bases: &[G1Affine], factor: usize, bits: usize) -> Vec<G1Affine> {
    let mut table = Vec::with_capacity(bases.len() * factor);
    table.extend_from_slice(bases);
    for part in 1..factor {
        let shifted: Vec<_> = table[(part - 1) * bases.len()..part * bases.len()]
            .par_iter()
            .map(|p| {
                let mut p = p.into_group();
                for _ in 0..bits {
                    p.double_in_place();
                }
                p
            })
            .collect();
        table.extend(G1Projective::normalize_batch(&shifted));
    }
    table
}

fn split_scalars(scalars: &[Fr], factor: usize, bits: usize) -> Vec<ark_ff::BigInt<4>> {
    (0..scalars.len() * factor)
        .into_par_iter()
        .map(|i| {
            let mut value = scalars[i % scalars.len()].into_bigint();
            value >>= ((i / scalars.len()) * bits) as u32;
            // Clear bits above the segment without assuming a limb boundary.
            for limb in 0..4 {
                let keep = bits.saturating_sub(limb * 64).min(64);
                value.0[limb] &= if keep == 64 {
                    u64::MAX
                } else {
                    (1u64 << keep) - 1
                };
            }
            value
        })
        .collect()
}

// Test-only unsigned-window Pippenger using arkworks group operations. Unlike
// the stock API, it accepts the reduced scalar bit length. Factor one is the
// control for this kernel: its speed difference is not preprocessing benefit.
fn bounded_msm(bases: &[G1Affine], scalars: &[ark_ff::BigInt<4>], bits: usize) -> G1Affine {
    assert_eq!(bases.len(), scalars.len());
    let window = if bases.len() < 32 {
        3
    } else {
        ((usize::BITS - (bases.len() - 1).leading_zeros()) as usize * 69 / 100) + 2
    };
    let starts: Vec<_> = (0..bits).step_by(window).collect();
    let sums: Vec<_> = starts
        .par_iter()
        .map(|&start| {
            let width = window.min(bits - start);
            let mut buckets = vec![G1Projective::zero(); (1usize << width) - 1];
            for (base, scalar) in bases.iter().zip(scalars) {
                let mut digit = *scalar;
                digit >>= start as u32;
                let digit = (digit.0[0] & ((1u64 << width) - 1)) as usize;
                if digit != 0 {
                    buckets[digit - 1] += base;
                }
            }
            let mut running = G1Projective::zero();
            let mut sum = G1Projective::zero();
            for bucket in buckets.iter().rev() {
                running += bucket;
                sum += running;
            }
            sum
        })
        .collect();
    let mut result = G1Projective::zero();
    for sum in sums.iter().rev() {
        for _ in 0..window {
            result.double_in_place();
        }
        result += sum;
    }
    result.into_affine()
}

fn edge_cases() {
    let mut rng = StdRng::seed_from_u64(731);
    let mut bases = (0..19)
        .map(|_| G1Projective::rand(&mut rng).into_affine())
        .collect::<Vec<_>>();
    bases[0] = G1Affine::identity();
    bases[2] = bases[1];
    let cases = [
        vec![Fr::zero(); 19],
        vec![Fr::from(1u64); 19],
        vec![-Fr::from(1u64); 19],
        (0..19).map(|_| Fr::rand(&mut rng)).collect(),
    ];
    for scalars in cases {
        let expected = G1Projective::msm(&bases, &scalars).unwrap().into_affine();
        for factor in [1, 2, 4] {
            let bits = (Fr::MODULUS_BIT_SIZE as usize).div_ceil(factor);
            let table = shifted_bases(&bases, factor, bits);
            let digits = split_scalars(&scalars, factor, bits);
            assert_eq!(bounded_msm(&table, &digits, bits), expected);
            assert_eq!(
                G1Projective::msm_bigint(&table, &digits).into_affine(),
                expected
            );
        }
    }
}

fn main() {
    assert!(!cfg!(debug_assertions), "use --release");
    edge_cases();
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    assert_eq!(args.len(), 5, "TAU_FILE SOURCE COUNT REUSE TRIALS");
    let count: usize = args[2].parse().unwrap();
    let reuse: usize = args[3].parse().unwrap();
    let trials: usize = args[4].parse().unwrap();
    assert!(count >= 3 && reuse > 0 && trials > 0);
    let tau = archive::from_bytes::<TauSequenceRkyv, archive::rancor::Error>(
        &std::fs::read(&args[0]).unwrap(),
    )
    .unwrap();
    let records = match args[1].as_str() {
        "xi" => &tau.sxi_g1,
        "psi" => &tau.spsi_g1,
        "ordinary" => &tau.s0_g1,
        _ => panic!("unsupported source"),
    };
    // Decoding is common to all variants and intentionally excluded.
    let bases: Vec<_> = records[..count]
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
    drop(tau);
    let mut rng = StdRng::seed_from_u64(0x746f6b616d616b);
    let inputs: Vec<Vec<Fr>> = (0..reuse)
        .map(|_| {
            let mut values: Vec<_> = (0..count).map(|_| Fr::rand(&mut rng)).collect();
            values[0] = Fr::zero();
            values[1] = Fr::from(1u64);
            values[2] = -Fr::from(1u64);
            values
        })
        .collect();
    let expected: Vec<_> = inputs
        .iter()
        .map(|s| G1Projective::msm(&bases, s).unwrap().into_affine())
        .collect();
    let variants = [
        ("stock", 1),
        ("bounded", 1),
        ("stock", 2),
        ("bounded", 2),
        ("stock", 4),
        ("bounded", 4),
    ];
    for trial in 0..=trials {
        for offset in 0..variants.len() {
            let (kernel, factor) = variants[(trial + offset) % variants.len()];
            eprintln!(
                "source={} count={count} trial={trial} kernel={kernel} factor={factor}",
                args[1]
            );
            let start = Instant::now();
            let bits = (Fr::MODULUS_BIT_SIZE as usize).div_ceil(factor);
            let table = (factor > 1).then(|| shifted_bases(&bases, factor, bits));
            let precompute_seconds = start.elapsed().as_secs_f64();
            let mut msm_seconds = Vec::new();
            let mut results = Vec::new();
            for scalars in &inputs {
                let msm_start = Instant::now();
                let result = if factor == 1 && kernel == "stock" {
                    G1Projective::msm(&bases, scalars).unwrap().into_affine()
                } else {
                    let digits = split_scalars(scalars, factor, bits);
                    let points = table.as_deref().unwrap_or(&bases);
                    if kernel == "stock" {
                        G1Projective::msm_bigint(points, &digits).into_affine()
                    } else {
                        bounded_msm(points, &digits, bits)
                    }
                };
                msm_seconds.push(msm_start.elapsed().as_secs_f64());
                results.push(result);
            }
            let total_seconds = start.elapsed().as_secs_f64();
            assert_eq!(results, expected);
            println!(
                "{}",
                serde_json::json!({"source":args[1],"count":count,"reuse":reuse,
                "trial":trial,"warmup":trial==0,"kernel":kernel,"factor":factor,"bits":bits,
                "precomputeSeconds":precompute_seconds,"msmSeconds":msm_seconds,"totalSeconds":total_seconds,
                "tableBytes":table.as_ref().map_or(0, |v| v.len()*std::mem::size_of::<G1Affine>()),
                "allPointsEqual":true,"edgeCasesPassed":true,"rayonThreads":rayon::current_num_threads()})
            );
        }
    }
}
