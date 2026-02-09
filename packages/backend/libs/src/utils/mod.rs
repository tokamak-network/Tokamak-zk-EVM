use icicle_runtime::{self, Device};
use std::path::PathBuf;

use crate::bivariate_polynomial::init_ntt_domain_for_size;
use crate::iotools::SetupParams;

#[derive(Clone, Copy, Debug)]
pub struct SetupShape {
    pub l: usize,
    pub m_i: usize,
    pub n: usize,
    pub s_max: usize,
}

pub fn load_setup_params_from_qap_path(qap_path: &str) -> SetupParams {
    let setup_path = PathBuf::from(qap_path).join("setupParams.json");
    SetupParams::read_from_json(setup_path).expect("Failed to read setupParams.json")
}

pub fn setup_shape(params: &SetupParams) -> SetupShape {
    let m_i = params
        .l_D
        .checked_sub(params.l)
        .expect("Invalid setup params: l_D must be >= l.");
    SetupShape {
        l: params.l,
        m_i,
        n: params.n,
        s_max: params.s_max,
    }
}

pub fn validate_setup_shape(shape: &SetupShape) {
    if !shape.n.is_power_of_two() {
        panic!("n is not a power of two.");
    }
    if !shape.s_max.is_power_of_two() {
        panic!("s_max is not a power of two.");
    }
    if !shape.m_i.is_power_of_two() {
        panic!("m_I is not a power of two.");
    }
}

pub fn validate_public_wire_size(l: usize) {
    if l != 0 && !l.is_power_of_two() {
        panic!("l is not a power of two.");
    }
}

pub fn prover_verifier_ntt_domain_size(shape: &SetupShape) -> usize {
    let max_mn = std::cmp::max(shape.m_i, shape.n);
    let ntt_domain_x = max_mn.checked_mul(4).expect("4 * max(m_i, n) overflow");
    let ntt_domain_y = shape.s_max.checked_mul(2).expect("2 * s_max overflow");
    ntt_domain_x
        .checked_mul(ntt_domain_y)
        .expect("2 * max(m_i, n) * 2 * s_max overflow")
}

pub fn trusted_setup_ntt_domain_size(shape: &SetupShape) -> usize {
    *[shape.n, shape.l, shape.m_i, shape.s_max]
        .iter()
        .max()
        .expect("max(n, l, m_i, s_max) requires non-empty inputs")
}

pub fn trusted_setup_testing_ntt_domain_size(shape: &SetupShape) -> usize {
    std::cmp::max(shape.n, shape.m_i)
        .checked_mul(shape.s_max)
        .expect("max(n, m_i) * s_max overflow")
}

pub fn init_ntt_domain(size: usize) {
    init_ntt_domain_for_size(size).expect("Failed to initialize NTT domain");
}

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

    let _ = icicle_runtime::load_backend_from_env_or_default();
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
