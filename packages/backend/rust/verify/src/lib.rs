//! Online-only U32--U35 verification. Circuit admission belongs to preprocess.
mod decode;
mod prepare_g2;
mod fixed {
    include!(concat!(env!("OUT_DIR"), "/verifier_fixed.rs"));
}
pub mod univariate_cli;

use ark_bls12_381::{Bls12_381, Fr, G1Affine, G1Projective};
use ark_ec::scalar_mul::BatchMulPreprocessing;
use ark_ec::{pairing::Pairing, CurveGroup};
use ark_ff::{batch_inversion, Field, One, PrimeField, Zero};
use backend_interface::{PreprocessBytes, ProofBytes};
#[cfg(test)]
use libs::univariate_field::canonical_root;
use libs::univariate_transcript::{derive_binary_proof_challenges, UnivariateChallenges};

/// Library-owned geometry embedded at build time, never loaded online.
pub mod parameters {
    include!(concat!(env!("OUT_DIR"), "/verifier_parameters.rs"));
}

#[derive(Debug, thiserror::Error)]
pub enum VerifyError {
    #[error("invalid verifier input: {0}")]
    Invalid(String),
    #[error("{}: {source}", path.display())]
    Io {
        path: std::path::PathBuf,
        source: std::io::Error,
    },
    #[error("cannot write verification result: {reason}")]
    MachineResult { reason: String },
}
impl From<String> for VerifyError {
    fn from(value: String) -> Self {
        Self::Invalid(value)
    }
}
impl From<&str> for VerifyError {
    fn from(value: &str) -> Self {
        Self::Invalid(value.into())
    }
}
impl libs::cli::CliDiagnostic for VerifyError {
    fn hint(&self) -> &'static str {
        "Use admitted preprocess and proof with free public inputs matching the library and verifier keys embedded in this executable."
    }
}

/// Checked dynamic preprocess operands and embedded pairing coefficients for
/// repeated online verification. Circuit admission belongs to preprocess.
pub struct Verifier {
    g1: [BatchMulPreprocessing<G1Projective>; 3],
    g2: [<Bls12_381 as Pairing>::G2Prepared; 5],
    s_c: G1Affine,
    c_fix: G1Affine,
}

impl Verifier {
    pub fn from_bytes(preprocess: &[u8]) -> Result<Self, VerifyError> {
        let preprocess = PreprocessBytes::decode(preprocess)?;
        let [one, tau, tau_k, delta] = fixed::prepared_g2();
        Ok(Self {
            g1: fixed::prepared_g1(),
            g2: [
                one,
                tau,
                tau_k,
                delta,
                prepare_g2::prepare(decode::g2(&preprocess.e_kappa)?),
            ],
            s_c: decode::g1(&preprocess.s_c)?,
            c_fix: decode::g1(&preprocess.c_fix)?,
        })
    }

