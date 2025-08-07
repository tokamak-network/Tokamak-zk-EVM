use icicle_runtime::{self, Device};

/// Returns true if CUDA or METAL GPU is available.
pub fn check_gpu() -> bool {
    let device_cuda = Device::new("CUDA", 0);
    // "METAL" is not working yet.
    let device_metal = Device::new("CUDA", 0);

    icicle_runtime::is_device_available(&device_cuda)
        || icicle_runtime::is_device_available(&device_metal)
}

/// Sets the best available device and returns the selected device name ("CUDA", "METAL", or "CPU").
pub fn check_device() -> &'static str {

    let _ = icicle_runtime::load_backend("./icicle").unwrap();

    let device_cpu = Device::new("CPU", 0);
    let device_cuda = Device::new("CUDA", 0);
    let device_metal = Device::new("METAL", 0);

    if icicle_runtime::is_device_available(&device_cuda) {
        println!("CUDA is available");
        icicle_runtime::set_device(&device_cuda).expect("Failed to set CUDA device");
        "CUDA"
    } else if icicle_runtime::is_device_available(&device_metal) {
        println!("METAL is available");
        // icicle_runtime::set_device(&device_metal).expect("Failed to set METAL device");
        // "METAL"
        println!( "METAL is not working properly in the ICICLE version 3.8.0, so falling back to CPU only.");
        icicle_runtime::set_device(&device_cpu).expect("Failed to set CPU device");
        "CPU"
    } else {
        println!("GPU is not available, falling back to CPU only");
        icicle_runtime::set_device(&device_cpu).expect("Failed to set CPU device");
        "CPU"
    }
}
