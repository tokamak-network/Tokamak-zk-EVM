//! Opt-in release-only arithmetic experiments. Never part of the operator API.
use ark_bls12_381::{Bls12_381, Fr, G1Affine, G2Affine};
use ark_ec::{pairing::Pairing, AffineRepr, CurveGroup};
use ark_ff::UniformRand;
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use rand::{rngs::StdRng, SeedableRng};
use rayon::prelude::*;
use serde_json::{json, Value};
use std::{hint::black_box, path::PathBuf, time::Instant};

fn save(name: &str, samples: Vec<Value>) {
    assert!(!cfg!(debug_assertions), "measure with --release");
    let dir = PathBuf::from(std::env::var_os("MPC_BENCH_DIR").expect("set MPC_BENCH_DIR"));
    let path = dir.join(format!("{name}.json"));
    let data = json!({
        "scope": "synthetic CPU kernels, not native E2E or live MPC",
        "arch": std::env::consts::ARCH,
        "rayonThreads": rayon::current_num_threads(),
        "warmupRounds": 1,
        "retainedRounds": 5,
        "samples": samples,
    });
    std::fs::write(&path, serde_json::to_vec_pretty(&data).unwrap()).unwrap();
    println!("samples: {}", path.display());
}

#[test]
fn allocation_layout() {
    use crate::phase2_pairing::PreparedG2;
    let prepared = PreparedG2::from(G2Affine::generator());
    println!(
        "allocation layout: {}",
        json!({
            "g1AffineBytes":std::mem::size_of::<G1Affine>(),
            "g1ProjectiveBytes":std::mem::size_of::<ark_bls12_381::G1Projective>(),
            "frBytes":std::mem::size_of::<Fr>(),
            "g2PreparedHeaderBytes":std::mem::size_of::<PreparedG2>(),
            "g2PreparedCoefficientsBytes":std::mem::size_of_val(prepared.ell_coeffs.as_slice()),
            "g2PreparedAllocatedCoefficientsBytes":prepared.ell_coeffs.capacity()*std::mem::size_of_val(&prepared.ell_coeffs[0]),
        })
    );
}

#[test]
#[ignore = "release comparison; set MPC_BENCH_DIR"]
fn pairing() {
    assert!(!cfg!(debug_assertions));
    type Prepared = <Bls12_381 as Pairing>::G2Prepared;
    let mut rng = StdRng::seed_from_u64(15182);
    let delta = Fr::rand(&mut rng);
    let weights = (0..1024).map(|_| Fr::rand(&mut rng)).collect::<Vec<_>>();
    let d = (G2Affine::generator() * delta).into_affine();
    let w = weights
        .par_iter()
        .map(|w| (G2Affine::generator() * w).into_affine())
        .collect::<Vec<_>>();
    let scalars = (0..32768).map(|_| Fr::rand(&mut rng)).collect::<Vec<_>>();
    let all_points = scalars
        .par_iter()
        .enumerate()
        .map(|(i, s)| {
            (
                (G1Affine::generator() * (*s * weights[i % 1024])).into_affine(),
                (G1Affine::generator() * (*s * delta)).into_affine(),
            )
        })
        .collect::<Vec<_>>();
    let mut samples = vec![];
    for count in [4096, 32768] {
        let points = &all_points[..count];
        for round in 0..6 {
            for slot in 0..4 {
                let variant = (slot + round) % 4;
                let start = Instant::now();
                let prepared = (variant >= 2).then(|| {
                    (
                        Prepared::from(d),
                        w.par_iter()
                            .copied()
                            .map(Prepared::from)
                            .collect::<Vec<_>>(),
                    )
                });
                let preparation = start.elapsed().as_secs_f64();
                let valid = points
                    .par_iter()
                    .enumerate()
                    .all(|(i, (a, c))| match variant {
                        0 => Bls12_381::pairing(*a, d) == Bls12_381::pairing(*c, w[i % 1024]),
                        1 => crate::phase2_pairing::equal(*a, d, *c, w[i % 1024]),
                        2 => {
                            let (d, w) = prepared.as_ref().unwrap();
                            Bls12_381::pairing(*a, d.clone())
                                == Bls12_381::pairing(*c, w[i % 1024].clone())
                        }
                        _ => {
                            let (d, w) = prepared.as_ref().unwrap();
                            crate::phase2_pairing::equal(*a, d.clone(), *c, w[i % 1024].clone())
                        }
                    });
                let seconds = start.elapsed().as_secs_f64();
                assert!(black_box(valid));
                if round > 0 {
                    samples.push(json!({"variant": (["two-pairings", "product", "prepared-two", "prepared-product"][variant]), "round": round, "points": points.len(), "seconds": seconds, "preparationSeconds": preparation}));
                }
            }
        }
        println!("pairing case {count} complete");
    }
    save("mpc-pairing-parallel-preparation", samples);
}

