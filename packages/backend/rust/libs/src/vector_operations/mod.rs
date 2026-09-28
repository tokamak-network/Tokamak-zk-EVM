use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_runtime::memory::HostSlice;

/// Multiplies two same-length scalar vectors through ICICLE.
pub fn point_mul_two_vecs(lhs: &[ScalarField], rhs: &[ScalarField], result: &mut [ScalarField]) {
    assert_eq!(
        lhs.len(),
        rhs.len(),
        "pointwise multiplication input lengths differ"
    );
    assert_eq!(
        lhs.len(),
        result.len(),
        "pointwise multiplication output length differs"
    );

    let config = VecOpsConfig::default();
    ScalarCfg::mul(
        HostSlice::from_slice(lhs),
        HostSlice::from_slice(rhs),
        HostSlice::from_mut_slice(result),
        &config,
    )
    .expect("ICICLE pointwise scalar multiplication must succeed");
}
