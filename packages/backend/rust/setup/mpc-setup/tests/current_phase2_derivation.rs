//! Test-only algebra checks for the current-protocol MPC design gate.
//! These are not a contribution protocol, a knowledge proof, or a security proof.
//! All scalars are deliberately public oracle inputs. No production code may
//! obtain the correction terms below by recovering a participant's secret.

use ark_bls12_381::{Bls12_381, Fr, G1Affine, G1Projective, G2Projective};
use ark_ec::{pairing::Pairing, AffineRepr, CurveGroup, PrimeGroup};
use ark_ff::{BigInteger, Field, PrimeField, Zero};

fn point(value: Fr) -> G1Projective {
    G1Projective::generator() * value
}

#[test]
fn filecoin_generator_probe_matches_bls12_381_coordinates() {
    // Bytes 64..159 of challenge_19, fetched in a bounded probe on 2026-09-12.
    // This checks a coordinate encoding, not source authenticity or all points.
    let generator = G1Affine::generator();
    let hex = |bytes: Vec<u8>| bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
    assert_eq!(hex(generator.x.into_bigint().to_bytes_be()),
        "17f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb");
    assert_eq!(hex(generator.y.into_bigint().to_bytes_be()),
        "08b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1");
}

#[test]
fn filecoin_pinned_parameter_ranges_cover_current_capacity() {
    // Upstream 2bd49903, small_bls12_381::Bls12CeremonyParameters:
    // REQUIRED_POWER = 27; uncompressed accumulator from parameters.rs.
    let length = 1u64 << 27;
    let p = 524_291u64;
    assert!(2 * p <= 2 * length - 2);
    assert!(p < length);
    assert_eq!(
        64 + (2 * length - 1) * 96 + length * 192 + 2 * length * 96 + 192,
        77_309_411_488
    );
}

#[test]
fn delta_only_reference_update_preserves_a_fixed_numerator() {
    let numerator = Fr::from(53u64);
    let mut delta = Fr::from(7u64);
    let mut query = point(numerator / delta);
    for share in [Fr::from(11u64), Fr::from(13u64)] {
        query *= share.inverse().unwrap();
        delta *= share;
        assert_eq!(query, point(numerator / delta));
    }
}

#[test]
fn packed_weight_updates_need_a_correction_not_uniform_scaling() {
    // A is the tagged arithmetic/interface contribution; B is tau^S L_i,k.
    // A free-public M term is included in A for the second case.
    for public_term in [Fr::from(0u64), Fr::from(17u64)] {
        let a = Fr::from(19u64) + public_term;
        let b = Fr::from(23u64);
        let mut delta = Fr::from(7u64);
        let mut weight = Fr::from(5u64);
        let mut packed = point((a + weight * b) / delta);
        let mut fixed = point(a + weight * b);
        let mut helper = point(weight * Fr::from(29u64));
        let mut mask = point(Fr::from(31u64) / delta);

        for (delta_share, weight_share) in [(11u64, 13u64), (37, 41)] {
            let u = Fr::from(delta_share);
            let v = Fr::from(weight_share);
            let new_delta = delta * u;
            let new_weight = weight * v;
            let expected = point((a + new_weight * b) / new_delta);

            // Neither the Groth16 delta-only update nor scaling the entire
            // packed query by v/u updates its two summands correctly.
            assert_ne!(packed * u.inverse().unwrap(), expected);
            assert_ne!(packed * (v / u), expected);

            // This identity needs a separately available role-scaled selection
            // summand. Constructing it from known scalars is an oracle only.
            let selection = point(weight * b / delta);
            assert_eq!(packed - selection, point(a / delta));
            packed = (packed + selection * (v - Fr::from(1u64))) * u.inverse().unwrap();
            assert_eq!(packed, expected);

            fixed += point(weight * b) * (v - Fr::from(1u64));
            helper *= v;
            mask *= u.inverse().unwrap();
            delta = new_delta;
            weight = new_weight;
            assert_eq!(fixed, point(a + weight * b));
            assert_eq!(helper, point(weight * Fr::from(29u64)));
            assert_eq!(mask, point(Fr::from(31u64) / delta));
        }
    }
}

