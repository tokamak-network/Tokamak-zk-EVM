//! Current-query initialization and updates using only encoded Filecoin powers.
//! There is no tau/tag scalar input and no call to trusted setup.

use crate::phase2_pairing::{equal, PreparedG2};
use ark_bls12_381::{Fq, Fr, G1Affine, G1Projective, G2Affine};
use ark_ec::{AffineRepr, CurveGroup};
use ark_ff::{BigInteger, Field, One, PrimeField, Zero};
use ark_poly::{EvaluationDomain, Radix2EvaluationDomain};
use backend_univariate_crs_interface::{
    NonpublicQueryLayout, PreprocessKeysRkyv, ProverKeysRkyv, TauSequenceRkyv, UnivariateG1Rkyv,
    UnivariateG2Rkyv, VerifierKeysRkyv, WeightedQueryLayout,
};
use icicle_core::traits::FieldImpl;
use libs::frontend_artifacts::normalized_library::{NormalizedSubcircuitLibrary, PublicWireSource};
use libs::univariate_crs::{UnivariateCrsShape, UNIVARIATE_CRS_SCHEMA_ID};
use libs::univariate_field::canonical_root;
use libs::univariate_relation::NormalizedUnivariateSubcircuit;
use rayon::prelude::*;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct State {
    // Packed queries: nonpublic first, then free public, in final archive order.
    pub packed: Vec<G1Affine>,
    pub correction: Vec<G1Affine>,
    pub fixed: Vec<G1Affine>,
    pub fixed_correction: Vec<G1Affine>,
    pub weighted: Vec<G1Affine>,
    pub shifted: Vec<G1Affine>,
    pub masks: [G1Affine; 9],
    pub delta_g1: G1Affine,
    pub delta_g2: G2Affine,
    pub weights: Vec<G2Affine>,
}

pub(crate) struct Engine {
    initial: State,
    // Per-invocation public images only; not a persisted trust receipt.
    packed_images: Vec<G1Affine>,
    packed_wires: Vec<usize>,
    fixed_wires: Vec<usize>,
    nonpublic_count: usize,
    placements: usize,
    #[cfg(test)]
    state_checks: std::sync::atomic::AtomicUsize,
}

/// Immutable state qualified against this exact, immutably borrowed engine.
/// Only local initialization and full state verification can construct it.
pub(crate) struct VerifiedState<'a> {
    engine: &'a Engine,
    state: State,
}

impl VerifiedState<'_> {
    pub(crate) fn get(&self) -> &State {
        &self.state
    }

    pub(crate) fn contribute(&self, u: Fr, v: &[Fr]) -> Result<State, String> {
        self.engine.contribute(&self.state, u, v)
    }

    pub(crate) fn final_keys(
        &self,
        tau: &TauSequenceRkyv,
        library: &NormalizedSubcircuitLibrary,
    ) -> Result<(ProverKeysRkyv, PreprocessKeysRkyv, VerifierKeysRkyv), String> {
        self.engine.final_keys(&self.state, tau, library)
    }
}

impl<'a> VerifiedState<'a> {
    pub(crate) fn verify_successor(&self, state: State) -> Result<Self, String> {
        self.engine.verify_state(state)
    }
}

impl Engine {
    pub(crate) fn initial(&self) -> &State {
        &self.initial
    }

    #[cfg(test)]
    pub(crate) fn state_check_count(&self) -> usize {
        self.state_checks.load(std::sync::atomic::Ordering::Relaxed)
    }

