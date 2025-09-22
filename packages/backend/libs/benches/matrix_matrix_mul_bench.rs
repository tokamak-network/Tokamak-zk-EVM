use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_core::traits::FieldImpl;
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_runtime::memory::HostSlice;
use criterion::{criterion_group, criterion_main, Criterion};
use libs::vector_operations::{transpose_inplace, matrix_matrix_mul};
use libs::utils::check_device;

fn _repeat_extend(v: &mut Vec<ScalarField>, n: usize) {
    let original = v.clone();
    for _ in 1..n {
        v.extend(original.iter().cloned());
    }
}

fn matrix_matrix_mul_original(lhs_mat: &[ScalarField], rhs_mat: &[ScalarField], m: usize, n:usize, l:usize, res_mat: &mut [ScalarField]) {
    if lhs_mat.len() != m * n || rhs_mat.len() != n * l || res_mat.len() != m * l {
        panic!("Incorrect sizes for the matrix multiplication")
    }
    if lhs_mat.is_empty() || rhs_mat.is_empty() {
        res_mat.fill(ScalarField::zero());
        return;
    }
    // size of LHS: m-by-n
    // size of RHS: n-by-l
    // Extending LHS and RHS. E.g., say LHS = [r1; r2; r3] and RHS = [c1, c2] with m=3, l=2, where r_i are row vectors, and c_i are column vectors.
    // Extended_LHS = [r1, r1, r2, r2, r3, r3], and
    // Extended_RHS = [c1^T, c2^T c1^T, c2^T; c1^T, c2^T].
    // Then, LHS*RHS is a batched inner product of Extended_LHS and Extended_RHS.
    
    let mut ext_lhs_mat = lhs_mat.to_vec();
    transpose_inplace(&mut ext_lhs_mat, m, n);
    _repeat_extend(&mut ext_lhs_mat, l);
    transpose_inplace(&mut ext_lhs_mat, l*n, m);
    
    let mut ext_rhs_mat = rhs_mat.to_vec();
    transpose_inplace(&mut ext_rhs_mat, n, l);
    _repeat_extend(&mut ext_rhs_mat, m);

    let mut vec_ops_cfg = VecOpsConfig::default();
    let mut mul_res_vec = vec![ScalarField::zero(); m*n*l];
    let mul_res_buff = HostSlice::from_mut_slice(&mut mul_res_vec);
    ScalarCfg::mul(HostSlice::from_slice(&ext_lhs_mat), HostSlice::from_slice(&ext_rhs_mat), mul_res_buff, &vec_ops_cfg).unwrap();
    vec_ops_cfg.batch_size = (m * l) as i32;
    vec_ops_cfg.columns_batch = false;
    let res = HostSlice::from_mut_slice(res_mat);
    ScalarCfg::sum(mul_res_buff, res, &vec_ops_cfg).unwrap();
}

fn bench_matrix_matrix_mul(c: &mut Criterion) {
    check_device();
    let m = 1 << 10;
    let n = 1 << 10;
    let l = 5;
    let mut lhs_mat = vec![ScalarField::zero(); m * n];
    let mut rhs_mat = vec![ScalarField::zero(); n * l];
    let mut res_mat = vec![ScalarField::zero(); m * l];

    c.bench_function("matrix_matrix_mul_original", |b| {
        b.iter(|| {
            matrix_matrix_mul_original(&lhs_mat, &rhs_mat, m, n, l, &mut res_mat);
        })
    });

    c.bench_function("matrix_matrix_mul", |b| {
        b.iter(|| {
            matrix_matrix_mul(&lhs_mat, &rhs_mat, m, n, l, &mut res_mat);
        })
    });
}

criterion_group!(benches, bench_matrix_matrix_mul);
criterion_main!(benches);