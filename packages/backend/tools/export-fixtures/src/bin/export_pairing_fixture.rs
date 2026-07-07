use std::fs::{create_dir_all, File};
use std::path::{Path, PathBuf};

use clap::Parser;
use icicle_bls12_381::curve::{BaseField, G1Affine, G2Affine, G2BaseField, ScalarField};
use icicle_core::traits::FieldImpl;
use libs::group_structures::{pairing, G1serde, G2serde};
use serde::Serialize;

#[derive(Parser)]
struct Args {
    #[arg(long)]
    output_dir: PathBuf,
}

#[derive(Serialize)]
struct PairingFixtureInput {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    curve: &'static str,
    point_encoding: &'static str,
    true_case: PairingEqualityCase,
    false_case: PairingEqualityCase,
}

#[derive(Serialize)]
struct PairingEqualityCase {
    id: &'static str,
    left: Vec<PairingTerm>,
    right: Vec<PairingTerm>,
}

#[derive(Serialize)]
struct PairingTerm {
    g1: G1serde,
    g2: G2serde,
}

#[derive(Serialize)]
struct PairingFixtureExpected {
    schema_version: u32,
    case_id: &'static str,
    kind: &'static str,
    true_case_products_equal: bool,
    false_case_products_equal: bool,
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

fn fixed_g2_generator() -> G2Affine {
    G2Affine::from_limbs(
        G2BaseField::from_hex("0x1116094a7c01d4fd8abcfea69c658c92c037765bee00556b8d4063c33540b316ac68a2d913d3adc3b43c7d7cc7505cfc17206c8ae661f247979b3f1daa7fb6d5f7ce9c17b5ed1d7e8b421a2508b3f09a603e6a5fab3fcde7364fd178d656ac36").into(),
        G2BaseField::from_hex("0x15bf297a4b9842fb1a3a6f2dbf6b94de06997b11b2f72436c22efbb48d2f74b0de7239ea182a2ee50c23ae3d0be6fdee09459611409874fe4b04b1a7e42cb84eb4ae01728dc55dbd1343fda8d0fe94a299fc757acc1d2602a49a005b4ff90190").into(),
    )
}

fn scale_g1(base: G1Affine, factor: ScalarField) -> G1serde {
    G1serde(G1Affine::from(base.to_projective() * factor))
}

fn scale_g2(base: G2Affine, factor: ScalarField) -> G2serde {
    G2serde(G2Affine::from(base.to_projective() * factor))
}

fn products_equal(left: &[PairingTerm], right: &[PairingTerm]) -> bool {
    let left_g1 = left.iter().map(|term| term.g1).collect::<Vec<_>>();
    let left_g2 = left.iter().map(|term| term.g2).collect::<Vec<_>>();
    let right_g1 = right.iter().map(|term| term.g1).collect::<Vec<_>>();
    let right_g2 = right.iter().map(|term| term.g2).collect::<Vec<_>>();

    pairing(&left_g1, &left_g2) == pairing(&right_g1, &right_g2)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let input_dir = args.output_dir.join("input");
    let expected_dir = args.output_dir.join("expected");

    create_dir_all(&input_dir)?;
    create_dir_all(&expected_dir)?;

    let g1 = fixed_g1_generator();
    let g2 = fixed_g2_generator();

    let true_case = PairingEqualityCase {
        id: "bilinear-sum-equality",
        left: vec![
            PairingTerm {
                g1: scale_g1(g1, scalar(2)),
                g2: scale_g2(g2, scalar(1)),
            },
            PairingTerm {
                g1: scale_g1(g1, scalar(3)),
                g2: scale_g2(g2, scalar(1)),
            },
        ],
        right: vec![PairingTerm {
            g1: scale_g1(g1, scalar(1)),
            g2: scale_g2(g2, scalar(5)),
        }],
    };

    let false_case = PairingEqualityCase {
        id: "bilinear-sum-inequality",
        left: vec![
            PairingTerm {
                g1: scale_g1(g1, scalar(2)),
                g2: scale_g2(g2, scalar(1)),
            },
            PairingTerm {
                g1: scale_g1(g1, scalar(3)),
                g2: scale_g2(g2, scalar(1)),
            },
        ],
        right: vec![PairingTerm {
            g1: scale_g1(g1, scalar(1)),
            g2: scale_g2(g2, scalar(6)),
        }],
    };

    let expected = PairingFixtureExpected {
        schema_version: 1,
        case_id: "pairing-small",
        kind: "pairing",
        true_case_products_equal: products_equal(&true_case.left, &true_case.right),
        false_case_products_equal: products_equal(&false_case.left, &false_case.right),
    };

    let input = PairingFixtureInput {
        schema_version: 1,
        case_id: "pairing-small",
        kind: "pairing",
        curve: "bls12-381",
        point_encoding: "G1serde/G2serde",
        true_case,
        false_case,
    };

    write_json(&input_dir.join("pairing-small.json"), &input)?;
    write_json(&expected_dir.join("pairing-small.json"), &expected)?;

    Ok(())
}
