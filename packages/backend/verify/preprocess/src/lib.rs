#![allow(non_snake_case)]
use icicle_bls12_381::curve::{G1Affine, G1Projective, G2Affine, ScalarField, ScalarCfg};
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use icicle_core::msm::{self, MSMConfig};
use ark_bls12_381::{Bls12_381, G1Affine as ArkG1Affine, G2Affine as ArkG2Affine};
use ark_ec::{pairing::Pairing, AffineRepr, CurveGroup};
use ark_ff::{Field, PrimeField, Fp12};
use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{DensePolynomialExt, BivariatePolynomial};
use libs::group_structures::{G1serde, G2serde, SigmaPreprocess};
use libs::field_structures::{FieldSerde, Tau};
use libs::iotools::{*};
use libs::{impl_read_from_json, impl_write_into_json, split_push, pop_recover};
use libs::vector_operations::{*};

use serde::{Deserialize, Serialize};
use std::{
    ops::{Add, Mul, Sub},
};

#[derive(Debug, Serialize, Deserialize)]
pub struct Preprocess {
    pub s0: G1serde,
    pub s1: G1serde,
    // pub lagrange_KL: G1serde,
}

impl Preprocess {
    pub fn gen(sigma: &SigmaPreprocess, permutation_raw: &Box<[Permutation]>, setup_params: &SetupParams) -> Self {
        let m_i = setup_params.l_D - setup_params.l;
        let s_max = setup_params.s_max;
        // Generating permutation polynomials
        println!("Converting the permutation matrices into polynomials s^0 and s^1...");
        let (mut s0XY, mut s1XY) = Permutation::to_poly(&permutation_raw, m_i, s_max);
        let s0 = sigma.sigma_1.encode_poly(&mut s0XY, &setup_params);
        let s1 = sigma.sigma_1.encode_poly(&mut s1XY, &setup_params);

        // let mut lagrange_KL_XY = {
        //     let mut k_evals = vec![ScalarField::zero(); m_i];
        //     k_evals[m_i - 1] = ScalarField::one();
        //     let lagrange_K_XY = DensePolynomialExt::from_rou_evals(
        //         HostSlice::from_slice(&k_evals),
        //         m_i,
        //         1,
        //         None,
        //         None
        //     );
        //     let mut l_evals = vec![ScalarField::zero(); s_max];
        //     l_evals[s_max - 1] = ScalarField::one();
        //     let lagrange_L_XY = DensePolynomialExt::from_rou_evals(
        //         HostSlice::from_slice(&l_evals),
        //         1,
        //         s_max,
        //         None,
        //         None
        //     );
        //     &lagrange_K_XY * &lagrange_L_XY
        // };
        // let lagrange_KL = sigma.sigma_1.encode_poly(&mut lagrange_KL_XY, &setup_params);
        // return Preprocess {s0, s1, lagrange_KL}
        return Preprocess {s0, s1};
    }

    pub fn convert_format_for_solidity_verifier(&self) -> FormattedPreprocess {
        // Formatting the preprocess for the Solidity verifier
        // Part1 is a tuple of hex strings of the first 16 bytes of each preprocess component
        let mut preprocess_entries_part1 = Vec::<String>::new();
        // Part2 is a tuple of hex strings of the last 32 bytes of each preprocess component
        let mut preprocess_entries_part2 = Vec::<String>::new();
        
        // Process
        split_push!(preprocess_entries_part1, preprocess_entries_part2,
            &self.s0,
            &self.s1
        );
        return FormattedPreprocess { preprocess_entries_part1, preprocess_entries_part2 };
    }
}

impl_read_from_json!(Preprocess);
impl_write_into_json!(Preprocess);

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FormattedPreprocess {
    pub preprocess_entries_part1: Vec<String>,
    pub preprocess_entries_part2: Vec<String>,
}

impl_read_from_json!(FormattedPreprocess);
impl_write_into_json!(FormattedPreprocess);

impl FormattedPreprocess {
    pub fn recover_proof_from_format(&self) -> Preprocess {
        let p1 = &self.preprocess_entries_part1;
        let p2 = &self.preprocess_entries_part2;

        const G1_CNT: usize = 2;      // The number of G1 points 
        const SCALAR_CNT: usize = 0;   // The number of Scalars

        assert_eq!(p1.len(), G1_CNT * 2);
        assert_eq!(p2.len(), G1_CNT * 2 + SCALAR_CNT);
        
        let mut idx = 0;

        // Must follow the same order of inputs as split_push!
        pop_recover!(idx, p1, p2,
            s0,
            s1
        );

        return Preprocess {
            s0,
            s1,
        };
    }
}