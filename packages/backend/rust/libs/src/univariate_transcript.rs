//! Canonical Keccak-256 Fiat--Shamir transcript for the univariate protocol.
//!
//! F1 fixes the verifier configuration before every random-oracle query. The
//! proof-time transcript therefore contains only the public-input vector,
//! prover messages, and preceding challenges described by F2--F4.

use crate::group_structures::G1serde;
use crate::univariate_field::{canonical_scalar, ProtocolField};
use crate::univariate_proof::UnivariateProof;
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use tiny_keccak::Keccak;

pub const UNIVARIATE_FIAT_SHAMIR_SCHEMA_ID: &str = "tokamak-zk-evm-univariate-fs";
const TRANSCRIPT_DOMAIN: &[u8] = UNIVARIATE_FIAT_SHAMIR_SCHEMA_ID.as_bytes();

/// The seven scalar challenges from the six F3 rounds, in protocol order.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UnivariateChallenges<F = ScalarField> {
    pub upsilon: F,
    pub beta: F,
    pub gamma_c: F,
    pub theta: F,
    pub chi: F,
    pub varpi: F,
    pub mu: F,
}

/// Builds an injective type-tagged, length-prefixed encoding for F2--F4.
#[derive(Clone, Debug, Default)]
pub struct CanonicalTranscriptEncoder {
    bytes: Vec<u8>,
}

impl CanonicalTranscriptEncoder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn bytes(mut self, label: &str, value: &[u8]) -> Self {
        self.push(label, value);
        self
    }

    pub fn u32(mut self, label: &str, value: u32) -> Self {
        self.push(label, &value.to_be_bytes());
        self
    }

    pub fn scalar<F: ProtocolField>(mut self, label: &str, value: &F) -> Self {
        self.push(label, &scalar_bytes(value));
        self
    }

    pub fn g1(mut self, label: &str, value: &G1serde) -> Self {
        self.push(label, &g1_bytes(value));
        self
    }

    pub fn finish(self) -> Vec<u8> {
        self.bytes
    }

    fn push(&mut self, label: &str, value: &[u8]) {
        let label = label.as_bytes();
        let label_len = u32::try_from(label.len()).expect("transcript label length exceeds u32");
        let value_len = u64::try_from(value.len()).expect("transcript value length exceeds u64");
        self.bytes.extend_from_slice(&label_len.to_be_bytes());
        self.bytes.extend_from_slice(label);
        self.bytes.extend_from_slice(&value_len.to_be_bytes());
        self.bytes.extend_from_slice(value);
    }
}

/// State for the F4 challenge schedule after canonical public-input encoding.
#[derive(Clone, Debug)]
pub struct UnivariateTranscript<F = ScalarField> {
    field: std::marker::PhantomData<F>,
    input: Vec<u8>,
    message: Vec<u8>,
}

impl<F: ProtocolField> UnivariateTranscript<F> {
    /// Creates F4 state for one validated fixed verifier configuration and its
    /// adaptive public-input statement. The configuration itself is excluded
    /// by F1 and must have been admitted by the caller before this method.
    pub fn from_public_inputs(public_inputs: &[F]) -> Self {
        Self {
            field: std::marker::PhantomData,
            input: encode_public_inputs(public_inputs),
            message: Vec::new(),
        }
    }

    /// Replaces the preceding message; F4 hashes only the immediate predecessor.
    pub fn set_message(&mut self, encoded_message: &[u8]) {
        self.message = encoded_message.to_vec();
    }

    /// Derives one ordinary field challenge and records it for later rounds.
    pub fn challenge(&mut self, round: u8, output_index: u8) -> F {
        let value = self.sample_value(round, output_index, |_| true);
        self.record_challenges(&[value]);
        value
    }

    /// Samples F3's paired `(beta, gamma_C)` output from one F4 state. Neither
    /// coordinate may influence the other coordinate's oracle input.
    pub fn challenge_pair(&mut self, round: u8) -> (F, F) {
        let first = self.sample_value(round, 0, |_| true);
        let second = self.sample_value(round, 1, |_| true);
        self.record_challenges(&[first, second]);
        (first, second)
    }