    /// Accept exactly the free-public vector. Fixed public values are already
    /// represented by C_fix and never enter the Fiat--Shamir statement.
    pub fn verify(&self, public_inputs: &[Fr], bytes: &[u8]) -> Result<bool, VerifyError> {
        if public_inputs.len() != parameters::L_FREE as usize {
            return Err("free public input length does not match the built library".into());
        }
        let proof = ProofBytes::decode(bytes)?;
        let points = [
            proof.c_l,
            proof.c_h,
            proof.c_o,
            proof.d_q,
            proof.d_q_k,
            proof.c_d,
            proof.c_r,
            proof.c_q,
            proof.pi_chi,
            proof.pi_plus,
        ];
        let mut decoded = [G1Affine::identity(); 10];
        for (out, bytes) in decoded.iter_mut().zip(points) {
            *out = decode::g1(&bytes)?;
        }
        let [c_l, c_h, c_o, d_q, d_q_k, c_d, c_r, c_q, pi_chi, pi_plus] = decoded;
        let [s_c, u, v, w, b, r, r_plus] = [
            proof.s_c,
            proof.u,
            proof.v,
            proof.w,
            proof.b,
            proof.r,
            proof.r_plus,
        ]
        .map(|bytes| Fr::from_le_bytes_mod_order(&bytes));
        let ch = derive_binary_proof_challenges(
            public_inputs,
            &proof,
            parameters::N_A as usize,
            parameters::N_C as usize,
        );
        let q = quotient_at_challenge(
            &ch,
            [s_c, u, v, w, b, r, r_plus],
            parameters::N_A,
            parameters::N_C,
            fixed::INV_N_C,
        );
        let a = evaluate_public(
            public_inputs,
            &fixed::PUBLIC_ROOTS,
            &fixed::PUBLIC_WEIGHTS,
            ch.chi,
        );
        let varpi2 = ch.varpi.square();
        let varpi3 = varpi2 * ch.varpi;
        let varpi4 = varpi2.square();
        let mu2 = ch.mu.square();
        let mu3 = mu2 * ch.mu;
        let mu4 = mu2.square();
        // U34: A_free is evaluated in the field; fixed inputs have no MSM here.
        // Factor fixed-base terms through U35 in the field before multiplying
        // their bases. ONE needs one scalar multiplication instead of two.
        let one = self.g1[0]
            .batch_mul(&[(a + varpi2 * r + varpi3 * q + varpi4 * s_c) * mu2 + r_plus * mu3])[0];
        let xi = self.g1[1].batch_mul(&[(u + ch.varpi * v) * mu2])[0];
        let psi = self.g1[2].batch_mul(&[(w + ch.varpi * b) * mu2])[0];
        let opening_commitments =
            c_l + c_h * ch.varpi + c_r * varpi2 + c_q * varpi3 + self.s_c * varpi4;
        let c_e = c_l + c_h * ch.upsilon;
        // U35 with the approved free/fixed-public specialization: subtract
        // C_fix exactly once in the first operand, not in the opening equation.
        let first = c_l - c_d * ch.mu
            + (opening_commitments + pi_chi * ch.chi) * mu2
            + (c_r + pi_plus * (fixed::CONNECTION_ROOT * ch.chi)) * mu3
            - one
            - xi
            - psi
            - d_q_k * mu4
            - self.c_fix;
        let operands = [
            first,
            -(pi_chi * mu2 + pi_plus * mu3),
            c_h + c_e * ch.mu + d_q * mu4,
            -G1Projective::from(c_o),
            G1Projective::from(d_q_k),
        ];
        let affine = G1Projective::normalize_batch(&operands);
        Ok(Bls12_381::multi_pairing(affine, self.g2.clone()).is_zero())
    }
}

fn quotient_at_challenge(
    ch: &UnivariateChallenges<Fr>,
    values: [Fr; 7],
    na: u64,
    nc: u64,
    inv_nc: Fr,
) -> Fr {
    let [s_c, u, v, w, b, r, r_plus] = values;
    // Both domains are nested radix-two subgroups with the same canonical root.
    let za = ch.chi.pow([na]) - Fr::one();
    let zc = ch.chi.pow([nc]) - Fr::one();
    let zg = ch.chi.pow([na.min(nc)]) - Fr::one();
    let ma = zc / zg;
    let mc = za / zg;
    let l0 = zc * inv_nc / (ch.chi - Fr::one());
    (ma * (u * v - w)
        + ch.theta * mc * (r - Fr::one()) * l0
        + ch.theta.square()
            * mc
            * (r_plus * (b + ch.beta * ch.chi + ch.gamma_c) - r * (b + ch.beta * s_c + ch.gamma_c)))
        / (za * zc / zg)
}

fn evaluate_public(values: &[Fr], roots: &[Fr], weights: &[Fr], chi: Fr) -> Fr {
    if let Some(index) = roots.iter().position(|root| *root == chi) {
        return values[index];
    }
    let mut denominators: Vec<_> = roots.iter().map(|root| chi - root).collect();
    batch_inversion(&mut denominators);
    let sum: Fr = values
        .iter()
        .zip(weights)
        .zip(denominators)
        .map(|((value, root), inverse)| *value * root * inverse)
        .sum();
    (chi.pow([values.len() as u64]) - Fr::one()) * sum
}

#[cfg(test)]
mod tests;
