use std::fs::{create_dir_all, File};
use std::path::{Path, PathBuf};

use clap::Parser;
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{
    init_ntt_domain_for_size, BivariatePolynomial, DensePolynomialExt,
};
use libs::field_structures::FieldSerde;
use serde::Serialize;

#[derive(Parser)]
struct Args {
    #[arg(long)]
    output_dir: PathBuf,
}

#[derive(Serialize)]
struct Ntt2dFixtureInput {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    field: &'static str,
    encoding: &'static str,
    x_size: usize,
    y_size: usize,
    layout: &'static str,
    coefficients: Vec<FieldSerde>,
}

#[derive(Serialize)]
struct Ntt2dFixtureExpected {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    encoding: &'static str,
    forward_evals: Vec<FieldSerde>,
    inverse_recovered_coefficients: Vec<FieldSerde>,
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::create(path)?;
    serde_json::to_writer_pretty(file, value)?;
    Ok(())
}

fn scalar(value: u32) -> ScalarField {
    ScalarField::from_u32(value)
}

fn serialize_fields(values: &[ScalarField]) -> Vec<FieldSerde> {
    values.iter().copied().map(FieldSerde).collect()
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let input_dir = args.output_dir.join("input");
    let expected_dir = args.output_dir.join("expected");

    create_dir_all(&input_dir)?;
    create_dir_all(&expected_dir)?;

    let x_size = 4;
    let y_size = 4;
    init_ntt_domain_for_size(x_size * y_size).unwrap();

    let coefficients = vec![
        scalar(1),
        scalar(4),
        scalar(9),
        scalar(16),
        scalar(25),
        scalar(36),
        scalar(49),
        scalar(64),
        scalar(81),
        scalar(100),
        scalar(121),
        scalar(144),
        scalar(169),
        scalar(196),
        scalar(225),
        scalar(256),
    ];

    let poly =
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coefficients), x_size, y_size);
    let mut forward_evals = vec![ScalarField::zero(); x_size * y_size];
    poly.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut forward_evals));

    let recovered = DensePolynomialExt::from_rou_evals(
        HostSlice::from_slice(&forward_evals),
        x_size,
        y_size,
        None,
        None,
    );
    let mut inverse_recovered_coefficients = vec![ScalarField::zero(); x_size * y_size];
    recovered.copy_coeffs(
        0,
        HostSlice::from_mut_slice(&mut inverse_recovered_coefficients),
    );

    let input = Ntt2dFixtureInput {
        schema_version: 1,
        case_id: "ntt-2d-small",
        kind: "ntt-2d",
        field: "bls12-381-fr",
        encoding: "FieldSerde",
        x_size,
        y_size,
        layout: "row-major x*y, index = x * y_size + y",
        coefficients: serialize_fields(&coefficients),
    };

    let expected = Ntt2dFixtureExpected {
        schema_version: 1,
        case_id: "ntt-2d-small",
        kind: "ntt-2d",
        encoding: "FieldSerde",
        forward_evals: serialize_fields(&forward_evals),
        inverse_recovered_coefficients: serialize_fields(&inverse_recovered_coefficients),
    };

    write_json(&input_dir.join("ntt-2d-small.json"), &input)?;
    write_json(&expected_dir.join("ntt-2d-small.json"), &expected)?;

    Ok(())
}