    pub(crate) fn initial_state(&self) -> VerifiedState<'_> {
        VerifiedState {
            engine: self,
            state: self.initial.clone(),
        }
    }

    /// The caller authenticates the source before this function; malformed
    /// capacities and metadata are rejected before any indexed construction.
    pub(crate) fn initialize(
        library: &NormalizedSubcircuitLibrary,
        circuits: &[NormalizedUnivariateSubcircuit<'_>],
        tau: &TauSequenceRkyv,
    ) -> Result<Self, String> {
        #[cfg(feature = "timing")]
        let _initialize = libs::timing::SpanGuard::new("mpc.initialize", "mpc", vec![]);
        let setup = &library.setup;
        let shape =
            UnivariateCrsShape::from_normalized_setup(setup, library.public.free_public_len())
                .map_err(|e| e.to_string())?;
        let p = shape.declared_capacity[1];
        if tau.schema_id != UNIVARIATE_CRS_SCHEMA_ID
            || tau.s0_g1.len() != 2 * p + 1
            || tau.sxi_g1.len() != p + 1
            || tau.spsi_g1.len() != p + 1
            || tau.tau_powers_g2.len() != p + 1
        {
            return Err("source capacity does not match the selected library".into());
        }
        if circuits.len() != library.actual_subcircuit_count() {
            return Err("compiled catalog length mismatch".into());
        }
        for (k, c) in circuits.iter().enumerate() {
            if c.info.id != k {
                return Err("normalized circuit catalog ID/order mismatch".into());
            }
            for (active, rows) in [
                (c.a_active_wires, c.a_rows),
                (c.b_active_wires, c.b_rows),
                (c.c_active_wires, c.c_rows),
            ] {
                if rows.len() > setup.n
                    || active.iter().any(|j| *j >= setup.m)
                    || rows.iter().flatten().any(|(col, _)| *col >= active.len())
                {
                    return Err("invalid sparse R1CS coordinates".into());
                }
            }
        }
        let ordinary = decode_all(&tau.s0_g1)?;
        let xi = decode_all(&tau.sxi_g1)?;
        let psi = decode_all(&tau.spsi_g1)?;
        for n in [
            shape.arithmetic_domain_size,
            shape.connection_domain_size,
            shape.selection_domain_size,
            library.public.free_public_len(),
        ] {
            if ordinary[n] == ordinary[0] {
                return Err("source tau is inside an evaluation domain".into());
            }
        }
        let na = shape.arithmetic_domain_size;
        let nc = shape.connection_domain_size;
        let ns = shape.selection_domain_size;
        let k = shape.k;
        // IFFT of encoded powers yields commitments to the ordered Lagrange
        // basis. This is a group FFT, not evaluation at a recovered tau.
        let ((u, v), (w, b)) = rayon::join(
            || rayon::join(|| basis(&xi[..na]), || basis(&xi[k..k + na])),
            || rayon::join(|| basis(&psi[..na]), || basis(&psi[k..k + nc])),
        );
        let selection = basis(&ordinary[p + 1..p + 1 + ns]);
        let free = basis(&ordinary[..library.public.free_public_len()]);
        let layout = NonpublicQueryLayout::from_retained_wires(
            setup.s,
            library
                .subcircuits
                .iter()
                .map(|circuit| circuit.retained_nonpublic_wires())
                .collect::<Vec<_>>(),
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
        let image = |i: usize, c: &NormalizedUnivariateSubcircuit<'_>| {
            let mut result = vec![G1Projective::zero(); setup.m];
            for (active, rows, values) in [
                (c.a_active_wires, c.a_rows, &u),
                (c.b_active_wires, c.b_rows, &v),
                (c.c_active_wires, c.c_rows, &w),
            ] {
                for (row, terms) in rows.iter().enumerate() {
                    let base = values[i + setup.s * row];
                    for (column, coef) in terms {
                        result[active[*column]] +=
                            base * Fr::from_le_bytes_mod_order(&coef.to_bytes_le());
                    }
                }
            }
            for (j, value) in result[..setup.m_b].iter_mut().enumerate() {
                *value += b[i + setup.s * j];
            }
            result
        };
        let rows = (0..setup.s)
            .into_par_iter()
            .map(|i| {
                let mut out = Vec::new();
                for (k, c) in circuits.iter().enumerate() {
                    let values = image(i, c);
                    let correction = selection[i + setup.s * k];
                    for &j in layout.local_wires(k).unwrap() {
                        let row = weighted_layout
                            .compact_row(j)
                            .expect("retained non-public wire must have a compact weighted row");
                        out.push((values[j] + correction, correction, row));
                    }
                }
                out
            })
            .collect::<Vec<_>>();
        let mut packed = Vec::with_capacity(layout.len());
        let mut correction = Vec::with_capacity(layout.len());
        let mut packed_wires = Vec::with_capacity(layout.len());
        for row in rows {
            for (q, c, j) in row {
                packed.push(q);
                correction.push(c);
                packed_wires.push(j);
            }
        }
        let nonpublic_count = packed.len();
        let mut fixed = Vec::new();
        let mut fixed_correction = Vec::new();
        let mut fixed_wires = Vec::new();
        for public_index in 0..library.public.len() {
            let Some(PublicWireSource::Mapped {
                subcircuit_id: k,
                local_wire_index: j,
            }) = library.public.source(public_index)
            else {
                continue;
            };
            if k >= circuits.len() || k >= setup.s || j >= setup.m_b {
                return Err("invalid normalized public query coordinate".into());
            }
            let row = weighted_layout
                .compact_row(j)
                .map_err(|_| "public wire unexpectedly omitted from weighted layout")?;
            // Fixed placement i=k applies only to producer-declared public buffer wires.
            let c = selection[k + setup.s * k];
            let q = image(k, &circuits[k])[j] + c;
            if public_index < library.public.free_public_len() {
                packed.push(q + free[public_index]);
                correction.push(c);
                packed_wires.push(row);
            } else {
                fixed.push(q);
                fixed_correction.push(c);
                fixed_wires.push(row);
            }
        }
        let (packed, fixed) = rayon::join(|| normalize(packed), || normalize(fixed));
        let packed_images = normalize(
            packed
                .par_iter()
                .zip(&correction)
                .map(|(q, c)| *q - *c)
                .collect(),
        );
        let mut masks = [G1Affine::zero(); 9];
        for (slot, tag, shift, n) in [
            (0, &xi, 0, na),
            (2, &xi, k, na),
            (4, &psi, 0, na),
            (6, &psi, k, nc),
        ] {
            for a in 0..2 {
                masks[slot + a] = (tag[shift + a + n] - tag[shift + a]).into_affine();
            }
        }
        masks[8] = (ordinary[p + 1 + ns] - ordinary[p + 1]).into_affine();
        let weighted = (0..weighted_layout.retained_rows())
            .flat_map(|_| ordinary[..setup.s].iter().copied())
            .collect();
        let shifted = (0..weighted_layout.retained_rows())
            .flat_map(|_| ordinary[k..k + setup.s].iter().copied())
            .collect();
        Ok(Self {
            initial: State {
                packed,
                correction,
                fixed,
                fixed_correction,
                weighted,
                shifted,
                masks,
                delta_g1: G1Affine::generator(),
                delta_g2: G2Affine::generator(),
                weights: vec![G2Affine::generator(); weighted_layout.retained_rows()],
            },
            packed_images,
            packed_wires,
            fixed_wires,
            nonpublic_count,
            placements: setup.s,
            #[cfg(test)]
            state_checks: std::sync::atomic::AtomicUsize::new(0),
        })
    }

    // Production callers enter through VerifiedState, not an arbitrary State.
    fn contribute(&self, old: &State, u: Fr, v: &[Fr]) -> Result<State, String> {
        #[cfg(feature = "timing")]
        let _update = libs::timing::SpanGuard::new("mpc.update", "mpc", vec![]);
        if u.is_zero() || v.len() != old.weights.len() || v.iter().any(Zero::is_zero) {
            return Err("contribution needs one nonzero delta and m nonzero wire shares".into());
        }
        let inv = u.inverse().unwrap();
        let factors = zeroize::Zeroizing::new(v.iter().map(|v| *v * inv).collect::<Vec<_>>());
        let (packed, correction) = update_queries(
            &old.packed,
            &old.correction,
            &self.packed_wires,
            inv,
            &factors,
        );
        let (fixed, fixed_correction) = update_queries(
            &old.fixed,
            &old.fixed_correction,
            &self.fixed_wires,
            Fr::one(),
            v,
        );
        let scale = |points: &[G1Affine]| {
            normalize(
                points
                    .par_iter()
                    .enumerate()
                    .map(|(index, q)| *q * v[index / self.placements])
                    .collect(),
            )
        };
        Ok(State {
            packed,
            correction,
            fixed,
            fixed_correction,
            weighted: scale(&old.weighted),
            shifted: scale(&old.shifted),
            masks: old.masks.map(|q| (q * inv).into_affine()),
            delta_g1: (old.delta_g1 * u).into_affine(),
            delta_g2: (old.delta_g2 * u).into_affine(),
            weights: old
                .weights
                .iter()
                .zip(v)
                .map(|(q, v)| (*q * *v).into_affine())
                .collect(),
        })
    }

    /// These equations qualify the whole public state against locally derived
    /// initialization. Share knowledge and predecessor binding are separate.
    fn verify_state(&self, state: State) -> Result<VerifiedState<'_>, String> {
        #[cfg(feature = "timing")]
        let _verify = libs::timing::SpanGuard::new("mpc.verify_state", "mpc", vec![]);
        #[cfg(feature = "timing")]
        let points_span = libs::timing::SpanGuard::new("mpc.point_admission", "mpc", vec![]);
        #[cfg(test)]
        self.state_checks
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let init = &self.initial;
        if [
            state.packed.len(),
            state.correction.len(),
            state.fixed.len(),
            state.fixed_correction.len(),
            state.weighted.len(),
            state.shifted.len(),
            state.weights.len(),
        ] != [
            init.packed.len(),
            init.correction.len(),
            init.fixed.len(),
            init.fixed_correction.len(),
            init.weighted.len(),
            init.shifted.len(),
            init.weights.len(),
        ] {
            return Err("ceremony state shape mismatch".into());
        }
        let valid1 = |p: &G1Affine| p.is_on_curve() && p.is_in_correct_subgroup_assuming_on_curve();
        let valid2 = |p: &G2Affine| {
            !p.is_zero() && p.is_on_curve() && p.is_in_correct_subgroup_assuming_on_curve()
        };
        if ![
            &state.packed,
            &state.correction,
            &state.fixed,
            &state.fixed_correction,
            &state.weighted,
            &state.shifted,
        ]
        .into_iter()
        .all(|v| v.par_iter().all(valid1))
            || !state.masks.iter().all(valid1)
            || !valid1(&state.delta_g1)
            || state.delta_g1.is_zero()
            || !valid2(&state.delta_g2)
            || !state.weights.par_iter().all(valid2)
        {
            return Err("invalid ceremony point".into());
        }
        #[cfg(feature = "timing")]
        drop(points_span);
        #[cfg(feature = "timing")]
        let _equations = libs::timing::SpanGuard::new("mpc.state_equations", "mpc", vec![]);
        let h = PreparedG2::from(G2Affine::generator());
        let delta = PreparedG2::from(state.delta_g2);
        let weights = state
            .weights
            .par_iter()
            .copied()
            .map(PreparedG2::from)
            .collect::<Vec<_>>();
        if !equal(
            state.delta_g1,
            h.clone(),
            G1Affine::generator(),
            delta.clone(),
        ) {
            return Err("role encodings disagree".into());
        }
        let state_images = normalize(
            state
                .packed
                .par_iter()
                .zip(&state.correction)
                .map(|(q, c)| *q - *c)
                .collect(),
        );
        let packed_ok = (0..state.packed.len()).into_par_iter().all(|i| {
            equal(
                state_images[i],
                delta.clone(),
                self.packed_images[i],
                h.clone(),
            ) && equal(
                state.correction[i],
                delta.clone(),
                init.correction[i],
                weights[self.packed_wires[i]].clone(),
            )
        });
        let fixed_ok = (0..state.fixed.len()).into_par_iter().all(|i| {
            state.fixed[i] - state.fixed_correction[i] == init.fixed[i] - init.fixed_correction[i]
                && equal(
                    state.fixed_correction[i],
                    h.clone(),
                    init.fixed_correction[i],
                    weights[self.fixed_wires[i]].clone(),
                )
        });
        let helpers_ok = [
            (&state.weighted, &init.weighted),
            (&state.shifted, &init.shifted),
        ]
        .into_iter()
        .all(|(a, b)| {
            a.par_iter()
                .zip(b)
                .enumerate()
                .all(|(i, (a, b))| equal(*a, h.clone(), *b, weights[i / self.placements].clone()))
        });
        if !packed_ok
            || !fixed_ok
            || !helpers_ok
            || !state
                .masks
                .iter()
                .zip(init.masks)
                .all(|(a, b)| equal(*a, delta.clone(), b, h.clone()))
        {
            return Err("ceremony state does not match authenticated circuit/source images".into());
        }
        Ok(VerifiedState {
            engine: self,
            state,
        })
    }

    fn final_keys(
        &self,
        state: &State,
        tau: &TauSequenceRkyv,
        library: &NormalizedSubcircuitLibrary,
    ) -> Result<(ProverKeysRkyv, PreprocessKeysRkyv, VerifierKeysRkyv), String> {
        let setup = &library.setup;
        let shape =
            UnivariateCrsShape::from_normalized_setup(setup, library.public.free_public_len())
                .map_err(|e| e.to_string())?;
        #[cfg(feature = "timing")]
        let _projection = libs::timing::SpanGuard::new("mpc.final_projection", "mpc", vec![]);
        let enc = |values: &[G1Affine]| values.par_iter().copied().map(encode_g1).collect();
        let prover = ProverKeysRkyv {
            schema_id: UNIVARIATE_CRS_SCHEMA_ID.into(),
            weighted_g1: enc(&state.weighted),
            weighted_shifted_g1: enc(&state.shifted),
            nonpublic_queries: enc(&state.packed[..self.nonpublic_count]),
            free_public_queries: enc(&state.packed[self.nonpublic_count..]),
            mask_u: [encode_g1(state.masks[0]), encode_g1(state.masks[1])],
            mask_v: [encode_g1(state.masks[2]), encode_g1(state.masks[3])],
            mask_w: [encode_g1(state.masks[4]), encode_g1(state.masks[5])],
            mask_b: [encode_g1(state.masks[6]), encode_g1(state.masks[7])],
            mask_selection: encode_g1(state.masks[8]),
        };
        let preprocess = PreprocessKeysRkyv {
            schema_id: UNIVARIATE_CRS_SCHEMA_ID.into(),
            sc_g1: tau.s0_g1[..shape.connection_domain_size].to_vec(),
            selection_g2: tau.tau_powers_g2[shape.h..=shape.h + setup.s * (setup.t - 1)].to_vec(),
            fixed_public_queries: enc(&state.fixed),
        };
        let verifier = VerifierKeysRkyv {
            schema_id: UNIVARIATE_CRS_SCHEMA_ID.into(),
            one_g1: tau.s0_g1[0],
            xi_g1: tau.sxi_g1[0],
            psi_g1: tau.spsi_g1[0],
            one_g2: tau.tau_powers_g2[0],
            tau_g2: tau.tau_powers_g2[1],
            tau_k_g2: tau.tau_powers_g2[shape.k],
            delta_g2: encode_g2(state.delta_g2),
        };
        Ok((prover, preprocess, verifier))
    }
}

