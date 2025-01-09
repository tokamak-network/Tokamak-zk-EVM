#![cfg_attr(not(feature = "std"), no_std)]

#[cfg(feature = "alloc")]
extern crate alloc;


// pub mod gpu;

// These modules don't work in no-std mode
// pub mod fft;
#[cfg(feature = "alloc")]
pub mod bipolynomial;

#[cfg(feature = "alloc")]
pub mod bifft;
