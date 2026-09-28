//! 64-bit RKYV schemas for the role-separated univariate CRS archives.
//!
//! Production univariate CRS files exceed the offset range of RKYV's default
//! 32-bit relative pointers. Both trusted setup and MPC use these role records.

#![deny(unsafe_code)]

pub use rkyv as archive;

mod nonpublic_queries;
pub use nonpublic_queries::NonpublicQueryLayout;
mod weighted_queries;
pub use weighted_queries::WeightedQueryLayout;

// Current role records are generated from the common JSON artifact contract.
// NonpublicQueryLayout selects stored coordinates without expanding omitted
// virtual IDs or local-wire padding. Preprocess bases are not online keys.
mod roles;
pub use roles::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
pub struct UnivariateG1Rkyv {
    pub x: [u8; 48],
    pub y: [u8; 48],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
pub struct UnivariateG2Rkyv {
    pub x: [u8; 96],
    pub y: [u8; 96],
}

#[cfg(test)]
mod tests {
    #[test]
    fn archive_offsets_are_64_bit() {
        assert_eq!(
            core::mem::size_of::<rkyv::Archived<usize>>(),
            core::mem::size_of::<u64>()
        );
    }
}
