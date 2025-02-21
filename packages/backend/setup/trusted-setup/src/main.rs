use libs::tools::{SetupParams, SubcircuitInfo, Constraints};
use libs::tools::read_json_as_boxed_boxed_numbers;

use icicle_bls12_381::curve::{ScalarField as Field, ScalarCfg, G1Affine as G1, G2Affine as G2, CurveCfg};
use icicle_bls12_381::vec_ops;
use icicle_core::traits::{Arithmetic, FieldConfig, FieldImpl, GenerateRandom};
use icicle_core::polynomials::UnivariatePolynomial;
use icicle_core::{ntt, ntt::NTTInitDomainConfig};
use icicle_core::vec_ops::{VecOps, VecOpsConfig};
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_runtime::memory::{HostOrDeviceSlice, HostSlice, DeviceSlice, DeviceVec};
use icicle_runtime::Device;
use std::ops::Deref;
use std::{
    clone, cmp,
    ops::{Add, AddAssign, Div, Mul, Rem, Sub, Neg},
    ptr, slice,
};

macro_rules! impl_tau_struct {
    ($name:ident { $($field:ident),* }) => {
        struct $name {
            $(pub $field: Field),*
        }

        impl $name {
            fn gen() -> Self {
                Self {
                    $($field: ScalarCfg::generate_random(1)[0]),*
                }
            }
        }
    };
}

fn main() {
    impl_tau_struct!(Tau {x, y, z, alpha, beta, gamma, delta, eta0, eta1, mu, nu, psi0, psi1, psi2, psi3, kappa});
    let tau = Tau::gen();
    
    let mut path = "";
    path = "setup/trusted-setup/resource/setupParams.json";
    let setup_params = SetupParams::from_path(path).unwrap();
    // println!("{:?}", setup_params);
    path = "setup/trusted-setup/resource/subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(path).unwrap();
    // for subcircuit in subcircuit_infos.iter() {
    //     println!("{:?}", subcircuit);
    // }
    path = "setup/trusted-setup/resource/globalWireList.json";
    let globalWireList = read_json_as_boxed_boxed_numbers(path).unwrap();
    // println!("{:?}", globalWireList);
    path = "setup/trusted-setup/resource/json/subcircuit0.json";
    match Constraints::from_path(path) {
        Ok(mut data) => {
            Constraints::convert_values_to_hex(&mut data); // ✅ value를 hex로 변환
            println!("JSON 파일을 성공적으로 읽고 변환했습니다:");
            for (i, constraint_group) in data.constraints.iter().enumerate() {
                println!("Constraint Group {}:", i);
                for (j, hashmap) in constraint_group.iter().enumerate() {
                    println!("  Element {}: {:?}", j, hashmap);
                }
            }
        }
        Err(e) => eprintln!("JSON 파일을 읽는 중 오류가 발생했습니다: {}", e),
    }

}