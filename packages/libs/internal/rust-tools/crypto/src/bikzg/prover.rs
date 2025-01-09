use std::{error::Error, fmt};

use lambdaworks_math::{
    elliptic_curve::short_weierstrass::curves::bls12_381::default_types::{FrElement, FrField},
    fft::{errors::FFTError, polynomial::evaluate_fft_cpu},
    msm::{naive::MSMError, pippenger::parallel_msm_with},
    polynomial::Polynomial,
};


use rayon::prelude::*;

use crate::bikzg::G1Point;

#[derive(Debug)]
pub enum ProverError {
    InvalidFFTOperation(String),
}

impl fmt::Display for ProverError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            ProverError::InvalidFFTOperation(ref err) => write!(f, "Invalid FFT Op: {}", err),
        }
    }
}

impl Error for ProverError {}

impl From<FFTError> for ProverError {
    fn from(err: FFTError) -> Self {
        ProverError::InvalidFFTOperation(err.to_string())
    }
}

impl From<MSMError> for ProverError {
    fn from(err: MSMError) -> Self {
        ProverError::InvalidFFTOperation(err.to_string())
    }
}

/// Very basic prover that uses the SRS to commit to a polynomial
pub struct Prover {
    poly_eval: Vec<FrElement>,
}

impl Prover {
    /// Create a new prover instance
    pub fn new(poly: Polynomial<FrElement>) -> Result<Self, ProverError> {
        // let eval = poly.evaluate_fft(2, None)?;
        // Ok(Prover { poly_eval: eval })
        // Err(ProverError::from("sdf"))
        Err(ProverError::InvalidFFTOperation(
            "Witness length does not match polynomial length".to_string(),
        ))
    }

    /// Commit to the polynomial using the Lagrange basis
    pub fn commit_lagrange(
        &self,
        witness: &Polynomial<FrElement>,
        lagrange_srs: &[G1Point],
    ) -> Result<G1Point, ProverError> {
        let witness_eval = Polynomial::evaluate_fft::<FrField>(witness, 1, None).unwrap();// witness.evaluate_fft(2, None)?;

        // verify that the witness is of the same length as the polynomial
        if witness_eval.len() != self.poly_eval.len() {
            return Err(ProverError::InvalidFFTOperation(
                "Witness length does not match polynomial length".to_string(),
            ));
        }

        // multiply polynomials in evaluated form
        let evaluations = witness_eval
            .par_iter()
            .zip(&self.poly_eval)
            .map(|(w, e)| (w * e).representative())
            .collect::<Vec<_>>();

        // Compute the optimal window size for the multi-scalar multiplication
        const SCALE_FACTORS: (usize, usize) = (4, 5);
        // We approximate the optimum window size with: f(n) = k * log2(n), where k is a scaling factor
        let len_isqrt = evaluations.len().checked_ilog2().unwrap_or(0);
        let window_size = (len_isqrt as usize * SCALE_FACTORS.0) / SCALE_FACTORS.1;

        // Compute the multi-scalar multiplication in parallel
        Ok(parallel_msm_with(&evaluations, lagrange_srs, window_size))
    }

    /// Commit to the polynomial using the powers of tau
    pub fn commit_polynomial(
        &self,
        witness: &Polynomial<FrElement>,
        pwrs_tau: &[G1Point],
    ) -> Result<G1Point, ProverError> {
        // let witness_eval = witness.evaluate_fft(2, None)?;
        let witness_eval = Polynomial::evaluate_fft::<FrField>(witness, 1, None).unwrap();// witness.evaluate_fft(2, None)?;

        // verify that the witness is of the same length as the polynomial
        if witness_eval.len() != self.poly_eval.len() {
            return Err(ProverError::InvalidFFTOperation(
                "Witness length does not match polynomial length".to_string(),
            ));
        }

        // multiply polynomials in evaluated form
        let evaluations = witness_eval
            .par_iter()
            .zip(&self.poly_eval)
            .map(|(w, e)| (w * e))
            .collect::<Vec<_>>();

        let witness_eval = Polynomial::evaluate_fft::<FrField>(witness, 1, None).unwrap();// witness.evaluate_fft(2, None)?;


        let polynomial = Polynomial::interpolate_fft::<FrField>(&evaluations)?;
        let coeff = polynomial
            .coefficients()
            .into_par_iter()
            .map(|c| c.representative())
            .collect::<Vec<_>>();

        // Compute the optimal window size for the multi-scalar multiplication
        const SCALE_FACTORS: (usize, usize) = (4, 5);
        // We approximate the optimum window size with: f(n) = k * log2(n), where k is a scaling factor
        let len_isqrt = evaluations.len().checked_ilog2().unwrap_or(0);
        let window_size = (len_isqrt as usize * SCALE_FACTORS.0) / SCALE_FACTORS.1;

        // Compute the multi-scalar multiplication in parallel
        Ok(parallel_msm_with(&coeff, pwrs_tau, window_size))
    }
}
