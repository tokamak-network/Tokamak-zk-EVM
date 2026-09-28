//! Process-wide ICICLE radix-two NTT-domain management.
//!
//! ICICLE owns one field NTT domain per process. Native protocol paths must
//! therefore share this synchronization instead of independently releasing or
//! replacing the provider domain.

use icicle_bls12_381::curve::ScalarField;
use icicle_core::ntt;
use icicle_runtime::errors::eIcicleError;
#[cfg(test)]
use std::cmp;
use std::sync::{Mutex, OnceLock};

static NTT_DOMAIN_SIZE: OnceLock<Mutex<Option<usize>>> = OnceLock::new();

fn ntt_domain_size_cell() -> &'static Mutex<Option<usize>> {
    NTT_DOMAIN_SIZE.get_or_init(|| Mutex::new(None))
}

pub fn init_ntt_domain_for_size(size: usize) -> Result<(), eIcicleError> {
    let domain_size = requested_ntt_domain_size(size);
    if domain_size == 0 || !domain_size.is_power_of_two() {
        return Err(eIcicleError::InvalidArgument);
    }

    let mut guard = ntt_domain_size_cell()
        .lock()
        .map_err(|_| eIcicleError::InvalidArgument)?;
    if let Some(current) = *guard {
        if current >= domain_size {
            return Ok(());
        }
        ntt::release_domain::<ScalarField>()?;
    }
    ntt::initialize_domain::<ScalarField>(
        ntt::get_root_of_unity::<ScalarField>(domain_size as u64),
        &ntt::NTTInitDomainConfig::default(),
    )?;
    *guard = Some(domain_size);
    Ok(())
}

fn requested_ntt_domain_size(size: usize) -> usize {
    #[cfg(test)]
    {
        cmp::max(size, 1 << 22)
    }
    #[cfg(not(test))]
    {
        size
    }
}
