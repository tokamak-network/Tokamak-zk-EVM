use icicle_runtime::{self, Device};

/// Returns true if CUDA or METAL GPU is available.
pub fn check_gpu() -> bool {
    let device_cuda = Device::new("CUDA", 0);
    let device_metal = Device::new("METAL", 0);

    icicle_runtime::is_device_available(&device_cuda)
        || icicle_runtime::is_device_available(&device_metal)
}

/// Sets the best available device and returns the selected device name ("CUDA", "METAL", or "CPU").
pub fn check_device() -> &'static str {
    let _ = icicle_runtime::load_backend_from_env_or_default();

    let device_cuda = Device::new("CUDA", 0);
    let device_metal = Device::new("METAL", 0);

    if icicle_runtime::is_device_available(&device_cuda) {
        println!("CUDA is available");
        icicle_runtime::set_device(&device_cuda).expect("Failed to set CUDA device");
        "CUDA"
    } else if icicle_runtime::is_device_available(&device_metal) {
        println!("METAL is available");
        icicle_runtime::set_device(&device_metal).expect("Failed to set METAL device");
        "METAL"
    } else {
        println!("GPU is not available, falling back to CPU only");
        "CPU"
    }
}