#[test]
#[ignore = "release comparison; set MPC_BENCH_DIR"]
fn decode() {
    assert!(!cfg!(debug_assertions));
    let mut rng = StdRng::seed_from_u64(15183);
    let scalars = (0..32768).map(|_| Fr::rand(&mut rng)).collect::<Vec<_>>();
    let points = scalars
        .par_iter()
        .map(|s| (G1Affine::generator() * s).into_affine())
        .collect::<Vec<_>>();
    let mut bytes = Vec::new();
    for p in &points {
        p.serialize_uncompressed(&mut bytes).unwrap();
    }
    let mut samples = vec![];
    for round in 0..6 {
        for slot in 0..3 {
            let variant = (slot + round) % 3;
            let start = Instant::now();
            let result: Vec<G1Affine> = match variant {
                0 => bytes
                    .chunks_exact(96)
                    .map(|b| G1Affine::deserialize_uncompressed(b).unwrap())
                    .collect(),
                1 => bytes
                    .par_chunks_exact(96)
                    .map(|b| G1Affine::deserialize_uncompressed(b).unwrap())
                    .collect(),
                _ => bytes
                    .par_chunks_exact(96)
                    .map(|b| G1Affine::deserialize_uncompressed_unchecked(b).unwrap())
                    .collect(),
            };
            let valid = result
                .par_iter()
                .all(|p| p.is_on_curve() && p.is_in_correct_subgroup_assuming_on_curve());
            let seconds = start.elapsed().as_secs_f64();
            assert!(black_box(valid));
            assert_eq!(result, points);
            if round > 0 {
                samples.push(json!({"variant": (["serial-checked-plus-admission", "parallel-checked-plus-admission", "parallel-decode-single-admission"][variant]), "round": round, "points": points.len(), "seconds": seconds}));
            }
        }
    }
    save("mpc-decode", samples);
}

#[test]
#[ignore = "release comparison; set MPC_BENCH_DIR"]
fn normalization() {
    assert!(!cfg!(debug_assertions));
    use ark_bls12_381::G1Projective;
    let mut rng = StdRng::seed_from_u64(15184);
    let scalars = (0..32768).map(|_| Fr::rand(&mut rng)).collect::<Vec<_>>();
    let points = scalars
        .par_iter()
        .map(|s| G1Affine::generator() * s)
        .collect::<Vec<_>>();
    let expected = points
        .par_iter()
        .map(|p| p.into_affine())
        .collect::<Vec<_>>();
    let mut samples = vec![];
    for round in 0..6 {
        for slot in 0..4 {
            let variant = (slot + round) % 4;
            let start = Instant::now();
            let result: Vec<G1Affine> = match variant {
                0 => points.par_iter().map(|p| p.into_affine()).collect(),
                1 => G1Projective::normalize_batch(&points),
                _ => points
                    .par_chunks(if variant == 2 { 1024 } else { 4096 })
                    .flat_map_iter(G1Projective::normalize_batch)
                    .collect(),
            };
            let seconds = start.elapsed().as_secs_f64();
            assert_eq!(black_box(result), expected);
            if round > 0 {
                samples.push(json!({"variant": (["individual", "batch", "chunk-1024", "chunk-4096"][variant]), "round": round, "points": points.len(), "seconds": seconds}));
            }
        }
    }
    save("mpc-normalization", samples);
}

