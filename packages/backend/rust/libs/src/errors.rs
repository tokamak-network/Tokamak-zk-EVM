use std::io;
use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ArtifactError {
    #[error("failed to read {artifact} at {}: {source}", path.display())]
    Read {
        artifact: &'static str,
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("failed to parse {artifact} at {}: {source}", path.display())]
    Parse {
        artifact: &'static str,
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("invalid {artifact} at {}: {reason}", path.display())]
    Invalid {
        artifact: &'static str,
        path: PathBuf,
        reason: String,
    },
}

#[derive(Debug, Error)]
pub enum CrsError {
    #[error("failed to read CRS artifact at {}: {source}", path.display())]
    Read {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("invalid CRS artifact at {}: {reason}", path.display())]
    Invalid { path: PathBuf, reason: String },
    #[error("CRS compatibility validation failed: {0}")]
    Compatibility(String),
}

#[derive(Debug, Error)]
pub enum DeviceError {
    #[error("failed to initialize {device} device: {reason}")]
    Initialization {
        device: &'static str,
        reason: String,
    },
}
