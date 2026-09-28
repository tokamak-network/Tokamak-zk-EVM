//! Current prover-only CRS ingress. Omitted zero-witness coordinates are never
//! expanded; the library-derived layout selects stored query blocks directly.

use backend_univariate_crs_interface::{
    archive, NonpublicQueryLayout, ProverKeysRkyv, TauSequenceRkyv, UnivariateG1Rkyv,
    WeightedQueryLayout,
};
use icicle_bls12_381::curve::{BaseField, G1Affine, G1Projective, ScalarField};
use icicle_core::{
    msm::{msm, MSMConfig},
    traits::FieldImpl,
};
use icicle_runtime::memory::HostSlice;
use libs::{
    frontend_artifacts::normalized_library::{NormalizedSubcircuitLibrary, PublicWireSource},
    group_structures::G1serde,
    univariate_crs::{UnivariateCrsShape, UNIVARIATE_CRS_SCHEMA_ID},
};
use std::{fs, io, path::Path};

pub struct ProverCrs {
    pub tau: TauSequenceRkyv,
    pub keys: ProverKeysRkyv,
    pub shape: UnivariateCrsShape,
    pub layout: NonpublicQueryLayout,
    /// Compact CRS row order for weighted selection queries. This excludes
    /// only producer-declared local-wire padding; a retained wire is present
    /// even when its witness value is zero.
    pub weighted_layout: WeightedQueryLayout,
}

impl ProverCrs {
    pub fn from_owned_bytes(
        bytes: libs::subcircuit_library::ValidatedUnivariateCrsBytes,
        library: &NormalizedSubcircuitLibrary,
    ) -> io::Result<Self> {
        let tau = crate::time_block!("univariate.crs.decode.tau", "input", {
            archive::from_bytes::<TauSequenceRkyv, archive::rancor::Error>(&bytes.tau)
                .map_err(io::Error::other)?
        });
        drop(bytes.tau);
        let keys = crate::time_block!("univariate.crs.decode.keys", "input", {
            archive::from_bytes::<ProverKeysRkyv, archive::rancor::Error>(&bytes.prover_keys)
                .map_err(io::Error::other)?
        });
        drop(bytes.prover_keys);
        Self::new(tau, keys, library).map_err(io::Error::other)
    }

    pub fn read(
        tau: &Path,
        keys: &Path,
        library: &NormalizedSubcircuitLibrary,
    ) -> io::Result<Self> {
        let tau_bytes = crate::time_block!("univariate.crs.read.tau", "input", { fs::read(tau)? });
        let tau = crate::time_block!("univariate.crs.decode.tau", "input", {
            archive::from_bytes::<TauSequenceRkyv, archive::rancor::Error>(&tau_bytes)
                .map_err(io::Error::other)?
        });
        drop(tau_bytes);
        let key_bytes = crate::time_block!("univariate.crs.read.keys", "input", {
            fs::read(keys.join("prover_keys.rkyv"))?
        });
        let keys = crate::time_block!("univariate.crs.decode.keys", "input", {
            archive::from_bytes::<ProverKeysRkyv, archive::rancor::Error>(&key_bytes)
                .map_err(io::Error::other)?
        });
        drop(key_bytes);
        Self::new(tau, keys, library).map_err(io::Error::other)
    }

