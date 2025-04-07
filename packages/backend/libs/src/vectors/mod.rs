use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_bls12_381::{curve::{ScalarCfg, ScalarField}, vec_ops};
use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice, DeviceSlice, DeviceVec};

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