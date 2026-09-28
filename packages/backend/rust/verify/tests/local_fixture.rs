//! Opt-in current-protocol fixture qualification. Supply existing artifacts;
//! this test never generates a ceremony or reads the circuit library.
use ark_bls12_381::Fr;
use ark_ff::{BigInteger, PrimeField};
use backend_interface::{PreprocessBytes, ProofBytes};
use serde::Deserialize;
use std::{
    fs,
    path::{Path, PathBuf},
};
use verify::{univariate_cli::read_public_inputs, Verifier};

#[derive(Deserialize)]
struct InstanceDescription {
    a_pub_user_description: Vec<String>,
}

fn input(name: &str) -> PathBuf {
    std::env::var_os(name)
        .unwrap_or_else(|| panic!("set {name}"))
        .into()
}

fn channel_transaction_index_offset(instance_path: &Path) -> usize {
    let description_path = instance_path.with_file_name("instance_description.json");
    let description: InstanceDescription =
        serde_json::from_slice(&fs::read(&description_path).unwrap())
            .unwrap_or_else(|error| panic!("{}: {error}", description_path.display()));
    let offsets = description
        .a_pub_user_description
        .iter()
        .enumerate()
        .filter_map(|(offset, label)| {
            (label == "Signed channel transaction index").then_some(offset)
        })
        .collect::<Vec<_>>();
    assert_eq!(
        offsets.len(),
        1,
        "expected one channel transaction index metadata entry"
    );
    offsets[0]
}

#[test]
#[ignore = "requires matching current-protocol local fixture paths"]
fn accepts_real_proof_and_rejects_tampering() {
    let preprocess = fs::read(input("VERIFY_TEST_PREPROCESS")).unwrap();
    let proof = fs::read(input("VERIFY_TEST_PROOF")).unwrap();
    let instance_path = input("VERIFY_TEST_INSTANCE");
    let public = read_public_inputs(&instance_path).unwrap();
    let verifier = Verifier::from_bytes(&preprocess).unwrap();
    assert!(verifier.verify(&public, &proof).unwrap());
    let mut wrong_public = public.clone();
    let channel_transaction_index = channel_transaction_index_offset(&instance_path);
    assert!(
        channel_transaction_index < wrong_public.len(),
        "channel transaction index must be part of the free public statement"
    );
    wrong_public[channel_transaction_index] += Fr::from(1);
    assert!(!verifier.verify(&wrong_public, &proof).unwrap());
    assert!(verifier
        .verify(&public[..public.len() - 1], &proof)
        .is_err());
    let mut extra_public = public.clone();
    extra_public.push(Fr::from(0));
    assert!(verifier.verify(&extra_public, &proof).is_err());
    assert!(verifier.verify(&public, &proof[..proof.len() - 1]).is_err());
    let mut extra = proof.clone();
    extra.push(0);
    assert!(verifier.verify(&public, &extra).is_err());
    assert!(Verifier::from_bytes(&preprocess[..preprocess.len() - 1]).is_err());
    // Every proof point is authenticated. Replace it by a different valid
    // source-group encoding, rather than merely triggering curve validation.
    for index in 0..10 {
        let mut changed = proof.clone();
        assert!(changed[index * 96..(index + 1) * 96]
            .iter()
            .any(|b| *b != 0));
        changed[index * 96..(index + 1) * 96].fill(0);
        assert!(
            !verifier.verify(&public, &changed).unwrap(),
            "point {index}"
        );
    }
    for index in 0..7 {
        let mut changed = proof.clone();
        let start = 960 + index * 32;
        let value = Fr::from_le_bytes_mod_order(&changed[start..start + 32]) + Fr::from(1);
        changed[start..start + 32].copy_from_slice(&value.into_bigint().to_bytes_le());
        assert!(
            !verifier.verify(&public, &changed).unwrap(),
            "evaluation {index}"
        );
    }
    let mut noncanonical = proof.clone();
    noncanonical[960..992].copy_from_slice(&Fr::MODULUS.to_bytes_le());
    assert!(verifier.verify(&public, &noncanonical).is_err());
    let mut wrong_group = proof.clone();
    wrong_group[..96].fill(0);
    wrong_group[48] = 2;
    assert!(verifier.verify(&public, &wrong_group).is_err());
    let pp = PreprocessBytes::decode(&preprocess).unwrap();
    for index in 0..3 {
        let mut changed = pp.clone();
        match index {
            0 => changed.s_c = [0; 96],
            1 => changed.c_fix = [0; 96],
            _ => changed.e_kappa = [0; 192],
        }
        assert_ne!(
            changed, pp,
            "fixture must exercise preprocess operand {index}"
        );
        let verifier = Verifier::from_bytes(&changed.encode().unwrap()).unwrap();
        assert!(
            !verifier.verify(&public, &proof).unwrap(),
            "preprocess operand {index}"
        );
    }
    assert_eq!(proof.len(), ProofBytes::BYTE_LENGTH);
}