pub(crate) fn normalize(points: Vec<G1Projective>) -> Vec<G1Affine> {
    points
        .par_chunks(4096)
        .flat_map_iter(G1Projective::normalize_batch)
        .collect()
}

/// Fuse query/correction updates: (Q-C)/u + C', where C'=v*C/u.
/// Fixed-public queries use inverse=1 and factors=v. All points stay distinct.
pub(crate) fn update_queries(
    queries: &[G1Affine],
    corrections: &[G1Affine],
    wires: &[usize],
    inverse: Fr,
    factors: &[Fr],
) -> (Vec<G1Affine>, Vec<G1Affine>) {
    let unscaled = inverse.is_one();
    let (queries, corrections): (Vec<_>, Vec<_>) = queries
        .par_iter()
        .zip(corrections)
        .zip(wires)
        .map(|((q, c), j)| {
            let next_c = *c * factors[*j];
            let difference = *q - *c;
            let next_q = (if unscaled {
                difference
            } else {
                difference * inverse
            }) + next_c;
            (next_q, next_c)
        })
        .unzip();
    rayon::join(|| normalize(queries), || normalize(corrections))
}

fn basis(powers: &[G1Affine]) -> Vec<G1Affine> {
    let mut domain = Radix2EvaluationDomain::<Fr>::new(powers.len()).expect("validated domain");
    domain.group_gen = canonical_root(powers.len()).expect("validated root");
    domain.group_gen_inv = domain.group_gen.inverse().unwrap();
    let coefficients = powers
        .iter()
        .copied()
        .map(AffineRepr::into_group)
        .collect::<Vec<_>>();
    G1Projective::normalize_batch(&domain.ifft(&coefficients))
}
pub(crate) fn decode_all(points: &[UnivariateG1Rkyv]) -> Result<Vec<G1Affine>, String> {
    #[cfg(feature = "timing")]
    let _span = libs::timing::SpanGuard::new("mpc.source_decode", "mpc", vec![]);
    points
        .par_iter()
        .map(|p| {
            if p.x == [0; 48] && p.y == [0; 48] {
                return Ok(G1Affine::zero());
            }
            let x = Fq::from_le_bytes_mod_order(&p.x);
            let y = Fq::from_le_bytes_mod_order(&p.y);
            let q = G1Affine::new_unchecked(x, y);
            if x.into_bigint().to_bytes_le() != p.x
                || y.into_bigint().to_bytes_le() != p.y
                || !q.is_on_curve()
                || !q.is_in_correct_subgroup_assuming_on_curve()
            {
                return Err("invalid source G1 encoding".into());
            }
            Ok(q)
        })
        .collect()
}
pub(crate) fn encode_g1(p: G1Affine) -> UnivariateG1Rkyv {
    if p.is_zero() {
        return UnivariateG1Rkyv {
            x: [0; 48],
            y: [0; 48],
        };
    }
    UnivariateG1Rkyv {
        x: p.x.into_bigint().to_bytes_le().try_into().unwrap(),
        y: p.y.into_bigint().to_bytes_le().try_into().unwrap(),
    }
}
pub(crate) fn encode_g2(p: G2Affine) -> UnivariateG2Rkyv {
    let mut x = [0; 96];
    let mut y = [0; 96];
    if !p.is_zero() {
        x[..48].copy_from_slice(&p.x.c0.into_bigint().to_bytes_le());
        x[48..].copy_from_slice(&p.x.c1.into_bigint().to_bytes_le());
        y[..48].copy_from_slice(&p.y.c0.into_bigint().to_bytes_le());
        y[48..].copy_from_slice(&p.y.c1.into_bigint().to_bytes_le());
    }
    UnivariateG2Rkyv { x, y }
}

