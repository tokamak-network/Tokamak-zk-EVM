//! P13.5 isolated per-invocation memory experiments, including construction.
//! Usage: commitment_memory_benchmark TAU_FILE COUNT TRIALS
use ark_bls12_381::{Fq, Fr, G1Affine};
use ark_ff::PrimeField;
use backend_univariate_crs_interface::{archive, TauSequenceRkyv, UnivariateG1Rkyv};
use rayon::prelude::*;
use std::{hint::black_box, ops::Range, time::Instant};

fn decode(records: &[UnivariateG1Rkyv]) -> Vec<G1Affine> {
    records
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
        .collect()
}

fn gather(
    records: &[UnivariateG1Rkyv],
    scalars: &[Fr],
    ranges: &[Range<usize>],
    reuse: bool,
    check: bool,
) {
    let mut points = Vec::new();
    let mut values = Vec::new();
    for r in ranges {
        if !reuse {
            points = Vec::new();
            values = Vec::new();
        }
        points.clear();
        values.clear();
        points.extend_from_slice(&records[r.clone()]);
        values.extend_from_slice(&scalars[r.clone()]);
        black_box((&points, &values));
        if check {
            assert_eq!(points, &records[r.clone()]);
            assert_eq!(values, &scalars[r.clone()]);
        }
    }
}

fn cached_decode(records: &[UnivariateG1Rkyv], ranges: &[Range<usize>], cached: bool, check: bool) {
    let mut cache: Vec<(Range<usize>, Vec<G1Affine>)> = Vec::new();
    for r in ranges {
        let output = if cached {
            if let Some((range, points)) = cache
                .iter()
                .find(|(range, _)| range.start <= r.start && range.end >= r.end)
            {
                points[r.start - range.start..r.end - range.start].to_vec()
            } else {
                let points = decode(&records[r.clone()]);
                let output = points.clone();
                cache.push((r.clone(), points));
                output
            }
        } else {
            decode(&records[r.clone()])
        };
        black_box(&output);
        if check {
            assert_eq!(output, decode(&records[r.clone()]));
        }
    }
}

fn main() {
    assert!(!cfg!(debug_assertions));
    let args: Vec<_> = std::env::args().skip(1).collect();
    assert_eq!(args.len(), 3, "TAU_FILE COUNT TRIALS");
    let n: usize = args[1].parse().unwrap();
    let trials: usize = args[2].parse().unwrap();
    let tau = archive::from_bytes::<TauSequenceRkyv, archive::rancor::Error>(
        &std::fs::read(&args[0]).unwrap(),
    )
    .unwrap();
    let records: Vec<_> = tau
        .sxi_g1
        .iter()
        .chain(&tau.spsi_g1)
        .take(3 * n)
        .copied()
        .collect();
    assert_eq!(records.len(), 3 * n);
    let scalars = vec![Fr::from(17u64); records.len()];
    let cases = [
        ("reuse", vec![0..n, 0..n - 1, 0..n - 2, 0..n / 2]),
        ("shifted", vec![0..n, n..2 * n, 0..n - 1, n..2 * n - 1]),
        ("overlap", vec![0..n, n / 2..n + n / 2, 0..n - 1]),
        ("disjoint", vec![0..n, n..2 * n, 2 * n..3 * n]),
    ];
    for (case, ranges) in cases {
        for candidate in [false, true] {
            gather(&records, &scalars, &ranges, candidate, true);
            cached_decode(&records, &ranges, candidate, true);
        }
        for experiment in ["gather", "decode-cache"] {
            for trial in 0..=trials {
                for offset in 0..2 {
                    let candidate = (trial + offset) % 2 == 0;
                    let start = Instant::now();
                    if experiment == "gather" {
                        gather(&records, &scalars, &ranges, candidate, false)
                    } else {
                        cached_decode(&records, &ranges, candidate, false)
                    };
                    println!(
                        "{}",
                        serde_json::json!({"experiment":experiment,"case":case,"n":n,"trial":trial,"candidate":candidate,"seconds":start.elapsed().as_secs_f64(),"equal":true,"threads":rayon::current_num_threads()})
                    );
                }
            }
        }
    }
}