    /// Derives F3's `chi`, excluding zero and both protocol domains.
    pub fn chi(&mut self, arithmetic_size: usize, connection_size: usize) -> F {
        let value = self.sample_value(4, 0, |value| {
            *value != F::zero()
                && value.pow(arithmetic_size) != F::one()
                && value.pow(connection_size) != F::one()
        });
        self.record_challenges(&[value]);
        value
    }

    /// Derives F3's nonzero `mu`.
    pub fn nonzero_challenge(&mut self, round: u8, output_index: u8) -> F {
        let value = self.sample_value(round, output_index, |value| *value != F::zero());
        self.record_challenges(&[value]);
        value
    }

    /// Runs F2--F4 after callers append each prover message block exactly
    /// once. The message encodings are caller-owned typed encodings.
    pub fn derive_challenges(
        &mut self,
        a1: &[u8],
        a2: &[u8],
        a3: &[u8],
        a4: &[u8],
        a5: &[u8],
        a6: &[u8],
        arithmetic_size: usize,
        connection_size: usize,
    ) -> UnivariateChallenges<F> {
        self.set_message(a1);
        let upsilon = self.challenge(1, 0);
        self.set_message(a2);
        let (beta, gamma_c) = self.challenge_pair(2);
        self.set_message(a3);
        let theta = self.challenge(3, 0);
        self.set_message(a4);
        let chi = self.chi(arithmetic_size, connection_size);
        self.set_message(a5);
        let varpi = self.challenge(5, 0);
        self.set_message(a6);
        let mu = self.nonzero_challenge(6, 0);
        UnivariateChallenges {
            upsilon,
            beta,
            gamma_c,
            theta,
            chi,
            varpi,
            mu,
        }
    }

    fn sample_value<Accept>(&self, round: u8, output_index: u8, accepts: Accept) -> F
    where
        Accept: Fn(&F) -> bool,
    {
        for counter in 0u32.. {
            let input = self.oracle_input(round, output_index, counter);
            let Some(value) = digest_to_scalar(keccak256(&input)) else {
                continue;
            };
            if !accepts(&value) {
                continue;
            }
            return value;
        }
        unreachable!("u32 rejection counter exhausted")
    }

    fn oracle_input(&self, round: u8, output_index: u8, counter: u32) -> Vec<u8> {
        CanonicalTranscriptEncoder::new()
            .bytes("protocol", TRANSCRIPT_DOMAIN)
            .u32("round", u32::from(round))
            .u32("output-index", u32::from(output_index))
            .bytes("input", &self.input)
            .bytes("message", &self.message)
            .u32("rejection-counter", counter)
            .finish()
    }

    fn record_challenges(&mut self, values: &[F]) {
        let mut encoder = CanonicalTranscriptEncoder::new();
        for (index, value) in values.iter().enumerate() {
            encoder = encoder.scalar(&format!("challenge.{index}"), value);
        }
        self.input = encoder.finish();
    }
}

/// Canonically encodes F1's adaptive statement `a` without any fixed verifier
/// configuration field.
pub fn encode_public_inputs<F: ProtocolField>(public_inputs: &[F]) -> Vec<u8> {
    let mut encoder = CanonicalTranscriptEncoder::new().u32(
        "public-input-count",
        u32::try_from(public_inputs.len()).expect("public-input count exceeds u32"),
    );
    for (index, value) in public_inputs.iter().enumerate() {
        encoder = encoder.scalar(&format!("public-input.{index}"), value);
    }
    encoder.finish()
}

