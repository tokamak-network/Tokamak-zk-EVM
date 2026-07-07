use std::fs::{create_dir_all, File};
use std::path::{Path, PathBuf};

use clap::Parser;
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::{Arithmetic, FieldImpl};
use libs::field_structures::FieldSerde;
use serde::Serialize;

#[derive(Parser)]
struct Args {
    #[arg(long)]
    output_dir: PathBuf,
}

#[derive(Serialize)]
struct ScalarFixtureInput {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    field: &'static str,
    operands: ScalarFixtureOperands,
    operations: Vec<&'static str>,
}

#[derive(Serialize)]
struct ScalarFixtureOperands {
    a: &'static str,
    b: &'static str,
    c: &'static str,
}

#[derive(Serialize)]
struct ScalarFixtureExpected {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    encoding: &'static str,
    results: ScalarFixtureResults,
}

#[derive(Serialize)]
struct ScalarFixtureResults {
    zero: FieldSerde,
    one: FieldSerde,
    a: FieldSerde,
    b: FieldSerde,
    c: FieldSerde,
    add_ab: FieldSerde,
    sub_ab: FieldSerde,
    mul_ab: FieldSerde,
    neg_a: FieldSerde,
    inv_b: FieldSerde,
    pow_a_5: FieldSerde,
    round_trip_c: FieldSerde,
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::create(path)?;
    serde_json::to_writer_pretty(file, value)?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let input_dir = args.output_dir.join("input");
    let expected_dir = args.output_dir.join("expected");

    create_dir_all(&input_dir)?;
    create_dir_all(&expected_dir)?;

    let a_hex = "0x05";
    let b_hex = "0x11";
    let c_hex = "0x7234cd9b97845e0125e84ae3ae81354e004558d8c82a83425652bc7b9ed49f7d";

    let a = ScalarField::from_hex(a_hex);
    let b = ScalarField::from_hex(b_hex);
    let c = ScalarField::from_hex(c_hex);

    let input = ScalarFixtureInput {
        schema_version: 1,
        case_id: "scalar-ops-basic",
        kind: "scalar-ops",
        field: "bls12-381-fr",
        operands: ScalarFixtureOperands {
            a: a_hex,
            b: b_hex,
            c: c_hex,
        },
        operations: vec![
            "zero",
            "one",
            "add",
            "sub",
            "mul",
            "neg",
            "inv",
            "pow",
            "round-trip",
        ],
    };

    let expected = ScalarFixtureExpected {
        schema_version: 1,
        case_id: "scalar-ops-basic",
        kind: "scalar-ops",
        encoding: "FieldSerde",
        results: ScalarFixtureResults {
            zero: FieldSerde(ScalarField::zero()),
            one: FieldSerde(ScalarField::one()),
            a: FieldSerde(a),
            b: FieldSerde(b),
            c: FieldSerde(c),
            add_ab: FieldSerde(a + b),
            sub_ab: FieldSerde(a - b),
            mul_ab: FieldSerde(a * b),
            neg_a: FieldSerde(ScalarField::zero() - a),
            inv_b: FieldSerde(b.inv()),
            pow_a_5: FieldSerde(a.pow(5)),
            round_trip_c: FieldSerde(ScalarField::from_hex(&c.to_string())),
        },
    };

    write_json(&input_dir.join("scalar-ops-basic.json"), &input)?;
    write_json(&expected_dir.join("scalar-ops-basic.json"), &expected)?;

    Ok(())
}
