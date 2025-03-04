// Using bls12-377 curve
use icicle_bls12_381::curve::{CurveCfg, G1Affine, G1Projective, ScalarCfg};
use icicle_core::{curve::Curve, msm, msm::MSMConfig, traits::GenerateRandom};
use icicle_runtime::{device::Device, memory::HostSlice};
use std::time::Instant;

use rayon::prelude::*;
use rayon::current_num_threads;

fn main() {
    let size = 1024 * 64;

    // Randomize inputs
    let point = CurveCfg::generate_random_affine_points(1)[0].to_projective();
    let scalars = ScalarCfg::generate_random(size).into_boxed_slice();
    let mut res = vec![G1Affine::zero(); size].into_boxed_slice();
    
    let start3 = Instant::now();
    let num_threads = current_num_threads(); // 현재 사용 가능한 스레드 개수 감지
    let chunk_size = (scalars.len() / num_threads).max(1); // 최소 크기 1 보장

    res.par_chunks_mut(chunk_size)
        .zip(scalars.par_chunks(chunk_size))
        .for_each(|(r_chunk, c_chunk)| {
            for (r, &c) in r_chunk.iter_mut().zip(c_chunk.iter()) {
                *r = G1Affine::from(point * c);
            }
        });
    let duration3 = start3.elapsed();

    let start2 = Instant::now();
    res.par_iter_mut()
        .zip(scalars.par_iter())
        .for_each(|(r, &c)| {
            *r = G1Affine::from(point * c);
        });
    let duration2 = start2.elapsed();

    let start1 = Instant::now();
    for i in 0..size {
        res[i] = G1Affine::from(point * scalars[i]);
    }
    let duration1 = start1.elapsed();
    

    println!("Size: {:?}", size);
    println!("Single core: {:.6} seconds", duration1.as_secs_f64());
    println!("rayon {:.6} seconds", duration2.as_secs_f64());
    println!("rayon-chunk {:.6} seconds", duration3.as_secs_f64());
}