// A small public-point model of the proposed intermediate state. It does not
// serialize ceremony artifacts or replace share proofs of knowledge.
#[derive(Clone)]
struct QueryState {
    packed: G1Projective,
    selection: G1Projective,
    fixed: G1Projective,
    fixed_selection: G1Projective,
    helpers: [G1Projective; 2],
    masks: [G1Projective; 9],
    delta_g1: G1Projective,
    delta_g2: G2Projective,
    weight_g2: G2Projective,
}

#[derive(Clone, Copy)]
struct SharePoints {
    delta_g1: G1Projective,
    delta_g2: G2Projective,
    weight_g1: G1Projective,
    weight_g2: G2Projective,
}

fn point2(value: Fr) -> G2Projective {
    G2Projective::generator() * value
}

fn pairing_equal(a: G1Projective, b: G2Projective, c: G1Projective, d: G2Projective) -> bool {
    Bls12_381::pairing(a.into_affine(), b.into_affine())
        == Bls12_381::pairing(c.into_affine(), d.into_affine())
}

impl QueryState {
    // The initializer receives group-linear images, not tau/tag scalars.
    // Delta and each weight start at one; participant updates randomize them.
    fn initialize(a: G1Projective, t: G1Projective, fixed_a: G1Projective) -> Self {
        Self {
            packed: a + t,
            selection: t,
            fixed: fixed_a + t,
            fixed_selection: t,
            helpers: [point(Fr::from(29u64)), point(Fr::from(31u64))],
            masks: std::array::from_fn(|i| point(Fr::from(37 + i as u64))),
            delta_g1: G1Projective::generator(),
            delta_g2: G2Projective::generator(),
            weight_g2: G2Projective::generator(),
        }
    }

    // Only the participant's own shares are scalar inputs. Neither cumulative
    // delta/weight nor tau/xi/psi is required to update the public points.
    fn contribute(&self, u: Fr, v: Fr) -> Option<(Self, SharePoints)> {
        let inverse = u.inverse()?;
        if v.is_zero() {
            return None;
        }
        let one = Fr::from(1u64);
        Some((
            Self {
                packed: (self.packed + self.selection * (v - one)) * inverse,
                selection: self.selection * (v * inverse),
                fixed: self.fixed + self.fixed_selection * (v - one),
                fixed_selection: self.fixed_selection * v,
                helpers: self.helpers.map(|p| p * v),
                masks: self.masks.map(|p| p * inverse),
                delta_g1: self.delta_g1 * u,
                delta_g2: self.delta_g2 * u,
                weight_g2: self.weight_g2 * v,
            },
            SharePoints {
                delta_g1: point(u),
                delta_g2: point2(u),
                weight_g1: point(v),
                weight_g2: point2(v),
            },
        ))
    }
}

// Algebraic consistency only. This deliberately cannot authorize a production
// contribution: receipt binding and Verify_dl for both shares remain mandatory.
fn consistent_transition(old: &QueryState, new: &QueryState, share: SharePoints) -> bool {
    let g = G1Projective::generator();
    let h = G2Projective::generator();
    !share.delta_g1.is_zero()
        && !share.delta_g2.is_zero()
        && !share.weight_g1.is_zero()
        && !share.weight_g2.is_zero()
        && !new.delta_g1.is_zero()
        && !new.delta_g2.is_zero()
        && !new.weight_g2.is_zero()
        && pairing_equal(share.delta_g1, h, g, share.delta_g2)
        && pairing_equal(share.weight_g1, h, g, share.weight_g2)
        && pairing_equal(new.delta_g1, h, old.delta_g1, share.delta_g2)
        && pairing_equal(new.delta_g1, h, g, new.delta_g2)
        && pairing_equal(share.weight_g1, old.weight_g2, g, new.weight_g2)
        && pairing_equal(
            new.packed - new.selection,
            share.delta_g2,
            old.packed - old.selection,
            h,
        )
        && pairing_equal(
            new.selection,
            share.delta_g2,
            old.selection,
            share.weight_g2,
        )
        && new.fixed - new.fixed_selection == old.fixed - old.fixed_selection
        && pairing_equal(new.fixed_selection, h, old.fixed_selection, share.weight_g2)
        && old
            .helpers
            .iter()
            .zip(&new.helpers)
            .all(|(a, b)| pairing_equal(*b, h, *a, share.weight_g2))
        && old
            .masks
            .iter()
            .zip(&new.masks)
            .all(|(a, b)| pairing_equal(*b, share.delta_g2, *a, h))
}

