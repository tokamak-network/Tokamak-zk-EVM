use icicle_bn254::curve::{ScalarCfg, ScalarField};
use icicle_core::{curve::Curve, ntt, traits::GenerateRandom, traits::FieldImpl};
use icicle_core::vec_ops::{transpose_matrix, VecOps, VecOpsConfig};
use icicle_runtime::memory::{DeviceVec, HostOrDeviceSlice, HostSlice, DeviceSlice};

fn main(){
    // Setting Bn254 points and scalars
    println!("Generating random inputs on host for bn254...");
    let size = 8;
    let mut test_signal = vec![ScalarField::zero(); size];
    test_signal[0] = ScalarField::one();
    test_signal[2] = ScalarField::one();
    test_signal[4] = ScalarField::one();
    test_signal[6] = ScalarField::one();
    let scalars = test_signal.clone();
    let mut ntt_results = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
    let mut ntt_results2 = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
    let mut ntt_host_vec = vec![ScalarField::zero(); size];
    let mut ntt_host = HostSlice::from_mut_slice(&mut ntt_host_vec[..]);
    let mut ntt_host_vec2 = vec![ScalarField::zero(); size];
    let mut ntt_host2 = HostSlice::from_mut_slice(&mut ntt_host_vec2[..]);

    // constructing NTT domain
    ntt::initialize_domain::<ScalarField>(
        ntt::get_root_of_unity::<ScalarField>(
            size.try_into()
                .unwrap(),
        ),
        &ntt::NTTInitDomainConfig::default(),
    )
    .unwrap();

    // Using default config
    let mut cfg = ntt::NTTConfig::<ScalarField>::default();
    cfg.batch_size = 4;
    cfg.columns_batch = true;
    cfg.ext.set_int(ntt::CUDA_NTT_ALGORITHM, ntt::NttAlgorithm::MixedRadix as i32);
    //cfg.ordering = ntt::Ordering::kNM;


    // Computing NTT columns batch
    ntt::ntt(
        HostSlice::from_slice(&scalars),
        ntt::NTTDir::kForward,
        &cfg,
        &mut ntt_results,
    )
    .unwrap();

    let mut transposed_input = vec![ScalarField::zero(); size];
    transpose_matrix(
        HostSlice::from_slice(&scalars),
        2,
        4,
        HostSlice::from_mut_slice(&mut transposed_input),
        &VecOpsConfig::default(),
    )
    .unwrap();

    cfg.batch_size = 4;
    cfg.columns_batch = false;
    ntt::ntt(
        HostSlice::from_slice(&transposed_input),
        ntt::NTTDir::kForward,
        &cfg,
        &mut ntt_results2,
    )
    .unwrap();
    


    println!("NTT result1 = {:?}", scalars);
    ntt_results.copy_to_host(&mut ntt_host);
    println!("NTT result2 = {:?}", ntt_host_vec);
    ntt_results2.copy_to_host(&mut ntt_host2);
    println!("NTT result3 = {:?}", ntt_host_vec2);
}