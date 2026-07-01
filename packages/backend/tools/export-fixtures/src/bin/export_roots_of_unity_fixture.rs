use std::fs::{create_dir_all, File};
use std::path::{Path, PathBuf};

use clap::Parser;
use icicle_bls12_381::curve::ScalarField;
use icicle_core::ntt;
use icicle_core::traits::{Arithmetic, FieldImpl};
use libs::field_structures::FieldSerde;
use serde::Serialize;

#[derive(Parser)]
struct Args {
    #[arg(long)]
    output_dir: PathBuf,
}

#[derive(Serialize)]
struct RootsOfUnityFixtureInput {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    field: &'static str,
    sizes: Vec<usize>,
    source: &'static str,
}

#[derive(Serialize)]
struct RootsOfUnityFixtureExpected {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    encoding: &'static str,
    cases: Vec<RootOfUnityCase>,
}

#[derive(Serialize)]
struct RootOfUnityCase {
    size: usize,
    root: FieldSerde,
    root_inverse: FieldSerde,
    powers: Vec<FieldSerde>,
    inverse_powers: Vec<FieldSerde>,
    root_to_size: FieldSerde,
    root_to_half_size: FieldSerde,
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::create(path)?;
    serde_json::to_writer_pretty(file, value)?;
    Ok(())
}

fn powers(base: ScalarField, size: usize) -> Vec<FieldSerde> {
    let mut values = Vec::with_capacity(size);
    let mut current = ScalarField::one();

    for _ in 0..size {
        values.push(FieldSerde(current));
        current = current * base;
    }

    values
}

fn root_case(size: usize) -> RootOfUnityCase {
    let root = ntt::get_root_of_unity::<ScalarField>(size as u64);
    let root_inverse = root.inv();

    RootOfUnityCase {
        size,
        root: FieldSerde(root),
        root_inverse: FieldSerde(root_inverse),
        powers: powers(root, size),
        inverse_powers: powers(root_inverse, size),
        root_to_size: FieldSerde(root.pow(size)),
        root_to_half_size: FieldSerde(root.pow(size / 2)),
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let input_dir = args.output_dir.join("input");
    let expected_dir = args.output_dir.join("expected");

    create_dir_all(&input_dir)?;
    create_dir_all(&expected_dir)?;

    let sizes = vec![2, 4, 8, 16];

    let input = RootsOfUnityFixtureInput {
        schema_version: 1,
        case_id: "roots-of-unity-small",
        kind: "roots-of-unity",
        field: "bls12-381-fr",
        sizes: sizes.clone(),
        source: "icicle_core::ntt::get_root_of_unity",
    };

    let expected = RootsOfUnityFixtureExpected {
        schema_version: 1,
        case_id: "roots-of-unity-small",
        kind: "roots-of-unity",
        encoding: "FieldSerde",
        cases: sizes.into_iter().map(root_case).collect(),
    };

    write_json(&input_dir.join("roots-of-unity-small.json"), &input)?;
    write_json(&expected_dir.join("roots-of-unity-small.json"), &expected)?;

    Ok(())
}
