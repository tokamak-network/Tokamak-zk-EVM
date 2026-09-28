//! Repository-owned parsing for the Tokamak zk-EVM version contract.
//!
//! Package versions are strict canonical `MAJOR.MINOR.PATCH`; CRS compatibility
//! classes are strict canonical `MAJOR.MINOR`. This module deliberately has no
//! crate dependencies so Cargo build scripts and backend runtime code can share
//! the same implementation.

use std::fmt;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompatibilityVersion {
    major: u64,
    minor: u64,
}

impl fmt::Display for CompatibilityVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}.{}", self.major, self.minor)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackageVersion {
    compatibility: CompatibilityVersion,
    patch: u64,
}

impl PackageVersion {
    pub fn compatibility_version(&self) -> CompatibilityVersion {
        self.compatibility.clone()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VersionContractError {
    expected: &'static str,
    value: String,
    detail: &'static str,
}

impl fmt::Display for VersionContractError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "must be canonical {}; got {:?} ({})",
            self.expected, self.value, self.detail
        )
    }
}

impl std::error::Error for VersionContractError {}

pub fn parse_compatible_backend_version(
    value: &str,
) -> Result<CompatibilityVersion, VersionContractError> {
    let components = split_components(value, "MAJOR.MINOR", 2)?;
    Ok(CompatibilityVersion {
        major: parse_component(components[0], "MAJOR.MINOR", value)?,
        minor: parse_component(components[1], "MAJOR.MINOR", value)?,
    })
}

pub fn parse_package_version(value: &str) -> Result<PackageVersion, VersionContractError> {
    let components = split_components(value, "MAJOR.MINOR.PATCH", 3)?;
    Ok(PackageVersion {
        compatibility: CompatibilityVersion {
            major: parse_component(components[0], "MAJOR.MINOR.PATCH", value)?,
            minor: parse_component(components[1], "MAJOR.MINOR.PATCH", value)?,
        },
        patch: parse_component(components[2], "MAJOR.MINOR.PATCH", value)?,
    })
}

pub fn compatibility_from_package_version(
    value: &str,
) -> Result<CompatibilityVersion, VersionContractError> {
    Ok(parse_package_version(value)?.compatibility_version())
}

fn split_components<'a>(
    value: &'a str,
    expected: &'static str,
    count: usize,
) -> Result<Vec<&'a str>, VersionContractError> {
    let components = value.split('.').collect::<Vec<_>>();
    if components.len() != count {
        return Err(error(expected, value, "wrong component count"));
    }
    Ok(components)
}

fn parse_component(
    component: &str,
    expected: &'static str,
    original_value: &str,
) -> Result<u64, VersionContractError> {
    if component.is_empty() || !component.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(error(
            expected,
            original_value,
            "components must contain ASCII digits",
        ));
    }
    if component.len() > 1 && component.starts_with('0') {
        return Err(error(
            expected,
            original_value,
            "leading zeroes are not canonical",
        ));
    }
    component.parse::<u64>().map_err(|_| {
        error(
            expected,
            original_value,
            "numeric component is out of range",
        )
    })
}

fn error(expected: &'static str, value: &str, detail: &'static str) -> VersionContractError {
    VersionContractError {
        expected,
        value: value.to_string(),
        detail,
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_compatible_backend_version, parse_package_version};
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Contract {
        compatible_backend_versions: Vec<CompatibleVersionCase>,
        package_versions: Vec<PackageVersionCase>,
    }

    #[derive(Deserialize)]
    struct CompatibleVersionCase {
        input: String,
        canonical: Option<String>,
    }

    #[derive(Deserialize)]
    struct PackageVersionCase {
        input: String,
        compatibility: Option<String>,
    }

    #[test]
    fn conforms_to_the_repository_version_contract() {
        let contract: Contract = serde_json::from_str(include_str!("compatibility-contract.json"))
            .expect("repository version contract must be valid JSON");

        for case in contract.compatible_backend_versions {
            match case.canonical {
                Some(expected) => assert_eq!(
                    parse_compatible_backend_version(&case.input)
                        .expect("accepted compatibility version must parse")
                        .to_string(),
                    expected,
                    "compatibility input {:?}",
                    case.input
                ),
                None => assert!(
                    parse_compatible_backend_version(&case.input).is_err(),
                    "compatibility input {:?} must be rejected",
                    case.input
                ),
            }
        }

        for case in contract.package_versions {
            match case.compatibility {
                Some(expected) => assert_eq!(
                    parse_package_version(&case.input)
                        .expect("accepted package version must parse")
                        .compatibility_version()
                        .to_string(),
                    expected,
                    "package input {:?}",
                    case.input
                ),
                None => assert!(
                    parse_package_version(&case.input).is_err(),
                    "package input {:?} must be rejected",
                    case.input
                ),
            }
        }
    }
}
