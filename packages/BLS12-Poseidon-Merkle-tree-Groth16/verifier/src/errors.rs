use thiserror::Error;

#[derive(Error, Debug)]
pub enum VerifierError {
    #[error("Invalid proof format: {0}")]
    InvalidProofFormat(String),

    #[error("Invalid public inputs: {0}")]
    InvalidPublicInputs(String),

    #[error("Verification key error: {0}")]
    VerificationKeyError(String),

    #[error("Pairing verification failed")]
    PairingVerificationFailed,

    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Hex decoding error: {0}")]
    HexError(#[from] hex::FromHexError),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Field element error: {0}")]
    FieldElementError(String),

    #[error("Curve point error: {0}")]
    CurvePointError(String),

    #[error("Field conversion error: {0}")]
    FieldConversionError(String),

    #[error("Trusted setup error: {0}")]
    TrustedSetupError(#[from] tokamak_groth16_trusted_setup::TrustedSetupError),
}

pub type Result<T> = std::result::Result<T, VerifierError>;