#[test]
#[ignore = "release comparison; set MPC_BENCH_DIR"]
fn serialization() {
    assert!(!cfg!(debug_assertions));
    use sha2::{Digest, Sha256};
    let mut rng = StdRng::seed_from_u64(15185);
    let scalars = (0..262144).map(|_| Fr::rand(&mut rng)).collect::<Vec<_>>();
    let points = scalars
        .par_iter()
        .map(|s| (G1Affine::generator() * s).into_affine())
        .collect::<Vec<_>>();
    let mut expected = Vec::new();
    for p in &points {
        p.serialize_uncompressed(&mut expected).unwrap();
    }
    let mut samples = vec![];
    for round in 0..6 {
        for slot in 0..3 {
            let variant = (slot + round) % 3;
            let start = Instant::now();
            let mut bytes = if variant == 0 {
                Vec::new()
            } else {
                Vec::with_capacity(points.len() * 96)
            };
            if variant == 2 {
                bytes.resize(points.len() * 96, 0);
                bytes
                    .par_chunks_exact_mut(96)
                    .zip(&points)
                    .for_each(|(out, p)| p.serialize_uncompressed(out).unwrap());
            } else {
                for p in &points {
                    p.serialize_uncompressed(&mut bytes).unwrap();
                }
            }
            let serialization_seconds = start.elapsed().as_secs_f64();
            let digest = Sha256::digest(&bytes);
            let seconds = start.elapsed().as_secs_f64();
            black_box(digest);
            assert_eq!(black_box(bytes), expected);
            if round > 0 {
                samples.push(json!({"variant": (["grow", "reserve", "parallel-ranges"][variant]), "round": round, "points": points.len(), "seconds": seconds, "serializationSeconds":serialization_seconds}));
            }
        }
    }
    save("mpc-serialization-with-hash", samples);
}

#[test]
#[ignore = "release comparison; set MPC_BENCH_DIR"]
fn share_verification() {
    assert!(!cfg!(debug_assertions));
    use crate::contribution_proof::{ContributionBinding, ShareProof, ShareRole};
    let mut rng = StdRng::seed_from_u64(15183);
    let binding = ContributionBinding {
        library_version: "2.1.5",
        library_digest: [1; 32],
        tau_digest: [2; 32],
        previous_record_digest: [3; 32],
        next_state_digest: [4; 32],
    };
    let proofs = (0..1024)
        .map(|j| {
            ShareProof::create(
                Fr::rand(&mut rng),
                &binding,
                ShareRole::WireWeight(j),
                &mut rng,
            )
            .unwrap()
        })
        .collect::<Vec<_>>();
    let mut samples = vec![];
    for round in 0..6 {
        for slot in 0..2 {
            let variant = (slot + round) % 2;
            let start = Instant::now();
            let verify =
                |(j, p): (usize, &ShareProof)| p.verify(&binding, ShareRole::WireWeight(j as u64));
            let valid = if variant == 0 {
                proofs.iter().enumerate().all(verify)
            } else {
                proofs.par_iter().enumerate().all(verify)
            };
            let seconds = start.elapsed().as_secs_f64();
            assert!(black_box(valid));
            if round > 0 {
                samples.push(json!({"variant": (["serial", "parallel"][variant]), "round": round, "points": proofs.len(), "seconds": seconds}));
            }
        }
    }
    save("mpc-share-verification", samples);
}

