use libs::cli::CliDiagnostic;
use libs::errors::{ArtifactError, CrsError, DeviceError};
use libs::univariate_crs::UnivariateCrsError;
use std::path::PathBuf;
use thiserror::Error;

mod univariate;

pub use univariate::{run_trusted_setup, TrustedSetupConfig};

#[derive(Debug, Error)]
pub enum TrustedSetupError {
    #[error("CRS construction failed: {0}")]
    Construction(String),
    #[error(transparent)]
    Artifact(#[from] ArtifactError),
    #[error(transparent)]
    Crs(#[from] CrsError),
    #[error(transparent)]
    Device(#[from] DeviceError),
    #[error(transparent)]
    UnivariateCrs(#[from] UnivariateCrsError),
    #[error("failed to write final CRS artifact at {}: {source}", path.display())]
    WriteOutput {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

impl CliDiagnostic for TrustedSetupError {
    fn hint(&self) -> &'static str {
        match self {
            Self::Artifact(_) => {
                "Regenerate the frontend artifacts and provide the matching subcircuit library."
            }
            Self::Crs(_) => "Check the selected subcircuit library and CRS output path.",
            Self::Device(_) => "Check the ICICLE backend installation and the selected device.",
            Self::UnivariateCrs(_) | Self::Construction(_) => {
                "Check the selected library's univariate domain requirements and regenerate the CRS."
            }
            Self::WriteOutput { .. } => {
                "Create or grant write access to the requested output directory, then retry."
            }
        }
    }
}
