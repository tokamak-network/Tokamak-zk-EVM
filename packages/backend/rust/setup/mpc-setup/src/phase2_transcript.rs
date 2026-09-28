//! Append-only public contribution records. Initialization is derived locally,
//! never deserialized from the coordinator. No source-verification receipt is
//! accepted here: callers must construct the engine from authenticated inputs.

use crate::circuit_input::Mode;
use crate::contribution_proof::{ContributionBinding, ShareProof, ShareRole};
use crate::phase2_engine::{Engine, State, VerifiedState};
use crate::phase2_pairing::equal;
use ark_bls12_381::{Fr, G1Affine, G2Affine};
use ark_ec::AffineRepr;
use ark_ff::{UniformRand, Zero};
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use rand::{CryptoRng, RngCore};
use rayon::prelude::*;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use zeroize::Zeroizing;

const TRANSCRIPT_MAGIC: &[u8] = b"TOKAMAK_MPC_PHASE2_TRANSCRIPT_V1\0";
const TRANSCRIPT_FORMAT_VERSION: u8 = 1;

pub(crate) struct Identity {
    pub mode: Mode,
    pub version: String,
    pub library_digest: [u8; 32],
    pub tau_digest: [u8; 32],
}

pub(crate) struct Transcript<'a> {
    bytes: Vec<u8>,
    state: VerifiedState<'a>,
    identity: &'a Identity,
    contributions: usize,
    digest: [u8; 32],
}

