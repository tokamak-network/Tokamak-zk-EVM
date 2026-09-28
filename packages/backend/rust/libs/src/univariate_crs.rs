//! Library-derived geometry for the current univariate CRS.

use crate::frontend_artifacts::normalized_library::NormalizedSetupParams;
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::{Arithmetic, FieldImpl};
use thiserror::Error;

pub const UNIVARIATE_CRS_SCHEMA_ID: &str = "tokamak-zk-evm-univariate";

#[derive(Debug, Error)]
pub enum UnivariateCrsError {
    #[error("invalid library capacity: {name}")]
    InvalidCapacity { name: &'static str },
    #[error("{name} must be greater than one")]
    DomainTooSmall { name: &'static str },
    #[error("{name} must be a nonzero power of two for the selected transform provider")]
    DomainNotPowerOfTwo { name: &'static str },
    #[error("{name} exceeds the supported u64 domain size")]
    DomainTooLarge { name: &'static str },
    #[error("{name} has no primitive root of the required order")]
    InvalidDomainRoot { name: &'static str },
    #[error("{name} overflows while deriving univariate CRS capacity")]
    CapacityOverflow { name: &'static str },
}

/// Capacity and roots fixed exclusively by normalized library metadata.
#[derive(Clone, Debug, PartialEq)]
pub struct UnivariateCrsShape {
    pub subcircuit_capacity: usize,
    pub arithmetic_domain_size: usize,
    pub connection_domain_size: usize,
    pub selection_domain_size: usize,
    pub intersection_domain_size: usize,
    pub union_domain_size: usize,
    pub minimum_capacity: [usize; 3],
    pub declared_capacity: [usize; 3],
    pub k: usize,
    pub h: usize,
    pub arithmetic_root: ScalarField,
    pub connection_root: ScalarField,
    pub selection_root: ScalarField,
}

impl UnivariateCrsShape {
    pub fn from_normalized_setup(
        params: &NormalizedSetupParams,
        free_public_len: usize,
    ) -> Result<Self, UnivariateCrsError> {
        for (name, value) in [
            ("n", params.n),
            ("m", params.m),
            ("m_b", params.m_b),
            ("t", params.t),
            ("s", params.s),
            ("free public length", free_public_len),
        ] {
            if !value.is_power_of_two() {
                return Err(UnivariateCrsError::DomainNotPowerOfTwo { name });
            }
        }
        if params.m_b > params.m || params.t < 2 {
            return Err(UnivariateCrsError::InvalidCapacity {
                name: "normalized local grid",
            });
        }
        Self::from_capacities(params.n, params.m_b, params.t, params.s, free_public_len)
    }

    fn from_capacities(
        arithmetic_width: usize,
        wiring_width: usize,
        subcircuit_capacity: usize,
        placement_capacity: usize,
        free_public_len: usize,
    ) -> Result<Self, UnivariateCrsError> {
        let product = |name, a: usize, b: usize| {
            a.checked_mul(b)
                .ok_or(UnivariateCrsError::CapacityOverflow { name })
        };
        let add = |name, a: usize, b: usize| {
            a.checked_add(b)
                .ok_or(UnivariateCrsError::CapacityOverflow { name })
        };
        let arithmetic_domain_size = product("N_A", arithmetic_width, placement_capacity)?;
        let connection_domain_size = product("N_C", wiring_width, placement_capacity)?;
        let selection_domain_size = product("N_S", subcircuit_capacity, placement_capacity)?;
        let intersection_domain_size =
            greatest_common_divisor(arithmetic_domain_size, connection_domain_size);
        let union_domain_size = add("N_union", arithmetic_domain_size, connection_domain_size)?
            - intersection_domain_size;
        let d = add("d", arithmetic_domain_size.max(connection_domain_size), 1)?;
        let h = add("h", d, 1)?;
        let p = [
            add("2d+1", product("2d", 2, d)?, 1)?,
            add("N_S+1", selection_domain_size, 1)?,
            add(
                "h+s(t-1)",
                h,
                product("s(t-1)", placement_capacity, subcircuit_capacity - 1)?,
            )?,
            free_public_len - 1,
        ]
        .into_iter()
        .max()
        .unwrap();
        let minimum_capacity = [product("2P", 2, p)?, p, p];
        let arithmetic_root = primitive_root("N_A", arithmetic_domain_size)?;
        let connection_root = primitive_root("N_C", connection_domain_size)?;
        let selection_root = primitive_root("N_S", selection_domain_size)?;
        let placement_root = primitive_root("s", placement_capacity)?;
        if arithmetic_root.pow(arithmetic_width) != placement_root
            || connection_root.pow(wiring_width) != placement_root
            || selection_root.pow(subcircuit_capacity) != placement_root
        {
            return Err(UnivariateCrsError::InvalidDomainRoot {
                name: "compatible placement roots",
            });
        }
        Ok(Self {
            subcircuit_capacity,
            arithmetic_domain_size,
            connection_domain_size,
            selection_domain_size,
            intersection_domain_size,
            union_domain_size,
            minimum_capacity,
            declared_capacity: minimum_capacity,
            k: p - d,
            h,
            arithmetic_root,
            connection_root,
            selection_root,
        })
    }
}

fn greatest_common_divisor(mut left: usize, mut right: usize) -> usize {
    while right != 0 {
        (left, right) = (right, left % right);
    }
    left
}

fn primitive_root(
    name: &'static str,
    domain_size: usize,
) -> Result<ScalarField, UnivariateCrsError> {
    if domain_size == 0 {
        return Err(UnivariateCrsError::DomainTooSmall { name });
    }
    if domain_size == 1 {
        return Ok(ScalarField::one());
    }
    let domain_size_u64 =
        u64::try_from(domain_size).map_err(|_| UnivariateCrsError::DomainTooLarge { name })?;
    use ark_ff::{BigInteger, Field, One, PrimeField};
    let root = crate::univariate_field::canonical_root(domain_size)
        .ok_or(UnivariateCrsError::InvalidDomainRoot { name })?;
    if root.pow([domain_size_u64]) != ark_bls12_381::Fr::one()
        || distinct_prime_factors(domain_size)
            .iter()
            .any(|factor| root.pow([(domain_size / factor) as u64]) == ark_bls12_381::Fr::one())
    {
        return Err(UnivariateCrsError::InvalidDomainRoot { name });
    }
    Ok(ScalarField::from_bytes_le(
        &root.into_bigint().to_bytes_le(),
    ))
}

fn distinct_prime_factors(mut value: usize) -> Vec<usize> {
    let mut factors = Vec::new();
    let mut divisor = 2;
    while divisor <= value / divisor {
        if value % divisor == 0 {
            factors.push(divisor);
            while value % divisor == 0 {
                value /= divisor;
            }
        }
        divisor += if divisor == 2 { 1 } else { 2 };
    }
    if value > 1 {
        factors.push(value);
    }
    factors
}
