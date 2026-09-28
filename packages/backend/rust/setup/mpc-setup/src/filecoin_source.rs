//! Internal participant preparation from the original Filecoin challenge_19.
//! Hash the complete source and retain only library-required ranges in the same
//! pass. No standalone import artifact, receipt or phase 1 is produced here.

use ark_bls12_381::{Bls12_381, Fq, Fq2, Fr, G1Affine, G1Projective, G2Affine, G2Projective};
use ark_ec::{pairing::Pairing, AffineRepr, CurveGroup, VariableBaseMSM};
use ark_ff::{BigInteger, PrimeField, UniformRand, Zero};
use backend_univariate_crs_interface::{TauSequenceRkyv, UnivariateG1Rkyv, UnivariateG2Rkyv};
use blake2::{Blake2b, Digest as BlakeDigest};
use libs::univariate_crs::UnivariateCrsShape;
use rayon::prelude::*;
use std::{
    fs::File,
    io::{self, Read},
    ops::Range,
    path::Path,
    time::Duration,
};

pub(crate) const SOURCE_URL: &str = "https://trusted-setup.filecoin.io/phase1/challenge_19";
pub(crate) const SOURCE_REVISION: &str = "2bd49903bac07485fe23e5ef1a2d5fa19561977b";
const SOURCE_LENGTH: u64 = 1 << 27;
pub(crate) const SOURCE_DIGEST: &str = "5a26015ba27d8164152407da8f9b87e47593f17ae4c260e467bac2ba9dda6f66c15fa352487604d1350ef33a3bfedb0d99e37b619161e27545017366274df76b";
const PREVIOUS_RESPONSE: &str = "6e3f4b98e6c205d0efa5abc917dd03e28864016df380936fa4e9865595c5d69863eff93e8badf8e6b8c8cbfd5ab3a415ef7ba50b86e124bd9bfcd3f9aab67124";
const READ_CHUNK: usize = 1024 * 1024;
const RELATION_CHUNK: usize = 4096;

#[derive(Debug, thiserror::Error)]
pub(crate) enum SourceError {
    #[error("{0}")]
    Invalid(String),
    #[error("Filecoin source I/O: {0}")]
    Io(#[from] io::Error),
    #[error("Filecoin download: {0}")]
    Download(#[from] reqwest::Error),
}
type Result<T> = std::result::Result<T, SourceError>;

fn invalid(message: impl Into<String>) -> SourceError {
    SourceError::Invalid(message.into())
}

// The source pin is not supplied by a coordinator, receipt or command option.
// Private smaller pins are used only by tests of the identical stream parser.
struct SourcePin<'a> {
    length: u64,
    digest: &'a str,
    previous_response: &'a str,
}
const FILECOIN: SourcePin<'static> = SourcePin {
    length: SOURCE_LENGTH,
    digest: SOURCE_DIGEST,
    previous_response: PREVIOUS_RESPONSE,
};

impl SourcePin<'_> {
    fn byte_len(&self) -> u64 {
        576 * self.length + 160
    }

    fn ranges(&self, p: usize) -> Result<[Range<u64>; 5]> {
        if p == 0 || p as u64 >= self.length {
            return Err(invalid(format!(
                "capacity P must be between 1 and {}",
                self.length - 1
            )));
        }
        let p = p as u64;
        let g2 = 64 + (2 * self.length - 1) * 96;
        let alpha = g2 + self.length * 192;
        let beta = alpha + self.length * 96;
        let beta2 = beta + self.length * 96;
        Ok([
            64..64 + (2 * p + 1) * 96,
            g2..g2 + (p + 1) * 192,
            alpha..alpha + (p + 1) * 96,
            beta..beta + (p + 1) * 96,
            beta2..beta2 + 192,
        ])
    }
}

// Reuse the already-admitted normalized library shape. Participants do not
// reinterpret aggregate setup metadata or accept a coordinator-supplied P.
fn required_capacity(shape: &UnivariateCrsShape, pin: &SourcePin<'_>) -> Result<usize> {
    let p = shape.minimum_capacity[1];
    pin.ranges(p)?;
    Ok(p)
}

pub(crate) fn prepare_local(source: &Path, shape: &UnivariateCrsShape) -> Result<TauSequenceRkyv> {
    let p = required_capacity(shape, &FILECOIN)?;
    let file = File::open(source)?;
    if file.metadata()?.len() != FILECOIN.byte_len() {
        return Err(invalid("Filecoin source has the wrong byte length"));
    }
    prepare_stream(file, p, &FILECOIN)
}