#[test]
#[ignore = "release comparison; set MPC_BENCH_DIR"]
fn query_update() {
    assert!(!cfg!(debug_assertions));
    use crate::phase2_engine::{normalize, update_queries};
    use ark_ff::{Field, One};
    let mut rng = StdRng::seed_from_u64(15184);
    let v = (0..1024).map(|_| Fr::rand(&mut rng)).collect::<Vec<_>>();
    let inv = Fr::rand(&mut rng).inverse().unwrap();
    let scalars = (0..32768)
        .map(|_| (Fr::rand(&mut rng), Fr::rand(&mut rng)))
        .collect::<Vec<_>>();
    let (q, c): (Vec<_>, Vec<_>) = scalars
        .par_iter()
        .map(|(a, b)| {
            (
                (G1Affine::generator() * a).into_affine(),
                (G1Affine::generator() * b).into_affine(),
            )
        })
        .unzip();
    let wires = (0..q.len()).map(|i| i % 1024).collect::<Vec<_>>();
    let control = |inv: Fr| {
        let correction = c
            .par_iter()
            .zip(&wires)
            .map(|(c, j)| (*c * (v[*j] * inv)).into_affine())
            .collect::<Vec<_>>();
        let query = q
            .par_iter()
            .zip(&c)
            .zip(&wires)
            .map(|((q, c), j)| {
                let q = q.into_group() + *c * (v[*j] - Fr::one());
                (if inv.is_one() { q } else { q * inv }).into_affine()
            })
            .collect::<Vec<_>>();
        (query, correction)
    };
    let mut samples = vec![];
    for inverse in [inv, Fr::one()] {
        let expected = control(inverse);
        for round in 0..6 {
            for slot in 0..3 {
                let variant = (slot + round) % 3;
                let start = Instant::now();
                let result = match variant {
                    0 => control(inverse),
                    1 => {
                        let correction = normalize(
                            c.par_iter()
                                .zip(&wires)
                                .map(|(c, j)| *c * (v[*j] * inverse))
                                .collect(),
                        );
                        let query = normalize(
                            q.par_iter()
                                .zip(&c)
                                .zip(&wires)
                                .map(|((q, c), j)| {
                                    let q = q.into_group() + *c * (v[*j] - Fr::one());
                                    if inverse.is_one() {
                                        q
                                    } else {
                                        q * inverse
                                    }
                                })
                                .collect(),
                        );
                        (query, correction)
                    }
                    _ => {
                        if inverse.is_one() {
                            update_queries(&q, &c, &wires, inverse, &v)
                        } else {
                            let factors = zeroize::Zeroizing::new(
                                v.iter().map(|v| *v * inverse).collect::<Vec<_>>(),
                            );
                            update_queries(&q, &c, &wires, inverse, &factors)
                        }
                    }
                };
                let seconds = start.elapsed().as_secs_f64();
                assert_eq!(black_box(result), expected);
                if round > 0 {
                    samples.push(json!({"variant": (["individual", "batch-only", "fused-batch-factors"][variant]), "family": if inverse.is_one() {"fixed"} else {"packed"}, "round":round,"points":q.len(),"seconds":seconds}));
                }
            }
        }
    }
    save("mpc-query-update-final", samples);
}

#[test]
#[ignore = "release comparison; set MPC_BENCH_DIR"]
fn pairing_cache() {
    assert!(!cfg!(debug_assertions));
    use crate::phase2_pairing::{equal, PreparedG2};
    use ark_ff::Field;
    let mut rng = StdRng::seed_from_u64(15182);
    let delta = Fr::rand(&mut rng);
    let inv = delta.inverse().unwrap();
    let h = G2Affine::generator();
    let d = (h * delta).into_affine();
    let scalars = (0..4096).map(|_| Fr::rand(&mut rng)).collect::<Vec<_>>();
    let points = scalars
        .par_iter()
        .map(|s| {
            (
                (G1Affine::generator() * (*s * inv)).into_affine(),
                (G1Affine::generator() * s).into_affine(),
            )
        })
        .collect::<Vec<_>>();
    let mut samples = vec![];
    for uses in [2, 4] {
        for round in 0..6 {
            for slot in 0..2 {
                let variant = (slot + round) % 2;
                let start = Instant::now();
                let h = PreparedG2::from(h);
                let d = PreparedG2::from(d);
                let table = (variant == 1).then(|| {
                    points
                        .par_iter()
                        .map(|(_, c)| Bls12_381::pairing(*c, h.clone()))
                        .collect::<Vec<_>>()
                });
                let preparation = start.elapsed().as_secs_f64();
                for _ in 0..uses {
                    assert!(black_box(points.par_iter().enumerate().all(
                        |(i, (a, c))| {
                            if let Some(table) = &table {
                                Bls12_381::pairing(*a, d.clone()) == table[i]
                            } else {
                                equal(*a, d.clone(), *c, h.clone())
                            }
                        }
                    )));
                }
                let seconds = start.elapsed().as_secs_f64();
                if round > 0 {
                    samples.push(json!({"variant":(["prepared-product","cached-target-group"][variant]),"uses":uses,"round":round,"points":points.len(),"seconds":seconds,"preparationSeconds":preparation}));
                }
            }
        }
    }
    save("mpc-pairing-cache", samples);
}

