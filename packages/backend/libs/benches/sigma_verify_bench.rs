// benches/sigma_verify_bench.rs

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use icicle_bls12_381::curve::{G2Affine, ScalarField, G2CurveCfg};
use icicle_core::curve::Curve;
use icicle_core::traits::FieldImpl;
use libs::group_structures::SigmaVerify; 
use libs::tools::{SetupParams, Tau};

fn prepare_sigma_verify_inputs() -> (SetupParams, Tau, Box<[ScalarField]>, Box<[ScalarField]>, G2Affine) {
    let params = SetupParams {
         n: 1024,
         m_D: 1112,
         s_D: 3,
         l: 0,
         l_D: 32,
    };

    let tau = Tau::gen();

    let o_vec: Box<[ScalarField]> = (0..params.m_D)
         .map(|_| ScalarField::from_u32(1))
         .collect::<Vec<_>>()
         .into_boxed_slice();

    let k_vec: Box<[ScalarField]> = (0..(params.l_D - params.l))
         .map(|_| ScalarField::from_u32(1))
         .collect::<Vec<_>>()
         .into_boxed_slice();

    let g2_gen = G2CurveCfg::generate_random_affine_points(1)[0];

    (params, tau, o_vec, k_vec, g2_gen)
}

fn bench_sigma_verify_gen(c: &mut Criterion) {
    let (params, tau, o_vec, k_vec, g2_gen) = prepare_sigma_verify_inputs();
    c.bench_function("SigmaVerify::gen", |b| {
        b.iter(|| {
            let sigma = SigmaVerify::gen(
                black_box(&params),
                black_box(&tau),
                black_box(&o_vec),
                black_box(&k_vec),
                black_box(&g2_gen),
            );
            black_box(sigma);
        })
    });
}

fn bench_sigma_verify_gen_rayon(c: &mut Criterion) {
    let (params, tau, o_vec, k_vec, g2_gen) = prepare_sigma_verify_inputs();
    c.bench_function("SigmaVerify::gen_rayon", |b| {
        b.iter(|| {
            let sigma = SigmaVerify::gen_rayon(
                black_box(&params),
                black_box(&tau),
                black_box(&o_vec),
                black_box(&k_vec),
                black_box(&g2_gen),
            );
            black_box(sigma);
        })
    });
}

criterion_group!(benches, bench_sigma_verify_gen, bench_sigma_verify_gen_rayon);
criterion_main!(benches);