pub(crate) fn prepare_download(shape: &UnivariateCrsShape) -> Result<TauSequenceRkyv> {
    let p = required_capacity(shape, &FILECOIN)?;
    let client = reqwest::blocking::Client::builder()
        .https_only(true)
        .connect_timeout(Duration::from_secs(30))
        .timeout(None)
        .build()?;
    let response = client
        .get(SOURCE_URL)
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .send()?
        .error_for_status()?;
    if response.status() != reqwest::StatusCode::OK
        || response
            .content_length()
            .is_some_and(|n| n != FILECOIN.byte_len())
        || response
            .headers()
            .get(reqwest::header::CONTENT_ENCODING)
            .is_some_and(|v| v != "identity")
    {
        return Err(invalid(
            "Filecoin server returned an unexpected length, status or encoding",
        ));
    }
    prepare_stream(response, p, &FILECOIN)
}

fn prepare_stream(reader: impl Read, p: usize, pin: &SourcePin<'_>) -> Result<TauSequenceRkyv> {
    eprintln!(
        "Filecoin source: hashing {} bytes; retaining only library-required capacity P={p}",
        pin.byte_len()
    );
    let selected = collect_ranges(reader, p, pin)?;
    eprintln!("Filecoin source: validating selected point encodings and power relations");
    decode_and_verify(selected)
}

// Hash and retain in the same read pass: the decoded bytes cannot be changed
// between source authentication and conversion by modifying a local file.
fn collect_ranges(mut reader: impl Read, p: usize, pin: &SourcePin<'_>) -> Result<[Vec<u8>; 5]> {
    let ranges = pin.ranges(p)?;
    let mut selected: [Vec<u8>; 5] = std::array::from_fn(|_| Vec::new());
    let mut buffer = vec![0u8; READ_CHUNK];
    let mut header = Vec::with_capacity(64);
    let mut hasher = Blake2b::new();
    let mut offset = 0u64;
    while offset < pin.byte_len() {
        let limit = (pin.byte_len() - offset).min(buffer.len() as u64) as usize;
        let n = match reader.read(&mut buffer[..limit]) {
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            result => result?,
        };
        if n == 0 {
            return Err(invalid("truncated Filecoin source"));
        }
        hasher.input(&buffer[..n]);
        if offset < 64 {
            header.extend_from_slice(&buffer[..n.min((64 - offset) as usize)]);
        }
        for (range, retained) in ranges.iter().zip(&mut selected) {
            let start = offset.max(range.start);
            let end = (offset + n as u64).min(range.end);
            if start < end {
                retained
                    .extend_from_slice(&buffer[(start - offset) as usize..(end - offset) as usize]);
            }
        }
        offset += n as u64;
    }
    if reader.read(&mut buffer[..1])? != 0 {
        return Err(invalid("trailing Filecoin source bytes"));
    }
    if hex::encode(header) != pin.previous_response {
        return Err(invalid("preceding response hash mismatch"));
    }
    if hex::encode(hasher.result()) != pin.digest {
        return Err(invalid("Filecoin source BLAKE2b-512 mismatch"));
    }
    Ok(selected)
}

fn fq(bytes: &[u8]) -> Result<Fq> {
    let value = Fq::from_be_bytes_mod_order(bytes);
    if value.into_bigint().to_bytes_be() != bytes {
        return Err(invalid("noncanonical Filecoin field coordinate"));
    }
    Ok(value)
}

fn decode_g1(bytes: &[u8]) -> Result<G1Affine> {
    if bytes.len() != 96 || bytes[0] & 0xe0 != 0 {
        return Err(invalid(
            "invalid Filecoin uncompressed G1 flags/length (infinity forbidden)",
        ));
    }
    let p = G1Affine::new_unchecked(fq(&bytes[..48])?, fq(&bytes[48..])?);
    if p.is_zero() || !p.is_on_curve() || !p.is_in_correct_subgroup_assuming_on_curve() {
        return Err(invalid("Filecoin G1 is not a nonzero subgroup point"));
    }
    Ok(p)
}

fn decode_g2(bytes: &[u8]) -> Result<G2Affine> {
    if bytes.len() != 192 || bytes[0] & 0xe0 != 0 {
        return Err(invalid(
            "invalid Filecoin uncompressed G2 flags/length (infinity forbidden)",
        ));
    }
    // Upstream pairing c2af46ca serializes x.c1, x.c0, y.c1, y.c0 in big endian.
    let p = G2Affine::new_unchecked(
        Fq2::new(fq(&bytes[48..96])?, fq(&bytes[..48])?),
        Fq2::new(fq(&bytes[144..])?, fq(&bytes[96..144])?),
    );
    if p.is_zero() || !p.is_on_curve() || !p.is_in_correct_subgroup_assuming_on_curve() {
        return Err(invalid("Filecoin G2 is not a nonzero subgroup point"));
    }
    Ok(p)
}

