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
struct CosetNttFixtureInput {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    field: &'static str,
    encoding: &'static str,
    x_size: usize,
    y_size: usize,
    layout: &'static str,
    coset_x: FieldSerde,
    coset_y: FieldSerde,
    coefficients: Vec<FieldSerde>,
}

#[derive(Serialize)]
struct CosetNttFixtureExpected {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    encoding: &'static str,
    coset_evals: Vec<FieldSerde>,
    scaled_coefficients_evals: Vec<FieldSerde>,
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

    let coset_x = scalar(5);
    let coset_y = scalar(7);
    let coefficients = vec![
        scalar(6),
        scalar(10),
        scalar(15),
        scalar(21),
        scalar(28),
        scalar(36),
        scalar(45),
        scalar(55),
        scalar(66),
        scalar(78),
        scalar(91),
        scalar(105),
        scalar(120),
        scalar(136),
        scalar(153),
        scalar(171),
    ];

    let poly =
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coefficients), x_size, y_size);
    let mut coset_evals = vec![ScalarField::zero(); x_size * y_size];
    poly.to_rou_evals(
        Some(&coset_x),
        Some(&coset_y),
        HostSlice::from_mut_slice(&mut coset_evals),
    );

    let scaled_poly = poly.scale_coeffs_x(&coset_x).scale_coeffs_y(&coset_y);
    let mut scaled_coefficients_evals = vec![ScalarField::zero(); x_size * y_size];
    scaled_poly.to_rou_evals(
        None,
        None,
        HostSlice::from_mut_slice(&mut scaled_coefficients_evals),
    );

    let recovered = DensePolynomialExt::from_rou_evals(
        HostSlice::from_slice(&coset_evals),
        x_size,
        y_size,
        Some(&coset_x),
        Some(&coset_y),
    );
    let mut inverse_recovered_coefficients = vec![ScalarField::zero(); x_size * y_size];
    recovered.copy_coeffs(
        0,
        HostSlice::from_mut_slice(&mut inverse_recovered_coefficients),
    );

    let input = CosetNttFixtureInput {
        schema_version: 1,
        case_id: "coset-ntt-small",
        kind: "coset-ntt",
        field: "bls12-381-fr",
        encoding: "FieldSerde",
        x_size,
        y_size,
        layout: "row-major x*y, index = x * y_size + y",
        coset_x: FieldSerde(coset_x),
        coset_y: FieldSerde(coset_y),
        coefficients: serialize_fields(&coefficients),
    };

    let expected = CosetNttFixtureExpected {
        schema_version: 1,
        case_id: "coset-ntt-small",
        kind: "coset-ntt",
        encoding: "FieldSerde",
        coset_evals: serialize_fields(&coset_evals),
        scaled_coefficients_evals: serialize_fields(&scaled_coefficients_evals),
        inverse_recovered_coefficients: serialize_fields(&inverse_recovered_coefficients),
    };

    write_json(&input_dir.join("coset-ntt-small.json"), &input)?;
    write_json(&expected_dir.join("coset-ntt-small.json"), &expected)?;

    Ok(())
}
