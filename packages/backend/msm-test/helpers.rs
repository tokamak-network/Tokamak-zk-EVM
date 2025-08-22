use crate::{G1Cfg, G2Cfg};
use icicle_bls12_381::curve::{G1Affine, G1Projective, G2Affine, G2Projective, ScalarField};
use icicle_core::{
    curve::Curve,
    msm::{msm, precompute_bases, MSMConfig, CUDA_MSM_LARGE_BUCKET_FACTOR},
    ntt::{ntt_inplace, NTTConfig, NTTDir, NTT},
    traits::FieldImpl,
};
use icicle_runtime::{
    memory::{DeviceSlice, DeviceVec, HostOrDeviceSlice},
    stream::IcicleStream,
};
use rand::thread_rng;
use rand::Rng;

/// Basic MSM helper function for G1 points
/// Performs multi-scalar multiplication: s1*P1 + s2*P2 + ... + sn*Pn
pub fn msm_g1_helper(
    scalars: &(impl HostOrDeviceSlice<ScalarField> + ?Sized),
    points: &(impl HostOrDeviceSlice<G1Affine> + ?Sized),
    stream: &IcicleStream,
) -> DeviceVec<G1Projective> {
    let mut msm_result = DeviceVec::<G1Projective>::device_malloc_async(1, stream).unwrap();
    let mut msm_config = MSMConfig::default();
    msm_config.stream_handle = stream.into();
    msm_config.is_async = true;

    msm(scalars, points, &msm_config, &mut msm_result[..]).unwrap();

    msm_result
}

/// Basic MSM helper function for G2 points
pub fn msm_g2_helper(
    scalars: &(impl HostOrDeviceSlice<ScalarField> + ?Sized),
    points: &(impl HostOrDeviceSlice<G2Affine> + ?Sized),
    stream: &IcicleStream,
) -> DeviceVec<G2Projective> {
    let mut msm_result = DeviceVec::<G2Projective>::device_malloc_async(1, stream).unwrap();
    let mut msm_config = MSMConfig::default();
    msm_config.stream_handle = stream.into();
    msm_config.is_async = true;

    msm(scalars, points, &msm_config, &mut msm_result[..]).unwrap();

    msm_result
}

/// Batch MSM helper with configurable batch size and precomputation
pub fn batch_msm_g1_helper(
    scalars: &(impl HostOrDeviceSlice<ScalarField> + ?Sized),
    points: &(impl HostOrDeviceSlice<G1Affine> + ?Sized),
    batch_size: usize,
    precompute_factor: i32,
    stream: &IcicleStream,
) -> DeviceVec<G1Projective> {
    let mut msm_results =
        DeviceVec::<G1Projective>::device_malloc_async(batch_size, stream).unwrap();
    let mut msm_config = MSMConfig::default();
    msm_config.stream_handle = stream.into();
    msm_config.is_async = true;
    msm_config.precompute_factor = precompute_factor;
    msm_config.batch_size = batch_size as i32;

    // Enable optimization settings for CUDA backend
    msm_config.ext.set_int(CUDA_MSM_LARGE_BUCKET_FACTOR, 5);
    msm_config.c = 4;

    msm(scalars, points, &msm_config, &mut msm_results[..]).unwrap();

    msm_results
}

/// Enhanced batch MSM helper with explicit point sharing configuration
/// don't know if this is useful, need to test the performance on CPU and GPU
pub fn batch_msm_g1_helper_with_config(
    scalars: &(impl HostOrDeviceSlice<ScalarField> + ?Sized),
    points: &(impl HostOrDeviceSlice<G1Affine> + ?Sized),
    batch_size: usize,
    are_points_shared: bool,
    precompute_factor: i32,
    c_value: Option<i32>,
    stream: &IcicleStream,
) -> DeviceVec<G1Projective> {
    let mut msm_results =
        DeviceVec::<G1Projective>::device_malloc_async(batch_size, stream).unwrap();
    let mut msm_config = MSMConfig::default();
    msm_config.stream_handle = stream.into();
    msm_config.is_async = true;
    msm_config.batch_size = batch_size as i32;
    msm_config.are_points_shared_in_batch = are_points_shared;
    msm_config.precompute_factor = precompute_factor;

    // Set c value (window size) - rule of thumb: log2(n) - 4 for no precompute
    // msm_config.c = c_value.unwrap_or(4);
    msm_config.c = 3;
    // CUDA optimizations
    msm_config.ext.set_int(
        CUDA_MSM_LARGE_BUCKET_FACTOR,
        if are_points_shared { 10 } else { 5 },
    );

    msm(scalars, points, &msm_config, &mut msm_results[..]).unwrap();

    msm_results
}

