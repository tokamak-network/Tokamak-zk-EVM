//! Runtime device selection shared by current native backend entry points.

use crate::errors::DeviceError;
use icicle_runtime::Device;

/// Returns whether CUDA is available for ICICLE MSM execution. METAL is not a
/// GPU proving path in the supported ICICLE runtime and therefore remains CPU.
pub fn cuda_msm_is_available() -> bool {
    icicle_runtime::is_device_available(&Device::new("CUDA", 0))
}

pub fn try_check_device() -> Result<&'static str, DeviceError> {
    icicle_runtime::load_backend_from_env_or_default().map_err(|error| {
        DeviceError::Initialization {
            device: "ICICLE backend",
            reason: error.to_string(),
        }
    })?;
    let cpu = Device::new("CPU", 0);
    let cuda = Device::new("CUDA", 0);
    let selected = if icicle_runtime::is_device_available(&cuda) {
        println!("CUDA is available");
        (&cuda, "CUDA")
    } else {
        println!("CUDA is not available, falling back to CPU");
        (&cpu, "CPU")
    };
    icicle_runtime::set_device(selected.0).map_err(|error| DeviceError::Initialization {
        device: selected.1,
        reason: error.to_string(),
    })?;
    Ok(selected.1)
}
