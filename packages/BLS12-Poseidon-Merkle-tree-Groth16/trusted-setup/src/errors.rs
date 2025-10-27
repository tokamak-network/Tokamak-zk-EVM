use thiserror::Error;

#[derive(Debug, Error)]
pub enum Groth16Error {
    #[error("Trusted setup failed: {0}")]
    TrustedSetupError(String),
    
    #[error("Powers of Tau generation failed: {0}")]
    PowersOfTauError(String),
    
    #[error("R1CS parsing failed: {0}")]
    R1CSParsingError(String),
    
    #[error("Witness generation failed: {0}")]
    WitnessError(String),
    
    #[error("Proof generation failed: {0}")]
    ProvingError(String),
    
    #[error("Verification failed: {0}")]
    VerificationError(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Constraint validation failed: {0}")]
    ConstraintError(String),
    
    #[error("Cryptographic operation failed: {0}")]
    CryptographicError(String),
}

pub type Result<T> = std::result::Result<T, Groth16Error>;