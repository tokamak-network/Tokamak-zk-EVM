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
