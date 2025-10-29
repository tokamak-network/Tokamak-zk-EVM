use thiserror::Error;

/// Comprehensive error types for the Groth16 trusted setup
#[derive(Error, Debug)]
pub enum TrustedSetupError {
    #[error("Circuit compilation error: {0}")]
    CircuitError(String),
    
    #[error("R1CS parsing/validation error: {0}")]
    R1CSError(String),
    
    #[error("Powers of Tau generation error: {0}")]
    PowersOfTauError(String),
    
    #[error("Ceremony orchestration error: {0}")]
    CeremonyError(String),
    
    #[error("Cryptographic validation error: {0}")]
    ValidationError(String),
    
    #[error("Serialization/deserialization error: {0}")]
    SerializationError(String),
    
    #[error("File I/O error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("JSON serialization error: {0}")]
    JsonError(#[from] serde_json::Error),
    
    #[error("Circuit size {actual} exceeds maximum {max}")]
    CircuitTooLarge { actual: usize, max: usize },
    
    #[error("Insufficient powers of tau: need {required}, have {available}")]
    InsufficientPowers { required: usize, available: usize },
    
    #[error("Invalid ceremony participant: {0}")]
    InvalidParticipant(String),
    
    #[error("Security constraint violation: {0}")]
    SecurityViolation(String),
}

pub type Result<T> = std::result::Result<T, TrustedSetupError>;