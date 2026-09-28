//! One U23--U33 schedule for arkworks CPU and ICICLE CUDA.
pub mod engine;
mod msm_kernel;
#[cfg(test)]
mod optimization_tests;
pub mod prepare;
use crate::univariate_crs::ProverCrs;
use backend_interface::ProofBytes;
use backend_univariate_crs_interface::UnivariateG1Rkyv;
use engine::Engine;
use libs::{
    frontend_artifacts::normalized_library::{
        NormalizedSetupParams, NormalizedSubcircuitLibrary, PublicWireSource,
    },
    univariate_field::ProtocolField,
    univariate_transcript::{
        encode_binary_g1_message as point_message, CanonicalTranscriptEncoder,
        UnivariateChallenges, UnivariateTranscript,
    },
};
use thiserror::Error;
#[derive(Debug, Error)]
pub enum UnivariateProverError {
    #[error("{0}")]
    Invalid(String),
    #[error("copy recursion denominator vanishes at connection-domain index {index}")]
    CopyDenominator { index: usize },
    #[error("copy recursion does not close around the connection domain")]
    CopyRecurrenceDoesNotClose,
    #[error("{relation} polynomial has a nonzero vanishing remainder")]
    Unsatisfied { relation: &'static str },
}
impl From<String> for UnivariateProverError {
    fn from(e: String) -> Self {
        Self::Invalid(e)
    }
}
pub struct ProverRandomizers<F> {
    pub u: [F; 2],
    pub v: [F; 2],
    pub w: [F; 2],
    pub b: [F; 2],
    pub r: [F; 4],
    pub selection: F,
}
impl<F: ProtocolField> ProverRandomizers<F> {
    pub fn sample() -> Self {
        use rand::{rngs::OsRng, RngCore};
        // Uniform rejection sampling from the OS CSPRNG, never benchmark masks.
        let values: Vec<F> = (0..13)
            .map(|_| loop {
                let mut bytes = [0; 32];
                OsRng.fill_bytes(&mut bytes);
                if libs::univariate_field::canonical_scalar(&bytes) {
                    break F::from_le(&bytes);
                }
            })
            .collect();
        Self {
            u: values[0..2].try_into().unwrap(),
            v: values[2..4].try_into().unwrap(),
            w: values[4..6].try_into().unwrap(),
            b: values[6..8].try_into().unwrap(),
            r: values[8..12].try_into().unwrap(),
            selection: values[12],
        }
    }
}
pub struct DomainPolynomial<F> {
    pub evaluations: Vec<F>,
    pub coefficients: Vec<F>,
}
pub struct Prepared<F> {
    pub slots: Vec<Option<Box<[F]>>>,
    pub public_inputs: Vec<F>,
    pub maps: [DomainPolynomial<F>; 4],
    pub s_c: DomainPolynomial<F>,
}
pub struct ProvingInput<'a, E: Engine> {
    pub crs: &'a ProverCrs,
    pub library: &'a NormalizedSubcircuitLibrary,
    pub selector: &'a [Option<usize>],
    pub prepared: &'a Prepared<E::F>,
    pub randomizers: &'a ProverRandomizers<E::F>,
}
pub fn prove<E: Engine>(
    input: ProvingInput<'_, E>,
) -> Result<(ProofBytes, UnivariateChallenges<E::F>), UnivariateProverError> {
    #[cfg(feature = "timing")]
    let _span = crate::timing::SpanGuard::new("univariate.protocol", "prove", vec![]);
    let ProvingInput {
        crs,
        library,
        selector,
        prepared,
        randomizers: masks,
    } = input;
    let setup = &library.setup;
    let l_free = library.public.free_public_len();
    let shape = &crs.shape;
    let na = shape.arithmetic_domain_size;
    let nc = shape.connection_domain_size;
    let root = E::F::from_le(&shape.connection_root.canonical_le());
    prepare::validate_public(library, selector, &prepared.slots, &prepared.public_inputs)?;
    E::initialize(
        (2 * (na.max(nc) + 4))
            .next_power_of_two()
            .max((shape.selection_domain_size + 1).next_power_of_two()),
    )?;
    let (u, v, w, b, qa) = crate::time_block!("univariate.arithmetic", "prove", {
        let u = blind::<E>(&prepared.maps[0].coefficients, &masks.u, na);
        let v = blind::<E>(&prepared.maps[1].coefficients, &masks.v, na);
        let w = blind::<E>(&prepared.maps[2].coefficients, &masks.w, na);
        let b = blind::<E>(&prepared.maps[3].coefficients, &masks.b, nc);
        let q = E::divide_vanishing(&E::sub(&E::mul(&u, &v), &w), na, "arithmetic")?;
        (u, v, w, b, q)
    });
    let a = E::interpolate(
        &prepared.public_inputs[..l_free],
        prepare::root::<E::F>(l_free)?,
    );
    let c_l = commit_sum::<E>(
        "C_L",
        &[
            (&crs.tau.s0_g1, &E::coefficients(&a), 0),
            (&crs.tau.sxi_g1, &E::coefficients(&u), 0),
            (&crs.tau.spsi_g1, &E::coefficients(&w), 0),
        ],
    )?;
    let c_h = commit_sum::<E>(
        "C_H",
        &[
            (&crs.tau.sxi_g1, &E::coefficients(&v), 0),
            (&crs.tau.spsi_g1, &E::coefficients(&b), 0),
        ],
    )?;
    let c_o = crate::time_block!("univariate.binding", "prove", {
        binding::<E>(crs, library, selector, prepared, masks)?
    });
    let (d_q, d_q_k) = crate::time_block!("univariate.selection", "prove", {
        let (q, zv) = selection::<E>(crs, setup, selector, &prepared.slots)?;
        let zm: Vec<_> = zv.iter().map(|x| *x * masks.selection).collect();
        (
            commit_sum::<E>(
                "D_Q",
                &[(&crs.keys.weighted_g1, &q, 0), (&crs.tau.s0_g1, &zm, 0)],
            )?,
            commit_sum::<E>(
                "D_QK",
                &[
                    (&crs.keys.weighted_shifted_g1, &q, 0),
                    (&crs.tau.s0_g1, &zm, shape.k),
                ],
            )?,
        )
    });
    let mut tr =
        UnivariateTranscript::<E::F>::from_public_inputs(&prepared.public_inputs[..l_free]);
    tr.set_message(&point_message("F2.a1", &[c_l, c_h, c_o, d_q, d_q_k]));
    let upsilon = tr.challenge(1, 0);
    let c_d = commit_sum::<E>(
        "C_D",
        &[
            (&crs.tau.s0_g1, &E::coefficients(&a), shape.k),
            (
                &crs.tau.sxi_g1,
                &E::coefficients(&E::add(&u, &E::scale(&v, upsilon))),
                shape.k,
            ),
            (
                &crs.tau.spsi_g1,
                &E::coefficients(&E::add(&w, &E::scale(&b, upsilon))),
                shape.k,
            ),
        ],
    )?;
    tr.set_message(&point_message("F2.a2", &[c_d]));
    let (beta, gamma_c) = tr.challenge_pair(2);
    let sc = E::polynomial(&prepared.s_c.coefficients);
    let (r, q0, q1) = crate::time_block!("univariate.copy", "prove", {
        copy_relation::<E>(
            root,
            nc,
            &prepared.maps[3].evaluations,
            &prepared.s_c,
            &b,
            beta,
            gamma_c,
            &masks.r,
        )?
    });
    let c_r = commit_sum::<E>("C_R", &[(&crs.tau.s0_g1, &E::coefficients(&r), 0)])?;
    tr.set_message(&point_message("F2.a3", &[c_r]));
    let theta = tr.challenge(3, 0);
    let q = E::add(
        &E::add(&qa, &E::scale(&q0, theta)),
        &E::scale(&q1, theta.pow(2)),
    );
    let c_q = commit_sum::<E>("C_Q", &[(&crs.tau.s0_g1, &E::coefficients(&q), 0)])?;
    tr.set_message(&point_message("F2.a4", &[c_q]));
    let chi = tr.chi(na, nc);
    let evals = [
        E::eval(&sc, chi),
        E::eval(&u, chi),
        E::eval(&v, chi),
        E::eval(&w, chi),
        E::eval(&b, chi),
        E::eval(&r, chi),
        E::eval(&r, chi * root),
    ];
    let mut msg = CanonicalTranscriptEncoder::new();
    for (label, value) in ["s_C", "u", "v", "w", "b", "r", "r_plus"]
        .iter()
        .zip(&evals)
    {
        msg = msg.scalar(label, value);
    }
    tr.set_message(&msg.finish());
    let varpi = tr.challenge(5, 0);
    let (pi_chi, pi_plus) = crate::time_block!("univariate.openings", "prove", {
        let ordinary = E::add(
            &E::add(
                &E::add(&a, &E::scale(&r, varpi.pow(2))),
                &E::scale(&q, varpi.pow(3)),
            ),
            &E::scale(&sc, varpi.pow(4)),
        );
        let xi = E::add(&u, &E::scale(&v, varpi));
        let psi = E::add(&w, &E::scale(&b, varpi));
        (
            commit_sum::<E>(
                "Pi_chi",
                &[
                    (&crs.tau.s0_g1, &opening::<E>(&ordinary, chi), 0),
                    (&crs.tau.sxi_g1, &opening::<E>(&xi, chi), 0),
                    (&crs.tau.spsi_g1, &opening::<E>(&psi, chi), 0),
                ],
            )?,
            commit_sum::<E>(
                "Pi_plus",
                &[(&crs.tau.s0_g1, &opening::<E>(&r, chi * root), 0)],
            )?,
        )
    });
    tr.set_message(&point_message("F2.a6", &[pi_chi, pi_plus]));
    let mu = tr.nonzero_challenge(6, 0);
    let [s_c, u, v, w, b, r, r_plus] = evals.map(ProtocolField::canonical_le);
    Ok((
        ProofBytes {
            c_l,
            c_h,
            c_o,
            d_q,
            d_q_k,
            c_d,
            c_r,
            c_q,
            pi_chi,
            pi_plus,
            s_c,
            u,
            v,
            w,
            b,
            r,
            r_plus,
        },
        UnivariateChallenges {
            upsilon,
            beta,
            gamma_c,
            theta,
            chi,
            varpi,
            mu,
        },
    ))
}
fn commit_sum<E: Engine>(
    _label: &'static str,
    terms: &[(&[UnivariateG1Rkyv], &[E::F], usize)],
) -> Result<[u8; 96], UnivariateProverError> {
    #[cfg(feature = "timing")]
    let _span = crate::timing::SpanGuard::new("univariate.commit", _label, vec![]);
    #[cfg(feature = "timing")]
    let gathering = crate::timing::SpanGuard::new("univariate.commit.gather", _label, vec![]);
    let count = terms
        .iter()
        .try_fold(0usize, |n, (_, v, _)| n.checked_add(v.len()))
        .ok_or("MSM capacity overflow".to_owned())?;
    let mut bases = Vec::with_capacity(count);
    let mut scalars = Vec::with_capacity(count);
    for (source, values, offset) in terms {
        let end = offset
            .checked_add(values.len())
            .ok_or("MSM exponent overflow".to_owned())?;
        bases.extend_from_slice(
            source
                .get(*offset..end)
                .ok_or("polynomial exceeds CRS powers".to_owned())?,
        );
        scalars.extend_from_slice(values);
    }
    #[cfg(feature = "timing")]
    drop(gathering);
    #[cfg(feature = "timing")]
    diagnose_msm(_label, bases.len(), &scalars);
    E::msm(&bases, &scalars)
}
#[cfg(feature = "timing")]
fn diagnose_msm<F: ProtocolField>(label: &str, bases: usize, scalars: &[F]) {
    // Counts only; enable in a separate diagnostic run, never timed trials.
    if std::env::var_os("PROVE_MSM_DIAGNOSTICS").is_some() {
        eprintln!(
            "MSM_DIAGNOSTICS {}",
            serde_json::json!({"commitment":label,
            "bases":bases,"scalars":scalars.len(),
            "nonzero":scalars.iter().filter(|s| **s != F::zero()).count()})
        );
    }
}
fn binding<E: Engine>(
    crs: &ProverCrs,
    library: &NormalizedSubcircuitLibrary,
    selector: &[Option<usize>],
    data: &Prepared<E::F>,
    masks: &ProverRandomizers<E::F>,
) -> Result<[u8; 96], UnivariateProverError> {
    #[cfg(feature = "timing")]
    let gathering = crate::timing::SpanGuard::new("univariate.commit.gather", "C_O", vec![]);
    let mut bases = Vec::new();
    let mut values = Vec::new();
    for (query, public_index) in
        crs.keys
            .free_public_queries
            .iter()
            .zip((0..library.public.free_public_len()).filter(|index| {
                matches!(
                    library.public.source(*index),
                    Some(PublicWireSource::Mapped { .. })
                )
            }))
    {
        bases.push(*query);
        values.push(data.public_inputs[public_index]);
    }
    for (i, k) in selector.iter().enumerate() {
        if let Some(k) = k {
            let witness = data.slots[i]
                .as_ref()
                .ok_or("missing selected witness".to_owned())?;
            for (query, j) in crs.keys.nonpublic_queries
                [crs.layout.range(i, *k).map_err(str::to_owned)?]
            .iter()
            .zip(crs.layout.local_wires(*k).map_err(str::to_owned)?)
            {
                bases.push(*query);
                values.push(witness[*j]);
            }
        }
    }
    for (queries, mask) in [
        (&crs.keys.mask_u, &masks.u),
        (&crs.keys.mask_v, &masks.v),
        (&crs.keys.mask_w, &masks.w),
        (&crs.keys.mask_b, &masks.b),
    ] {
        bases.extend_from_slice(queries);
        values.extend_from_slice(mask);
    }
    bases.push(crs.keys.mask_selection);
    values.push(masks.selection);
    #[cfg(feature = "timing")]
    drop(gathering);
    #[cfg(feature = "timing")]
    diagnose_msm("C_O", bases.len(), &values);
    E::msm(&bases, &values)
}
fn blind<E: Engine>(values: &[E::F], mask: &[E::F], n: usize) -> E::P {
    let mut c = values.to_vec();
    c.resize(n + mask.len(), E::F::zero());
    for (i, v) in mask.iter().enumerate() {
        c[i] = c[i] - *v;
        c[n + i] = c[n + i] + *v;
    }
    E::polynomial(&c)
}
fn opening<E: Engine>(p: &E::P, z: E::F) -> Vec<E::F> {
    let c = E::coefficients(p);
    if c.len() == 1 {
        return vec![E::F::zero()];
    }
    let mut q = vec![E::F::zero(); c.len() - 1];
    let mut acc = *c.last().unwrap();
    for i in (0..q.len()).rev() {
        q[i] = acc;
        acc = c[i] + z * acc;
    }
    q
}
pub(crate) fn selection<E: Engine>(
    crs: &ProverCrs,
    setup: &NormalizedSetupParams,
    selector: &[Option<usize>],
    slots: &[Option<Box<[E::F]>>],
) -> Result<(Vec<E::F>, Vec<E::F>), UnivariateProverError> {
    #[cfg(feature = "timing")]
    let _span =
        crate::timing::SpanGuard::new("univariate.selection.interpolate", "polynomial", vec![]);
    let s = setup.s;
    let size = crs.shape.selection_domain_size;
    let omega = E::F::from_le(&crs.shape.selection_root.canonical_le());
    let roots: Vec<_> = selector
        .iter()
        .enumerate()
        .map(|(i, k)| omega.pow(i + s * k.unwrap_or(setup.t - 1)))
        .collect();
    let mut tree: Vec<_> = roots
        .iter()
        .map(|z| E::polynomial(&[E::F::zero() - *z, E::F::one()]))
        .collect();
    while tree.len() > 1 {
        tree = tree.chunks_exact(2).map(|p| E::mul(&p[0], &p[1])).collect();
    }
    let zv = E::coefficients(&tree[0]);
    let inverse = E::F::from_usize(size).inv();
    let mut cofactors = vec![E::F::zero(); s * s];
    for (row, z) in cofactors.chunks_mut(s).zip(&roots) {
        let scale = *z * inverse;
        let mut c = zv[s];
        for a in (0..s).rev() {
            row[a] = c * scale;
            c = zv[a] + *z * c;
        }
    }
    // The CRS stores weighted bases only for library-declared real local-wire
    // ranges. Build scalars in that same row-major compact order: local wire,
    // then placement. Runtime-zero witnesses remain represented.
    let witness: Vec<_> = crs
        .weighted_layout
        .retained_wires()
        .flat_map(|j| {
            slots.iter().map(move |slot| {
                slot.as_ref()
                    .and_then(|w| w.get(j))
                    .copied()
                    .unwrap_or(E::F::zero())
            })
        })
        .collect();
    Ok((E::cofactor_sums(&cofactors, &witness, s)?, zv))
}
fn copy_relation<E: Engine>(
    root: E::F,
    n: usize,
    b_values: &[E::F],
    sc: &DomainPolynomial<E::F>,
    b: &E::P,
    beta: E::F,
    gamma: E::F,
    mask: &[E::F; 4],
) -> Result<(E::P, E::P, E::P), UnivariateProverError> {
    if b_values.len() != n || sc.evaluations.len() != n {
        return Err("connection dimensions mismatch".to_owned().into());
    }
    #[cfg(feature = "timing")]
    let denominator_span =
        crate::timing::SpanGuard::new("univariate.copy.denominators", "copy", vec![]);
    let mut denominators = Vec::with_capacity(n);
    let mut z = E::F::one();
    for (i, b) in b_values.iter().enumerate() {
        let d = *b + beta * z + gamma;
        if d == E::F::zero() {
            return Err(UnivariateProverError::CopyDenominator { index: i });
        }
        denominators.push(d);
        z = z * root;
    }
    #[cfg(feature = "timing")]
    drop(denominator_span);
    crate::time_block!("univariate.copy.inversion", "copy", {
        E::invert(&mut denominators)?
    });
    #[cfg(feature = "timing")]
    let recurrence_span =
        crate::timing::SpanGuard::new("univariate.copy.recurrence", "copy", vec![]);
    let mut values = Vec::with_capacity(n);
    let mut product = E::F::one();
    for i in 0..n {
        values.push(product);
        product = product * (b_values[i] + beta * sc.evaluations[i] + gamma) * denominators[i];
    }
    if product != E::F::one() {
        return Err(UnivariateProverError::CopyRecurrenceDoesNotClose);
    }
    #[cfg(feature = "timing")]
    drop(recurrence_span);
    let r = crate::time_block!("univariate.copy.interpolate", "copy", {
        blind::<E>(&E::coefficients(&E::interpolate(&values, root)), mask, n)
    });
    let f = E::add(
        &E::add(b, &E::scale(&E::polynomial(&sc.coefficients), beta)),
        &E::polynomial(&[gamma]),
    );
    let g = E::add(b, &E::polynomial(&[gamma, beta]));
    #[cfg(feature = "timing")]
    let boundary_span = crate::timing::SpanGuard::new("univariate.copy.boundary", "copy", vec![]);
    let q0 = boundary_quotient::<E>(&r, n)?;
    #[cfg(feature = "timing")]
    drop(boundary_span);
    #[cfg(feature = "timing")]
    let _products = crate::timing::SpanGuard::new("univariate.copy.products", "copy", vec![]);
    let mut shifted = E::coefficients(&r);
    let mut power = E::F::one();
    for c in &mut shifted {
        *c = *c * power;
        power = power * root;
    }
    let q1 = E::divide_vanishing(
        &E::sub(&E::mul(&E::polynomial(&shifted), &g), &E::mul(&r, &f)),
        n,
        "copy recurrence",
    )?;
    Ok((r, q0, q1))
}

fn boundary_quotient<E: Engine>(r: &E::P, n: usize) -> Result<E::P, UnivariateProverError> {
    // L0 = (X^n - 1)/(n*(X - 1)); cancel the vanishing factor before
    // multiplication. The remainder check still enforces r(1) = 1,
    // including the blinded high-degree coefficients.
    let mut coefficients = E::coefficients(r);
    coefficients[0] = coefficients[0] - E::F::one();
    let mut quotient = vec![E::F::zero(); coefficients.len().saturating_sub(1).max(1)];
    let mut remainder = *coefficients.last().unwrap();
    for i in (0..coefficients.len() - 1).rev() {
        quotient[i] = remainder;
        remainder = remainder + coefficients[i];
    }
    if remainder != E::F::zero() {
        return Err(UnivariateProverError::Unsatisfied {
            relation: "copy boundary",
        });
    }
    Ok(E::scale(
        &E::polynomial(&quotient),
        E::F::from_usize(n).inv(),
    ))
}
