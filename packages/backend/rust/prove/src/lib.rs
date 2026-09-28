//! Native prover entry types for the current normalized univariate protocol.

use libs::cli::CliDiagnostic;
use libs::errors::{ArtifactError, CrsError, DeviceError};
use std::path::PathBuf;
use thiserror::Error;

pub mod univariate;
pub mod univariate_cli;
pub mod univariate_crs;

#[derive(Debug, Error)]
pub enum ProveError {
    #[error(transparent)]
    Artifact(#[from] ArtifactError),
    #[error(transparent)]
    Crs(#[from] CrsError),
    #[error(transparent)]
    Device(#[from] DeviceError),
    #[error(transparent)]
    Univariate(#[from] univariate::UnivariateProverError),
    #[error(transparent)]
    UnivariateRelation(#[from] libs::univariate_relation::UnivariateRelationError),
    #[error("failed to write proof output at {}: {source}", path.display())]
    WriteOutput {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

impl CliDiagnostic for ProveError {
    fn hint(&self) -> &'static str {
        match self {
            Self::Artifact(_) | Self::Univariate(_) | Self::UnivariateRelation(_) => {
                "Regenerate the frontend artifacts and provide the matching synthesizer directory."
            }
            Self::Crs(_) => {
                "Use a CRS whose compatible backend version matches the selected subcircuit library, or use the explicit local development bypass only for local testing."
            }
            Self::Device(_) => "Check the ICICLE backend installation and the selected device.",
            Self::WriteOutput { .. } => {
                "Create or grant write access to the requested output directory, then retry."
            }
        }
    }
}

#[cfg(feature = "timing")]
#[macro_export]
macro_rules! time_block {
    ($name:expr, $category:expr, $block:block) => {{
        let _guard = $crate::timing::SpanGuard::new($name, $category, Vec::new());
        $block
    }};
    ($name:expr, $category:expr, $sizes:expr, $block:block) => {{
        let _guard = $crate::timing::SpanGuard::new($name, $category, $sizes);
        $block
    }};
}

#[cfg(not(feature = "timing"))]
#[macro_export]
macro_rules! time_block {
    ($name:expr, $category:expr, $block:block) => {{
        $block
    }};
    ($name:expr, $category:expr, $sizes:expr, $block:block) => {{
        $block
    }};
}

#[cfg(feature = "timing")]
pub use libs::timing;

pub struct ProveInputPaths<'a> {
    pub qap_path: &'a str,
    pub synthesizer_path: &'a str,
    pub tau_sequence_path: &'a str,
    pub keys_path: &'a str,
    pub output_path: &'a str,
}
