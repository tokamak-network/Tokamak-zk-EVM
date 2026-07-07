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
struct Ntt1dFixtureInput {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    field: &'static str,
    encoding: &'static str,
    cases: Vec<Ntt1dInputCase>,
}

#[derive(Serialize)]
struct Ntt1dInputCase {
    id: &'static str,
    x_size: usize,
    y_size: usize,
    coefficients: Vec<FieldSerde>,
}

#[derive(Serialize)]
struct Ntt1dFixtureExpected {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    encoding: &'static str,
    cases: Vec<Ntt1dExpectedCase>,
}

#[derive(Serialize)]
struct Ntt1dExpectedCase {
    id: &'static str,
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

fn export_case(
    id: &'static str,
    x_size: usize,
    y_size: usize,
    coefficients: Vec<ScalarField>,
) -> (Ntt1dInputCase, Ntt1dExpectedCase) {
    init_ntt_domain_for_size(x_size * y_size).unwrap();

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

    (
        Ntt1dInputCase {
            id,
            x_size,
            y_size,
            coefficients: serialize_fields(&coefficients),
        },
        Ntt1dExpectedCase {
            id,
            forward_evals: serialize_fields(&forward_evals),
            inverse_recovered_coefficients: serialize_fields(&inverse_recovered_coefficients),
        },
    )
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let input_dir = args.output_dir.join("input");
    let expected_dir = args.output_dir.join("expected");

    create_dir_all(&input_dir)?;
    create_dir_all(&expected_dir)?;

    let x_axis_coefficients = vec![
        scalar(3),
        scalar(5),
        scalar(8),
        scalar(13),
        scalar(21),
        scalar(34),
        scalar(55),
        scalar(89),
    ];
    let y_axis_coefficients = vec![
        scalar(2),
        scalar(7),
        scalar(11),
        scalar(19),
        scalar(31),
        scalar(43),
        scalar(59),
        scalar(71),
    ];

    let cases = vec![
        export_case("x-axis-8", 8, 1, x_axis_coefficients),
        export_case("y-axis-8", 1, 8, y_axis_coefficients),
    ];

    let input = Ntt1dFixtureInput {
        schema_version: 1,
        case_id: "ntt-1d-small",
        kind: "ntt-1d",
        field: "bls12-381-fr",
        encoding: "FieldSerde",
        cases: cases
            .iter()
            .map(|(input, _)| Ntt1dInputCase {
                id: input.id,
                x_size: input.x_size,
                y_size: input.y_size,
                coefficients: input.coefficients.clone(),
            })
            .collect(),
    };

    let expected = Ntt1dFixtureExpected {
        schema_version: 1,
        case_id: "ntt-1d-small",
        kind: "ntt-1d",
        encoding: "FieldSerde",
        cases: cases.into_iter().map(|(_, expected)| expected).collect(),
    };

    write_json(&input_dir.join("ntt-1d-small.json"), &input)?;
    write_json(&expected_dir.join("ntt-1d-small.json"), &expected)?;

    Ok(())
}