#[cfg(test)]
mod tests {
    use super::*;
    use icicle_bls12_381::curve::ScalarField;
    use libs::frontend_artifacts::normalized_library::{
        BufferDirection, NormalizedSetupParams, NormalizedSubcircuitInfo,
        NormalizedSubcircuitLibrary, PublicRegion, PublicWirePhase,
    };
    use libs::univariate_setup::{generate_normalized, SetupScalars};

    #[test]
    fn fused_updates_preserve_identity_unit_and_dense_cases() {
        use ark_ff::UniformRand;
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(15184);
        let scalars = (0..65).map(|_| Fr::rand(&mut rng)).collect::<Vec<_>>();
        let q = scalars
            .iter()
            .map(|s| (G1Affine::generator() * s).into_affine())
            .collect::<Vec<_>>();
        let mut c = q.iter().rev().copied().collect::<Vec<_>>();
        c[0] = G1Affine::zero();
        c[1] = q[1];
        let wires = (0..q.len()).map(|j| j % 4).collect::<Vec<_>>();
        for inverse in [Fr::one(), Fr::rand(&mut rng)] {
            for v in [[Fr::one(); 4], [Fr::rand(&mut rng); 4]] {
                let factors = v.map(|v| v * inverse);
                let (next, correction) = update_queries(&q, &c, &wires, inverse, &factors);
                for j in 0..q.len() {
                    assert_eq!(
                        next[j],
                        ((q[j] + c[j] * (v[wires[j]] - Fr::one())) * inverse).into_affine()
                    );
                    assert_eq!(correction[j], (c[j] * factors[wires[j]]).into_affine());
                }
            }
        }
        assert_eq!(
            update_queries(&[], &[], &[], Fr::one(), &[]),
            (vec![], vec![])
        );
        let points = vec![G1Projective::zero(); 4097];
        assert_eq!(normalize(points), vec![G1Affine::zero(); 4097]);
    }

