use super::*;
use ark_ff::{Field, One};
use backend_univariate_crs_interface::archive;
use std::{fs, io::Cursor};

fn source_g1(p: G1Affine) -> Vec<u8> {
    [
        p.x.into_bigint().to_bytes_be(),
        p.y.into_bigint().to_bytes_be(),
    ]
    .concat()
}

fn source_g2(p: G2Affine) -> Vec<u8> {
    [p.x.c1, p.x.c0, p.y.c1, p.y.c0]
        .iter()
        .flat_map(|q| q.into_bigint().to_bytes_be())
        .collect()
}

// Synthetic upstream-format accumulator; tau/tags here are deliberately known.
// Participant ingress cannot override its source length, hash, header or URL.
fn fixture(length: usize) -> Vec<u8> {
    let mut bytes = vec![17u8; 64];
    let tau = Fr::from(7u64);
    let g = G1Affine::generator();
    let h = G2Affine::generator();
    for i in 0..2 * length - 1 {
        bytes.extend(source_g1((g * tau.pow([i as u64])).into_affine()));
    }
    for i in 0..length {
        bytes.extend(source_g2((h * tau.pow([i as u64])).into_affine()));
    }
    for tag in [11u64, 13u64] {
        for i in 0..length {
            bytes.extend(source_g1(
                (g * (Fr::from(tag) * tau.pow([i as u64]))).into_affine(),
            ));
        }
    }
    bytes.extend(source_g2((h * Fr::from(13u64)).into_affine()));
    bytes
}

fn digest(bytes: &[u8]) -> String {
    let mut h = Blake2b::new();
    h.input(bytes);
    hex::encode(h.result())
}

fn small_pin<'a>(digest: &'a str, header: &'a str) -> SourcePin<'a> {
    SourcePin {
        length: 8,
        digest,
        previous_response: header,
    }
}

fn selected() -> [Vec<u8>; 5] {
    let bytes = fixture(8);
    let hash = digest(&bytes);
    let header = hex::encode(&bytes[..64]);
    collect_ranges(Cursor::new(&bytes), 3, &small_pin(&hash, &header)).unwrap()
}

#[test]
fn pinned_offsets_and_capacity_are_exact() {
    assert_eq!(FILECOIN.byte_len(), 77_309_411_488);
    let ranges = FILECOIN.ranges(524_291).unwrap();
    assert_eq!(ranges[0], 64..64 + 1_048_583 * 96);
    assert_eq!(ranges[1].start, 64 + ((1u64 << 28) - 1) * 96);
    assert_eq!(ranges[4].end, FILECOIN.byte_len());
    assert!(FILECOIN.ranges(0).is_err());
    assert!(FILECOIN.ranges(SOURCE_LENGTH as usize).is_err());
    assert!(FILECOIN.ranges(usize::MAX).is_err());
    assert!(FILECOIN.ranges(SOURCE_LENGTH as usize - 1).is_ok());
}

#[test]
fn stream_capture_handles_short_reads_and_hashes_unselected_bytes() {
    let bytes = fixture(8);
    let hash = digest(&bytes);
    let header = hex::encode(&bytes[..64]);
    let pin = small_pin(&hash, &header);
    struct ShortReader<'a> {
        bytes: &'a [u8],
        interrupted: bool,
    }
    impl Read for ShortReader<'_> {
        fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
            if !self.interrupted {
                self.interrupted = true;
                return Err(io::ErrorKind::Interrupted.into());
            }
            let n = output.len().min(7).min(self.bytes.len());
            output[..n].copy_from_slice(&self.bytes[..n]);
            self.bytes = &self.bytes[n..];
            Ok(n)
        }
    }
    let captured = collect_ranges(
        ShortReader {
            bytes: &bytes,
            interrupted: false,
        },
        3,
        &pin,
    )
    .unwrap();
    for (slice, range) in captured.iter().zip(pin.ranges(3).unwrap()) {
        assert_eq!(slice, &bytes[range.start as usize..range.end as usize]);
    }
    assert_eq!(captured.iter().map(Vec::len).sum::<usize>(), 576 * 3 + 672);
    let mut tampered = bytes.clone();
    // Outside the retained ordinary G1 prefix: still covered by the full hash.
    tampered[64 + 7 * 96] ^= 1;
    assert!(collect_ranges(Cursor::new(tampered), 3, &pin)
        .unwrap_err()
        .to_string()
        .contains("BLAKE2b"));
    assert!(collect_ranges(Cursor::new(&bytes[..bytes.len() - 1]), 3, &pin).is_err());
    let mut trailing = bytes.clone();
    trailing.push(0);
    assert!(collect_ranges(Cursor::new(trailing), 3, &pin).is_err());
    let bad_header = "00".repeat(64);
    assert!(collect_ranges(Cursor::new(&bytes), 3, &small_pin(&hash, &bad_header)).is_err());
}

