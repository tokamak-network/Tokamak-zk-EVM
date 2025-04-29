// benches/outer_product_bench.rs
use criterion::{criterion_group, criterion_main, Criterion};
use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
use icicle_core::traits::FieldImpl;

use libs::vector_operations::{outer_product_two_vecs, outer_product_two_vecs_rayon};

fn bench_outer_products(c: &mut Criterion) {
    // 테스트할 벡터 크기 설정 (예: 512 x 512)
    let col_len = 512;
    let row_len = 512;
    let total = col_len * row_len;

    // 예제 입력 데이터를 생성합니다.
    // 여기서는 간단하게 일정한 규칙을 가진 값을 사용합니다.
    let col_vec: Box<[ScalarField]> = (0..col_len)
        .map(|i| ScalarField::from_u32((i % 100) as u32 + 1))
        .collect::<Vec<_>>()
        .into_boxed_slice();

    let row_vec: Box<[ScalarField]> = (0..row_len)
        .map(|i| ScalarField::from_u32(((i + 1) % 100) as u32 + 1))
        .collect::<Vec<_>>()
        .into_boxed_slice();

    // 결과를 저장할 버퍼들을 할당합니다.
    let mut res_seq: Box<[ScalarField]> = vec![ScalarField::zero(); total].into_boxed_slice();
    let mut res_par: Box<[ScalarField]> = vec![ScalarField::zero(); total].into_boxed_slice();

    // 순차 outer product 함수 벤치마크
    c.bench_function("outer_product_two_vecs", |b| {
        b.iter(|| {
            outer_product_two_vecs(&col_vec, &row_vec, &mut res_seq);
        })
    });

    // Rayon을 사용한 outer product 함수 벤치마크
    c.bench_function("outer_product_two_vecs_rayon", |b| {
        b.iter(|| {
            outer_product_two_vecs_rayon(&col_vec, &row_vec, &mut res_par);
        })
    });
}

criterion_group!(benches, bench_outer_products);
criterion_main!(benches);
