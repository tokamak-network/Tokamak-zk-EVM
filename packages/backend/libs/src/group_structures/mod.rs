// Module declarations
mod group_serde;
mod sigma;
mod sigma_verify;

// Re-exports for common use
pub use group_serde::{
    icicle_g1_affine_to_ark, icicle_g2_affine_to_ark, pairing, G1serde, G2serde,
};
pub use sigma::{Sigma, Sigma1, Sigma2};
pub use sigma_verify::{PartialSigma1, PartialSigma1Verify, SigmaPreprocess, SigmaVerify};

// Re-export types needed by macros and submodules
pub use icicle_bls12_381::curve::{G1Affine, G1Projective, G2Affine, ScalarField};

// Macro for polynomial encoding - used by Sigma1 and PartialSigma1
#[macro_export]
macro_rules! impl_encode_poly {
    ($t:ty) => {
        impl $t {
            pub fn encode_poly(
                &self,
                poly: &mut $crate::bivariate_polynomial::DensePolynomialExt,
                params: &$crate::iotools::SetupParams,
            ) -> $crate::group_structures::G1serde {
                use icicle_core::msm::{self, MSMConfig};
                use icicle_core::traits::FieldImpl;
                use icicle_runtime::memory::HostSlice;
                use $crate::group_structures::{G1Affine, G1Projective, G1serde, ScalarField};
                use $crate::vector_operations::resize;

                poly.optimize_size();
                let x_size = poly.x_size;
                let y_size = poly.y_size;
                let rs_x_size = std::cmp::max(2 * params.n, 2 * (params.l_D - params.l));
                let rs_y_size = params.s_max * 2;
                let target_x_size = (poly.x_degree + 1) as usize;
                let target_y_size = (poly.y_degree + 1) as usize;
                if target_x_size > rs_x_size || target_y_size > rs_y_size {
                    panic!("Insufficient length of sigma.sigma_1.xy_powers");
                }
                if target_x_size * target_y_size == 0 {
                    return G1serde::zero();
                }
                let poly_coeffs_vec_compact = {
                    let mut poly_coeffs_vec = vec![ScalarField::zero(); x_size * y_size];
                    let poly_coeffs = HostSlice::from_mut_slice(&mut poly_coeffs_vec);
                    poly.copy_coeffs(0, poly_coeffs);
                    resize(
                        &poly_coeffs_vec,
                        x_size,
                        y_size,
                        target_x_size,
                        target_y_size,
                        ScalarField::zero(),
                    )
                };

                let rs_unpacked: Vec<G1Affine> = {
                    let rs_resized = resize(
                        &self.xy_powers,
                        rs_x_size,
                        rs_y_size,
                        target_x_size,
                        target_y_size,
                        G1serde::zero(),
                    );
                    rs_resized.iter().map(|x| x.0).collect()
                };

                let mut msm_res = vec![G1Projective::zero(); 1];

                msm::msm(
                    HostSlice::from_slice(&poly_coeffs_vec_compact),
                    HostSlice::from_slice(&rs_unpacked),
                    &MSMConfig::default(),
                    HostSlice::from_mut_slice(&mut msm_res),
                )
                .unwrap();
                G1serde(G1Affine::from(msm_res[0]))
            }
        }
    };
}