    pub fn new(
        tau: TauSequenceRkyv,
        keys: ProverKeysRkyv,
        library: &NormalizedSubcircuitLibrary,
    ) -> Result<Self, String> {
        let setup = &library.setup;
        let shape =
            UnivariateCrsShape::from_normalized_setup(setup, library.public.free_public_len())
                .map_err(|e| e.to_string())?;
        let layout = NonpublicQueryLayout::from_retained_wires(
            setup.s,
            library
                .subcircuits
                .iter()
                .map(|circuit| circuit.retained_nonpublic_wires())
                .collect(),
        )?;
        let weighted_layout = WeightedQueryLayout::from_normalized_ranges(
            setup.s,
            setup.m,
            setup.m_b,
            library
                .subcircuits
                .iter()
                .map(|circuit| (circuit.wiring_range().len(), circuit.internal_range().len())),
        )?;
        let free_count = (0..library.public.free_public_len())
            .filter(|index| {
                matches!(
                    library.public.source(*index),
                    Some(PublicWireSource::Mapped { .. })
                )
            })
            .count();
        if tau.schema_id != UNIVARIATE_CRS_SCHEMA_ID
            || keys.schema_id != UNIVARIATE_CRS_SCHEMA_ID
            || tau.s0_g1.len() != shape.minimum_capacity[0] + 1
            || tau.sxi_g1.len() != shape.minimum_capacity[1] + 1
            || tau.spsi_g1.len() != shape.minimum_capacity[2] + 1
            || keys.weighted_g1.len() != weighted_layout.len()
            || keys.weighted_shifted_g1.len() != weighted_layout.len()
            || keys.nonpublic_queries.len() != layout.len()
            || keys.free_public_queries.len() != free_count
        {
            return Err(
                "prover CRS schema or query lengths do not match the selected library".into(),
            );
        }
        Ok(Self {
            tau,
            keys,
            shape,
            layout,
            weighted_layout,
        })
    }
}

pub fn point(record: &UnivariateG1Rkyv) -> G1Affine {
    G1Affine::from_limbs(
        BaseField::from_bytes_le(&record.x).into(),
        BaseField::from_bytes_le(&record.y).into(),
    )
}

/// One ICICLE MSM owns CPU/CUDA provider parallelism. Callers do not nest
/// parallel execution around it or perform one scalar multiplication per base.
pub fn msm_points(bases: &[G1Affine], scalars: &[ScalarField]) -> Result<G1serde, String> {
    #[cfg(feature = "timing")]
    let _msm = crate::timing::SpanGuard::new(
        "univariate.msm",
        "msm",
        vec![crate::timing::SizeInfo {
            label: "bases",
            dims: vec![bases.len()],
        }],
    );
    if bases.len() != scalars.len() {
        return Err("MSM base/scalar length mismatch".into());
    }
    if bases.is_empty() {
        return Ok(G1serde::zero());
    }
    let mut result = [G1Projective::zero()];
    msm(
        HostSlice::from_slice(scalars),
        HostSlice::from_slice(bases),
        &MSMConfig::default(),
        HostSlice::from_mut_slice(&mut result),
    )
    .map_err(|e| format!("ICICLE MSM failed: {e:?}"))?;
    Ok(G1serde(G1Affine::from(result[0])))
}

pub fn commit(
    bases: &[UnivariateG1Rkyv],
    coefficients: &[ScalarField],
    offset: usize,
) -> Result<G1serde, String> {
    let end = offset
        .checked_add(coefficients.len())
        .ok_or("commitment exponent overflow")?;
    let selected = bases
        .get(offset..end)
        .ok_or("polynomial exceeds the published source sequence")?;
    msm_points(
        &selected.iter().map(point).collect::<Vec<_>>(),
        coefficients,
    )
}

/// Commit a sum across distinct CRS sources with one ICICLE MSM. Each source
/// keeps its own exponent offset; concatenation changes neither scalar order
/// within a source nor the resulting group element.
pub fn commit_sum(
    terms: &[(&[UnivariateG1Rkyv], &[ScalarField], usize)],
) -> Result<G1serde, String> {
    let count = terms
        .iter()
        .try_fold(0usize, |n, (_, s, _)| n.checked_add(s.len()))
        .ok_or("commitment length overflow")?;
    let mut bases = Vec::with_capacity(count);
    let mut scalars = Vec::with_capacity(count);
    for (source, coefficients, offset) in terms {
        let end = offset
            .checked_add(coefficients.len())
            .ok_or("commitment exponent overflow")?;
        let selected = source
            .get(*offset..end)
            .ok_or("polynomial exceeds the published source sequence")?;
        bases.extend(selected.iter().map(point));
        scalars.extend_from_slice(coefficients);
    }
    msm_points(&bases, &scalars)
}

#[cfg(test)]
mod benchmarks {
    use super::*;