#[test]
fn conversion_preserves_every_retained_coordinate_and_common_archive() {
    let raw = selected();
    let tau = decode_and_verify(raw.clone()).unwrap();
    let expected1 = |data: &[u8]| {
        data.chunks_exact(96)
            .map(|b| {
                let mut x: [u8; 48] = b[..48].try_into().unwrap();
                let mut y: [u8; 48] = b[48..].try_into().unwrap();
                x.reverse();
                y.reverse();
                UnivariateG1Rkyv { x, y }
            })
            .collect::<Vec<_>>()
    };
    let expected2 = |data: &[u8]| {
        data.chunks_exact(192)
            .map(|b| {
                let convert = |b: &[u8]| {
                    let mut result = [0u8; 96];
                    result[..48].copy_from_slice(&b[48..96]);
                    result[..48].reverse();
                    result[48..].copy_from_slice(&b[..48]);
                    result[48..].reverse();
                    result
                };
                UnivariateG2Rkyv {
                    x: convert(&b[..96]),
                    y: convert(&b[96..]),
                }
            })
            .collect::<Vec<_>>()
    };
    assert_eq!(tau.s0_g1, expected1(&raw[0]));
    assert_eq!(tau.sxi_g1, expected1(&raw[2]));
    assert_eq!(tau.spsi_g1, expected1(&raw[3]));
    assert_eq!(tau.tau_powers_g2, expected2(&raw[1]));
    assert_eq!(tau.psi_g2, expected2(&raw[4])[0]);
    let bytes = archive::to_bytes::<archive::rancor::Error>(&tau).unwrap();
    let restored: TauSequenceRkyv =
        archive::from_bytes::<_, archive::rancor::Error>(&bytes).unwrap();
    assert_eq!(restored.s0_g1, tau.s0_g1);
    assert_eq!(restored.tau_powers_g2, tau.tau_powers_g2);
    assert_eq!(restored.sxi_g1, tau.sxi_g1);
    assert_eq!(restored.spsi_g1, tau.spsi_g1);
    assert_eq!(restored.psi_g2, tau.psi_g2);
    assert_eq!(
        restored.schema_id,
        libs::univariate_crs::UNIVARIATE_CRS_SCHEMA_ID
    );
}

#[test]
fn malformed_encodings_and_non_subgroup_points_are_rejected() {
    let g = source_g1(G1Affine::generator());
    let h = source_g2(G2Affine::generator());
    for flag in [0x20, 0x40, 0x80] {
        let mut bad = g.clone();
        bad[0] |= flag;
        assert!(decode_g1(&bad).is_err());
        let mut bad = h.clone();
        bad[0] |= flag;
        assert!(decode_g2(&bad).is_err());
    }
    assert!(decode_g1(&g[..95]).is_err());
    assert!(decode_g2(&h[..191]).is_err());
    assert!(decode_g1(&[0; 96]).is_err());
    assert!(decode_g2(&[0; 192]).is_err());
    let mut bad = g.clone();
    bad[..48].copy_from_slice(&Fq::MODULUS.to_bytes_be());
    assert!(decode_g1(&bad).is_err());
    let mut bad = h.clone();
    bad[48..96].copy_from_slice(&Fq::MODULUS.to_bytes_be());
    assert!(decode_g2(&bad).is_err());
    let off_curve = source_g1(G1Affine::new_unchecked(Fq::one(), Fq::one()));
    assert!(decode_g1(&off_curve).is_err());
    // y^2=x^3+4 at x=0,y=2 is on G1 but not in its prime-order subgroup.
    let torsion = G1Affine::new_unchecked(Fq::zero(), Fq::from(2u64));
    assert!(torsion.is_on_curve());
    assert!(!torsion.is_in_correct_subgroup_assuming_on_curve());
    assert!(decode_g1(&source_g1(torsion)).is_err());
    let torsion2 = (0u64..100)
        .find_map(|i| {
            let x = Fq2::from(i);
            let y = (x.square() * x + Fq2::new(Fq::from(4u64), Fq::from(4u64))).sqrt()?;
            let p = G2Affine::new_unchecked(x, y);
            (!p.is_in_correct_subgroup_assuming_on_curve()).then_some(p)
        })
        .unwrap();
    assert!(torsion2.is_on_curve());
    assert!(decode_g2(&source_g2(torsion2)).is_err());
}

#[test]
fn upstream_g2_generator_probe_has_the_expected_encoding() {
    // challenge_19 bytes 25769803744..25769803935, fetched on 2026-09-12.
    // A bounded real-source vector, not a claim of complete source verification.
    let bytes = hex::decode(concat!(
        "13e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e024",
        "aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb806",
        "06c4a02ea734cc32acd2b02bc28b99cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be0ce",
        "5d527727d6e118cc9cdc6da2e351aadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801"
    )).unwrap();
    assert_eq!(decode_g2(&bytes).unwrap(), G2Affine::generator());
    assert_eq!(source_g2(G2Affine::generator()), bytes);
}

