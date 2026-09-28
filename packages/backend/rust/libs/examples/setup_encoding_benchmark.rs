//! Independent release comparison; no CRS file or production mode is changed.
use ark_ec::{scalar_mul::BatchMulPreprocessing, AffineRepr};
use ark_ff::{BigInteger, PrimeField};
use icicle_bls12_381::curve::*;
use icicle_core::{
    curve::Curve,
    msm::{msm, MSMConfig},
    traits::{FieldImpl, GenerateRandom},
};
use icicle_runtime::memory::HostSlice;
use rayon::prelude::*;
use std::time::Instant;

fn main() {
    assert!(!cfg!(debug_assertions), "use --release");
    libs::utils::try_check_device().unwrap();
    assert!(
        !libs::utils::cuda_msm_is_available(),
        "this experiment measures CPU only"
    );
    let mut samples = Vec::new();
    macro_rules! compare {
        ($name:literal, $cfg:ty, $affine:ty, $projective:ty, $ark:ty, $to_ark:path, $encode_ark:expr) => {{
            let generator = <$cfg>::generate_random_affine_points(1)[0];
            for n in [0, 1, 17, 1024, 16384] {
                let mut scalars = ScalarCfg::generate_random(n);
                for (j, v) in [
                    ScalarField::zero(),
                    ScalarField::one(),
                    ScalarField::zero() - ScalarField::one(),
                ].into_iter().enumerate().take(n) {
                    scalars[j] = v;
                }
                let encode = |p: $affine| (p.x.to_bytes_le(), p.y.to_bytes_le());
                let direct = || scalars
                    .par_iter()
                    .map(|s| encode(<$affine>::from(generator.to_projective() * *s)))
                    .collect::<Vec<_>>();
                let batch = || {
                    if n == 0 {
                        return vec![];
                    }
                    let mut points = vec![<$projective>::zero(); n];
                    msm(
                        HostSlice::from_slice(&scalars),
                        HostSlice::from_slice(&[generator]),
                        &MSMConfig::default(),
                        HostSlice::from_mut_slice(&mut points),
                    ).unwrap();
                    points.into_par_iter()
                        .map(|p| encode(<$affine>::from(p)))
                        .collect::<Vec<_>>()
                };
                let fixed = || {
                    if n == 0 {
                        return vec![];
                    }
                    let base: $ark = $to_ark(&generator).into_group();
                    let table = BatchMulPreprocessing::new(base, n.min(65536));
                    scalars.par_chunks(1024).flat_map_iter(|chunk| {
                        let values = chunk.iter()
                            .map(|s| ark_bls12_381::Fr::from_le_bytes_mod_order(&s.to_bytes_le()))
                            .collect::<Vec<_>>();
                        table.batch_mul(&values).into_iter().map($encode_ark)
                    }).collect::<Vec<_>>()
                };
                let expected = direct();
                for trial in 0..3 {
                    // Limit the slow CPU one-point MSM probe; it is not internally
                    // wrapped in Rayon. The full-size alternatives still alternate.
                    let modes = if trial % 2 == 0 {
                        ["direct", "fixed", "batch"]
                    } else {
                        ["fixed", "direct", "batch"]
                    };
                    for mode in modes {
                        if mode == "batch" && n > 1024 {
                            continue;
                        }
                        let start = Instant::now();
                        let points = match mode {
                            "direct" => direct(),
                            "fixed" => fixed(),
                            _ => batch(),
                        };
                        let millis = start.elapsed().as_secs_f64() * 1000.;
                        assert_eq!(points, expected, "{} {} n={}", $name, mode, n);
                        samples.push(serde_json::json!({
                            "curve": $name,
                            "count": n,
                            "trial": trial,
                            "mode": mode,
                            "milliseconds": millis,
                        }));
                    }
                }
            }
        }};
    }
    compare!(
        "G1",
        CurveCfg,
        G1Affine,
        G1Projective,
        ark_bls12_381::G1Projective,
        libs::group_structures::icicle_g1_affine_to_ark,
        |p: ark_bls12_381::G1Affine| {
            if p.is_zero() {
                (vec![0; 48], vec![0; 48])
            } else {
                (
                    p.x.into_bigint().to_bytes_le(),
                    p.y.into_bigint().to_bytes_le(),
                )
            }
        }
    );
    compare!(
        "G2",
        G2CurveCfg,
        G2Affine,
        G2Projective,
        ark_bls12_381::G2Projective,
        libs::group_structures::icicle_g2_affine_to_ark,
        |p: ark_bls12_381::G2Affine| {
            let bytes = |f: ark_bls12_381::Fq2| {
                [
                    f.c0.into_bigint().to_bytes_le(),
                    f.c1.into_bigint().to_bytes_le(),
                ]
                .concat()
            };
            if p.is_zero() {
                (vec![0; 96], vec![0; 96])
            } else {
                (bytes(p.x), bytes(p.y))
            }
        }
    );
    println!("{}", serde_json::to_string(&samples).unwrap());
}
