#![allow(non_snake_case)]

pub mod curves;
pub mod field_structures;

// export commonly used types
pub use curves::bls12_381::Bls12_381Config;
pub use curves::curve_config::CurveConfig;
pub use field_structures::FieldSerde;

// Default curve type alias
pub type DefaultCurve = Bls12_381Config;
