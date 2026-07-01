use std::fs::{create_dir_all, File};
use std::path::{Path, PathBuf};

use clap::Parser;
use icicle_bls12_381::curve::{BaseField, G1Affine, G1Projective, ScalarField};
use icicle_core::msm::{self, MSMConfig};
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::HostSlice;
use libs::field_structures::FieldSerde;
use libs::group_structures::G1serde;
use serde::Serialize;

#[derive(Parser)]
struct Args {
    #[arg(long)]
    output_dir: PathBuf,
}

#[derive(Serialize)]
struct MsmFixtureInput {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    curve: &'static str,
    scalar_encoding: &'static str,
    point_encoding: &'static str,
    bases: Vec<G1serde>,
    scalars: Vec<FieldSerde>,
}

#[derive(Serialize)]
struct MsmFixtureExpected {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    point_encoding: &'static str,
    result: G1serde,
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::create(path)?;
    serde_json::to_writer_pretty(file, value)?;
    Ok(())
}

fn scalar(value: u32) -> ScalarField {
    ScalarField::from_u32(value)
}

fn fixed_g1_generator() -> G1Affine {
    G1Affine::from_limbs(
        BaseField::from_hex("0x0b001b4cc05fa01578be7d4e821d6ff58f2a05c584fba3cb31a37942dece65eadec9a878add2282f7c2513abb8d4ab05").into(),
        BaseField::from_hex("0x15e237775397ed22eef43dd36cdca277c9cf6fa7e4ffff0a5bb4b20a82392caacf0f63fb6cdb02bccf2f5af14970d6b9").into(),
    )
}

fn scale_g1(base: G1Affine, factor: ScalarField) -> G1Affine {
    G1Affine::from(base.to_projective() * factor)
}

fn run_msm(scalars: &[ScalarField], bases: &[G1Affine]) -> G1serde {
    let mut msm_res = vec![G1Projective::zero(); 1];
    msm::msm(
        HostSlice::from_slice(scalars),
        HostSlice::from_slice(bases),
        &MSMConfig::default(),
        HostSlice::from_mut_slice(&mut msm_res),
    )
    .unwrap();

    G1serde(G1Affine::from(msm_res[0]))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let input_dir = args.output_dir.join("input");
    let expected_dir = args.output_dir.join("expected");

    create_dir_all(&input_dir)?;
    create_dir_all(&expected_dir)?;

    let generator = fixed_g1_generator();
    let base_factors = vec![scalar(2), scalar(3), scalar(5), scalar(7), scalar(11)];
    let bases = base_factors
        .iter()
        .map(|factor| scale_g1(generator, *factor))
        .collect::<Vec<_>>();
    let scalars = vec![scalar(13), scalar(17), scalar(19), scalar(23), scalar(29)];
    let result = run_msm(&scalars, &bases);

    let input = MsmFixtureInput {
        schema_version: 1,
        case_id: "msm-small",
        kind: "msm",
        curve: "bls12-381-g1",
        scalar_encoding: "FieldSerde",
        point_encoding: "G1serde",
        bases: bases.iter().copied().map(G1serde).collect(),
        scalars: scalars.iter().copied().map(FieldSerde).collect(),
    };

    let expected = MsmFixtureExpected {
        schema_version: 1,
        case_id: "msm-small",
        kind: "msm",
        point_encoding: "G1serde",
        result,
    };

    write_json(&input_dir.join("msm-small.json"), &input)?;
    write_json(&expected_dir.join("msm-small.json"), &expected)?;

    Ok(())
}
