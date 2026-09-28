//! Direct, single-command U19--U22a construction for the current protocol.
//! Only scalar labels are evaluated here; no per-query dense polynomial is built.

use crate::frontend_artifacts::normalized_library::{
    NormalizedSubcircuitLibrary, PublicWireSource,
};
use crate::univariate_crs::{UnivariateCrsShape, UNIVARIATE_CRS_SCHEMA_ID};
use crate::univariate_relation::NormalizedUnivariateSubcircuit;
use backend_univariate_crs_interface::{
    NonpublicQueryLayout, PreprocessKeysRkyv, ProverKeysRkyv, TauSequenceRkyv, UnivariateG1Rkyv,
    UnivariateG2Rkyv, VerifierKeysRkyv, WeightedQueryLayout,
};
use icicle_bls12_381::curve::{
    G1Affine, G1Projective, G2Affine, G2Projective, ScalarCfg, ScalarField,
};
use icicle_core::{
    msm::{msm, MSMConfig},
    traits::{Arithmetic, FieldImpl, GenerateRandom},
};
use icicle_runtime::memory::HostSlice;
use rayon::prelude::*;

// Reuse the existing opt-in timing collector; normal builds allocate no spans.
macro_rules! measured {
    ($name:expr, $body:expr) => {{
        #[cfg(feature = "timing")]
        let _span = crate::timing::SpanGuard::new($name, "setup", vec![]);
        $body
    }};
}

pub struct SetupScalars {
    pub tau: ScalarField,
    pub xi: ScalarField,
    pub psi: ScalarField,
    pub delta: ScalarField,
    pub weights: Vec<ScalarField>,
}

impl SetupScalars {
    pub fn sample(shape: &UnivariateCrsShape, width: usize) -> Self {
        let nonzero = || loop {
            let value = ScalarCfg::generate_random(1)[0];
            if value != ScalarField::zero() {
                break value;
            }
        };
        let tau = loop {
            let candidate = nonzero();
            if [
                shape.arithmetic_domain_size,
                shape.connection_domain_size,
                shape.selection_domain_size,
            ]
            .iter()
            .all(|n| candidate.pow(*n) != ScalarField::one())
            {
                break candidate;
            }
        };
        Self {
            tau,
            xi: nonzero(),
            psi: nonzero(),
            delta: nonzero(),
            weights: (0..width).into_par_iter().map(|_| nonzero()).collect(),
        }
    }
}

pub struct SetupCrs {
    pub tau: TauSequenceRkyv,
    pub prover: ProverKeysRkyv,
    pub preprocess: PreprocessKeysRkyv,
    pub verifier: VerifierKeysRkyv,
}

pub struct SetupCrsDigests {
    pub tau_sequence_sha256: String,
    pub prover_keys_sha256: String,
    pub preprocess_keys_sha256: String,
    pub verifier_keys_sha256: String,
}

/// Stage the four role-local archives without exposing a partial generation.
/// The caller must validate and write their provenance before activation.
pub fn stage_artifacts(
    active_output: &std::path::Path,
    crs: &SetupCrs,
) -> std::io::Result<(crate::crs_artifacts::StagedUnivariateCrs, SetupCrsDigests)> {
    use backend_univariate_crs_interface::archive;
    use sha2::{Digest, Sha256};
    let stage = crate::crs_artifacts::create_univariate_stage(active_output)?;
    let directory = stage.staging_directory()?;
    // These are independent host serialization and I/O operations, not
    // internally parallel ICICLE calls. Drop each buffer after its write.
    macro_rules! write_archive {
        ($name:literal, $value:expr) => {{
            (|| -> std::io::Result<String> {
                let bytes = measured!(
                    concat!($name, ".serialize"),
                    archive::to_bytes::<archive::rancor::Error>($value)
                )
                .map_err(std::io::Error::other)?;
                let digest = measured!(
                    concat!($name, ".hash"),
                    hex::encode(Sha256::digest(bytes.as_ref()))
                );
                measured!(
                    concat!($name, ".write"),
                    std::fs::write(directory.join($name), bytes.as_ref())
                )?;
                Ok(digest)
            })()
        }};
    }
    let ((tau, prover), (preprocess, verifier)) = rayon::join(
        || {
            rayon::join(
                || write_archive!("tau_sequence.rkyv", &crs.tau),
                || write_archive!("prover_keys.rkyv", &crs.prover),
            )
        },
        || {
            rayon::join(
                || write_archive!("preprocess_keys.rkyv", &crs.preprocess),
                || write_archive!("verifier_keys.rkyv", &crs.verifier),
            )
        },
    );
    let digests = SetupCrsDigests {
        tau_sequence_sha256: tau?,
        prover_keys_sha256: prover?,
        preprocess_keys_sha256: preprocess?,
        verifier_keys_sha256: verifier?,
    };
    Ok((stage, digests))
}

