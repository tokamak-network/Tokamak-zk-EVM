//! Share-knowledge evidence following Filecoin's SnapDeals phase 2.
//!
//! The group mapping is pinned to Filecoin 934fe8c / blstrs 0.4.1. Tokamak
//! binds its own source, library and transition; this is not a Filecoin receipt.

use crate::phase2_pairing::equal as pairing_equal;
use ark_bls12_381::{Fq, Fq2, Fr, G1Affine, G2Affine};
use ark_ec::{AffineRepr, CurveGroup};
use ark_ff::{BigInteger, PrimeField, Zero};
use blake2::{Blake2b, Digest};
use rand::{CryptoRng, RngCore, SeedableRng};
use rand_chacha::ChaCha20Rng;

use crate::filecoin_source::SOURCE_DIGEST;

/// Digests must be computed from the participant's independently authenticated
/// inputs and the states being checked, not copied from an untrusted receipt.
#[derive(Clone)]
pub(crate) struct ContributionBinding<'a> {
    pub library_version: &'a str,
    pub library_digest: [u8; 32],
    pub tau_digest: [u8; 32],
    pub previous_record_digest: [u8; 32],
    pub next_state_digest: [u8; 32],
}

#[derive(Clone, Copy)]
pub(crate) enum ShareRole {
    Delta,
    WireWeight(u64),
}

/// Only public points are retained. Neither the share nor RNG state is stored.
#[derive(Clone)]
pub(crate) struct ShareProof {
    pub share_g1: G1Affine,
    pub share_g2: G2Affine,
    pub s: G1Affine,
    pub s_share: G1Affine,
    pub r_share: G2Affine,
}

impl ShareProof {
    pub(crate) fn create(
        share: Fr,
        binding: &ContributionBinding<'_>,
        role: ShareRole,
        rng: &mut (impl RngCore + CryptoRng),
    ) -> Result<Self, &'static str> {
        if share.is_zero() {
            return Err("phase 2 contribution share must be nonzero");
        }
        Self::from_sample(share, binding, role, Self::sample_point(rng))
    }

    // Keep RNG consumption serial and unchanged when evaluating wire proofs
    // in parallel. Only public sampled points cross into the worker pool.
    pub(crate) fn sample_point(rng: &mut (impl RngCore + CryptoRng)) -> G1Affine {
        // As in Filecoin, sample a point, not a public scalar times a generator.
        loop {
            let mut message = [0; 64];
            rng.fill_bytes(&mut message);
            let mut point = blst::blst_p1::default();
            let mut bytes = [0; 96];
            // SAFETY: all buffers have the exact lengths passed to blst;
            // encode initializes point before serialization. This reproduces
            // blstrs 0.4.1's G1 random sampler, including its DST and AUG.
            unsafe {
                blst::blst_encode_to_g1(
                    &mut point,
                    message.as_ptr(),
                    message.len(),
                    [0u8; 16].as_ptr(),
                    16,
                    [0u8; 16].as_ptr(),
                    16,
                );
                blst::blst_p1_serialize(bytes.as_mut_ptr(), &point);
            }
            if bytes[0] & 0x40 != 0 {
                continue;
            }
            let s = G1Affine::new_unchecked(
                Fq::from_be_bytes_mod_order(&bytes[..48]),
                Fq::from_be_bytes_mod_order(&bytes[48..]),
            );
            if !s.is_zero() {
                break s;
            }
        }
    }

    pub(crate) fn from_sample(
        share: Fr,
        binding: &ContributionBinding<'_>,
        role: ShareRole,
        s: G1Affine,
    ) -> Result<Self, &'static str> {
        if share.is_zero() {
            return Err("phase 2 contribution share must be nonzero");
        }
        let share_g1 = (G1Affine::generator() * share).into_affine();
        let share_g2 = (G2Affine::generator() * share).into_affine();
        let s_share = (s * share).into_affine();
        let r = challenge(binding, role, share_g1, share_g2, s, s_share);
        if r.is_zero() {
            return Err("phase 2 hash-to-G2 produced the identity");
        }
        Ok(Self {
            share_g1,
            share_g2,
            s,
            s_share,
            r_share: (r * share).into_affine(),
        })
    }

    pub(crate) fn verify(&self, binding: &ContributionBinding<'_>, role: ShareRole) -> bool {
        // Validate before pairing even if a caller constructed affine values
        // without a checked decoder. Identity evidence proves no contribution.
        if [self.share_g1, self.s, self.s_share].iter().any(|p| {
            p.is_zero() || !p.is_on_curve() || !p.is_in_correct_subgroup_assuming_on_curve()
        }) || [self.share_g2, self.r_share].iter().any(|p| {
            p.is_zero() || !p.is_on_curve() || !p.is_in_correct_subgroup_assuming_on_curve()
        }) {
            return false;
        }
        let r = challenge(
            binding,
            role,
            self.share_g1,
            self.share_g2,
            self.s,
            self.s_share,
        );
        !r.is_zero()
            && pairing_equal(
                self.share_g1,
                G2Affine::generator(),
                G1Affine::generator(),
                self.share_g2,
            )
            && pairing_equal(self.s_share, G2Affine::generator(), self.s, self.share_g2)
            && pairing_equal(self.s_share, r, self.s, self.r_share)
    }
}