impl<'a> Transcript<'a> {
    pub(crate) fn state(&self) -> &VerifiedState<'a> {
        &self.state
    }

    pub(crate) fn contributions(&self) -> usize {
        self.contributions
    }

    pub fn file_digest(&self) -> String {
        format!("{:x}", Sha256::digest(&self.bytes))
    }

    pub(crate) fn library_version_from_file(path: &Path) -> Result<Option<String>, String> {
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        read_library_version(&mut file)
    }

    pub fn initialize(engine: &'a Engine, identity: &'a Identity) -> Result<Self, String> {
        let library_version = match identity.mode {
            Mode::Development => None,
            Mode::Publish => Some(identity.version.as_str()),
        };
        let mut bytes = encode_header(library_version)?;
        let mut context = Sha256::new();
        // Even byte-identical circuit inputs cannot promote a development
        // ceremony into a publish ceremony. The record chain inherits this binding.
        context.update(&bytes);
        context.update((identity.mode.name().len() as u64).to_be_bytes());
        context.update(identity.mode.name().as_bytes());
        context.update((identity.version.len() as u64).to_be_bytes());
        context.update(identity.version.as_bytes());
        context.update(identity.library_digest);
        context.update(identity.tau_digest);
        context.update(encode_state(engine.initial())?);
        bytes.extend_from_slice(&context.finalize());
        Ok(Self {
            digest: Sha256::digest(&bytes).into(),
            bytes,
            state: engine.initial_state(),
            identity,
            contributions: 0,
        })
    }

    pub fn read(
        bytes: Vec<u8>,
        engine: &'a Engine,
        identity: &'a Identity,
    ) -> Result<Self, String> {
        let mut result = Self::initialize(engine, identity)?;
        if !bytes.starts_with(&result.bytes) {
            return Err(
                "transcript is not bound to the locally authenticated initialization".into(),
            );
        }
        let mut input = &bytes[result.bytes.len()..];
        while !input.is_empty() {
            result.verify_record(&mut input)?;
        }
        result.bytes = bytes;
        Ok(result)
    }

    /// Check one record against the already-qualified prefix. Both external
    /// reads and local appends validate the same serialized record bytes here.
    fn verify_record(&mut self, input: &mut &[u8]) -> Result<(), String> {
        #[cfg(feature = "timing")]
        let _record = libs::timing::SpanGuard::new("mpc.verify_record", "mpc", vec![]);
        let record_start = *input;
        let state = decode_state(input, self.state.get())?;
        let state_length = record_start.len() - input.len();
        let binding = ContributionBinding {
            library_version: &self.identity.version,
            library_digest: self.identity.library_digest,
            tau_digest: self.identity.tau_digest,
            // Includes the prior receipt, so replaying even an identity
            // update (share=1) cannot duplicate a contribution.
            previous_record_digest: self.digest,
            next_state_digest: state_digest(&record_start[..state_length]),
        };
        #[cfg(feature = "timing")]
        let proofs_span = libs::timing::SpanGuard::new("mpc.share_verification", "mpc", vec![]);
        let delta = decode_proof(input)?;
        if !delta.verify(&binding, ShareRole::Delta) {
            return Err("invalid delta contribution".into());
        }
        let proofs = (0..self.state.get().weights.len())
            .map(|_| decode_proof(input))
            .collect::<Result<Vec<_>, _>>()?;
        if !proofs
            .par_iter()
            .enumerate()
            .all(|(j, proof)| proof.verify(&binding, ShareRole::WireWeight(j as u64)))
        {
            return Err("invalid wire contribution".into());
        }
        // Decoding above checks byte syntax, not group membership. Admit all
        // state points and equations before using them in predecessor pairings.
        // ShareProof::verify independently admits all of its public points.
        #[cfg(feature = "timing")]
        drop(proofs_span);
        let state = self.state.verify_successor(state)?;
        #[cfg(feature = "timing")]
        let _links = libs::timing::SpanGuard::new("mpc.predecessor_and_chain_hash", "mpc", vec![]);

        if !equal(
            self.state.get().delta_g1,
            delta.share_g2,
            state.get().delta_g1,
            G2Affine::generator(),
        ) {
            return Err("invalid delta contribution or predecessor binding".into());
        }
        if !proofs.par_iter().enumerate().all(|(j, proof)| {
            equal(
                proof.share_g1,
                self.state.get().weights[j],
                G1Affine::generator(),
                state.get().weights[j],
            )
        }) {
            return Err("invalid wire predecessor binding".into());
        }
        let record = &record_start[..record_start.len() - input.len()];
        let mut hash = Sha256::new();
        hash.update(self.digest);
        hash.update(record);
        self.digest = hash.finalize().into();
        self.contributions += 1;
        self.state = state;
        Ok(())
    }

    pub fn contribute(mut self, rng: &mut (impl RngCore + CryptoRng)) -> Result<Self, String> {
        #[cfg(feature = "timing")]
        let _contribute = libs::timing::SpanGuard::new("mpc.contribute", "mpc", vec![]);
        let nonzero = |rng: &mut _| loop {
            let share = Fr::rand(rng);
            if !share.is_zero() {
                break share;
            }
        };
        let u = Zeroizing::new(nonzero(rng));
        let v = Zeroizing::new(
            (0..self.state.get().weights.len())
                .map(|_| nonzero(rng))
                .collect::<Vec<_>>(),
        );
        let state = self.state.contribute(*u, &v)?;
        let mut record = encode_state(&state)?;
        let binding = ContributionBinding {
            library_version: &self.identity.version,
            library_digest: self.identity.library_digest,
            tau_digest: self.identity.tau_digest,
            previous_record_digest: self.digest,
            next_state_digest: state_digest(&record),
        };
        #[cfg(feature = "timing")]
        let generation_span = libs::timing::SpanGuard::new("mpc.share_generation", "mpc", vec![]);
        encode_proof(
            &ShareProof::create(*u, &binding, ShareRole::Delta, rng)?,
            &mut record,
        )?;
        let samples = v
            .iter()
            .map(|_| ShareProof::sample_point(rng))
            .collect::<Vec<_>>();
        let proofs = v
            .par_iter()
            .zip(samples)
            .enumerate()
            .map(|(j, (share, s))| {
                ShareProof::from_sample(*share, &binding, ShareRole::WireWeight(j as u64), s)
            })
            .collect::<Result<Vec<_>, _>>()?;
        for proof in proofs {
            encode_proof(&proof, &mut record)?;
        }
        #[cfg(feature = "timing")]
        drop(generation_span);
        // Verify exactly the public bytes that will be handed to the next
        // participant before exposing output. Private shares are not encoded.
        drop(u);
        drop(v);
        let mut input = record.as_slice();
        self.verify_record(&mut input)?;
        if !input.is_empty() {
            return Err("unexpected trailing bytes in generated contribution".into());
        }
        self.bytes.extend_from_slice(&record);
        Ok(self)
    }

    pub fn write_new(&self, path: &Path) -> Result<(), String> {
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let mut staged = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        staged.write_all(&self.bytes).map_err(|e| e.to_string())?;
        staged.as_file().sync_all().map_err(|e| e.to_string())?;
        staged.persist_noclobber(path).map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn encode_header(library_version: Option<&str>) -> Result<Vec<u8>, String> {
    let mut header = TRANSCRIPT_MAGIC.to_vec();
    header.push(TRANSCRIPT_FORMAT_VERSION);
    match library_version {
        None => header.push(0),
        Some(version) => {
            libs::compatibility::parse_package_version(version).map_err(|e| e.to_string())?;
            let length = u16::try_from(version.len())
                .map_err(|_| "transcript library version is too long")?;
            header.push(1);
            header.extend_from_slice(&length.to_be_bytes());
            header.extend_from_slice(version.as_bytes());
        }
    }
    Ok(header)
}

fn read_library_version(reader: &mut impl Read) -> Result<Option<String>, String> {
    let mut magic = vec![0; TRANSCRIPT_MAGIC.len()];
    reader
        .read_exact(&mut magic)
        .map_err(|_| "invalid or unsupported MPC transcript header".to_string())?;
    if magic != TRANSCRIPT_MAGIC {
        return Err("invalid or unsupported MPC transcript header".into());
    }
    let mut fixed = [0; 2];
    reader
        .read_exact(&mut fixed)
        .map_err(|_| "truncated MPC transcript header".to_string())?;
    if fixed[0] != TRANSCRIPT_FORMAT_VERSION {
        return Err("unsupported MPC transcript format version".into());
    }
    match fixed[1] {
        0 => Ok(None),
        1 => {
            let mut length = [0; 2];
            reader
                .read_exact(&mut length)
                .map_err(|_| "truncated MPC transcript library version".to_string())?;
            let length = u16::from_be_bytes(length) as usize;
            if length == 0 {
                return Err("empty MPC transcript library version".into());
            }
            let mut version = vec![0; length];
            reader
                .read_exact(&mut version)
                .map_err(|_| "truncated MPC transcript library version".to_string())?;
            let version =
                String::from_utf8(version).map_err(|_| "invalid transcript library version")?;
            libs::compatibility::parse_package_version(&version).map_err(|e| e.to_string())?;
            Ok(Some(version))
        }
        _ => Err("invalid MPC transcript library version marker".into()),
    }
}

fn encode_state(state: &State) -> Result<Vec<u8>, String> {
    #[cfg(feature = "timing")]
    let _span = libs::timing::SpanGuard::new("mpc.serialize", "mpc", vec![]);
    let size = (state.packed.len()
        + state.correction.len()
        + state.fixed.len()
        + state.fixed_correction.len()
        + state.weighted.len()
        + state.shifted.len()
        + 10)
        * 96
        + (state.weights.len() + 1) * 192;
    let mut bytes = Vec::with_capacity(size);
    for points in [
        &state.packed,
        &state.correction,
        &state.fixed,
        &state.fixed_correction,
        &state.weighted,
        &state.shifted,
    ] {
        put_points(points, &mut bytes)?;
    }
    for point in state.masks {
        put(&point, &mut bytes)?;
    }
    put(&state.delta_g1, &mut bytes)?;
    put(&state.delta_g2, &mut bytes)?;
    put_points(&state.weights, &mut bytes)?;
    Ok(bytes)
}

fn put_points<T: CanonicalSerialize + Sync>(points: &[T], out: &mut Vec<u8>) -> Result<(), String> {
    let Some(first) = points.first() else {
        return Ok(());
    };
    let width = first.uncompressed_size();
    let start = out.len();
    out.resize(start + points.len() * width, 0);
    out[start..]
        .par_chunks_exact_mut(width)
        .zip(points)
        .try_for_each(|(out, p)| p.serialize_uncompressed(out).map_err(|e| e.to_string()))
}

fn decode_state(input: &mut &[u8], shape: &State) -> Result<State, String> {
    #[cfg(feature = "timing")]
    let _span = libs::timing::SpanGuard::new("mpc.decode", "mpc", vec![]);
    // Counts come only from the independently selected library, never from an
    // allocation length supplied in the transcript. Reject truncation first.
    let g1_count = shape.packed.len()
        + shape.correction.len()
        + shape.fixed.len()
        + shape.fixed_correction.len()
        + shape.weighted.len()
        + shape.shifted.len()
        + 10;
    let size = g1_count
        .checked_mul(96)
        .and_then(|n| n.checked_add((shape.weights.len() + 1) * 192))
        .ok_or("transcript state size overflow")?;
    if input.len() < size {
        return Err("truncated ceremony state".into());
    }
    fn points<T: CanonicalDeserialize + Send>(
        input: &mut &[u8],
        n: usize,
        width: usize,
    ) -> Result<Vec<T>, String> {
        let size = n
            .checked_mul(width)
            .ok_or("ceremony point count overflow")?;
        let (bytes, rest) = input
            .split_at_checked(size)
            .ok_or("truncated ceremony points")?;
        let points = bytes
            .par_chunks_exact(width)
            .map(|mut bytes| get(&mut bytes))
            .collect::<Result<Vec<_>, _>>()?;
        *input = rest;
        Ok(points)
    }
    Ok(State {
        packed: points(input, shape.packed.len(), 96)?,
        correction: points(input, shape.correction.len(), 96)?,
        fixed: points(input, shape.fixed.len(), 96)?,
        fixed_correction: points(input, shape.fixed_correction.len(), 96)?,
        weighted: points(input, shape.weighted.len(), 96)?,
        shifted: points(input, shape.shifted.len(), 96)?,
        masks: points(input, 9, 96)?.try_into().unwrap(),
        delta_g1: get(input)?,
        delta_g2: get(input)?,
        weights: points(input, shape.weights.len(), 192)?,
    })
}
fn encode_proof(proof: &ShareProof, out: &mut Vec<u8>) -> Result<(), String> {
    put(&proof.share_g1, out)?;
    put(&proof.share_g2, out)?;
    put(&proof.s, out)?;
    put(&proof.s_share, out)?;
    put(&proof.r_share, out)
}
fn decode_proof(input: &mut &[u8]) -> Result<ShareProof, String> {
    Ok(ShareProof {
        share_g1: get(input)?,
        share_g2: get(input)?,
        s: get(input)?,
        s_share: get(input)?,
        r_share: get(input)?,
    })
}
fn put<T: CanonicalSerialize>(point: &T, out: &mut Vec<u8>) -> Result<(), String> {
    // Affine coordinates avoid square-root decompression at the next reader.
    // Intermediate records do not change the final common CRS encoding.
    point.serialize_uncompressed(out).map_err(|e| e.to_string())
}
fn get<T: CanonicalDeserialize>(input: &mut &[u8]) -> Result<T, String> {
    // Every caller passes these raw points to state/share admission before any
    // pairing. This parser alone does not establish a valid curve/subgroup point.
    T::deserialize_uncompressed_unchecked(input)
        .map_err(|e| format!("invalid ceremony point encoding: {e}"))
}

fn state_digest(bytes: &[u8]) -> [u8; 32] {
    #[cfg(feature = "timing")]
    let _span = libs::timing::SpanGuard::new("mpc.state_hash", "mpc", vec![]);
    Sha256::digest(bytes).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transcript_header_records_publish_version_or_development_null() {
        let publish = encode_header(Some("3.0.7")).unwrap();
        assert_eq!(
            read_library_version(&mut publish.as_slice()).unwrap(),
            Some("3.0.7".into())
        );

        let development = encode_header(None).unwrap();
        assert_eq!(
            read_library_version(&mut development.as_slice()).unwrap(),
            None
        );
        assert!(encode_header(Some("latest")).is_err());
    }

    #[test]
    fn parallel_state_encoding_matches_serial_bytes_and_digest() {
        let g = G1Affine::generator();
        let state = State {
            packed: vec![g; 4100],
            correction: vec![G1Affine::zero(); 4100],
            fixed: vec![],
            fixed_correction: vec![],
            weighted: vec![g; 9],
            shifted: vec![g; 17],
            masks: [g; 9],
            delta_g1: g,
            delta_g2: G2Affine::generator(),
            weights: vec![G2Affine::generator(); 19],
        };
        let mut serial = Vec::new();
        for points in [
            &state.packed,
            &state.correction,
            &state.fixed,
            &state.fixed_correction,
            &state.weighted,
            &state.shifted,
        ] {
            for p in points {
                put(p, &mut serial).unwrap();
            }
        }
        for p in state.masks {
            put(&p, &mut serial).unwrap();
        }
        put(&state.delta_g1, &mut serial).unwrap();
        put(&state.delta_g2, &mut serial).unwrap();
        for p in &state.weights {
            put(p, &mut serial).unwrap();
        }
        let parallel = encode_state(&state).unwrap();
        assert_eq!(parallel, serial);
        assert_eq!(state_digest(&parallel), state_digest(&serial));
        let mut input = parallel.as_slice();
        assert_eq!(decode_state(&mut input, &state).unwrap(), state);
        assert!(input.is_empty());
    }

    #[test]
    fn parallel_share_generation_preserves_rng_stream_and_record_bytes() {
        use rand::SeedableRng;
        let binding = ContributionBinding {
            library_version: "2.1.5",
            library_digest: [1; 32],
            tau_digest: [2; 32],
            previous_record_digest: [3; 32],
            next_state_digest: [4; 32],
        };
        let mut serial_rng = rand::rngs::StdRng::seed_from_u64(15183);
        let mut parallel_rng = serial_rng.clone();
        let shares = (1u64..=9).map(Fr::from).collect::<Vec<_>>();
        let mut serial = Vec::new();
        for (j, share) in shares.iter().enumerate() {
            encode_proof(
                &ShareProof::create(
                    *share,
                    &binding,
                    ShareRole::WireWeight(j as u64),
                    &mut serial_rng,
                )
                .unwrap(),
                &mut serial,
            )
            .unwrap();
        }
        let points = shares
            .iter()
            .map(|_| ShareProof::sample_point(&mut parallel_rng))
            .collect::<Vec<_>>();
        let proofs = shares
            .par_iter()
            .zip(points)
            .enumerate()
            .map(|(j, (share, s))| {
                ShareProof::from_sample(*share, &binding, ShareRole::WireWeight(j as u64), s)
                    .unwrap()
            })
            .collect::<Vec<_>>();
        let mut parallel = Vec::new();
        for proof in proofs {
            encode_proof(&proof, &mut parallel).unwrap();
        }
        assert_eq!(parallel, serial);
        assert_eq!(parallel_rng.next_u64(), serial_rng.next_u64());
    }
}
