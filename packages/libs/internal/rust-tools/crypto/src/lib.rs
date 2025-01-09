#![allow(clippy::op_ref)]
#![cfg_attr(not(feature = "std"), no_std)]
#[macro_use]
extern crate alloc;

// #[cfg(feature = "alloc")]
pub mod bikzg;
// #[cfg(feature = "alloc")]
pub mod lagrange_basis;
// #[cfg(feature = "std")]
// pub mod errors;
// pub mod fiat_shamir;
// pub mod hash;
// pub mod merkle_tree;
