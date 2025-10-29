//! Tokamak Groth16 Trusted Setup Implementation
//!
//! This crate provides a high-performance trusted setup ceremony implementation for
//! the Tokamak Storage Merkle Proof circuit using the BLS12-381 curve and ICICLE acceleration.
//!
//! ## Core Components
//! 
//! - **Powers of Tau Generation**: Creates the initial cryptographic material
//! - **Circuit Setup**: Transforms R1CS constraints into Groth16 proving/verification keys
//! - **Ceremony Orchestration**: Manages the trusted setup process
//! - **Security Validation**: Ensures cryptographic correctness and safety

// Core modules
pub mod errors;
pub mod powers_of_tau;
pub mod r1cs;
pub mod circuit_setup;
pub mod ceremony;
pub mod serialization;
pub mod validation;

// Re-export all public types
pub use errors::*;
pub use powers_of_tau::*;
pub use r1cs::*;
pub use circuit_setup::*;
pub use ceremony::*;
pub use serialization::*;
pub use validation::*;

// Version and circuit constants
pub const TOKAMAK_CIRCUIT_VERSION: &str = "1.0.0";
pub const MAX_CIRCUIT_SIZE: usize = 200_000;
pub const DEFAULT_CEREMONY_ROUNDS: usize = 3;
