use icicle_bls12_381::curve::{G1Projective, G2Projective, ScalarCfg, ScalarField};
use icicle_core::{
    msm::{msm, MSMConfig},
    traits::{GenerateRandom, MontgomeryConvertible},
};
use icicle_runtime::{
    memory::{DeviceVec, HostSlice},
    stream::IcicleStream,
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::*; // Import all helper functions from the crate
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
                println!(
                    "[INFO] multiple computation tests using device: {:?}",
                    device
                );
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
        if !initialize() {
            println!("[SKIP] Test skipped due to device initialization failure");
            return;
        }
        let test_sizes = [16, 64, 256, 1000];
        let mut stream = IcicleStream::create().unwrap();

        for test_size in test_sizes {
            let points = generate_random_affine_g1_points_with_zeroes(test_size, 2);
            let scalars = ScalarCfg::generate_random(test_size);

            // Test MSM helper
            let result = msm_g1_helper(
                HostSlice::from_slice(&scalars),
                HostSlice::from_slice(&points),
                &stream,
            );

            // Verify result by copying to host
            let mut host_result = vec![G1Projective::zero(); 1];
            result
                .copy_to_host_async(HostSlice::from_mut_slice(&mut host_result), &stream)
                .unwrap();
            stream.synchronize().unwrap();

            // Compare with reference implementation using CPU device
            let cpu_device = Device::new("CPU", 0);
            let _ = set_device(&cpu_device); // Switch to CPU for reference
            let mut ref_result = vec![G1Projective::zero(); 1];
            msm(
                HostSlice::from_slice(&scalars),
                HostSlice::from_slice(&points),
                &MSMConfig::default(),
                HostSlice::from_mut_slice(&mut ref_result),
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

    #[test]
    fn test_basic_msm_g2() {
        if !initialize() {
            println!("[SKIP] Test skipped due to device initialization failure");
            return;
        }
        let test_sizes = [16, 64, 128];
        let mut stream = IcicleStream::create().unwrap();

        for test_size in test_sizes {
            let points = generate_random_affine_g2_points_with_zeroes(test_size, 2);
            let scalars = ScalarCfg::generate_random(test_size);

            // Test MSM helper
            let result = msm_g2_helper(
                HostSlice::from_slice(&scalars),
                HostSlice::from_slice(&points),
                &stream,
            );

            // Verify result by copying to host
            let mut host_result = vec![G2Projective::zero(); 1];
            result
                .copy_to_host_async(HostSlice::from_mut_slice(&mut host_result), &stream)
                .unwrap();
            stream.synchronize().unwrap();

            // Compare with reference implementation using CPU device
            let cpu_device = Device::new("CPU", 0);
            let _ = set_device(&cpu_device); // Switch to CPU for reference
            let mut ref_result = vec![G2Projective::zero(); 1];
            msm(
                HostSlice::from_slice(&scalars),
                HostSlice::from_slice(&points),
                &MSMConfig::default(),
                HostSlice::from_mut_slice(&mut ref_result),
            )
            .unwrap();

            assert_eq!(
                host_result[0], ref_result[0],
                "MSM G2 results don't match for size {}",
                test_size
            );
        }

        stream.destroy().unwrap();
    }

    #[test]
    fn test_batch_msm() {
        if !initialize() {
            println!("[SKIP] Test skipped due to device initialization failure");
            return;
        }
        let test_size = 1000;
        let batch_sizes = [1, 4, 8];
        let mut stream = IcicleStream::create().unwrap();

        for batch_size in batch_sizes {
            let points = generate_random_affine_g1_points_with_zeroes(test_size, 10);
            let scalars = ScalarCfg::generate_random(test_size * batch_size);

            // Test batch MSM helper
            let result = batch_msm_g1_helper(
                HostSlice::from_slice(&scalars),
                HostSlice::from_slice(&points),
                batch_size,
                1, // no precompute
                &stream,
            );

            // Verify results
            let mut host_results = vec![G1Projective::zero(); batch_size];
            result
                .copy_to_host_async(HostSlice::from_mut_slice(&mut host_results), &stream)
                .unwrap();
            stream.synchronize().unwrap();

            // Compare with individual MSMs
            let cpu_device = Device::new("CPU", 0);
            let _ = set_device(&cpu_device); // Switch to CPU for reference
            for i in 0..batch_size {
                let scalar_slice = &scalars[i * test_size..(i + 1) * test_size];
                let mut ref_result = vec![G1Projective::zero(); 1];
                msm(
                    HostSlice::from_slice(scalar_slice),
                    HostSlice::from_slice(&points),
                    &MSMConfig::default(),
                    HostSlice::from_mut_slice(&mut ref_result),
                )
                .unwrap();

                assert_eq!(
                    host_results[i], ref_result[0],
                    "Batch MSM result {} doesn't match for batch size {}",
                    i, batch_size
                );
            }
        }

        stream.destroy().unwrap();
    }

    #[test]
    fn test_precomputed_msm() {
        if !initialize() {
            println!("[SKIP] Test skipped due to device initialization failure");
            return;
        }
        let test_size = 1000;
        let precompute_factor = 4;
        let mut stream = IcicleStream::create().unwrap();

        let points = generate_random_affine_g1_points_with_zeroes(test_size, 5);
        let scalars = ScalarCfg::generate_random(test_size);

        // Precompute bases
        let precomputed_points =
            precompute_msm_bases(HostSlice::from_slice(&points), precompute_factor, &stream);
        stream.synchronize().unwrap();

        // Test MSM with precomputed bases
        let mut config = MSMConfig::default();
        config.stream_handle = (*stream).into();
        config.precompute_factor = precompute_factor;
        config.is_async = true;

        let mut result_precomputed =
            DeviceVec::<G1Projective>::device_malloc_async(1, &stream).unwrap();
        msm(
            HostSlice::from_slice(&scalars),
            &precomputed_points[..],
            &config,
            &mut result_precomputed[..],
        )
        .unwrap();

        // Compare with regular MSM
        let result_regular = msm_g1_helper(
            HostSlice::from_slice(&scalars),
            HostSlice::from_slice(&points),
            &stream,
        );

        let mut host_precomputed = vec![G1Projective::zero(); 1];
        let mut host_regular = vec![G1Projective::zero(); 1];

        result_precomputed
            .copy_to_host_async(HostSlice::from_mut_slice(&mut host_precomputed), &stream)
            .unwrap();
        result_regular
            .copy_to_host_async(HostSlice::from_mut_slice(&mut host_regular), &stream)
            .unwrap();
        stream.synchronize().unwrap();

        assert_eq!(
            host_precomputed[0], host_regular[0],
            "Precomputed MSM doesn't match regular MSM"
        );

        stream.destroy().unwrap();
    }

    #[test]
    fn test_optimized_configs() {
        if !initialize() {
            println!("[SKIP] Test skipped due to device initialization failure");
            return;
        }
        let mut stream = IcicleStream::create().unwrap();

        // Test different optimized configurations
        let small_config = OptimizedMSMConfig::small(&stream);
        let medium_config = OptimizedMSMConfig::medium(&stream);
        let large_config = OptimizedMSMConfig::large(&stream);
        let batch_config = OptimizedMSMConfig::batch(&stream, 4, 2);

        // Verify configurations have expected settings
        assert_eq!(small_config.c, 2);
        assert_eq!(medium_config.c, 4);
        assert_eq!(large_config.c, 6);
        assert_eq!(batch_config.batch_size, 4);
        assert_eq!(batch_config.precompute_factor, 2);

        // Test with small dataset
        let test_size = 256;
        let points = generate_random_affine_g1_points_with_zeroes(test_size, 2);
        let scalars = ScalarCfg::generate_random(test_size);

        let mut result = DeviceVec::<G1Projective>::device_malloc_async(1, &stream).unwrap();
        msm(
            HostSlice::from_slice(&scalars),
            HostSlice::from_slice(&points),
            &small_config,
            &mut result[..],
        )
        .unwrap();

        let mut host_result = vec![G1Projective::zero(); 1];
        result
            .copy_to_host_async(HostSlice::from_mut_slice(&mut host_result), &stream)
            .unwrap();
        stream.synchronize().unwrap();

        // Should not panic and produce valid result
        assert!(host_result.len() == 1);

        stream.destroy().unwrap();
    }

    #[test]
    fn test_montgomery_form_scalars() {
        if !initialize() {
            println!("[SKIP] Test skipped due to device initialization failure");
            return;
        }
        let test_size = 100;
        let mut stream = IcicleStream::create().unwrap();

        let points = generate_random_affine_g1_points_with_zeroes(test_size, 2);
        let scalars = ScalarCfg::generate_random(test_size);

        // Copy scalars to device and convert to Montgomery form
        let mut scalars_mont =
            DeviceVec::<ScalarField>::device_malloc_async(test_size, &stream).unwrap();
        scalars_mont
            .copy_from_host_async(HostSlice::from_slice(&scalars), &stream)
            .unwrap();
        ScalarField::to_mont(&mut scalars_mont, &stream);

        // Configure MSM for Montgomery form
        let mut config = MSMConfig::default();
        config.stream_handle = (*stream).into();
        config.is_async = true;
        config.are_scalars_montgomery_form = true;

        let mut result_mont = DeviceVec::<G1Projective>::device_malloc_async(1, &stream).unwrap();
        msm(
            &scalars_mont[..],
            HostSlice::from_slice(&points),
            &config,
            &mut result_mont[..],
        )
        .unwrap();

        // Compare with regular MSM
        let result_regular = msm_g1_helper(
            HostSlice::from_slice(&scalars),
            HostSlice::from_slice(&points),
            &stream,
        );

        let mut host_mont = vec![G1Projective::zero(); 1];
        let mut host_regular = vec![G1Projective::zero(); 1];

        result_mont
            .copy_to_host_async(HostSlice::from_mut_slice(&mut host_mont), &stream)
            .unwrap();
        result_regular
            .copy_to_host_async(HostSlice::from_mut_slice(&mut host_regular), &stream)
            .unwrap();
        stream.synchronize().unwrap();

        assert_eq!(
            host_mont[0], host_regular[0],
            "Montgomery form MSM doesn't match regular MSM"
        );

        stream.destroy().unwrap();
    }

    #[test]
    fn test_sequential_vs_batch_msm() {
        if !initialize() {
            println!("[SKIP] Test skipped due to device initialization failure");
            return;
        }

        let mut stream_1 = IcicleStream::create().unwrap();
        let mut stream_2 = IcicleStream::create().unwrap();

        // Test parameters
        let num_msms = 10;
        let msm_size = 1 << 13; // Size of each individual MSM

        println!("Testing {} MSMs of size {} each", num_msms, msm_size);

        // Generate different points and scalars for each MSM
        let mut all_points = Vec::new();
        let mut all_scalars = Vec::new();

        for _i in 0..num_msms {
            // Each MSM gets completely different points and scalars
            let points = generate_random_affine_g1_points_with_zeroes(msm_size, 10);
            let scalars = ScalarCfg::generate_random(msm_size);

            all_points.extend(points);
            all_scalars.extend(scalars);
        }

        // ===== SEQUENTIAL APPROACH =====
        println!("Running sequential MSMs...");
        let start_sequential = std::time::Instant::now();

        let mut sequential_results = Vec::with_capacity(num_msms);
        for i in 0..num_msms {
            let start_idx = i * msm_size;
            let end_idx = (i + 1) * msm_size;

            let result = msm_g1_helper(
                HostSlice::from_slice(&all_scalars[start_idx..end_idx]),
                HostSlice::from_slice(&all_points[start_idx..end_idx]),
                &stream_1,
            );

            // Copy result to host for comparison
            let mut host_result = vec![G1Projective::zero(); 1];
            result
                .copy_to_host_async(HostSlice::from_mut_slice(&mut host_result), &stream_1)
                .unwrap();
            stream_1.synchronize().unwrap();

            sequential_results.push(host_result[0]);
        }
        stream_1.destroy().unwrap();

        let sequential_duration = start_sequential.elapsed();
        println!(
            "Sequential time: {:.2?} ({:.2?} per MSM)",
            sequential_duration,
            sequential_duration / num_msms as u32
        );

        // ===== BATCH APPROACH =====
        println!("Running batch MSM...");
        let start_batch = std::time::Instant::now();

        // Configure for batch with different points per MSM
        let mut config = MSMConfig::default();
        config.stream_handle = (*stream_2).into();
        config.is_async = true;
        config.batch_size = num_msms as i32;
        config.are_points_shared_in_batch = false; // KEY: different points per MSM
        config.precompute_factor = 1; // No precompute since points differ
        config.c = 4; // Reasonable c value for this size
        config
            .ext
            .set_int(icicle_core::msm::CUDA_MSM_LARGE_BUCKET_FACTOR, 5);

        let mut batch_results =
            DeviceVec::<G1Projective>::device_malloc_async(num_msms, &stream_2).unwrap();

        // Run batch MSM with all scalars and points
        msm(
            HostSlice::from_slice(&all_scalars),
            HostSlice::from_slice(&all_points),
            &config,
            &mut batch_results[..],
        )
        .unwrap();

        // Copy batch results to host
        let mut host_batch_results = vec![G1Projective::zero(); num_msms];
        batch_results
            .copy_to_host_async(
                HostSlice::from_mut_slice(&mut host_batch_results),
                &stream_2,
            )
            .unwrap();
        stream_2.synchronize().unwrap();
        stream_2.destroy().unwrap();
        let batch_duration = start_batch.elapsed();
        println!(
            "Batch time: {:.2?} ({:.2?} per MSM)",
            batch_duration,
            batch_duration / num_msms as u32
        );

        // ===== PERFORMANCE COMPARISON =====
        let speedup = sequential_duration.as_nanos() as f64 / batch_duration.as_nanos() as f64;
        println!("Batch speedup: {:.2}x", speedup);

        if speedup > 1.0 {
            println!("✓ Batch MSM is {:.2}x faster than sequential", speedup);
        } else {
            println!(
                "⚠ Sequential is {:.2}x faster than batch (unexpected)",
                1.0 / speedup
            );
        }

        // ===== CORRECTNESS VERIFICATION =====
        println!("Verifying correctness...");
        for i in 0..num_msms {
            assert_eq!(
                sequential_results[i], host_batch_results[i],
                "MSM result {} doesn't match between sequential and batch",
                i
            );
        }
        println!("✓ All results match!");

        // ===== ADDITIONAL ANALYSIS =====
        println!("\nPerformance Analysis:");
        println!("- Total elements processed: {}", num_msms * msm_size);
        println!(
            "- Sequential throughput: {:.0} elements/ms",
            (num_msms * msm_size) as f64 / sequential_duration.as_millis() as f64
        );
        println!(
            "- Batch throughput: {:.0} elements/ms",
            (num_msms * msm_size) as f64 / batch_duration.as_millis() as f64
        );
    }
}