/// Encodes one F2--F4 affine-point message block.  Both prover construction
/// and verifier replay use this function so the proof wire object is the only
/// source of the message sequence.
pub fn encode_g1_message_block(label: &str, points: &[G1serde]) -> Vec<u8> {
    let mut encoder = CanonicalTranscriptEncoder::new().u32(
        "count",
        u32::try_from(points.len()).expect("point-message count exceeds u32"),
    );
    for (index, point) in points.iter().enumerate() {
        encoder = encoder.g1(&format!("{label}.{index}"), point);
    }
    encoder.finish()
}

/// Encodes F2.a5's seven field evaluations in their protocol order.
pub fn encode_evaluation_message_block(proof: &UnivariateProof) -> Vec<u8> {
    CanonicalTranscriptEncoder::new()
        .scalar("s_C", &proof.s_c.0)
        .scalar("u", &proof.u.0)
        .scalar("v", &proof.v.0)
        .scalar("w", &proof.w.0)
        .scalar("b", &proof.b.0)
        .scalar("r", &proof.r.0)
        .scalar("r_plus", &proof.r_plus.0)
        .finish()
}

/// Replays F2--F4 from F5's canonical proof messages.  The fixed verifier
/// configuration is deliberately not an argument: F1 admits it before this
/// proof-time transcript is constructed.
pub fn derive_proof_challenges(
    public_inputs: &[ScalarField],
    proof: &UnivariateProof,
    arithmetic_size: usize,
    connection_size: usize,
) -> UnivariateChallenges {
    UnivariateTranscript::from_public_inputs(public_inputs).derive_challenges(
        &encode_g1_message_block(
            "F2.a1",
            &[proof.c_l, proof.c_h, proof.c_o, proof.d_q, proof.d_q_k],
        ),
        &encode_g1_message_block("F2.a2", &[proof.c_d]),
        &encode_g1_message_block("F2.a3", &[proof.c_r]),
        &encode_g1_message_block("F2.a4", &[proof.c_q]),
        &encode_evaluation_message_block(proof),
        &encode_g1_message_block("F2.a6", &[proof.pi_chi, proof.pi_plus]),
        arithmetic_size,
        connection_size,
    )
}

fn keccak256(input: &[u8]) -> [u8; 32] {
    let mut output = [0u8; 32];
    let mut hasher = Keccak::new_keccak256();
    hasher.update(input);
    hasher.finalize(&mut output);
    output
}

/// Encode canonical affine bytes in F2 message order, independent of the
/// arithmetic engine. Artifact coordinates are little-endian; F4 uses big-endian.
pub fn encode_binary_g1_message(label: &str, points: &[[u8; 96]]) -> Vec<u8> {
    let mut e = CanonicalTranscriptEncoder::new().u32("count", points.len().try_into().unwrap());
    for (i, p) in points.iter().enumerate() {
        let mut be = *p;
        be[..48].reverse();
        be[48..].reverse();
        e = e.bytes(&format!("{label}.{i}"), &be);
    }
    e.finish()
}

/// Replay the current binary proof after canonical field and point admission.
/// Fixed CRS and circuit preprocessing never enter the proof transcript.
pub fn derive_binary_proof_challenges<F: ProtocolField>(
    public_inputs: &[F],
    proof: &backend_interface::ProofBytes,
    arithmetic_size: usize,
    connection_size: usize,
) -> UnivariateChallenges<F> {
    let mut evaluations = CanonicalTranscriptEncoder::new();
    for (label, bytes) in ["s_C", "u", "v", "w", "b", "r", "r_plus"].into_iter().zip([
        proof.s_c,
        proof.u,
        proof.v,
        proof.w,
        proof.b,
        proof.r,
        proof.r_plus,
    ]) {
        evaluations = evaluations.scalar(label, &F::from_le(&bytes));
    }
    UnivariateTranscript::from_public_inputs(public_inputs).derive_challenges(
        &encode_binary_g1_message(
            "F2.a1",
            &[proof.c_l, proof.c_h, proof.c_o, proof.d_q, proof.d_q_k],
        ),
        &encode_binary_g1_message("F2.a2", &[proof.c_d]),
        &encode_binary_g1_message("F2.a3", &[proof.c_r]),
        &encode_binary_g1_message("F2.a4", &[proof.c_q]),
        &evaluations.finish(),
        &encode_binary_g1_message("F2.a6", &[proof.pi_chi, proof.pi_plus]),
        arithmetic_size,
        connection_size,
    )
}