fn challenge(
    binding: &ContributionBinding<'_>,
    role: ShareRole,
    share_g1: G1Affine,
    share_g2: G2Affine,
    s: G1Affine,
    s_share: G1Affine,
) -> G2Affine {
    let mut hash = Blake2b::new();
    hash.input(b"TOKAMAK_MPC_PHASE2_SHARE");
    hash.input(SOURCE_DIGEST.as_bytes());
    hash.input((binding.library_version.len() as u64).to_be_bytes());
    hash.input(binding.library_version.as_bytes());
    hash.input(binding.library_digest);
    hash.input(binding.tau_digest);
    hash.input(binding.previous_record_digest);
    hash.input(binding.next_state_digest);
    match role {
        ShareRole::Delta => hash.input([0]),
        ShareRole::WireWeight(j) => {
            hash.input([1]);
            hash.input(j.to_be_bytes());
        }
    }
    hash.input(g1_bytes(share_g1));
    hash.input(g2_bytes(share_g2));
    hash.input(g1_bytes(s));
    hash.input(g1_bytes(s_share));
    hash_to_g2(hash.result().as_slice().try_into().unwrap())
}

// These are transcript encodings, not the little-endian common CRS format.
// Filecoin uses uncompressed big-endian G1 and G2 (c1 before c0).
fn g1_bytes(point: G1Affine) -> [u8; 96] {
    let mut out = [0; 96];
    out[..48].copy_from_slice(&point.x.into_bigint().to_bytes_be());
    out[48..].copy_from_slice(&point.y.into_bigint().to_bytes_be());
    out
}

fn g2_bytes(point: G2Affine) -> [u8; 192] {
    let mut out = [0; 192];
    for (chunk, coordinate) in out
        .chunks_exact_mut(48)
        .zip([point.x.c1, point.x.c0, point.y.c1, point.y.c0])
    {
        chunk.copy_from_slice(&coordinate.into_bigint().to_bytes_be());
    }
    out
}

fn hash_to_g2(digest: &[u8; 64]) -> G2Affine {
    // Filecoin 934fe8c: the first 32 digest bytes seed ChaCha20, whose bytes
    // feed blstrs 0.4.1's G2Projective::random (blst_encode_to_g2). Do not
    // replace point sampling with Fr::random followed by generator scaling.
    let seed = digest[..32].try_into().unwrap();
    let mut message = [0; 64];
    ChaCha20Rng::from_seed(seed).fill_bytes(&mut message);
    let mut point = blst::blst_p2::default();
    let mut bytes = [0; 192];
    // SAFETY: all input/output buffers match their lengths. encode initializes
    // point before serialization. Call the exact blst primitive underneath
    // blstrs 0.4.1 rather than resolving its obsolete ff/group dependency tree.
    unsafe {
        blst::blst_encode_to_g2(
            &mut point,
            message.as_ptr(),
            message.len(),
            [0u8; 16].as_ptr(),
            16,
            [0u8; 16].as_ptr(),
            16,
        );
        blst::blst_p2_serialize(bytes.as_mut_ptr(), &point);
    }
    if bytes[0] & 0x40 != 0 {
        return G2Affine::zero();
    }
    G2Affine::new_unchecked(
        Fq2::new(
            Fq::from_be_bytes_mod_order(&bytes[48..96]),
            Fq::from_be_bytes_mod_order(&bytes[..48]),
        ),
        Fq2::new(
            Fq::from_be_bytes_mod_order(&bytes[144..]),
            Fq::from_be_bytes_mod_order(&bytes[96..144]),
        ),
    )
}

#[cfg(test)]
#[path = "contribution_proof_tests.rs"]
mod tests;
