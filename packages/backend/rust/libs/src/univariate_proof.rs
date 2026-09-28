//! Current F2/F5 proof: ten G1 elements and seven scalar evaluations.

use crate::field_structures::FieldSerde;
use crate::group_structures::G1serde;

#[derive(Clone, Debug, PartialEq)]
pub struct UnivariateProof {
    pub c_l: G1serde,
    pub c_h: G1serde,
    pub c_o: G1serde,
    pub d_q: G1serde,
    pub d_q_k: G1serde,
    pub c_d: G1serde,
    pub c_r: G1serde,
    pub c_q: G1serde,
    pub s_c: FieldSerde,
    pub u: FieldSerde,
    pub v: FieldSerde,
    pub w: FieldSerde,
    pub b: FieldSerde,
    pub r: FieldSerde,
    pub r_plus: FieldSerde,
    pub pi_chi: G1serde,
    pub pi_plus: G1serde,
}
