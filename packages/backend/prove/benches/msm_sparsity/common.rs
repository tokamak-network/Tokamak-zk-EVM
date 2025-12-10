/// Common utilities for MSM sparsity benchmarks
use icicle_bls12_381::curve::{G1Affine, G1Projective, ScalarCfg, ScalarField};
use icicle_core::msm::{self, MSMConfig};
use icicle_core::traits::{FieldImpl, GenerateRandom};
use icicle_runtime::memory::HostSlice;
use rand::Rng;

pub const BATCH_CNT: usize = 3;
pub const MSM_SIZE: usize = 1025 * 129; // 132,225 elements

/// Generate sparse data with given zero probability
pub fn generate_sparse_data(
    num_batches: usize,
    size: usize,
    zero_probability: f64,
) -> Vec<Vec<ScalarField>> {
    let mut rng = rand::thread_rng();
    let mut scalar_sets = Vec::with_capacity(num_batches);

    for _ in 0..num_batches {
        let mut s = Vec::with_capacity(size);
        for _ in 0..size {
            if rng.gen_bool(zero_probability) {
                s.push(ScalarField::zero());
            } else {
                s.push(ScalarCfg::generate_random(1)[0]);
            }
        }
        scalar_sets.push(s);
    }
    scalar_sets
}

/// Generate fully random data (no zeros)
pub fn generate_random_data(num_batches: usize, size: usize) -> Vec<Vec<ScalarField>> {
    let mut scalar_sets = Vec::with_capacity(num_batches);
    for _ in 0..num_batches {
        scalar_sets.push(ScalarCfg::generate_random(size));
    }
    scalar_sets
}

/// Run sequential MSM (one at a time)
pub fn run_sequential_msm(
    scalar_sets: &[Vec<ScalarField>],
    points: &[G1Affine],
) -> Vec<G1Projective> {
    let mut results = Vec::with_capacity(scalar_sets.len());
    for scalars in scalar_sets {
        let mut msm_res = vec![G1Projective::zero(); 1];
        msm::msm(
            HostSlice::from_slice(scalars),
            HostSlice::from_slice(points),
            &MSMConfig::default(),
            HostSlice::from_mut_slice(&mut msm_res),
        )
        .unwrap();
        results.push(msm_res[0]);
    }
    results
}

/// Run batch MSM (single call with shared points)
pub fn run_batch_msm(
    scalar_sets: &[Vec<ScalarField>],
    points: &[G1Affine],
    batch_cnt: usize,
) -> Vec<G1Projective> {
    let all_scalars: Vec<ScalarField> = scalar_sets.iter().flatten().cloned().collect();
    let mut config = MSMConfig::default();
    config.batch_size = batch_cnt as i32;
    config.are_points_shared_in_batch = true;

    let mut msm_results = vec![G1Projective::zero(); batch_cnt];
    msm::msm(
        HostSlice::from_slice(&all_scalars),
        HostSlice::from_slice(points),
        &config,
        HostSlice::from_mut_slice(&mut msm_results),
    )
    .unwrap();
    msm_results
}

/// Print zero statistics for the generated data
pub fn print_zero_stats(name: &str, scalars: &[Vec<ScalarField>]) {
    let total: usize = scalars.iter().map(|s| s.len()).sum();
    let zeros: usize = scalars
        .iter()
        .flat_map(|s| s.iter())
        .filter(|s| **s == ScalarField::zero())
        .count();
    println!(
        "  {}: {}/{} zeros ({:.1}%)",
        name,
        zeros,
        total,
        100.0 * zeros as f64 / total as f64
    );
}
