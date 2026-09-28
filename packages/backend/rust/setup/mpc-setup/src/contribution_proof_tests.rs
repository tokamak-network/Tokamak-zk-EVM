use super::*;

fn binding() -> ContributionBinding<'static> {
    ContributionBinding {
        library_version: "2.1.5",
        library_digest: [1; 32],
        tau_digest: [2; 32],
        previous_record_digest: [3; 32],
        next_state_digest: [4; 32],
    }
}

fn proof(role: ShareRole) -> ShareProof {
    ShareProof::create(
        Fr::from(7u64),
        &binding(),
        role,
        &mut ChaCha20Rng::from_seed([42; 32]),
    )
    .unwrap()
}

#[test]
fn filecoin_mapping_matches_independent_reference_vectors() {
    // Generated outside this crate by replaying Filecoin 934fe8c:
    // blake2b_simd 0.5.11, rand 0.8.4, rand_chacha 0.3.1 and blst 0.3.6,
    // using blstrs 0.4.1's exact Group::random call (64 message bytes,
    // 16 zero DST bytes and 16 zero AUG bytes). These are replay vectors,
    // not published Filecoin ceremony contributions or RFC 9380 vectors.
    let vectors = [
        (b"".as_slice(),
         "786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce",
         "08e3c58c2ec38317d6313ae8e0265d2a18bda65182dd4b35795f6fa56cad4fe7c7aa969cbaee8946e734f0668fe42c0913b771caa673df8f156a98f2d66396f45dbfe0edb2fcb2e80aba19f2b0df9990aff01cfd086c1b9e2ecaaed5f291149c19ccab260bd9249e1fa7451a3b9676945558ebcfb7d3cc2242993134a1e2da44d7ce6e527b68cc677d830af89188b65504bf5033bac0105a5ad973a3d92235567e26dedeaf6ced792d6e62e5b54dd8eb42b6e68d22ebe9f57998e76e30888feb"),
        (b"Filecoin phase 2".as_slice(),
         "20f99e56778efcafd2fc1bc8389aad06d630ba67c59b86d6c2cc2660b756afd5fb7dbbacfbe27cd659da60ebeda34ff9844b53ef8c2a3c283d045ae50c278793",
         "18982bf7bd2e270ff61fd780d4786b965c3605863d1a7b9ab6daa1f3cddfcf9cf9962617c70ef7c5e6a156071e69df371809468d5da16ea3b3e649bbb5bca443b922baa91a58a993b21b4dad142e5965e019d9531f8a94626bc46191dc7d5deb10adabd90e45ccb1f64143111a88fdea30d704fe228c6391b7126bbe5cb588747b0c32074c00a1490a8de2983f761fc601ffe2fc0e3b609c32a277549ba7bc63e1f00a8f525c97610dec665bbc27ef4f95375932397d8261e4773bbf9358cf42"),
        (&[0xa5; 1024],
         "1a97ffd71bf697646856222be0a72c9c9ef6873c303e3ba40303bd0bfd490f4df54ca47dc84d9d54ffe2035fa2bce97ed90ea6c47a5be581400fba65aae891cb",
         "100ac5090914f6920ac121fc3df095a250fe70927ac8bb25c5a36ab939d33332985ec6084093b5e973318dfba8a73c4809579426259e09bdfd44d8aebc9cbeb2d796c7faf2206c34fe109bbc13cafd7e953331d541444af0bb1d51815388e97f18ff938b15f6de64778b5d41ee13849b95f64d5ffcb48b9999dbb3e94e1172e80ac570f8fb0d108b10aa9599c30f1d2d11676ce22194d1da719ece4396eedc710cfcff71fc6753a814fb8ffe0b148cfc1eabf6efd9832454c18b7ab67856be3b"),
    ];
    for (message, expected_digest, expected_point) in vectors {
        let digest = Blake2b::digest(message);
        assert_eq!(hex::encode(digest), expected_digest);
        let point = hash_to_g2(digest.as_slice().try_into().unwrap());
        assert!(point.is_on_curve());
        assert!(point.is_in_correct_subgroup_assuming_on_curve());
        assert!(!point.is_zero());
        assert_eq!(hex::encode(g2_bytes(point)), expected_point);
    }
}

#[test]
fn valid_delta_and_wire_proofs_pass() {
    for role in [
        ShareRole::Delta,
        ShareRole::WireWeight(0),
        ShareRole::WireWeight(u64::MAX),
    ] {
        assert!(proof(role).verify(&binding(), role));
    }
}

