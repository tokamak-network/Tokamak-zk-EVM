// Using bls12-377 curve
use icicle_bls12_377::curve::{CurveCfg, G1Projective, ScalarCfg};
use icicle_core::{curve::Curve, msm, msm::MSMConfig, traits::GenerateRandom};
use icicle_runtime::{device::Device, memory::HostSlice};

fn main() {
    // Load backend and set device
    let _ = icicle_runtime::runtime::load_backend_from_env_or_default();
    let cuda_device = Device::new("CPU", 0);
    if icicle_runtime::is_device_available(&cuda_device) {
        icicle_runtime::set_device(&cuda_device).unwrap();
    }

    let size = 1024;

    // Randomize inputs
    let points = CurveCfg::generate_random_affine_points(size);
    let scalars = ScalarCfg::generate_random(size);

    let mut msm_config = MSMConfig::default();

    let mut msm_results1 = vec![G1Projective::zero(); 2];
    msm::msm(
        HostSlice::from_slice(&scalars),
        HostSlice::from_slice(&points),
        &msm_config,
        HostSlice::from_mut_slice(&mut msm_results1[..]),
    )
    .unwrap();

    let mut msm_results2 = vec![G1Projective::zero(); 1];
    msm::msm(
        HostSlice::from_slice(&scalars),
        HostSlice::from_slice(&points),
        &msm_config,
        HostSlice::from_mut_slice(&mut msm_results2[..]),
    )
    .unwrap();

    // msm_config.batch_size = 4;
    
    // let mut msm_results2 = vec![G1Projective::zero(); 4];
    // msm::msm(
    //     HostSlice::from_slice(&scalars),
    //     HostSlice::from_slice(&points),
    //     &msm_config,
    //     HostSlice::from_mut_slice(&mut msm_results2[..]),
    // )
    // .unwrap();

    println!("MSM result1 = {:?}", G1Projective::eq(&msm_results2[0], &(msm_results1[0]+ msm_results1[0])));
    // println!("MSM result2 = {:?}", msm_results2);
}