#[test]
fn public_intermediate_points_support_two_contributions_without_old_secrets() {
    // Zero arithmetic columns are valid; only role/share points must be nonzero.
    // The second case represents a free query with its interpolation term.
    for a in [Fr::zero(), Fr::from(19u64) + Fr::from(17u64)] {
        let t = Fr::from(23u64);
        let fixed_a = Fr::from(47u64);
        let initial = QueryState::initialize(point(a), point(t), point(fixed_a));
        let mut state = initial.clone();
        let mut delta = Fr::from(1u64);
        let mut weight = Fr::from(1u64);
        for (u, v) in [(11u64, 13u64), (37, 41)] {
            let u = Fr::from(u);
            let v = Fr::from(v);
            let (next, receipt) = state.contribute(u, v).unwrap();
            assert!(consistent_transition(&state, &next, receipt));
            delta *= u;
            weight *= v;
            assert_eq!(next.packed, point((a + weight * t) / delta));
            assert_eq!(next.fixed, point(fixed_a + weight * t));
            assert_eq!(next.selection, point(weight * t / delta));
            assert_eq!(next.delta_g2, point2(delta));
            let h = G2Projective::generator();
            assert!(pairing_equal(
                next.packed - next.selection,
                next.delta_g2,
                point(a),
                h
            ));
            assert!(pairing_equal(
                next.selection,
                next.delta_g2,
                point(t),
                next.weight_g2
            ));
            assert!(pairing_equal(
                next.fixed_selection,
                h,
                point(t),
                next.weight_g2
            ));
            for (base, helper) in initial.helpers.iter().zip(&next.helpers) {
                assert_eq!(*helper, *base * weight);
                assert!(pairing_equal(*helper, h, *base, next.weight_g2));
            }
            for (base, mask) in initial.masks.iter().zip(&next.masks) {
                assert_eq!(*mask, *base * delta.inverse().unwrap());
                assert!(pairing_equal(*mask, next.delta_g2, *base, h));
            }
            state = next;
        }
    }
}

#[test]
fn public_transition_equations_reject_corruption_in_each_mutable_family() {
    let old = QueryState::initialize(
        point(Fr::from(19u64)),
        point(Fr::from(23u64)),
        point(Fr::from(47u64)),
    );
    let (new, share) = old.contribute(Fr::from(11u64), Fr::from(13u64)).unwrap();
    // Each point is checked independently: cancellation across families cannot
    // hide a bad update in this unbatched correctness baseline.
    for index in 0..18 {
        let mut bad = new.clone();
        let g = G1Projective::generator();
        let h = G2Projective::generator();
        match index {
            0 => bad.packed += g,
            1 => bad.selection += g,
            2 => bad.fixed += g,
            3 => bad.fixed_selection += g,
            4..=5 => bad.helpers[index - 4] += g,
            6..=14 => bad.masks[index - 6] += g,
            15 => bad.delta_g1 += g,
            16 => bad.delta_g2 += h,
            17 => bad.weight_g2 += h,
            _ => unreachable!(),
        }
        assert!(
            !consistent_transition(&old, &bad, share),
            "accepted corruption {index}"
        );
    }
    let mut wrong_wire_share = share;
    wrong_wire_share.weight_g1 = point(Fr::from(17u64));
    wrong_wire_share.weight_g2 = point2(Fr::from(17u64));
    assert!(!consistent_transition(&old, &new, wrong_wire_share));
    assert!(!consistent_transition(&new, &old, share));
    let zero = Fr::zero();
    let one = Fr::from(1u64);
    assert!(old.contribute(zero, one).is_none());
    assert!(old.contribute(one, zero).is_none());
    let mut zero_share = share;
    zero_share.delta_g1 = G1Projective::zero();
    zero_share.delta_g2 = G2Projective::zero();
    assert!(!consistent_transition(&old, &new, zero_share));
}