#[test]
#[ignore = "release comparison; set MPC_BENCH_DIR"]
fn share_generation() {
    assert!(!cfg!(debug_assertions));
    use crate::contribution_proof::{ContributionBinding, ShareProof, ShareRole};
    let binding = ContributionBinding {
        library_version: "2.1.5",
        library_digest: [1; 32],
        tau_digest: [2; 32],
        previous_record_digest: [3; 32],
        next_state_digest: [4; 32],
    };
    let mut share_rng = StdRng::seed_from_u64(15182);
    let shares = (0..1024)
        .map(|_| Fr::rand(&mut share_rng))
        .collect::<Vec<_>>();
    let mut samples = vec![];
    for round in 0..6 {
        let mut reference = None;
        for slot in 0..2 {
            let variant = (slot + round) % 2;
            let mut rng = StdRng::seed_from_u64(15183);
            let start = Instant::now();
            let proofs = if variant == 0 {
                shares
                    .iter()
                    .enumerate()
                    .map(|(j, share)| {
                        ShareProof::create(
                            *share,
                            &binding,
                            ShareRole::WireWeight(j as u64),
                            &mut rng,
                        )
                        .unwrap()
                    })
                    .collect::<Vec<_>>()
            } else {
                let points = shares
                    .iter()
                    .map(|_| ShareProof::sample_point(&mut rng))
                    .collect::<Vec<_>>();
                shares
                    .par_iter()
                    .zip(points)
                    .enumerate()
                    .map(|(j, (share, s))| {
                        ShareProof::from_sample(
                            *share,
                            &binding,
                            ShareRole::WireWeight(j as u64),
                            s,
                        )
                        .unwrap()
                    })
                    .collect::<Vec<_>>()
            };
            let seconds = start.elapsed().as_secs_f64();
            let mut bytes = Vec::new();
            for p in &proofs {
                for q in [p.share_g1, p.s, p.s_share] {
                    q.serialize_uncompressed(&mut bytes).unwrap();
                }
                for q in [p.share_g2, p.r_share] {
                    q.serialize_uncompressed(&mut bytes).unwrap();
                }
            }
            if let Some(reference) = &reference {
                assert_eq!(&bytes, reference);
            } else {
                reference = Some(bytes);
            }
            assert!(proofs
                .par_iter()
                .enumerate()
                .all(|(j, p)| p.verify(&binding, ShareRole::WireWeight(j as u64))));
            if round > 0 {
                samples.push(json!({"variant":(["serial","serial-sample-parallel-proof"][variant]),"proofs":shares.len(),"round":round,"seconds":seconds}));
            }
        }
    }
    save("mpc-share-generation-dense", samples);
}