#[test]
fn rejects_rebinding_each_input_and_transition() {
    let proof = proof(ShareRole::Delta);
    let original = binding();
    let mut changed = original.clone();
    changed.library_version = "2.1.6";
    assert!(!proof.verify(&changed, ShareRole::Delta));
    for field in 0..4 {
        let mut changed = original.clone();
        let bytes = match field {
            0 => &mut changed.library_digest,
            1 => &mut changed.tau_digest,
            2 => &mut changed.previous_record_digest,
            _ => &mut changed.next_state_digest,
        };
        bytes[0] ^= 1;
        assert!(!proof.verify(&changed, ShareRole::Delta));
    }
}

#[test]
fn rejects_rebinding_role_or_wire_index() {
    assert!(!proof(ShareRole::Delta).verify(&binding(), ShareRole::WireWeight(0)));
    let proof = proof(ShareRole::WireWeight(0));
    assert!(!proof.verify(&binding(), ShareRole::Delta));
    assert!(!proof.verify(&binding(), ShareRole::WireWeight(1)));
}

#[test]
fn rejects_modified_public_points() {
    let original = proof(ShareRole::Delta);
    for field in 0..5 {
        let mut changed = original.clone();
        match field {
            0 => changed.share_g1 = (changed.share_g1 * Fr::from(2u64)).into_affine(),
            1 => changed.share_g2 = (changed.share_g2 * Fr::from(2u64)).into_affine(),
            2 => changed.s = (changed.s * Fr::from(2u64)).into_affine(),
            3 => changed.s_share = (changed.s_share * Fr::from(2u64)).into_affine(),
            _ => changed.r_share = (changed.r_share * Fr::from(2u64)).into_affine(),
        }
        assert!(!changed.verify(&binding(), ShareRole::Delta));
    }
}

#[test]
fn rejects_identity_off_curve_and_wrong_subgroup_evidence() {
    let original = proof(ShareRole::Delta);
    for field in 0..5 {
        let mut changed = original.clone();
        match field {
            0 => changed.share_g1 = G1Affine::zero(),
            1 => changed.share_g2 = G2Affine::zero(),
            2 => changed.s = G1Affine::zero(),
            3 => changed.s_share = G1Affine::zero(),
            _ => changed.r_share = G2Affine::zero(),
        }
        assert!(!changed.verify(&binding(), ShareRole::Delta));
    }
    let mut changed = original.clone();
    changed.s = G1Affine::new_unchecked(Fq::from(0), Fq::from(0));
    assert!(!changed.verify(&binding(), ShareRole::Delta));
    changed = original.clone();
    changed.r_share = G2Affine::new_unchecked(Fq2::zero(), Fq2::zero());
    assert!(!changed.verify(&binding(), ShareRole::Delta));
    let outside = (0..100u64)
        .filter_map(|x| G1Affine::get_point_from_x_unchecked(Fq::from(x), false))
        .find(|p| !p.is_in_correct_subgroup_assuming_on_curve())
        .unwrap();
    changed = original;
    changed.s = outside;
    assert!(!changed.verify(&binding(), ShareRole::Delta));
}

#[test]
fn zero_share_is_rejected_before_randomness_is_used() {
    let mut rng = ChaCha20Rng::from_seed([42; 32]);
    let mut untouched = rng.clone();
    assert!(ShareProof::create(Fr::zero(), &binding(), ShareRole::Delta, &mut rng).is_err());
    assert_eq!(rng.next_u64(), untouched.next_u64());
}

#[test]
fn public_scalar_mapping_would_forge_but_is_not_accepted() {
    let mut proof = proof(ShareRole::Delta);
    // The attacker uses only public evidence; no access to the witness share.
    let public_hash_scalar = Fr::from(19u64);
    let bad_base = (G2Affine::generator() * public_hash_scalar).into_affine();
    proof.r_share = (proof.share_g2 * public_hash_scalar).into_affine();
    assert!(pairing_equal(
        proof.s_share,
        bad_base,
        proof.s,
        proof.r_share
    ));
    assert!(!proof.verify(&binding(), ShareRole::Delta));
}

#[test]
fn new_random_base_produces_distinct_valid_evidence() {
    let a = proof(ShareRole::Delta);
    let b = ShareProof::create(
        Fr::from(7u64),
        &binding(),
        ShareRole::Delta,
        &mut ChaCha20Rng::from_seed([43; 32]),
    )
    .unwrap();
    assert_ne!(a.s, b.s);
    assert_ne!(a.r_share, b.r_share);
    assert_eq!(a.share_g1, b.share_g1);
    assert!(b.verify(&binding(), ShareRole::Delta));
}