fn digest_to_scalar<F: ProtocolField>(digest: [u8; 32]) -> Option<F> {
    let mut bytes = digest;
    bytes.reverse();
    canonical_scalar(&bytes).then(|| F::from_le(&bytes))
}

fn scalar_bytes<F: ProtocolField>(value: &F) -> [u8; 32] {
    let mut bytes = value.canonical_le();
    bytes.reverse();
    bytes.try_into().expect("BLS scalar must fit in 32 bytes")
}

fn g1_bytes(value: &G1serde) -> [u8; 96] {
    let mut output = [0u8; 96];
    for (index, coordinate) in [&value.0.x, &value.0.y].into_iter().enumerate() {
        let mut bytes = coordinate.to_bytes_le();
        bytes.resize(48, 0);
        bytes.reverse();
        output[index * 48..(index + 1) * 48].copy_from_slice(&bytes);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::field_structures::FieldSerde;
    use ark_bls12_381::Fr;
    use icicle_bls12_381::curve::{BaseField, G1Affine};
    use icicle_core::traits::FieldImpl;
    #[test]
    fn transcript_is_deterministic_and_binds_only_the_public_statement() {
        let public_inputs = [ScalarField::from_u32(7), ScalarField::from_u32(11)];
        let mut left = UnivariateTranscript::from_public_inputs(&public_inputs);
        left.set_message(b"a1");
        let upsilon = left.challenge(1, 0);
        let (beta, gamma) = left.challenge_pair(2);
        left.set_message(b"a2");
        let theta = left.challenge(3, 0);

        let mut same = UnivariateTranscript::from_public_inputs(&public_inputs);
        same.set_message(b"a1");
        assert_eq!(upsilon, same.challenge(1, 0));
        assert_eq!((beta, gamma), same.challenge_pair(2));
        same.set_message(b"a2");
        assert_eq!(theta, same.challenge(3, 0));

        let mut changed = UnivariateTranscript::from_public_inputs(&[ScalarField::from_u32(8)]);
        changed.set_message(b"a1");
        assert_ne!(upsilon, changed.challenge(1, 0));
    }

    #[test]
    fn current_six_rounds_match_contract_preimages_and_challenges() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../common/contracts/fixtures/univariate-fiat-shamir.json"
        ))
        .unwrap();
        let messages = fixture["messages"].as_array().unwrap();
        let point = |message: usize, index: usize| {
            let text = messages[message][index].as_str().unwrap();
            G1serde(G1Affine::from_limbs(
                BaseField::from_hex(&text[..96]).into(),
                BaseField::from_hex(&text[96..]).into(),
            ))
        };
        let scalar = |index: usize| {
            FieldSerde(ScalarField::from_u32(
                messages[4][index].as_str().unwrap().parse().unwrap(),
            ))
        };
        let proof = UnivariateProof {
            c_l: point(0, 0),
            c_h: point(0, 1),
            c_o: point(0, 2),
            d_q: point(0, 3),
            d_q_k: point(0, 4),
            c_d: point(1, 0),
            c_r: point(2, 0),
            c_q: point(3, 0),
            s_c: scalar(0),
            u: scalar(1),
            v: scalar(2),
            w: scalar(3),
            b: scalar(4),
            r: scalar(5),
            r_plus: scalar(6),
            pi_chi: point(5, 0),
            pi_plus: point(5, 1),
        };
        let inputs = fixture["publicInputs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| ScalarField::from_u32(v.as_str().unwrap().parse().unwrap()))
            .collect::<Vec<_>>();
        let na = fixture["arithmeticSize"].as_u64().unwrap() as usize;
        let nc = fixture["connectionSize"].as_u64().unwrap() as usize;
        let blocks = [
            encode_g1_message_block(
                "F2.a1",
                &[proof.c_l, proof.c_h, proof.c_o, proof.d_q, proof.d_q_k],
            ),
            encode_g1_message_block("F2.a2", &[proof.c_d]),
            encode_g1_message_block("F2.a3", &[proof.c_r]),
            encode_g1_message_block("F2.a4", &[proof.c_q]),
            encode_evaluation_message_block(&proof),
            encode_g1_message_block("F2.a6", &[proof.pi_chi, proof.pi_plus]),
        ];
        let mut transcript = UnivariateTranscript::from_public_inputs(&inputs);
        let ark_inputs: Vec<Fr> = inputs
            .iter()
            .map(|v| Fr::from_le(&v.canonical_le()))
            .collect();
        let mut ark_transcript = UnivariateTranscript::from_public_inputs(&ark_inputs);
        for (i, block) in blocks.iter().enumerate() {
            let round = (i + 1) as u8;
            transcript.set_message(block);
            ark_transcript.set_message(block);
            let expected = fixture["expected"][i].as_array().unwrap();
            for (index, vector) in expected.iter().enumerate() {
                assert_eq!(
                    ark_transcript.oracle_input(
                        round,
                        index as u8,
                        vector["counter"].as_u64().unwrap() as u32
                    ),
                    transcript.oracle_input(
                        round,
                        index as u8,
                        vector["counter"].as_u64().unwrap() as u32
                    )
                );
                assert_eq!(
                    hex::encode(transcript.oracle_input(
                        round,
                        index as u8,
                        vector["counter"].as_u64().unwrap() as u32
                    )),
                    vector["preimage"].as_str().unwrap()
                );
            }
            let actual = match round {
                2 => {
                    let (a, b) = transcript.challenge_pair(round);
                    vec![a, b]
                }
                4 => vec![transcript.chi(na, nc)],
                6 => vec![transcript.nonzero_challenge(round, 0)],
                _ => vec![transcript.challenge(round, 0)],
            };
            let ark_actual = match round {
                2 => {
                    let (a, b) = ark_transcript.challenge_pair(round);
                    vec![a, b]
                }
                4 => vec![ark_transcript.chi(na, nc)],
                6 => vec![ark_transcript.nonzero_challenge(round, 0)],
                _ => vec![ark_transcript.challenge(round, 0)],
            };
            assert_eq!(
                actual.iter().map(|v| v.canonical_le()).collect::<Vec<_>>(),
                ark_actual
                    .iter()
                    .map(|v| v.canonical_le())
                    .collect::<Vec<_>>()
            );
            for (value, vector) in actual.iter().zip(expected) {
                assert_eq!(
                    *value,
                    ScalarField::from_hex(vector["value"].as_str().unwrap())
                );
            }
        }
        let replay = derive_proof_challenges(&inputs, &proof, na, nc);
        assert_eq!(
            replay.mu,
            ScalarField::from_hex(fixture["expected"][5][0]["value"].as_str().unwrap())
        );
    }

    #[test]
    fn predecessor_replaces_history_and_scalar_conversion_rejects_noncanonical_digest() {
        let mut first = UnivariateTranscript::from_public_inputs(&[ScalarField::from_u32(1)]);
        let mut second = UnivariateTranscript::from_public_inputs(&[ScalarField::from_u32(2)]);
        let previous = [ScalarField::from_u32(3), ScalarField::from_u32(4)];
        first.record_challenges(&previous);
        second.record_challenges(&previous);
        first.set_message(b"same");
        second.set_message(b"same");
        assert_eq!(first.oracle_input(3, 0, 0), second.oracle_input(3, 0, 0));
        assert!(digest_to_scalar::<ScalarField>([255; 32]).is_none());
        assert_eq!(digest_to_scalar([0; 32]), Some(ScalarField::from_u32(0)));
    }
}