fn pairing_equal(a: G1Affine, b: G2Affine, c: G1Affine, d: G2Affine) -> bool {
    Bls12_381::pairing(a, b) == Bls12_381::pairing(c, d)
}

fn random_coefficients(n: usize) -> Vec<Fr> {
    let mut rng = rand::rngs::OsRng;
    (0..n)
        .map(|_| loop {
            let r = Fr::rand(&mut rng);
            if !r.is_zero() {
                break r;
            }
        })
        .collect()
}

// Random coefficients are sampled after the complete pinned source is captured.
// Every adjacent pair is included, including pairs crossing chunk boundaries.
fn verify_g1_powers(points: &[G1Affine], tau_g2: G2Affine) -> Result<()> {
    (0..points.len() - 1)
        .step_by(RELATION_CHUNK)
        .collect::<Vec<_>>()
        .into_par_iter()
        .try_for_each(|start| {
            let n = RELATION_CHUNK.min(points.len() - 1 - start);
            let r = random_coefficients(n);
            let left = G1Projective::msm_unchecked(&points[start..start + n], &r).into_affine();
            let right =
                G1Projective::msm_unchecked(&points[start + 1..start + n + 1], &r).into_affine();
            if !pairing_equal(left, tau_g2, right, G2Affine::generator()) {
                return Err(invalid("inconsistent Filecoin G1 power sequence"));
            }
            Ok(())
        })
}

fn decode_and_verify(selected: [Vec<u8>; 5]) -> Result<TauSequenceRkyv> {
    let [ordinary, ordinary2, alpha, beta, beta2] = selected;
    let g1 = |bytes: &[u8]| {
        bytes
            .par_chunks(96)
            .map(decode_g1)
            .collect::<Result<Vec<_>>>()
    };
    let a = g1(&ordinary)?;
    let b = ordinary2
        .par_chunks(192)
        .map(decode_g2)
        .collect::<Result<Vec<_>>>()?;
    let xi = g1(&alpha)?;
    let psi = g1(&beta)?;
    let psi2 = decode_g2(&beta2)?;
    if a.len() < 3
        || b.len() < 2
        || xi.len() != b.len()
        || psi.len() != b.len()
        || a.len() != 2 * b.len() - 1
    {
        return Err(invalid("invalid selected family cardinalities"));
    }
    if a[0] != G1Affine::generator() || b[0] != G2Affine::generator() {
        return Err(invalid("Filecoin generator mismatch"));
    }
    for family in [&a, &xi, &psi] {
        verify_g1_powers(family, b[1])?;
    }
    (0..b.len() - 1)
        .step_by(RELATION_CHUNK)
        .collect::<Vec<_>>()
        .into_par_iter()
        .try_for_each(|start| {
            let n = RELATION_CHUNK.min(b.len() - 1 - start);
            let r = random_coefficients(n);
            let left = G2Projective::msm_unchecked(&b[start..start + n], &r).into_affine();
            let right = G2Projective::msm_unchecked(&b[start + 1..start + n + 1], &r).into_affine();
            if !pairing_equal(a[1], left, a[0], right) {
                return Err(invalid("inconsistent Filecoin G2 power sequence"));
            }
            Ok(())
        })?;
    if !pairing_equal(psi[0], b[0], a[0], psi2) {
        return Err(invalid("Filecoin beta tag mismatch"));
    }
    let encode1 = |p: &G1Affine| UnivariateG1Rkyv {
        x: p.x.into_bigint().to_bytes_le().try_into().unwrap(),
        y: p.y.into_bigint().to_bytes_le().try_into().unwrap(),
    };
    let coordinate2 = |q: Fq2| {
        let mut bytes = [0; 96];
        bytes[..48].copy_from_slice(&q.c0.into_bigint().to_bytes_le());
        bytes[48..].copy_from_slice(&q.c1.into_bigint().to_bytes_le());
        bytes
    };
    let encode2 = |p: &G2Affine| UnivariateG2Rkyv {
        x: coordinate2(p.x),
        y: coordinate2(p.y),
    };
    Ok(TauSequenceRkyv {
        schema_id: libs::univariate_crs::UNIVARIATE_CRS_SCHEMA_ID.into(),
        s0_g1: a.par_iter().map(encode1).collect(),
        sxi_g1: xi.par_iter().map(encode1).collect(),
        spsi_g1: psi.par_iter().map(encode1).collect(),
        tau_powers_g2: b.par_iter().map(encode2).collect(),
        psi_g2: encode2(&psi2),
    })
}

#[cfg(test)]
#[path = "filecoin_source_tests.rs"]
mod tests;