pub fn generate_normalized(
    library: &NormalizedSubcircuitLibrary,
    subcircuits: &[NormalizedUnivariateSubcircuit<'_>],
    secret: &SetupScalars,
    g1: G1Affine,
    g2: G2Affine,
) -> Result<SetupCrs, String> {
    let setup = &library.setup;
    let shape = UnivariateCrsShape::from_normalized_setup(setup, library.public.free_public_len())
        .map_err(|error| error.to_string())?;
    validate_normalized_setup_inputs(library, subcircuits, secret, &shape)?;

    let one = ScalarField::one();
    let p = shape.declared_capacity[1];
    let tau_k = secret.tau.pow(shape.k);
    let tau_s = secret.tau.pow(p + 1);
    let delta_inv = secret.delta.inv();
    let lag_a = lagrange_at(
        secret.tau,
        shape.arithmetic_root,
        shape.arithmetic_domain_size,
    );
    let lag_c = lagrange_at(
        secret.tau,
        shape.connection_root,
        shape.connection_domain_size,
    );
    let lag_s = lagrange_at(
        secret.tau,
        shape.selection_root,
        shape.selection_domain_size,
    );
    let free_root =
        icicle_core::ntt::get_root_of_unity::<ScalarField>(library.public.free_public_len() as u64);
    let lag_free = lagrange_at(secret.tau, free_root, library.public.free_public_len());
    let packed = |i: usize, k: usize, j: usize, image: [ScalarField; 4]| {
        secret.xi * (image[0] + tau_k * image[1])
            + secret.psi * (image[2] + tau_k * image[3])
            + tau_s * secret.weights[j] * lag_s[i + setup.s * k]
    };

    let retained_wires = library
        .subcircuits
        .iter()
        .map(|circuit| circuit.retained_nonpublic_wires())
        .collect::<Vec<_>>();
    let query_layout = NonpublicQueryLayout::from_retained_wires(setup.s, retained_wires)?;
    let weighted_layout = WeightedQueryLayout::from_normalized_ranges(
        setup.s,
        setup.m,
        setup.m_b,
        library
            .subcircuits
            .iter()
            .map(|circuit| (circuit.wiring_range().len(), circuit.internal_range().len())),
    )?;
    let row_len = query_layout.len() / setup.s;
    let mut nonpublic = vec![ScalarField::zero(); query_layout.len()];
    measured!("nonpublic.scalar_labels", {
        nonpublic
            .par_chunks_mut(row_len)
            .enumerate()
            .for_each(|(i, output)| {
                let mut cursor = 0;
                for (k, circuit) in subcircuits.iter().enumerate() {
                    let images = normalized_wire_images(
                        setup.s, setup.m, setup.m_b, circuit, i, &lag_a, &lag_c,
                    );
                    for &j in query_layout.local_wires(k).unwrap() {
                        output[cursor] = delta_inv * packed(i, k, j, images[j]);
                        cursor += 1;
                    }
                }
                assert_eq!(cursor, output.len());
            });
    });

    #[cfg(feature = "timing")]
    let public_span = crate::timing::SpanGuard::new("public.scalar_labels", "setup", vec![]);
    let public_labels = (0..library.public.len())
        .into_par_iter()
        .filter_map(|public_index| match library.public.source(public_index) {
            Some(PublicWireSource::Mapped {
                subcircuit_id,
                local_wire_index,
            }) => Some((public_index, subcircuit_id, local_wire_index)),
            Some(PublicWireSource::Padding) | None => None,
        })
        .map(|(public_index, k, j)| {
            if k >= setup.s || k >= subcircuits.len() {
                return Err("public buffer cannot occupy its matching placement".to_owned());
            }
            // Public buffers use the approved placement-index equals
            // subcircuit-ID specialization. Their values still participate in
            // the complete public-and-bus connection relation.
            let images = normalized_wire_images(
                setup.s,
                setup.m,
                setup.m_b,
                &subcircuits[k],
                k,
                &lag_a,
                &lag_c,
            );
            let q = packed(k, k, j, images[j]);
            Ok((
                public_index,
                if public_index < library.public.free_public_len() {
                    delta_inv * (q + lag_free[public_index])
                } else {
                    q
                },
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let free = public_labels
        .iter()
        .filter(|(index, _)| *index < library.public.free_public_len())
        .map(|(_, value)| *value)
        .collect::<Vec<_>>();
    let fixed = public_labels
        .iter()
        .filter(|(index, _)| *index >= library.public.free_public_len())
        .map(|(_, value)| *value)
        .collect::<Vec<_>>();
    #[cfg(feature = "timing")]
    drop(public_span);

    assemble_crs(
        &shape,
        setup.s,
        setup.t,
        Some(&weighted_layout),
        one,
        secret,
        g1,
        g2,
        free,
        fixed,
        nonpublic,
    )
}

#[allow(clippy::too_many_arguments)]
fn assemble_crs(
    shape: &UnivariateCrsShape,
    placement_capacity: usize,
    subcircuit_capacity: usize,
    weighted_layout: Option<&WeightedQueryLayout>,
    one: ScalarField,
    secret: &SetupScalars,
    g1: G1Affine,
    g2: G2Affine,
    free: Vec<ScalarField>,
    fixed: Vec<ScalarField>,
    nonpublic: Vec<ScalarField>,
) -> Result<SetupCrs, String> {
    let p = shape.declared_capacity[1];
    let tau_k = secret.tau.pow(shape.k);
    let tau_s = secret.tau.pow(p + 1);
    let delta_inv = secret.delta.inv();
    let powers = powers(secret.tau, p * 2 + 1);
    let weighted_rows = weighted_layout
        .map(|layout| layout.retained_wires().collect::<Vec<_>>())
        .unwrap_or_else(|| (0..secret.weights.len()).collect());
    let weighted = weighted_rows
        .par_iter()
        .flat_map_iter(|&j| {
            let r = secret.weights[j];
            powers[..placement_capacity]
                .iter()
                .map(move |power| r * *power)
        })
        .collect::<Vec<_>>();
    let shifted = weighted.par_iter().map(|v| *v * tau_k).collect::<Vec<_>>();
    let mask = |tag: ScalarField, shift: usize, n: usize| {
        encode_g1(
            &[0, 1].map(|a| delta_inv * tag * powers[shift + a] * (secret.tau.pow(n) - one)),
            g1,
        )
        .map(|points| points.try_into().unwrap())
    };
    let tau = TauSequenceRkyv {
        schema_id: UNIVARIATE_CRS_SCHEMA_ID.into(),
        s0_g1: encode_g1(&powers, g1)?,
        sxi_g1: encode_g1(
            &powers[..=p]
                .par_iter()
                .map(|v| secret.xi * *v)
                .collect::<Vec<_>>(),
            g1,
        )?,
        spsi_g1: encode_g1(
            &powers[..=p]
                .par_iter()
                .map(|v| secret.psi * *v)
                .collect::<Vec<_>>(),
            g1,
        )?,
        tau_powers_g2: encode_g2(&powers[..=p], g2)?,
        psi_g2: encode_g2(&[secret.psi], g2)?[0],
    };
    let preprocess = PreprocessKeysRkyv {
        schema_id: UNIVARIATE_CRS_SCHEMA_ID.into(),
        sc_g1: tau.s0_g1[..shape.connection_domain_size]
            .par_iter()
            .copied()
            .collect(),
        selection_g2: tau.tau_powers_g2
            [shape.h..=shape.h + placement_capacity * (subcircuit_capacity - 1)]
            .par_iter()
            .copied()
            .collect(),
        fixed_public_queries: encode_g1(&fixed, g1)?,
    };
    let verifier = VerifierKeysRkyv {
        schema_id: UNIVARIATE_CRS_SCHEMA_ID.into(),
        one_g1: tau.s0_g1[0],
        xi_g1: tau.sxi_g1[0],
        psi_g1: tau.spsi_g1[0],
        one_g2: tau.tau_powers_g2[0],
        tau_g2: tau.tau_powers_g2[1],
        tau_k_g2: tau.tau_powers_g2[shape.k],
        delta_g2: encode_g2(&[secret.delta], g2)?[0],
    };
    let prover = ProverKeysRkyv {
        schema_id: UNIVARIATE_CRS_SCHEMA_ID.into(),
        weighted_g1: encode_g1(&weighted, g1)?,
        weighted_shifted_g1: encode_g1(&shifted, g1)?,
        free_public_queries: encode_g1(&free, g1)?,
        nonpublic_queries: encode_g1(&nonpublic, g1)?,
        mask_u: mask(secret.xi, 0, shape.arithmetic_domain_size)?,
        mask_v: mask(secret.xi, shape.k, shape.arithmetic_domain_size)?,
        mask_w: mask(secret.psi, 0, shape.arithmetic_domain_size)?,
        mask_b: mask(secret.psi, shape.k, shape.connection_domain_size)?,
        mask_selection: encode_g1(
            &[delta_inv * tau_s * (secret.tau.pow(shape.selection_domain_size) - one)],
            g1,
        )?[0],
    };
    Ok(SetupCrs {
        tau,
        prover,
        preprocess,
        verifier,
    })
}

fn validate_normalized_setup_inputs(
    library: &NormalizedSubcircuitLibrary,
    subcircuits: &[NormalizedUnivariateSubcircuit<'_>],
    secret: &SetupScalars,
    shape: &UnivariateCrsShape,
) -> Result<(), String> {
    let setup = &library.setup;
    if secret.weights.len() != setup.m
        || [secret.tau, secret.xi, secret.psi, secret.delta]
            .iter()
            .chain(&secret.weights)
            .any(|value| *value == ScalarField::zero())
    {
        return Err("setup scalars must be nonzero and contain m weights".into());
    }
    if [
        shape.arithmetic_domain_size,
        shape.connection_domain_size,
        shape.selection_domain_size,
    ]
    .iter()
    .any(|domain_size| secret.tau.pow(*domain_size) == ScalarField::one())
    {
        return Err("tau must be outside all three evaluation domains".into());
    }
    if subcircuits.len() != library.subcircuits.len()
        || subcircuits
            .iter()
            .zip(&library.subcircuits)
            .any(|(circuit, info)| circuit.info.id != info.id || circuit.info != info)
    {
        return Err("compiled circuit catalog does not match normalized metadata".into());
    }
    for circuit in subcircuits {
        for (active, rows) in [
            (circuit.a_active_wires, circuit.a_rows),
            (circuit.b_active_wires, circuit.b_rows),
            (circuit.c_active_wires, circuit.c_rows),
        ] {
            if rows.len() != setup.n
                || active.iter().any(|wire| {
                    *wire >= setup.m
                        || circuit.info.is_wiring_padding(*wire, setup.m_b)
                        || circuit.info.is_internal_padding(*wire, setup.m)
                })
                || rows
                    .iter()
                    .flatten()
                    .any(|(column, _)| *column >= active.len())
            {
                return Err(format!(
                    "subcircuit {} contains an out-of-range or padded R1CS column",
                    circuit.info.id
                ));
            }
        }
    }
    Ok(())
}

fn normalized_wire_images(
    placement_capacity: usize,
    wire_width: usize,
    wiring_width: usize,
    circuit: &NormalizedUnivariateSubcircuit<'_>,
    placement_index: usize,
    lag_a: &[ScalarField],
    lag_c: &[ScalarField],
) -> Vec<[ScalarField; 4]> {
    let mut images = vec![[ScalarField::zero(); 4]; wire_width];
    for (matrix, (active, rows)) in [
        (circuit.a_active_wires, circuit.a_rows),
        (circuit.b_active_wires, circuit.b_rows),
        (circuit.c_active_wires, circuit.c_rows),
    ]
    .into_iter()
    .enumerate()
    {
        for (constraint_row, row) in rows.iter().enumerate() {
            let basis = lag_a[placement_index + placement_capacity * constraint_row];
            for (column, coefficient) in row {
                let local_wire_index = active[*column];
                images[local_wire_index][matrix] =
                    images[local_wire_index][matrix] + basis * *coefficient;
            }
        }
    }
    for (local_wire_index, image) in images[..wiring_width].iter_mut().enumerate() {
        image[3] = lag_c[placement_index + placement_capacity * local_wire_index];
    }
    images
}

fn lagrange_at(tau: ScalarField, root: ScalarField, count: usize) -> Vec<ScalarField> {
    #[cfg(feature = "timing")]
    let _span = crate::timing::SpanGuard::new(
        "lagrange_at",
        "setup",
        vec![crate::timing::SizeInfo {
            label: "count",
            dims: vec![count],
        }],
    );
    let numerator = (tau.pow(count) - ScalarField::one())
        * ScalarField::from_bytes_le(&count.to_le_bytes()).inv();
    (0..count)
        .into_par_iter()
        .map(|index| {
            let z = root.pow(index);
            if tau == z {
                ScalarField::one()
            } else {
                numerator * z * (tau - z).inv()
            }
        })
        .collect()
}

fn powers(tau: ScalarField, count: usize) -> Vec<ScalarField> {
    #[cfg(feature = "timing")]
    let _span = crate::timing::SpanGuard::new(
        "powers",
        "setup",
        vec![crate::timing::SizeInfo {
            label: "count",
            dims: vec![count],
        }],
    );
    let mut values = vec![ScalarField::zero(); count];
    values
        .par_chunks_mut(4096)
        .enumerate()
        .for_each(|(index, chunk)| {
            let mut value = tau.pow(index * 4096);
            for slot in chunk {
                *slot = value;
                value = value * tau;
            }
        });
    values
}

fn encode_g1(values: &[ScalarField], generator: G1Affine) -> Result<Vec<UnivariateG1Rkyv>, String> {
    #[cfg(feature = "timing")]
    let _span = crate::timing::SpanGuard::new(
        "encode_g1",
        "setup",
        vec![crate::timing::SizeInfo {
            label: "count",
            dims: vec![values.len()],
        }],
    );
    let encode = |point: G1Affine| UnivariateG1Rkyv {
        x: point.x.to_bytes_le().try_into().unwrap(),
        y: point.y.to_bytes_le().try_into().unwrap(),
    };
    if generator == G1Affine::zero() {
        return Ok(vec![encode(generator); values.len()]);
    }
    if !crate::utils::cuda_msm_is_available() {
        if values.len() >= FIXED_BASE_MIN_POINTS {
            use ark_ec::AffineRepr;
            use ark_ff::{BigInteger, PrimeField};
            let base = crate::group_structures::icicle_g1_affine_to_ark(&generator).into_group();
            return Ok(encode_fixed_base(values, base, |point| {
                if point.is_zero() {
                    return encode(G1Affine::zero());
                }
                UnivariateG1Rkyv {
                    x: point.x.into_bigint().to_bytes_le().try_into().unwrap(),
                    y: point.y.into_bigint().to_bytes_le().try_into().unwrap(),
                }
            }));
        }
        let generator = generator.to_projective();
        return Ok(values
            .par_iter()
            .map(|v| encode(G1Affine::from(generator * *v)))
            .collect());
    }
    let mut output = Vec::with_capacity(values.len());
    // Bound the transient device/result buffer. Bulk ICICLE calls are never
    // wrapped in another parallel iterator.
    for scalars in values.chunks(65536) {
        let mut points = vec![G1Projective::zero(); scalars.len()];
        msm(
            HostSlice::from_slice(scalars),
            HostSlice::from_slice(&[generator]),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut points),
        )
        .map_err(|e| format!("G1 query encoding failed: {e:?}"))?;
        output.extend(
            points
                .into_par_iter()
                .map(|p| encode(G1Affine::from(p)))
                .collect::<Vec<_>>(),
        );
    }
    Ok(output)
}

fn encode_g2(values: &[ScalarField], generator: G2Affine) -> Result<Vec<UnivariateG2Rkyv>, String> {
    #[cfg(feature = "timing")]
    let _span = crate::timing::SpanGuard::new(
        "encode_g2",
        "setup",
        vec![crate::timing::SizeInfo {
            label: "count",
            dims: vec![values.len()],
        }],
    );
    let encode = |point: G2Affine| UnivariateG2Rkyv {
        x: point.x.to_bytes_le().try_into().unwrap(),
        y: point.y.to_bytes_le().try_into().unwrap(),
    };
    if generator == G2Affine::zero() {
        return Ok(vec![encode(generator); values.len()]);
    }
    if !crate::utils::cuda_msm_is_available() {
        if values.len() >= FIXED_BASE_MIN_POINTS {
            use ark_ec::AffineRepr;
            use ark_ff::{BigInteger, PrimeField};
            let base = crate::group_structures::icicle_g2_affine_to_ark(&generator).into_group();
            return Ok(encode_fixed_base(values, base, |point| {
                if point.is_zero() {
                    return encode(G2Affine::zero());
                }
                let coordinate = |f: ark_bls12_381::Fq2| {
                    let mut bytes = [0; 96];
                    bytes[..48].copy_from_slice(&f.c0.into_bigint().to_bytes_le());
                    bytes[48..].copy_from_slice(&f.c1.into_bigint().to_bytes_le());
                    bytes
                };
                UnivariateG2Rkyv {
                    x: coordinate(point.x),
                    y: coordinate(point.y),
                }
            }));
        }
        let generator = generator.to_projective();
        return Ok(values
            .par_iter()
            .map(|v| encode(G2Affine::from(generator * *v)))
            .collect());
    }
    let mut output = Vec::with_capacity(values.len());
    for scalars in values.chunks(65536) {
        let mut points = vec![G2Projective::zero(); scalars.len()];
        msm(
            HostSlice::from_slice(scalars),
            HostSlice::from_slice(&[generator]),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut points),
        )
        .map_err(|e| format!("G2 query encoding failed: {e:?}"))?;
        output.extend(
            points
                .into_par_iter()
                .map(|p| encode(G2Affine::from(p)))
                .collect::<Vec<_>>(),
        );
    }
    Ok(output)
}

const FIXED_BASE_MIN_POINTS: usize = 16384;
const FIXED_BASE_BATCH_POINTS: usize = 1024;

/// CPU-only shared-generator construction using arkworks' fixed-base and
/// batch-normalization algorithms. Table/chunk sizes do not fix a core count.
/// No ICICLE bulk call runs inside Rayon; CUDA keeps its existing bulk path.
fn encode_fixed_base<G, T>(
    values: &[ScalarField],
    generator: G,
    encode: impl Fn(G::Affine) -> T + Sync,
) -> Vec<T>
where
    G: ark_ec::CurveGroup<ScalarField = ark_bls12_381::Fr>,
    T: Send + Clone,
{
    use ark_ec::{scalar_mul::BatchMulPreprocessing, AffineRepr};
    use ark_ff::PrimeField;
    let table = BatchMulPreprocessing::new(generator, FIXED_BASE_MIN_POINTS);
    let mut output = vec![encode(G::Affine::zero()); values.len()];
    output
        .par_chunks_mut(FIXED_BASE_BATCH_POINTS)
        .zip(values.par_chunks(FIXED_BASE_BATCH_POINTS))
        .for_each(|(destination, chunk)| {
            let scalars = chunk
                .iter()
                .map(|s| ark_bls12_381::Fr::from_le_bytes_mod_order(&s.to_bytes_le()))
                .collect::<Vec<_>>();
            for (slot, point) in destination.iter_mut().zip(table.batch_mul(&scalars)) {
                *slot = encode(point);
            }
        });
    output
}
