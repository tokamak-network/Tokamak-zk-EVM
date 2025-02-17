extern crate icicle_bls12_381;
extern crate icicle_core;
extern crate icicle_runtime;
use icicle_bls12_381::curve::{ScalarField, ScalarCfg};
use icicle_core::traits::{FieldImpl, FieldConfig, GenerateRandom};
use icicle_core::polynomials::UnivariatePolynomial;
use icicle_core::{ntt, ntt::NTTInitDomainConfig};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice, DeviceSlice, DeviceVec};
use std::ops::Deref;
use std::{
    clone, cmp,
    ops::{Add, AddAssign, Div, Mul, Rem, Sub},
    ptr, slice,
};

fn main () {
    let p1_coeffs_number:[u32; 12] = [1,2,3,4,5,6,7,8,9,10,11,12];
    let mut p1_coeffs_vec = vec![ScalarField::zero(); 12];
    for (ind, &num) in p1_coeffs_number.iter().enumerate() {
        p1_coeffs_vec[ind] = ScalarField::from_u32(num);
    }
    let p1_coeffs = HostSlice::from_slice(&p1_coeffs_vec);
    let mut p2_coeffs_vec = vec![ScalarField::zero(); 12];
    let p2_coeffs = HostSlice::from_mut_slice(&mut p2_coeffs_vec);
    
    let mut a_vec = vec![ScalarField::zero(); 5];
    a_vec[0] = ScalarField::from_u32(5);
    a_vec[4] = ScalarField::one();
    let a = HostSlice::<ScalarField>::from_slice(&a_vec);
    let mut b_vec = vec![ScalarField::zero(); 5];
    b_vec[0] = ScalarField::from_u32(4);
    b_vec[1] = ScalarField::one();
    let b = HostSlice::<ScalarField>::from_slice(&b_vec);

    let mut c_vec = vec![ScalarField::zero(); 5];
    let c = HostSlice::<ScalarField>::from_mut_slice(&mut c_vec);
    
    let cfg = VecOpsConfig::default();
    ScalarCfg::add(a,b,c,&cfg).unwrap();
    println!("res: {:?}\n", c_vec);
    ScalarCfg::transpose(p1_coeffs, 3, 4, p2_coeffs, &cfg).unwrap();
    println!("transpose:\n {:?}\n", p2_coeffs_vec);
}