    #[test]
    fn two_updates_match_every_trusted_setup_output_and_reject_tampering() {
        let setup = NormalizedSetupParams {
            n: 2,
            m: 4,
            m_b: 4,
            t: 4,
            s: 2,
            public_wire_phases: vec![
                PublicWirePhase {
                    name: "free".into(),
                    region: PublicRegion::Free,
                    subcircuit_ids: vec![0].into_boxed_slice(),
                },
                PublicWirePhase {
                    name: "fixed".into(),
                    region: PublicRegion::Fixed,
                    subcircuit_ids: vec![1].into_boxed_slice(),
                },
            ]
            .into_boxed_slice(),
        };
        let infos = (0..2)
            .map(|id| NormalizedSubcircuitInfo {
                id,
                name: format!("buffer-{id}"),
                Nwires: 4,
                NrealWires: 3,
                Nconsts: 2,
                Out_idx: [1, 1],
                In_idx: [2, 1],
                Wiring_idx: [0, 3],
                Public_idx: [1, 1],
                Internal_idx: [4, 0],
                bufferDirection: Some(BufferDirection::Out),
                publicPhase: Some(if id == 0 { "free" } else { "fixed" }.into()),
                logicalInterface: None,
            })
            .collect::<Vec<_>>()
            .into_boxed_slice();
        let library = NormalizedSubcircuitLibrary::new(setup, infos).unwrap();
        let active = [0, 1, 2];
        let a = [
            vec![(1, ScalarField::from_u32(2))],
            vec![(2, ScalarField::from_u32(3))],
        ];
        let b = [
            vec![(0, ScalarField::from_u32(5))],
            vec![(1, ScalarField::from_u32(7))],
        ];
        let c = [
            vec![(2, ScalarField::from_u32(11))],
            vec![(0, ScalarField::from_u32(13))],
        ];
        let circuits = library
            .subcircuits
            .iter()
            .map(|info| NormalizedUnivariateSubcircuit {
                info,
                a_active_wires: &active,
                b_active_wires: &active,
                c_active_wires: &active,
                a_rows: &a,
                b_rows: &b,
                c_rows: &c,
            })
            .collect::<Vec<_>>();
        let g1_bytes = encode_g1(G1Affine::generator());
        let g2_bytes = encode_g2(G2Affine::generator());
        let mut g1 = icicle_bls12_381::curve::G1Affine::zero();
        g1.x = FieldImpl::from_bytes_le(&g1_bytes.x);
        g1.y = FieldImpl::from_bytes_le(&g1_bytes.y);
        let mut g2 = icicle_bls12_381::curve::G2Affine::zero();
        g2.x = FieldImpl::from_bytes_le(&g2_bytes.x);
        g2.y = FieldImpl::from_bytes_le(&g2_bytes.y);
        let mut secret = SetupScalars {
            tau: ScalarField::from_u32(7),
            xi: ScalarField::from_u32(11),
            psi: ScalarField::from_u32(13),
            delta: ScalarField::one(),
            weights: vec![ScalarField::one(); library.setup.m],
        };
        let initial = generate_normalized(&library, &circuits, &secret, g1, g2).unwrap();
        let engine = Engine::initialize(&library, &circuits, &initial.tau).unwrap();
        let mut state = engine.initial.clone();
        for (u, v) in [(17u32, [19u32, 23, 29]), (37, [41, 43, 47])] {
            state = engine
                .contribute(&state, Fr::from(u), &v.map(Fr::from))
                .unwrap();
            secret.delta = secret.delta * ScalarField::from_u32(u);
            for (r, v) in secret.weights.iter_mut().zip(v) {
                *r = *r * ScalarField::from_u32(v);
            }
            let expected = generate_normalized(&library, &circuits, &secret, g1, g2).unwrap();
            let verified = engine.verify_state(state.clone()).unwrap();
            let (prover, preprocess, verifier) =
                verified.final_keys(&initial.tau, &library).unwrap();
            use backend_univariate_crs_interface::archive;
            macro_rules! same_bytes {
                ($a:expr, $b:expr) => {
                    assert_eq!(
                        archive::to_bytes::<archive::rancor::Error>(&$a)
                            .unwrap()
                            .as_slice(),
                        archive::to_bytes::<archive::rancor::Error>(&$b)
                            .unwrap()
                            .as_slice()
                    );
                };
            }
            same_bytes!(prover, expected.prover);
            same_bytes!(preprocess, expected.preprocess);
            same_bytes!(verifier, expected.verifier);
            same_bytes!(initial.tau, expected.tau);
            crate::publication::tests::check_local_retry(&expected);
        }
        // Every independently updated family must be checked, not just roles.
        for family in 0..9 {
            let mut bad = state.clone();
            let point = match family {
                0 => &mut bad.packed[0],
                1 => &mut bad.correction[0],
                2 => &mut bad.fixed[0],
                3 => &mut bad.fixed_correction[0],
                4 => &mut bad.weighted[0],
                5 => &mut bad.shifted[0],
                6 => &mut bad.masks[0],
                7 => &mut bad.masks[8],
                _ => &mut bad.delta_g1,
            };
            *point = (*point + G1Affine::generator()).into_affine();
            assert!(engine.verify_state(bad).is_err(), "family {family}");
        }
        let mut bad = state.clone();
        bad.weights[0] = G2Affine::zero();
        assert!(engine.verify_state(bad).is_err());
        let mut bad = state.clone();
        bad.packed[0] = G1Affine::new_unchecked(Fq::one(), Fq::one());
        assert!(!bad.packed[0].is_on_curve());
        assert!(engine.verify_state(bad).is_err());
        let mut bad = state.clone();
        bad.packed[0] = G1Affine::new_unchecked(Fq::zero(), Fq::from(2u64));
        assert!(bad.packed[0].is_on_curve());
        assert!(!bad.packed[0].is_in_correct_subgroup_assuming_on_curve());
        assert!(engine.verify_state(bad).is_err());
        let mut bad = state.clone();
        bad.packed.pop();
        assert!(engine.verify_state(bad).is_err());
        assert!(engine
            .contribute(&state, Fr::zero(), &vec![Fr::one(); library.setup.m])
            .is_err());
        assert!(engine.contribute(&state, Fr::one(), &[]).is_err());

        use crate::phase2_transcript::{Identity, Transcript};
        use rand::{rngs::StdRng, SeedableRng};
        let identity = Identity {
            mode: crate::circuit_input::Mode::Development,
            version: "2.1.5".into(),
            library_digest: [1; 32],
            tau_digest: [2; 32],
        };
        let checks = engine.state_check_count();
        let zero = Transcript::initialize(&engine, &identity).unwrap();
        assert_eq!(engine.state_check_count(), checks);
        let directory = tempfile::tempdir().unwrap();
        let first_path = directory.path().join("first.mpc");
        zero.write_new(&first_path).unwrap();
        let original = std::fs::read(&first_path).unwrap();
        assert!(zero.write_new(&first_path).is_err());
        assert_eq!(std::fs::read(&first_path).unwrap(), original);
        let one = zero.contribute(&mut StdRng::seed_from_u64(91)).unwrap();
        assert_eq!(engine.state_check_count(), checks + 1);
        let next_path = directory.path().join("next.mpc");
        one.write_new(&next_path).unwrap();
        let first = std::fs::read(&next_path).unwrap();
        let second = Transcript::read(first.clone(), &engine, &identity)
            .unwrap()
            .contribute(&mut StdRng::seed_from_u64(92))
            .unwrap();
        assert_eq!(second.contributions(), 2);
        // One external record is fully verified on import, then only the new
        // record is verified on append. Projection must not repeat either.
        assert_eq!(engine.state_check_count(), checks + 3);
        let projected = second.state().final_keys(&initial.tau, &library).unwrap();
        let key_bytes = |keys: &(ProverKeysRkyv, PreprocessKeysRkyv, VerifierKeysRkyv)| {
            backend_univariate_crs_interface::archive::to_bytes::<
                backend_univariate_crs_interface::archive::rancor::Error,
            >(keys)
            .unwrap()
            .to_vec()
        };
        assert_eq!(engine.state_check_count(), checks + 3);
        let second_path = directory.path().join("second.mpc");
        second.write_new(&second_path).unwrap();
        let imported =
            Transcript::read(std::fs::read(&second_path).unwrap(), &engine, &identity).unwrap();
        assert_eq!(engine.state_check_count(), checks + 5);
        assert_eq!(imported.file_digest(), second.file_digest());
        assert_eq!(imported.state().get(), second.state().get());
        assert_eq!(
            key_bytes(&imported.state().final_keys(&initial.tau, &library).unwrap()),
            key_bytes(&projected)
        );
        assert_eq!(engine.state_check_count(), checks + 5);

        // Match the continuous native fixture: two updates, two state checks,
        // byte-identical transcript and final keys to the external-read path.
        let continuous = Transcript::initialize(&engine, &identity)
            .unwrap()
            .contribute(&mut StdRng::seed_from_u64(91))
            .unwrap()
            .contribute(&mut StdRng::seed_from_u64(92))
            .unwrap();
        assert_eq!(engine.state_check_count(), checks + 7);
        assert_eq!(continuous.file_digest(), second.file_digest());
        assert_eq!(
            key_bytes(
                &continuous
                    .state()
                    .final_keys(&initial.tau, &library)
                    .unwrap()
            ),
            key_bytes(&projected)
        );
        assert_eq!(engine.state_check_count(), checks + 7);
        let mut replay = first.clone();
        replay.extend_from_slice(&first[original.len()..]);
        assert!(Transcript::read(replay, &engine, &identity).is_err());
        assert!(Transcript::read(first[..first.len() - 1].to_vec(), &engine, &identity).is_err());
        let mut trailing = first.clone();
        trailing.push(0);
        assert!(Transcript::read(trailing, &engine, &identity).is_err());
        let mut noncanonical = first.clone();
        noncanonical[original.len()..original.len() + 48].fill(0xff);
        assert!(Transcript::read(noncanonical, &engine, &identity).is_err());
        let mut modified = first.clone();
        *modified.last_mut().unwrap() ^= 1;
        assert!(Transcript::read(modified, &engine, &identity).is_err());
        let publish = Identity {
            mode: crate::circuit_input::Mode::Publish,
            version: identity.version.clone(),
            ..identity
        };
        assert!(Transcript::read(first.clone(), &engine, &publish).is_err());
        let other = Identity {
            version: "2.1.6".into(),
            ..identity
        };
        assert!(Transcript::read(first, &engine, &other).is_err());
    }
}
