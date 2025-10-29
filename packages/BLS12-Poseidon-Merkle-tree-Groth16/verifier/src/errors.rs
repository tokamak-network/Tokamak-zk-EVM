use thiserror::Error;

#[derive(Debug, Error)]
pub enum VerifierError {
    #[error("Verification failed: {0}")]
    VerificationError(String),
    
    #[error("Invalid proof: {0}")]
    InvalidProof(String),
    
    #[error("Invalid public inputs: {0}")]
    InvalidPublicInputs(String),
    
    #[error("Pairing computation failed: {0}")]
    PairingError(String),
    
    #[error("Solidity generation failed: {0}")]
    SolidityError(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Trusted setup error: {0}")]
    TrustedSetupError(#[from] tokamak_groth16_trusted_setup::Groth16Error),
    
    #[error("Prover error: {0}")]
    ProverError(#[from] tokamak_groth16_prover::ProverError),
    
    #[error("Security validation failed: {0}")]
    SecurityValidationError(String),
}

pub type Result<T> = std::result::Result<T, VerifierError>;