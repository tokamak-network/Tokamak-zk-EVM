use std::fs::{create_dir_all, File};
use std::path::{Path, PathBuf};

use clap::Parser;
use icicle_bls12_381::curve::{BaseField, G1Affine, ScalarField};
use icicle_core::traits::FieldImpl;
use libs::field_structures::FieldSerde;
use libs::group_structures::G1serde;
use prove::RollingKeccakTranscript;
use serde::Serialize;

#[derive(Parser)]
struct Args {
    #[arg(long)]
    output_dir: PathBuf,
}

#[derive(Serialize)]
struct TranscriptFixtureInput {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    field: &'static str,
    point_encoding: &'static str,
    operations: Vec<TranscriptOperation>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum TranscriptOperation {
    CommitBytes { value_hex: &'static str },
    CommitField { value: FieldSerde },
    CommitG1 { value: G1serde },
    GetChallenges { count: usize },
}

#[derive(Serialize)]
struct TranscriptFixtureExpected {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    challenge_encoding: &'static str,
    challenges: Vec<FieldSerde>,
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

fn scale_g1(base: G1Affine, factor: ScalarField) -> G1serde {
    G1serde(G1Affine::from(base.to_projective() * factor))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let input_dir = args.output_dir.join("input");
    let expected_dir = args.output_dir.join("expected");

    create_dir_all(&input_dir)?;
    create_dir_all(&expected_dir)?;

    let field_a = scalar(0x11);
    let field_b = ScalarField::from_hex("0x0123456789abcdef");
    let point = scale_g1(fixed_g1_generator(), scalar(7));

    let operations = vec![
        TranscriptOperation::CommitBytes {
            value_hex: "0x0102030405060708090a0b0c0d0e0f10",
        },
        TranscriptOperation::CommitField {
            value: FieldSerde(field_a),
        },
        TranscriptOperation::CommitG1 { value: point },
        TranscriptOperation::CommitField {
            value: FieldSerde(field_b),
        },
        TranscriptOperation::GetChallenges { count: 6 },
    ];

    let mut transcript = RollingKeccakTranscript::new();
    transcript
        .commit_bytes(&[
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
            0x0f, 0x10,
        ])
        .unwrap();
    transcript.commit_field_as_bytes(&field_a).unwrap();
    transcript.commit_g1_point(&point).unwrap();
    transcript.commit_field_as_bytes(&field_b).unwrap();
    let challenges = transcript
        .get_challenges(6)
        .into_iter()
        .map(FieldSerde)
        .collect();

    let input = TranscriptFixtureInput {
        schema_version: 1,
        case_id: "transcript-small",
        kind: "transcript",
        field: "bls12-381-fr",
        point_encoding: "G1serde",
        operations,
    };

    let expected = TranscriptFixtureExpected {
        schema_version: 1,
        case_id: "transcript-small",
        kind: "transcript",
        challenge_encoding: "FieldSerde",
        challenges,
    };

    write_json(&input_dir.join("transcript-small.json"), &input)?;
    write_json(&expected_dir.join("transcript-small.json"), &expected)?;

    Ok(())
}