#[test]
#[ignore = "release comparison; set MPC_BENCH_DIR"]
fn initial_differences() {
    assert!(!cfg!(debug_assertions));
    use crate::phase2_engine::normalize;
    let mut rng = StdRng::seed_from_u64(15184);
    let scalars = (0..32768)
        .map(|_| (Fr::rand(&mut rng), Fr::rand(&mut rng)))
        .collect::<Vec<_>>();
    let points = scalars
        .par_iter()
        .map(|(a, b)| {
            (
                (G1Affine::generator() * a).into_affine(),
                (G1Affine::generator() * b).into_affine(),
            )
        })
        .collect::<Vec<_>>();
    let expected = points
        .par_iter()
        .map(|(a, b)| (*a - *b).into_affine())
        .collect::<Vec<_>>();
    let mut samples = vec![];
    for uses in [1, 2, 4] {
        for round in 0..6 {
            for slot in 0..3 {
                let variant = (slot + round) % 3;
                let start = Instant::now();
                let cache = (variant == 2)
                    .then(|| normalize(points.par_iter().map(|(a, b)| *a - *b).collect()));
                let mut results = Vec::new();
                for _ in 0..uses {
                    results.push(match variant {
                        0 => points
                            .par_iter()
                            .map(|(a, b)| (*a - *b).into_affine())
                            .collect::<Vec<_>>(),
                        1 => normalize(points.par_iter().map(|(a, b)| *a - *b).collect()),
                        _ => cache.as_ref().unwrap().clone(),
                    });
                }
                let seconds = start.elapsed().as_secs_f64();
                assert!(results.iter().all(|v| v == &expected));
                if round > 0 {
                    samples.push(json!({"variant":(["individual","batch","cached-batch"][variant]),"uses":uses,"points":points.len(),"round":round,"seconds":seconds}));
                }
            }
        }
    }
    save("mpc-initial-differences", samples);
}

#[test]
#[ignore = "release comparison; set MPC_BENCH_DIR"]
fn source_decode() {
    assert!(!cfg!(debug_assertions));
    let mut rng = StdRng::seed_from_u64(15185);
    let scalars = (0..32768).map(|_| Fr::rand(&mut rng)).collect::<Vec<_>>();
    let points = scalars
        .par_iter()
        .map(|s| (G1Affine::generator() * s).into_affine())
        .collect::<Vec<_>>();
    let bytes = points
        .par_iter()
        .copied()
        .map(crate::phase2_engine::encode_g1)
        .collect::<Vec<_>>();
    let mut samples = vec![];
    for round in 0..6 {
        let start = Instant::now();
        let decoded = crate::phase2_engine::decode_all(&bytes).unwrap();
        let seconds = start.elapsed().as_secs_f64();
        assert_eq!(decoded, points);
        if round > 0 {
            samples.push(json!({"variant":"existing-parallel-canonical-admission","round":round,"points":points.len(),"seconds":seconds}));
        }
    }
    save("mpc-source-decode", samples);
}

#[test]
#[ignore = "release comparison; set MPC_BENCH_DIR"]
fn point_materialization() {
    assert!(!cfg!(debug_assertions));
    use crate::phase2_engine::normalize;
    let mut rng = StdRng::seed_from_u64(15184);
    let scalars = (0..32768)
        .map(|_| (Fr::rand(&mut rng), Fr::rand(&mut rng)))
        .collect::<Vec<_>>();
    let points = scalars
        .par_iter()
        .map(|(a, b)| {
            (
                G1Affine::generator() * a,
                (G1Affine::generator() * b).into_affine(),
            )
        })
        .collect::<Vec<_>>();
    let mut samples = vec![];
    for family in ["initialize-add", "weighted-scale"] {
        let op = |i: usize| {
            if family == "initialize-add" {
                points[i].0 + points[i].1
            } else {
                points[i].1 * scalars[i].0
            }
        };
        let expected = (0..points.len())
            .into_par_iter()
            .map(|i| op(i).into_affine())
            .collect::<Vec<_>>();
        for round in 0..6 {
            for slot in 0..2 {
                let variant = (slot + round) % 2;
                let start = Instant::now();
                let result = if variant == 0 {
                    (0..points.len())
                        .into_par_iter()
                        .map(|i| op(i).into_affine())
                        .collect::<Vec<_>>()
                } else {
                    normalize((0..points.len()).into_par_iter().map(op).collect())
                };
                let seconds = start.elapsed().as_secs_f64();
                assert_eq!(black_box(result), expected);
                if round > 0 {
                    samples.push(json!({"variant":(["individual","batch"][variant]),"family":family,"points":points.len(),"round":round,"seconds":seconds}));
                }
            }
        }
    }
    save("mpc-point-materialization", samples);
}
