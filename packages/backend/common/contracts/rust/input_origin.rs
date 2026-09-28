//! Backend-owned contract for subcircuit-library input origins.
//!
//! The serialized values are part of CRS provenance. This module deliberately
//! has no crate dependencies so Cargo build scripts and backend runtime code
//! share the same definition.

use std::fmt;
use std::str::FromStr;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SubcircuitLibraryOrigin {
    NpmSnapshot,
    LocalQapCompiler,
}

impl SubcircuitLibraryOrigin {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::NpmSnapshot => "npmSnapshot",
            Self::LocalQapCompiler => "localQapCompiler",
        }
    }
}

impl fmt::Display for SubcircuitLibraryOrigin {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for SubcircuitLibraryOrigin {
    type Err = InputOriginContractError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "npmSnapshot" => Ok(Self::NpmSnapshot),
            "localQapCompiler" => Ok(Self::LocalQapCompiler),
            _ => Err(InputOriginContractError {
                value: value.to_string(),
            }),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InputOriginContractError {
    value: String,
}

impl fmt::Display for InputOriginContractError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "unsupported subcircuit-library input origin {:?}; expected npmSnapshot or localQapCompiler",
            self.value
        )
    }
}

impl std::error::Error for InputOriginContractError {}

#[cfg(test)]
mod tests {
    use super::SubcircuitLibraryOrigin;
    use std::str::FromStr;

    #[test]
    fn conforms_to_the_provenance_origin_enum() {
        let contract: serde_json::Value =
            serde_json::from_str(include_str!("../crs-provenance-contract.json"))
                .expect("backend CRS provenance contract must be valid JSON");
        let origins = contract
            .pointer("/schema/properties/subcircuitLibrary/properties/origin/enum")
            .and_then(serde_json::Value::as_array)
            .expect("provenance contract must define the origin enum")
            .iter()
            .map(|value| value.as_str().expect("origin enum values must be strings"))
            .collect::<Vec<_>>();

        assert_eq!(origins, ["npmSnapshot", "localQapCompiler"]);
        for origin in origins {
            assert_eq!(
                SubcircuitLibraryOrigin::from_str(origin)
                    .expect("provenance origin must parse")
                    .as_str(),
                origin,
            );
        }
        for invalid in [
            "npm-snapshot",
            "localQapCompiler ",
            " localQapCompiler",
            "",
            "unknown",
        ] {
            assert!(
                SubcircuitLibraryOrigin::from_str(invalid).is_err(),
                "origin {invalid:?}"
            );
        }
    }
}
