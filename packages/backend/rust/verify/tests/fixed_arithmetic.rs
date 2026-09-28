//! Release-only qualification of mixed-input fixed-base arithmetic.
use ark_bls12_381::{Bls12_381, Fr, G1Affine, G1Projective, G2Affine};
use ark_ec::{pairing::Pairing, scalar_mul::BatchMulPreprocessing, AffineRepr, CurveGroup};
use ark_ff::Field;
use std::{hint::black_box, time::Instant};

#[test]
#[ignore = "run with --release --ignored --nocapture for arithmetic timing"]
fn compare_prepared_fixed_bases() {
    assert!(
        !cfg!(debug_assertions),
        "timing requires release optimization"
    );
    let base = G1Affine::generator();
    let table = BatchMulPreprocessing::new(G1Projective::from(base), 1);
    let gt = Bls12_381::pairing(base, G2Affine::generator());
    let gt_table = BatchMulPreprocessing::new(gt, 1);
    let scalars: Vec<_> = (0..256u64).map(|i| Fr::from(i + 17).pow([197])).collect();
    for scalar in &scalars {
        assert_eq!(gt_table.batch_mul(&[*scalar])[0], gt * scalar);
        assert_eq!(
            table.batch_mul(&[*scalar])[0],
            (base * scalar).into_affine()
        );
    }
    for round in 0..6 {
        let start = Instant::now();
        for scalar in &scalars {
            let _ = black_box(base * black_box(*scalar));
        }
        let plain = start.elapsed().as_secs_f64() * 1e6 / scalars.len() as f64;
        let start = Instant::now();
        for scalar in &scalars {
            black_box(table.batch_mul(&[black_box(*scalar)]));
        }
        let table_us = start.elapsed().as_secs_f64() * 1e6 / scalars.len() as f64;
        let start = Instant::now();
        for scalar in &scalars {
            let _ = black_box(gt * black_box(*scalar));
        }
        let gt_us = start.elapsed().as_secs_f64() * 1e6 / scalars.len() as f64;
        let start = Instant::now();
        for scalar in &scalars {
            black_box(gt_table.batch_mul(&[black_box(*scalar)]));
        }
        let gt_table_us = start.elapsed().as_secs_f64() * 1e6 / scalars.len() as f64;
        println!("round={round} plain_g1_us={plain:.3} table_g1_us={table_us:.3} fixed_gt_exp_us={gt_us:.3} table_gt_us={gt_table_us:.3}");
    }
}
