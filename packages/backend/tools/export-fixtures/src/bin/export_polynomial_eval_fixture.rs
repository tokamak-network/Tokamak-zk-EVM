use std::fs::{create_dir_all, File};
use std::path::{Path, PathBuf};

use clap::Parser;
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::field_structures::FieldSerde;
use serde::Serialize;

#[derive(Parser)]
struct Args {
    #[arg(long)]
    output_dir: PathBuf,
}

#[derive(Serialize)]
struct PolynomialEvalFixtureInput {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    field: &'static str,
    encoding: &'static str,
    x_size: usize,
    y_size: usize,
    layout: &'static str,
    coefficients: Vec<FieldSerde>,
    points: Vec<PolynomialEvalPointInput>,
}

#[derive(Serialize)]
struct PolynomialEvalPointInput {
    id: &'static str,
    x: FieldSerde,
    y: FieldSerde,
}

#[derive(Serialize)]
struct PolynomialEvalFixtureExpected {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    encoding: &'static str,
    evaluations: Vec<PolynomialEvalResult>,
}

#[derive(Serialize)]
struct PolynomialEvalResult {
    id: &'static str,
    value: FieldSerde,
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
    let coefficients = vec![
        scalar(2),
        scalar(3),
        scalar(5),
        scalar(7),
        scalar(11),
        scalar(13),
        scalar(17),
        scalar(19),
        scalar(23),
        scalar(29),
        scalar(31),
        scalar(37),
        scalar(41),
        scalar(43),
        scalar(47),
        scalar(53),
    ];
    let points = vec![
        ("low-values", scalar(3), scalar(5)),
        ("mixed-values", scalar(17), scalar(29)),
        (
            "wide-values",
            ScalarField::from_hex("0x0123456789abcdef"),
            ScalarField::from_hex("0x0203040506070809"),
        ),
    ];

    let poly =
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coefficients), x_size, y_size);
    let input_points = points
        .iter()
        .map(|(id, x, y)| PolynomialEvalPointInput {
            id,
            x: FieldSerde(*x),
            y: FieldSerde(*y),
        })
        .collect();
    let evaluations = points
        .iter()
        .map(|(id, x, y)| PolynomialEvalResult {
            id,
            value: FieldSerde(poly.eval(x, y)),
        })
        .collect();

    let input = PolynomialEvalFixtureInput {
        schema_version: 1,
        case_id: "polynomial-eval-small",
        kind: "polynomial-eval",
        field: "bls12-381-fr",
        encoding: "FieldSerde",
        x_size,
        y_size,
        layout: "row-major x*y, index = x * y_size + y",
        coefficients: serialize_fields(&coefficients),
        points: input_points,
    };

    let expected = PolynomialEvalFixtureExpected {
        schema_version: 1,
        case_id: "polynomial-eval-small",
        kind: "polynomial-eval",
        encoding: "FieldSerde",
        evaluations,
    };

    write_json(&input_dir.join("polynomial-eval-small.json"), &input)?;
    write_json(&expected_dir.join("polynomial-eval-small.json"), &expected)?;

    Ok(())
}
