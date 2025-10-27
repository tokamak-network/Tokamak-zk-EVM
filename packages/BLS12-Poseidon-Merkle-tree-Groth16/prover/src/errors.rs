use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProverError {
    #[error("Witness generation failed: {0}")]
    WitnessError(String),
    
    #[error("Proof generation failed: {0}")]
    ProvingError(String),
    
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    
    #[error("Circuit constraint violation: {0}")]
    ConstraintError(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Trusted setup error: {0}")]
    TrustedSetupError(#[from] tokamak_groth16_trusted_setup::Groth16Error),
}

pub type Result<T> = std::result::Result<T, ProverError>;