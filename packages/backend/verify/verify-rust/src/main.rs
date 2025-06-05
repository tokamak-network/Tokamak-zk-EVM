use std::time::Instant;

use icicle_runtime::Device;
use verify::Verifier;

fn main() {
    let _ = icicle_runtime::load_backend_from_env_or_default();

    // Check if GPU is available
    let device_cpu = Device::new("CPU", 0);
    let mut device_gpu = Device::new("CUDA", 0);
    let is_cuda_device_available = icicle_runtime::is_device_available(&device_gpu);
    if is_cuda_device_available {
        println!("GPU is available");
        icicle_runtime::set_device(&device_cpu).expect("Failed to set device");
    } else {
        println!("GPU is not available, falling back to CPU only");
        device_gpu = device_cpu.clone();
    }
    
    
    println!("Verifier initialization...");
    let mut timer = Instant::now();
    let verifier = Verifier::init();
    let mut lap = timer.elapsed();
    println!("Verifier init time: {:.6} seconds", lap.as_secs_f64());

    println!("Verifying the proof...");
    timer = Instant::now();
    let res_keccak = verifier.verify_keccak256();
    let res_snark = verifier.verify_snark();
    lap = timer.elapsed();
    println!("Verification time: {:.6} seconds", lap.as_secs_f64());
    println!("Verification result: {:?}, {:?}", res_snark, res_keccak);
}