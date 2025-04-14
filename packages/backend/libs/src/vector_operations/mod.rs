use super::bivariate_polynomial::{DensePolynomialExt, BivariatePolynomial};
use super::iotools::G1serde;
use icicle_bls12_381::vec_ops;
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_bls12_381::curve::{ScalarCfg, ScalarField, G1Affine, G2Affine};
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::HostSlice;
use rayon::vec;

pub fn gen_evaled_lagrange_bases(val: &ScalarField, size: usize, res: &mut Box<[ScalarField]>) {
    let mut val_pows = vec![ScalarField::one(); size].into_boxed_slice();
    for i in 1..size {
        val_pows[i] = val_pows[i-1] * *val;
    }
    let temp_evals = HostSlice::from_slice(&val_pows);
    let temp_poly = DensePolynomialExt::from_rou_evals(temp_evals, size, 1, None, None);
    let cached_val_pows = HostSlice::from_mut_slice(res);
    temp_poly.copy_coeffs(0, cached_val_pows);
}

pub fn point_mul_two_vecs(lhs: &Box<[ScalarField]>, rhs: &Box<[ScalarField]>, res: &mut Box<[ScalarField]>){
    if lhs.len() != rhs.len() || lhs.len() != res.len() {
        panic!("Mismatch of sizes of vectors to be pointwise-multiplied");
    }
    let vec_ops_cfg = VecOpsConfig::default();
    let lhs_buff = HostSlice::from_slice(lhs);
    let rhs_buff = HostSlice::from_slice(rhs);
    let res_buff = HostSlice::from_mut_slice(res);
    ScalarCfg::mul(lhs_buff, rhs_buff, res_buff, &vec_ops_cfg).unwrap();
}

pub fn point_add_two_vecs(lhs: &Box<[ScalarField]>, rhs: &Box<[ScalarField]>, res: &mut Box<[ScalarField]>){
    if lhs.len() != rhs.len() || lhs.len() != res.len() {
        panic!("Mismatch of sizes of vectors to be pointwise-multiplied");
    }
    let vec_ops_cfg = VecOpsConfig::default();
    let lhs_buff = HostSlice::from_slice(lhs);
    let rhs_buff = HostSlice::from_slice(rhs);
    let res_buff = HostSlice::from_mut_slice(res);
    ScalarCfg::add(lhs_buff, rhs_buff, res_buff, &vec_ops_cfg).unwrap();
}

pub fn scale_vec(scaler: ScalarField, vec: &Box<[ScalarField]>, res: &mut Box<[ScalarField]>){
    if vec.len() != res.len() {
        panic!("Incorrect output buffer length");
    }
    let vec_ops_cfg = VecOpsConfig::default();
    let lhs_v = vec![scaler];
    let lhs_buff = HostSlice::from_slice(&lhs_v);
    let rhs_buff = HostSlice::from_slice(vec);
    // let scaler = vec![lhs; rhs.len()].into_boxed_slice();
    // point_mul_two_vecs(&scaler, rhs, res);
    let res_buff = HostSlice::from_mut_slice(res);
    ScalarCfg::scalar_mul(lhs_buff, rhs_buff, res_buff, &vec_ops_cfg).unwrap();
}

pub fn scalar_vec_sub(lhs: ScalarField, rhs: &Box<[ScalarField]>, res: &mut Box<[ScalarField]>){
    if rhs.len() != res.len() {
        panic!("Incorrect output buffer length");
    }
    let vec_ops_cfg = VecOpsConfig::default();
    let lhs_v = vec![lhs];
    let lhs_buff = HostSlice::from_slice(&lhs_v);
    let rhs_buff = HostSlice::from_slice(rhs);
    let res_buff = HostSlice::from_mut_slice(res);
    ScalarCfg::scalar_sub(lhs_buff, rhs_buff, res_buff, &vec_ops_cfg).unwrap();
}

pub fn scalar_vec_add(scalar: ScalarField, vec: &Box<[ScalarField]>, res: &mut Box<[ScalarField]>){
    if vec.len() != res.len() {
        panic!("Incorrect output buffer length");
    }
    let vec_ops_cfg = VecOpsConfig::default();
    let lhs_v = vec![scalar];
    let lhs_buff = HostSlice::from_slice(&lhs_v);
    let rhs_buff = HostSlice::from_slice(vec);
    let res_buff = HostSlice::from_mut_slice(res);
    ScalarCfg::scalar_add(lhs_buff, rhs_buff, res_buff, &vec_ops_cfg).unwrap();
}

