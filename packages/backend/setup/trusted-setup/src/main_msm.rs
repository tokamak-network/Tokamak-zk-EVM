// Using bls12-377 curve
use icicle_bls12_381::curve::{CurveCfg, G1Projective, ScalarCfg};
use icicle_core::{curve::Curve, msm, msm::MSMConfig, traits::GenerateRandom};
use icicle_runtime::{device::Device, memory::HostSlice};
use std::time::Instant;

fn main() {
    // Load backend and set device
    let _ = icicle_runtime::runtime::load_backend_from_env_or_default();
    let cuda_device = Device::new("CUDA", 0);
    if icicle_runtime::is_device_available(&cuda_device) {
        icicle_runtime::set_device(&cuda_device).unwrap();
    }

    // let size = ((2 as i32).pow(10) * (2 as i32).pow(5)) as usize;
    let size = 1000;
    let mut cfg = MSMConfig::default();

    // Randomize inputs
    let points = CurveCfg::generate_random_affine_points(10);
    let scalars = ScalarCfg::generate_random(size);

    let mut msm_results = vec![G1Projective::zero(); 10];
    let start2 = Instant::now();
    for i in 0..10 {
        let mut temp = vec![G1Projective::zero(); 1];
        let temp2 = vec![points[i]; 100];
        let temp3 = scalars[i*100 .. (i+1)*100].to_vec();
        msm::msm(
            HostSlice::from_slice(&temp3),
            HostSlice::from_slice(&temp2),
            &cfg,
            HostSlice::from_mut_slice(&mut temp),
        )
        .unwrap();
        msm_results[i] = temp[0];
    }
    let duration2 = start2.elapsed();

    drop(msm_results);

    // cfg.batch_size = size as i32;
    cfg.batch_size = 10 as i32;
    cfg.are_points_shared_in_batch = true;
    let mut msm_results = vec![G1Projective::zero(); 10];
    let start = Instant::now();
    msm::msm(
        HostSlice::from_slice(&scalars),
        HostSlice::from_slice(&points),
        &cfg,
        HostSlice::from_mut_slice(&mut msm_results[..]),
    )
    .unwrap();
    let duration = start.elapsed();

    // println!("MSM result = {:?}", msm_results);
    println!("Size: {:?}", size);
    println!("Execution time with MSM: {:.6} seconds", duration.as_secs_f64());
    println!("Execution time with loop: {:.6} seconds", duration2.as_secs_f64());
}