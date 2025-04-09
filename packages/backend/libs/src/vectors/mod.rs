use super::polynomials::{DensePolynomialExt, BivariatePolynomial};
use super::iotools::G1serde;
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_bls12_381::curve::{ScalarCfg, ScalarField, G1Affine, G2Affine};
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::HostSlice;

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

pub fn scale_vec(lhs: ScalarField, rhs: &Box<[ScalarField]>, res: &mut Box<[ScalarField]>){
    if rhs.len() != res.len() {
        panic!("Incorrect output buffer length");
    }
    let scaler = vec![lhs; rhs.len()].into_boxed_slice();
    point_mul_two_vecs(&scaler, rhs, res);
}

pub fn inner_product_two_vecs(lhs_vec: &Box<[ScalarField]>, rhs_vec: &Box<[ScalarField]>) -> ScalarField {
    if lhs_vec.len() != rhs_vec.len() {
        panic!("Mismatch of sizes of vectors to be inner-producted");
    }

    let len = lhs_vec.len();
    let vec_ops_cfg = VecOpsConfig::default();
    let mut res_vec = vec![ScalarField::zero(); len].into_boxed_slice();
    let res_buff = HostSlice::from_mut_slice(&mut res_vec);
    ScalarCfg::mul(HostSlice::from_slice(&lhs_vec), HostSlice::from_slice(&rhs_vec), res_buff, &vec_ops_cfg).unwrap();
    let mut res = ScalarField::zero();
    for i in 0..len {
        res = res + res_vec[i];
    }
    res
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
        let scaler_vec = vec![scaler; max_len].into_boxed_slice();
        let mut res_vec = vec![ScalarField::zero(); max_len].into_boxed_slice();
        ScalarCfg::mul(
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
    let mut outer_prod_vec = vec![ScalarField::zero(); size].into_boxed_slice();
    outer_product_two_vecs(
        col_vec, 
        row_vec, 
        &mut outer_prod_vec
    );
    if let Some(_scaler) = scaler {
        let scaler_vec = vec![*_scaler; size].into_boxed_slice();
        point_mul_two_vecs(
            &outer_prod_vec, 
            &scaler_vec, 
            res
        );
    } else {
        res.clone_from_slice(&outer_prod_vec);
    }
}
