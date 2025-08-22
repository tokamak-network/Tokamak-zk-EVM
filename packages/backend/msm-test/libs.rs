use icicle_bls12_381::curve::{CurveCfg, G1Affine, G2Affine, G2CurveCfg, ScalarField};

pub type F = ScalarField;
pub type G1 = G1Affine;
pub type G2 = G2Affine;

pub type G1Cfg = CurveCfg;
pub type G2Cfg = G2CurveCfg;

// Re-export important types for convenience
pub use icicle_bls12_381::curve::{CurveCfg as BLS12_381_G1, G2CurveCfg as BLS12_381_G2};
pub use icicle_core::{
    curve::{Affine, Curve, Projective},
    msm::{msm, precompute_bases, MSMConfig, CUDA_MSM_LARGE_BUCKET_FACTOR, MSM},
    ntt::{ntt_inplace, NTTConfig, NTTDir, NTT},
    traits::{FieldImpl, GenerateRandom, MontgomeryConvertible},
    vec_ops::{mul_scalars, sub_scalars, VecOpsConfig},
};
pub use icicle_runtime::{
    memory::{DeviceSlice, DeviceVec, HostOrDeviceSlice, HostSlice},
    runtime::{get_device_count, warmup},
    stream::IcicleStream,
    test_utilities,
};

// Include the main module implementation
pub mod helpers;
pub use helpers::*;

// Include the test module
#[cfg(test)]
pub mod tests {
    use super::*;
    use icicle_bls12_381::curve::{G1Projective, ScalarCfg};
    use icicle_runtime::{device::Device, is_device_available, runtime, set_device};

    /// Safe test initialization that works without GPU backends
    fn initialize() -> bool {
        // Try to load backends, but don't panic if they fail
        let backend_loaded = runtime::load_backend_from_env_or_default().is_ok();

        if !backend_loaded {
            println!("[WARN] Failed to load GPU backends, trying CPU-only mode");
        }

        // Try to set up a device, preferring CUDA but falling back to CPU
        let device = if is_device_available(&Device::new("CUDA", 0)) {
            Device::new("CUDA", 0)
        } else {
            Device::new("CPU", 0)
        };

        // Try to set the device, return false if even CPU fails
        match set_device(&device) {
            Ok(_) => {
                println!("[INFO] Test using device: {:?}", device);
                true
            }
            Err(e) => {
                println!("[ERROR] Failed to set device: {:?}", e);
                false
            }
        }
    }

    #[test]
    fn test_basic_msm_g1() {
        // Skip test if device initialization fails
        if !initialize() {
            println!("[SKIP] Test skipped due to device initialization failure");
            return;
        }
        let test_sizes = [16, 64, 256, 1000];
        let mut stream = icicle_runtime::stream::IcicleStream::create().unwrap();

        for test_size in test_sizes {
            let points = generate_random_affine_g1_points_with_zeroes(test_size, 2);
            let scalars = icicle_bls12_381::curve::ScalarCfg::generate_random(test_size);

            // Test MSM helper
            let result = msm_g1_helper(
                icicle_runtime::memory::HostSlice::from_slice(&scalars),
                icicle_runtime::memory::HostSlice::from_slice(&points),
                &stream,
            );

            // Verify result by copying to host
            let mut host_result = vec![G1Projective::zero(); 1];
            result
                .copy_to_host_async(
                    icicle_runtime::memory::HostSlice::from_mut_slice(&mut host_result),
                    &stream,
                )
                .unwrap();
            stream.synchronize().unwrap();

            // Compare with reference implementation using CPU device
            let cpu_device = Device::new("CPU", 0);
            let _ = set_device(&cpu_device); // Switch to CPU for reference

            let mut ref_result = vec![G1Projective::zero(); 1];
            msm(
                icicle_runtime::memory::HostSlice::from_slice(&scalars),
                icicle_runtime::memory::HostSlice::from_slice(&points),
                &MSMConfig::default(),
                icicle_runtime::memory::HostSlice::from_mut_slice(&mut ref_result),
            )
            .unwrap();

            assert_eq!(
                host_result[0], ref_result[0],
                "MSM results don't match for size {}",
                test_size
            );
        }

        stream.destroy().unwrap();
    }
}

// Additional comprehensive tests
#[cfg(test)]
mod mul_tests;