#[test]
fn each_power_family_and_cross_group_tag_is_checked() {
    let raw = selected();
    for family in 0..5 {
        let mut bad = raw.clone();
        // A valid subgroup point with the wrong exponent/tag bypasses neither
        // the power checks nor the separate beta pairing.
        if family == 1 || family == 4 {
            let start = if family == 1 { 2 * 192 } else { 0 };
            bad[family][start..start + 192].copy_from_slice(&source_g2(
                (G2Affine::generator() * Fr::from(101u64)).into_affine(),
            ));
        } else {
            bad[family][2 * 96..3 * 96].copy_from_slice(&source_g1(
                (G1Affine::generator() * Fr::from(101u64)).into_affine(),
            ));
        }
        assert!(
            decode_and_verify(bad).is_err(),
            "accepted bad family {family}"
        );
    }
    let mut bad = raw.clone();
    bad[0].drain(..96);
    assert!(decode_and_verify(bad).is_err());
    let mut bad = raw;
    bad[0][..96].copy_from_slice(&source_g1(
        (G1Affine::generator() * Fr::from(3u64)).into_affine(),
    ));
    assert!(decode_and_verify(bad)
        .unwrap_err()
        .to_string()
        .contains("generator"));
}

#[test]
fn relation_check_includes_chunk_boundary() {
    let tau = Fr::from(7u64);
    let mut power = Fr::one();
    let mut points = Vec::new();
    for _ in 0..RELATION_CHUNK + 2 {
        points.push((G1Affine::generator() * power).into_affine());
        power *= tau;
    }
    let tau2 = (G2Affine::generator() * tau).into_affine();
    verify_g1_powers(&points, tau2).unwrap();
    points[RELATION_CHUNK] = G1Affine::generator();
    assert!(verify_g1_powers(&points, tau2).is_err());
}

#[test]
fn internal_preparation_authenticates_before_conversion_and_returns_only_tau() {
    let bytes = fixture(8);
    let hash = digest(&bytes);
    let header = hex::encode(&bytes[..64]);
    let pin = small_pin(&hash, &header);
    let p = required_capacity(&shape(1, 1), &pin).unwrap();
    assert_eq!(p, 5);
    let tau = prepare_stream(Cursor::new(&bytes), p, &pin).unwrap();
    assert_eq!(tau.s0_g1.len(), 2 * p + 1);
    assert_eq!(tau.sxi_g1.len(), p + 1);
    assert_eq!(tau.spsi_g1.len(), p + 1);
    assert_eq!(tau.tau_powers_g2.len(), p + 1);
    let payload = archive::to_bytes::<archive::rancor::Error>(&tau).unwrap();
    let repeated = prepare_stream(Cursor::new(&bytes), p, &pin).unwrap();
    assert_eq!(
        payload.as_ref(),
        archive::to_bytes::<archive::rancor::Error>(&repeated)
            .unwrap()
            .as_ref()
    );
    // A malformed point must first fail source authentication, not reach the
    // decoder. A valid earlier preparation does not bypass this second read.
    let mut bad = bytes.clone();
    bad[64] |= 0xe0;
    assert!(prepare_stream(Cursor::new(&bad), p, &pin)
        .unwrap_err()
        .to_string()
        .contains("BLAKE2b"));
    let bad_hash = digest(&bad);
    assert!(
        prepare_stream(Cursor::new(&bad), p, &small_pin(&bad_hash, &header))
            .unwrap_err()
            .to_string()
            .contains("flags")
    );
    assert!(prepare_stream(Cursor::new(&bytes[..20]), p, &pin).is_err());
    assert!(prepare_stream(Cursor::new(payload.as_ref()), p, &pin).is_err());
}

fn shape(n: usize, free_public_len: usize) -> UnivariateCrsShape {
    use libs::frontend_artifacts::normalized_library::NormalizedSetupParams;
    UnivariateCrsShape::from_normalized_setup(
        &NormalizedSetupParams {
            n,
            m: 1,
            m_b: 1,
            t: 2,
            s: 1,
            public_wire_phases: Box::new([]),
        },
        free_public_len,
    )
    .unwrap()
}

#[test]
fn capacity_is_derived_from_the_admitted_normalized_shape() {
    for (n, expected) in [(1, 5), (2, 7), (4, 11)] {
        assert_eq!(
            required_capacity(&shape(n, 1), &FILECOIN).unwrap(),
            expected
        );
    }
    assert_eq!(required_capacity(&shape(1, 16), &FILECOIN).unwrap(), 15);
    let pin = small_pin("", "");
    assert!(required_capacity(&shape(1, 16), &pin).is_err());
}

#[test]
fn production_sources_reject_invalid_inputs_without_output_or_network() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("synthetic-challenge");
    fs::write(&source, fixture(8)).unwrap();
    assert!(prepare_local(&source, &shape(1, 1))
        .unwrap_err()
        .to_string()
        .contains("byte length"));
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
}