/// NTT helper function with coset generation support
pub fn ntt_helper(
    vec: &mut DeviceSlice<ScalarField>,
    inverse: bool,
    coset_gen: Option<&ScalarField>,
    stream: &IcicleStream,
) where
    <ScalarField as FieldImpl>::Config: NTT<ScalarField, ScalarField>,
{
    let dir = if inverse {
        NTTDir::kInverse
    } else {
        NTTDir::kForward
    };

    let mut cfg = NTTConfig::<ScalarField>::default();
    cfg.is_async = true;
    cfg.batch_size = 3;
    cfg.stream_handle = stream.into();
    if let Some(coset_gen) = coset_gen {
        cfg.coset_gen = *coset_gen;
    }

    ntt_inplace(vec, dir, &cfg).unwrap();
}

/// Precompute MSM bases for better performance
pub fn precompute_msm_bases(
    points: &(impl HostOrDeviceSlice<G1Affine> + ?Sized),
    precompute_factor: i32,
    stream: &IcicleStream,
) -> DeviceVec<G1Affine> {
    let mut precomputed_points = DeviceVec::<G1Affine>::device_malloc_async(
        points.len() * precompute_factor as usize,
        stream,
    )
    .unwrap();

    let mut config = MSMConfig::default();
    config.stream_handle = stream.into();
    config.precompute_factor = precompute_factor;
    config.is_async = true;

    precompute_bases(points, &config, &mut precomputed_points[..]).unwrap();

    precomputed_points
}

/// Generate random affine points with some zero points for testing
pub fn generate_random_affine_g1_points_with_zeroes(
    size: usize,
    num_zeroes: usize,
) -> Vec<G1Affine> {
    let mut rng = thread_rng();
    let mut points = G1Cfg::generate_random_affine_points(size);
    for _ in 0..num_zeroes {
        points[rng.gen_range(0..size)] = G1Affine::zero();
    }
    points
}

/// Generate random affine G2 points with some zero points for testing
pub fn generate_random_affine_g2_points_with_zeroes(
    size: usize,
    num_zeroes: usize,
) -> Vec<G2Affine> {
    let mut rng = thread_rng();
    let mut points = G2Cfg::generate_random_affine_points(size);
    for _ in 0..num_zeroes {
        points[rng.gen_range(0..size)] = G2Affine::zero();
    }
    points
}

/// Optimized MSM configuration for different use cases
pub struct OptimizedMSMConfig;

impl OptimizedMSMConfig {
    /// Configuration for small MSMs (< 2^10 elements)
    pub fn small(stream: &IcicleStream) -> MSMConfig {
        let mut config = MSMConfig::default();
        config.stream_handle = stream.into();
        config.is_async = true;
        config.c = 2;
        config
    }

    /// Configuration for medium MSMs (2^10 to 2^16 elements)
    pub fn medium(stream: &IcicleStream) -> MSMConfig {
        let mut config = MSMConfig::default();
        config.stream_handle = stream.into();
        config.is_async = true;
        config.c = 4;
        config.ext.set_int(CUDA_MSM_LARGE_BUCKET_FACTOR, 3);
        config
    }

    /// Configuration for large MSMs (> 2^16 elements)
    pub fn large(stream: &IcicleStream) -> MSMConfig {
        let mut config = MSMConfig::default();
        config.stream_handle = stream.into();
        config.is_async = true;
        config.c = 6;
        config.ext.set_int(CUDA_MSM_LARGE_BUCKET_FACTOR, 5);
        config
    }

    /// Configuration optimized for batch operations
    pub fn batch(stream: &IcicleStream, batch_size: i32, precompute_factor: i32) -> MSMConfig {
        let mut config = MSMConfig::default();
        config.stream_handle = stream.into();
        config.is_async = true;
        config.batch_size = batch_size;
        config.precompute_factor = precompute_factor;
        config.c = 4;
        config.ext.set_int(CUDA_MSM_LARGE_BUCKET_FACTOR, 5);
        config
    }
}

/// Create optimal batch MSM config for different points per MSM scenario  
pub fn create_different_points_batch_config(
    batch_size: usize,
    msm_size: usize,
    stream: &IcicleStream,
) -> MSMConfig {
    let mut config = MSMConfig::default();
    config.stream_handle = stream.into();
    config.is_async = true;
    config.batch_size = batch_size as i32;
    config.are_points_shared_in_batch = false; // Different points per MSM
    config.precompute_factor = 1; // No precompute benefit when points differ

    // Optimal c value: rule of thumb log2(n) - 4 for no precompute
    config.c = ((msm_size as f32).log2() - 4.0).max(2.0) as i32;

    // CUDA optimizations (ignored on CPU)
    config.ext.set_int(CUDA_MSM_LARGE_BUCKET_FACTOR, 5);

    config
}
