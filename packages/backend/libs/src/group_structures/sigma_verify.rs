use crate::bivariate_polynomial::BivariatePolynomial;
use crate::group_structures::{G1serde, G2serde, Sigma2};
use crate::impl_encode_poly;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SigmaPreprocess {
    pub sigma_1: PartialSigma1,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct PartialSigma1 {
    pub xy_powers: Box<[G1serde]>,
}
impl_encode_poly!(PartialSigma1);

// impl PartialSigma1 {
//     pub fn encode_O_function_inst(
//         &self,
//         a_pub_function: &[String],
//     ) -> G1serde {
//         let mut msm_res = vec![G1Projective::zero(); 1];
//         if a_pub_function.len() != self.gamma2_inv_o_function_inst.len() {
//             panic!("Public function instance length mismatch with corresponding CRS elements")
//         }
//         let scalars_field = a_pub_function.iter().map( |val| ScalarField::from_hex(val)).collect::<Vec<_>>().into_boxed_slice();
//         let bases_G1 = self.gamma2_inv_o_function_inst.iter().map(|serde| serde.0).collect::<Vec<_>>().into_boxed_slice();
//         msm::msm(
//             HostSlice::from_slice(&scalars_field),
//             HostSlice::from_slice(&bases_G1),
//             &MSMConfig::default(),
//             HostSlice::from_mut_slice(&mut msm_res)
//         ).unwrap();

//         G1serde(G1Affine::from(msm_res[0]))
//     }

//     pub fn encode_O_block_inst(
//         &self,
//         a_pub_block: &[String],
//     ) -> G1serde {
//         let mut msm_res = vec![G1Projective::zero(); 1];
//         if a_pub_block.len() != self.gamma2_inv_o_block_inst.len() {
//             panic!("Public block instance length mismatch with corresponding CRS elements")
//         }
//         let scalars_field = a_pub_block.iter().map( |val| ScalarField::from_hex(val)).collect::<Vec<_>>().into_boxed_slice();
//         let bases_G1 = self.gamma2_inv_o_block_inst.iter().map(|serde| serde.0).collect::<Vec<_>>().into_boxed_slice();
//         msm::msm(
//             HostSlice::from_slice(&scalars_field),
//             HostSlice::from_slice(&bases_G1),
//             &MSMConfig::default(),
//             HostSlice::from_mut_slice(&mut msm_res)
//         ).unwrap();

//         G1serde(G1Affine::from(msm_res[0]))
//     }
// }

#[derive(Debug, Serialize, Deserialize)]
pub struct PartialSigma1Verify {
    pub x: G1serde,
    pub y: G1serde,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct SigmaVerify {
    pub G: G1serde,
    pub H: G2serde,
    pub sigma_1: PartialSigma1Verify,
    pub sigma_2: Sigma2,
    pub lagrange_KL: G1serde,
}