pub fn inner_product_two_vecs(lhs_vec: &Box<[ScalarField]>, rhs_vec: &Box<[ScalarField]>) -> ScalarField {
    if lhs_vec.len() != rhs_vec.len() {
        panic!("Mismatch of sizes of vectors to be inner-producted");
    }

    let len = lhs_vec.len();
    let vec_ops_cfg = VecOpsConfig::default();
    let mut mul_res_vec = vec![ScalarField::zero(); len].into_boxed_slice();
    let mul_res_buff = HostSlice::from_mut_slice(&mut mul_res_vec);
    ScalarCfg::mul(HostSlice::from_slice(&lhs_vec), HostSlice::from_slice(&rhs_vec), mul_res_buff, &vec_ops_cfg).unwrap();
    let mut res_vec = vec![ScalarField::zero()];
    let res = HostSlice::from_mut_slice(&mut res_vec);
    ScalarCfg::sum(mul_res_buff, res, &vec_ops_cfg).unwrap();
    return res_vec[0]
}
fn _repeat_extend(v: &mut Vec<ScalarField>, n: usize) {
    let original = v.clone();
    for _ in 1..n {
        v.extend(original.iter().cloned());
    }
}
pub fn transpose_inplace (a_vec: &mut Vec<ScalarField>, row_size: usize, col_size:usize) {
    if a_vec.len() != row_size * col_size {
        panic!("Error in transpose")
    } 
    let vec_ops_cfg = VecOpsConfig::default();
    let a = HostSlice::from_slice(&a_vec);
    let mut res_vec = vec![ScalarField::zero(); row_size * col_size];
    let res = HostSlice::from_mut_slice(&mut res_vec);
    ScalarCfg::transpose(a, row_size as u32, col_size as u32, res, &vec_ops_cfg).unwrap();
    a_vec.clone_from(&res_vec);
}
pub fn matrix_matrix_mul(lhs_mat: &[ScalarField], rhs_mat: &[ScalarField], m: usize, n:usize, l:usize, res_mat: &mut Box<[ScalarField]>) {
    if lhs_mat.len() != m * n || rhs_mat.len() != n * l || res_mat.len() != m * l {
        panic!("Incorrect sizes for the matrix multiplication")
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
    let mut mul_res_vec = vec![ScalarField::zero(); m*n*l].into_boxed_slice();
    let mul_res_buff = HostSlice::from_mut_slice(&mut mul_res_vec);
    ScalarCfg::mul(HostSlice::from_slice(&ext_lhs_mat), HostSlice::from_slice(&ext_rhs_mat), mul_res_buff, &vec_ops_cfg).unwrap();
    vec_ops_cfg.batch_size = (m * l) as i32;
    vec_ops_cfg.columns_batch = false;
    let res = HostSlice::from_mut_slice(res_mat);
    ScalarCfg::sum(mul_res_buff, res, &vec_ops_cfg).unwrap();
}

pub fn outer_product_two_vecs(col_vec: &Box<[ScalarField]>, row_vec: &Box<[ScalarField]>, res: &mut Box<[ScalarField]>){
    if col_vec.len() * row_vec.len() != res.len() {
        panic!("Insufficient buffer length");
    }

    let col_len = col_vec.len();
    let row_len = row_vec.len();

    let vec_ops_cfg = VecOpsConfig::default();
    let min_len = std::cmp::min(row_len, col_len);
    let max_len = std::cmp::max(row_len, col_len);
    let max_dir = if max_len == row_len {true } else {false};

    let base_vec = if max_dir { row_vec } else { col_vec };
     
    let mut res_untransposed = vec![ScalarField::zero(); res.len()].into_boxed_slice();
    for ind in 0 .. min_len {
        let scaler = if max_dir {col_vec[ind]} else {row_vec[ind]};
        let scaler_vec = vec![scaler].into_boxed_slice();
        let mut res_vec = vec![ScalarField::zero(); max_len].into_boxed_slice();
        ScalarCfg::scalar_mul(
            HostSlice::from_slice(&scaler_vec),
            HostSlice::from_slice(&base_vec),
            HostSlice::from_mut_slice(&mut res_vec),
            &vec_ops_cfg
        ).unwrap();
        res_untransposed[ind * max_len .. (ind + 1) * max_len].copy_from_slice(&res_vec);
    }
    
    if !max_dir {
        let res_untranposed_buf = HostSlice::from_slice(&res_untransposed);
        let res_buf = HostSlice::from_mut_slice(res);
        ScalarCfg::transpose(
            res_untranposed_buf,
            min_len as u32,
            max_len as u32,
            res_buf,
            &vec_ops_cfg).unwrap();
    } else {
        res.clone_from(&res_untransposed);
    }
}

pub fn outer_product_two_vecs_rayon(col_vec: &Box<[ScalarField]>, row_vec: &Box<[ScalarField]>, res: &mut Box<[ScalarField]>) {
    if col_vec.len() * row_vec.len() != res.len() {
        panic!("Insufficient buffer length");
    }

    let col_len = col_vec.len();
    let row_len = row_vec.len();

    let vec_ops_cfg = VecOpsConfig::default();
    let min_len = std::cmp::min(row_len, col_len);
    let max_len = std::cmp::max(row_len, col_len);
    let max_dir = if max_len == row_len { true } else { false };

    let base_vec = if max_dir { row_vec } else { col_vec };

    let mut res_untransposed = vec![ScalarField::zero(); res.len()].into_boxed_slice();

    res_untransposed
        .chunks_mut(max_len)
        .into_iter()
        .enumerate()
        .for_each(|(ind, chunk)| {
            let scaler = if max_dir { col_vec[ind] } else { row_vec[ind] };
            let scaler_vec = vec![scaler; max_len].into_boxed_slice();
            let mut res_vec = vec![ScalarField::zero(); max_len].into_boxed_slice();
            
            ScalarCfg::mul(
                HostSlice::from_slice(&scaler_vec),
                HostSlice::from_slice(&base_vec),
                HostSlice::from_mut_slice(&mut res_vec),
                &vec_ops_cfg,
            ).unwrap();
            chunk.copy_from_slice(&res_vec);
        });

    if !max_dir {
        let res_untranposed_buf = HostSlice::from_slice(&res_untransposed);
        let res_buf = HostSlice::from_mut_slice(res);
        
        ScalarCfg::transpose(
            res_untranposed_buf,
            min_len as u32,
            max_len as u32,
            res_buf,
            &vec_ops_cfg,
        ).unwrap();
    } else {
        res.clone_from(&res_untransposed);
    }
}

pub fn resize_monomial_vec (
    mono_vec: &Box<[ScalarField]>,
    res: &mut Box<[ScalarField]>,
) {
    let size_diff = res.len() as i64 - mono_vec.len() as i64;
    if size_diff == 0 {
        res.copy_from_slice(mono_vec); 
    } else if size_diff > 0{
        res[0..mono_vec.len()].copy_from_slice(mono_vec);
        for i in 0..size_diff as usize {
            res[mono_vec.len() + i] = res[mono_vec.len() + i - 1] * mono_vec[1];
        }
    } else {
        res.copy_from_slice(&mono_vec[0..res.len()]);
    }
}   

pub fn scaled_outer_product(
    col_vec: &Box<[ScalarField]>, 
    row_vec: &Box<[ScalarField]>,
    scaler: Option<&ScalarField>, 
    res: &mut Box<[ScalarField]>
) {
    let col_size = col_vec.len();
    let row_size = row_vec.len();
    let size = col_size * row_size;
    if res.len() != size {
        panic!("Insufficient buffer length");
    }
    let mut scaled_vec = vec![ScalarField::zero(); col_size].into_boxed_slice();
    if let Some(_scaler) = scaler {
        scale_vec(*_scaler, col_vec, &mut scaled_vec);
    } else {
        scaled_vec.clone_from(col_vec);
    }
    outer_product_two_vecs(
        &scaled_vec, 
        row_vec, 
        res
    );
    
}

#[deprecated(
    note = "This function can be replced with a combination of resize_monomial_vec and scaled_outer_product."
)]
pub fn gen_monomial_matrix(x_size: usize, y_size: usize, x: &ScalarField, y: &ScalarField, res_vec: &mut Box<[ScalarField]>) {
    // x_size: column size
    // y_size: row size
    if res_vec.len() != x_size * y_size {
        panic!("Not enough buffer length.")
    }
    let vec_ops_cfg = VecOpsConfig::default();
    let min_len = std::cmp::min(x_size, y_size);
    let max_len = std::cmp::max(x_size, y_size);
    let max_dir = if max_len == x_size {true } else {false};
    let mut base_row_vec = vec![ScalarField::one(); max_len];
    for ind in 1..max_len {
        if max_dir {
            base_row_vec[ind] = base_row_vec[ind-1] * *x;
        }
        else {
            base_row_vec[ind] = base_row_vec[ind-1] * *y;
        }
    }
    let mut res_vec_untransposed = res_vec.clone();
    let val_dup_vec = if max_dir {vec![*y; max_len].into_boxed_slice()} else {vec![*x; max_len].into_boxed_slice()};
    let val_dup = HostSlice::from_slice(&val_dup_vec);
    res_vec_untransposed[0 .. max_len].copy_from_slice(&base_row_vec);
    for ind in 1..min_len {
        let curr_row_view = HostSlice::from_slice(&res_vec_untransposed[(ind-1) * max_len .. (ind) * max_len]);
        let mut next_row_vec = vec![ScalarField::zero(); max_len].into_boxed_slice();
        let next_row = HostSlice::from_mut_slice(&mut next_row_vec); 
        ScalarCfg::mul(curr_row_view, val_dup, next_row, &vec_ops_cfg).unwrap();
        res_vec_untransposed[ind*max_len .. (ind+1)*max_len].copy_from_slice(&next_row_vec);
    }
    
    if !max_dir {
        let res_untranposed_buf = HostSlice::from_slice(&res_vec_untransposed);
        let res_buf = HostSlice::from_mut_slice(res_vec);
        ScalarCfg::transpose(
            res_untranposed_buf,
            min_len as u32,
            max_len as u32,
            res_buf,
            &vec_ops_cfg).unwrap();
    } else {
        res_vec.clone_from(&res_vec_untransposed);
    }
}
