//! Compare CPU setup encoding, including table construction and affine output.
//! Arguments: point count, trials, then optional ICICLE factor:window pairs.
use ark_ec::{scalar_mul::BatchMulPreprocessing, AffineRepr};
use ark_ff::{BigInteger, PrimeField};
use icicle_bls12_381::curve::*;
use icicle_core::{
    curve::Curve,
    msm::{msm, precompute_bases, MSMConfig},
    traits::{FieldImpl, GenerateRandom},
};
use icicle_runtime::memory::{DeviceVec, HostSlice};
use rayon::prelude::*;
use std::time::Instant;

fn main() {
    assert!(!cfg!(debug_assertions), "use --release");
    libs::utils::try_check_device().unwrap();
    assert!(!libs::utils::cuda_msm_is_available(), "CPU experiment only");
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let count: usize = args.first().map_or(1024, |v| v.parse().unwrap());
    let trials: usize = args.get(1).map_or(3, |v| v.parse().unwrap());
    assert!(count >= 3 && trials > 0);
    let configs = if args.len() > 2 {
        args[2..]
            .iter()
            .map(|s| {
                let (factor, window) = s.split_once(':').expect("factor:window");
                (
                    factor.parse::<i32>().unwrap(),
                    window.parse::<i32>().unwrap(),
                )
            })
            .collect::<Vec<_>>()
    } else {
        vec![
            (1, 0),
            (2, 0),
            (4, 0),
            (8, 0),
            (16, 0),
            (32, 0),
            (4, 4),
            (4, 6),
            (4, 10),
            (16, 6),
            (32, 6),
        ]
    };
    assert!(configs.iter().all(|&(f, c)| f > 0 && (0..=16).contains(&c)));

    macro_rules! compare {
        ($name:literal, $curve:ty, $affine:ty, $projective:ty, $base:path, $bytes:literal, $encode_ark:expr) => {{
            let generator = <$curve>::generate_random_affine_points(1)[0];
            let mut scalars = ScalarCfg::generate_random(count);
            scalars[0] = ScalarField::zero();
            scalars[1] = ScalarField::one();
            scalars[2] = ScalarField::zero() - ScalarField::one();
            let encode = |p: $affine| -> ([u8; $bytes], [u8; $bytes]) {
                (p.x.to_bytes_le().try_into().unwrap(), p.y.to_bytes_le().try_into().unwrap())
            };
            let expected = scalars.par_iter()
                .map(|s| encode(<$affine>::from(generator.to_projective() * *s)))
                .collect::<Vec<_>>();
            for trial in 0..trials {
                // Rotate all candidates; never wrap an ICICLE bulk call in Rayon.
                for offset in 0..=configs.len() {
                    let mode = (offset + trial) % (configs.len() + 1);
                    let started = Instant::now();
                    let (points, precompute_ms, multiply_ms, affine_ms, factor, window) =
                        if mode == configs.len() {
                            let table = BatchMulPreprocessing::new($base(&generator).into_group(), 16384);
                            let precompute_ms = started.elapsed().as_secs_f64() * 1000.;
                            let multiply_started = Instant::now();
                            let mut points = vec![([0; $bytes], [0; $bytes]); count];
                            points.par_chunks_mut(1024).zip(scalars.par_chunks(1024))
                                .for_each(|(output, chunk)| {
                                    let values = chunk.iter()
                                        .map(|s| ark_bls12_381::Fr::from_le_bytes_mod_order(&s.to_bytes_le()))
                                        .collect::<Vec<_>>();
                                    for (slot, p) in output.iter_mut().zip(table.batch_mul(&values)) {
                                        *slot = ($encode_ark)(p);
                                    }
                                });
                            let multiply_ms = multiply_started.elapsed().as_secs_f64() * 1000.;
                            (points, precompute_ms, multiply_ms, None, None, None)
                        } else {
                            let (factor, window) = configs[mode];
                            let mut config = MSMConfig::default();
                            config.precompute_factor = factor;
                            config.c = window;
                            // The CPU device allocator is used by the public precompute API.
                            let mut bases = DeviceVec::<$affine>::device_malloc(factor as usize).unwrap();
                            precompute_bases(HostSlice::from_slice(&[generator]), &config, &mut bases).unwrap();
                            let precompute_ms = started.elapsed().as_secs_f64() * 1000.;
                            let multiply_started = Instant::now();
                            let mut projective = vec![<$projective>::zero(); count];
                            msm(HostSlice::from_slice(&scalars), &bases, &config,
                                HostSlice::from_mut_slice(&mut projective)).unwrap();
                            let multiply_ms = multiply_started.elapsed().as_secs_f64() * 1000.;
                            let affine_started = Instant::now();
                            let points = projective.into_par_iter()
                                .map(|p| encode(<$affine>::from(p))).collect::<Vec<_>>();
                            let affine_ms = affine_started.elapsed().as_secs_f64() * 1000.;
                            (points, precompute_ms, multiply_ms, Some(affine_ms), Some(factor), Some(window))
                        };
                    let total_ms = started.elapsed().as_secs_f64() * 1000.;
                    assert_eq!(points, expected, "{} trial={} config={:?}", $name, trial, (factor, window));
                    println!("{}", serde_json::json!({
                        "curve": $name, "count": count, "trial": trial,
                        "mode": if factor.is_some() { "icicle-precomputed" } else { "arkworks-fixed-base" },
                        "factor": factor, "window": window,
                        "precomputeMs": precompute_ms, "multiplyMs": multiply_ms,
                        "affineMs": affine_ms, "totalMs": total_ms, "equal": true,
                    }));
                }
            }
        }};
    }
    compare!(
        "G1",
        CurveCfg,
        G1Affine,
        G1Projective,
        libs::group_structures::icicle_g1_affine_to_ark,
        48,
        |p: ark_bls12_381::G1Affine| {
            if p.is_zero() {
                ([0; 48], [0; 48])
            } else {
                (
                    p.x.into_bigint().to_bytes_le().try_into().unwrap(),
                    p.y.into_bigint().to_bytes_le().try_into().unwrap(),
                )
            }
        }
    );
    compare!(
        "G2",
        G2CurveCfg,
        G2Affine,
        G2Projective,
        libs::group_structures::icicle_g2_affine_to_ark,
        96,
        |p: ark_bls12_381::G2Affine| {
            let bytes = |f: ark_bls12_381::Fq2| {
                let mut output = [0; 96];
                output[..48].copy_from_slice(&f.c0.into_bigint().to_bytes_le());
                output[48..].copy_from_slice(&f.c1.into_bigint().to_bytes_le());
                output
            };
            if p.is_zero() {
                ([0; 96], [0; 96])
            } else {
                (bytes(p.x), bytes(p.y))
            }
        }
    );
}
