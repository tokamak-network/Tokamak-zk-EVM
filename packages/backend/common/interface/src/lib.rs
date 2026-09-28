//! Shared, byte-stable Rust interfaces for Tokamak zk-EVM backend artifacts.
//!
//! This crate owns only archive bindings and deterministic artifact codecs.
//! Native curve conversion and browser binding code belong to their respective
//! runtime packages.

#![deny(unsafe_code)]

pub use backend_univariate_crs_interface::*;
mod artifact_bytes;
pub use artifact_bytes::{PreprocessBytes, ProofBytes};