    #[test]
    #[ignore = "release-only comparison requiring PROVE_BENCH_TAU"]
    fn compare_commitment_sum() {
        use icicle_bls12_381::curve::ScalarCfg;
        use icicle_core::traits::GenerateRandom;
        use std::time::Instant;
        assert!(!cfg!(debug_assertions), "use --release");
        libs::utils::try_check_device().unwrap();
        let path = std::env::var("PROVE_BENCH_TAU").expect("PROVE_BENCH_TAU");
        let tau = archive::from_bytes::<TauSequenceRkyv, archive::rancor::Error>(
            &fs::read(path).unwrap(),
        )
        .unwrap();
        for counts in [
            [17, 17, 17],
            [262_146; 3],
            [256, 262_146, 262_146],
            [0, 262_146, 262_146],
        ] {
            let [a, b, c] = counts;
            let mut scalars = ScalarCfg::generate_random(a + b + c);
            scalars[0] = ScalarField::zero();
            scalars[1] = ScalarField::one();
            scalars[2] = ScalarField::zero() - ScalarField::one();
            let terms = [
                (&tau.s0_g1[..], &scalars[..a], 0),
                (&tau.sxi_g1[..], &scalars[a..a + b], 1),
                (&tau.spsi_g1[..], &scalars[a + b..], 2),
            ];
            for trial in 0..5 {
                let separate = || {
                    let start = Instant::now();
                    let result = terms
                        .iter()
                        .map(|(p, s, o)| commit(p, s, *o).unwrap())
                        .fold(G1serde::zero(), |a, b| a + b);
                    (result.0, start.elapsed().as_secs_f64())
                };
                let combined = || {
                    let start = Instant::now();
                    let result = commit_sum(&terms).unwrap();
                    (result.0, start.elapsed().as_secs_f64())
                };
                let (old, new) = if trial % 2 == 0 {
                    (separate(), combined())
                } else {
                    let new = combined();
                    (separate(), new)
                };
                assert_eq!(old.0, new.0);
                println!(
                    "{}",
                    serde_json::json!({"counts":counts,"trial":trial,"referenceSeconds":old.1,"candidateSeconds":new.1,"samePoint":true})
                );
            }
        }
    }

    #[test]
    #[ignore = "release-only comparison requiring PROVE_BENCH_TAU and PROVE_BENCH_KEYS"]
    fn compare_archive_read_backing() {
        use memmap2::Mmap;
        use std::{fs::File, time::Instant};
        assert!(!cfg!(debug_assertions), "use --release");
        // Inputs must remain immutable for the lifetime of each mapping.
        macro_rules! compare {
            ($variable:literal, $archive:ty) => {{
                let path = std::env::var($variable).expect($variable);
                let expected_bytes = fs::read(&path).unwrap();
                for trial in 0..5 {
                    for offset in 0..2 {
                        let mapped = (trial + offset) % 2 == 1;
                        let start = Instant::now();
                        let seconds = if mapped {
                            let file = File::open(&path).unwrap();
                            // SAFETY: the benchmark's source archive is immutable
                            // and the mapping outlives all decoder reads.
                            let bytes = unsafe { Mmap::map(&file).unwrap() };
                            let value = archive::from_bytes::<$archive, archive::rancor::Error>(&bytes).unwrap();
                            std::hint::black_box(&value);
                            let elapsed = start.elapsed().as_secs_f64();
                            assert_eq!(&bytes[..], &expected_bytes);
                            elapsed
                        } else {
                            let bytes = fs::read(&path).unwrap();
                            let value = archive::from_bytes::<$archive, archive::rancor::Error>(&bytes).unwrap();
                            std::hint::black_box(&value);
                            let elapsed = start.elapsed().as_secs_f64();
                            assert_eq!(&bytes, &expected_bytes);
                            elapsed
                        };
                        println!("{}", serde_json::json!({"artifact":$variable,"trial":trial,"mmap":mapped,"seconds":seconds,"bytes":expected_bytes.len(),"sameInputBytes":true}));
                    }
                }
            }};
        }
        compare!("PROVE_BENCH_TAU", TauSequenceRkyv);
        compare!("PROVE_BENCH_KEYS", ProverKeysRkyv);
    }
}
