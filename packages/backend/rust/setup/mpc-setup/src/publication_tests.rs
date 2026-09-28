use super::*;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
struct FakeDrive {
    entries: BTreeMap<String, (String, Entry, Vec<u8>)>,
    public: BTreeSet<String>,
    writes: usize,
    fail_at: Option<usize>,
    permission_failure: bool,
    corrupt_upload: bool,
    lose_activation_response: bool,
}
impl FakeDrive {
    fn add(&mut self, parent: &str, name: &str, folder: bool, bytes: Vec<u8>) -> Entry {
        let id = format!("id{}", self.entries.len());
        let e = Entry {
            id: id.clone(),
            name: name.into(),
            folder,
            size: bytes.len() as u64,
            digest: (!folder).then(|| format!("{:x}", Sha256::digest(&bytes))),
        };
        self.entries.insert(id, (parent.into(), e.clone(), bytes));
        e
    }
    fn write(&mut self) -> Result<(), String> {
        self.writes += 1;
        if self.fail_at == Some(self.writes) {
            return Err("injected interruption".into());
        }
        Ok(())
    }
}
impl Drive for FakeDrive {
    fn children(&mut self, parent: &str) -> Result<Vec<Entry>, String> {
        Ok(self
            .entries
            .values()
            .filter(|(p, _, _)| p == parent)
            .map(|(_, e, _)| e.clone())
            .collect())
    }
    fn folder(&mut self, parent: &str, name: &str) -> Result<Entry, String> {
        self.write()?;
        Ok(self.add(parent, name, true, vec![]))
    }
    fn upload(&mut self, parent: &str, name: &str, payload: &mut Payload) -> Result<Entry, String> {
        self.write()?;
        payload.file.seek(SeekFrom::Start(0)).unwrap();
        let mut bytes = Vec::new();
        payload.file.read_to_end(&mut bytes).unwrap();
        if self.corrupt_upload {
            bytes[0] ^= 1;
        }
        Ok(self.add(parent, name, false, bytes))
    }
    fn verify_file(&mut self, entry: &Entry, payload: &Payload) -> Result<(), String> {
        let (_, e, bytes) = &self.entries[&entry.id];
        if e.size != payload.size || format!("{:x}", Sha256::digest(bytes)) != payload.digest {
            return Err("fake Drive checksum mismatch".into());
        }
        Ok(())
    }
    fn public_read(&mut self, entry: &Entry) -> Result<(), String> {
        if self.permission_failure {
            return Err("fake permission denial".into());
        }
        if !self.public.contains(&entry.id) {
            self.write()?;
            self.public.insert(entry.id.clone());
        }
        Ok(())
    }
    fn rename(&mut self, entry: &Entry, name: &str) -> Result<Entry, String> {
        self.write()?;
        let e = &mut self.entries.get_mut(&entry.id).unwrap().1;
        e.name = name.into();
        if self.lose_activation_response {
            self.lose_activation_response = false;
            return Err("lost activation response".into());
        }
        Ok(e.clone())
    }
}

fn metadata() -> CrsProvenance {
    let mut p: CrsProvenance = serde_json::from_str(include_str!(
        "../../../../common/contracts/fixtures/final-mpc-crs-provenance.json"
    ))
    .unwrap();
    p.phase1_source_provenance = Some(libs::crs_provenance::Phase1SourceProvenance::Filecoin(
        libs::crs_provenance::FilecoinSourceProvenance {
            source_url: crate::filecoin_source::SOURCE_URL.into(),
            source_blake2b512: crate::filecoin_source::SOURCE_DIGEST.into(),
        },
    ));
    p
}
fn snapshot() -> Snapshot {
    let mut p = metadata();
    let mut payloads = Vec::new();
    for (name, digest) in &mut p.artifacts {
        let bytes = name.as_bytes();
        *digest = format!("{:x}", Sha256::digest(bytes));
        let mut file = tempfile::tempfile().unwrap();
        std::io::Write::write_all(&mut file, bytes).unwrap();
        payloads.push(Payload {
            name: name.clone(),
            file,
            size: bytes.len() as u64,
            digest: digest.clone(),
        });
    }
    let bytes = serde_json::to_vec_pretty(&p).unwrap();
    let mut file = tempfile::tempfile().unwrap();
    std::io::Write::write_all(&mut file, &bytes).unwrap();
    payloads.push(Payload {
        name: CRS_PROVENANCE_FILE_NAME.into(),
        file,
        size: bytes.len() as u64,
        digest: format!("{:x}", Sha256::digest(&bytes)),
    });
    Snapshot {
        provenance: p,
        payloads,
    }
}

#[test]
fn publishes_exact_consumer_layout_and_identical_provenance_then_noops() {
    let mut snapshot = snapshot();
    let mut drive = FakeDrive::default();
    let url = upload(&mut drive, "root", &mut snapshot).unwrap();
    assert!(url.starts_with("https://drive.google.com/drive/folders/"));
    let root = drive.children("root").unwrap();
    let version = named(&root, "2.1", true).unwrap().unwrap();
    let tau = named(&root, "tau_sequence", true).unwrap().unwrap();
    assert_eq!(root.len(), 2);
    let files = drive.children(&version.id).unwrap();
    assert_eq!(files.len(), 4);
    for name in [
        "prover_keys.rkyv",
        "preprocess_keys.rkyv",
        "verifier_keys.rkyv",
        CRS_PROVENANCE_FILE_NAME,
    ] {
        assert!(named(&files, name, false).unwrap().is_some());
    }
    assert_eq!(
        drive.children(&tau.id).unwrap()[0].name,
        format!(
            "{}.rkyv",
            snapshot.provenance.artifacts["tau_sequence.rkyv"]
        )
    );
    let provenance = named(&files, CRS_PROVENANCE_FILE_NAME, false)
        .unwrap()
        .unwrap();
    assert_eq!(
        drive.entries[&provenance.id].2,
        serde_json::to_vec_pretty(&snapshot.provenance).unwrap()
    );
    assert_eq!(drive.public.len(), drive.entries.len());
    let writes = drive.writes;
    upload(&mut drive, "root", &mut snapshot).unwrap();
    assert_eq!(drive.writes, writes);
}

#[test]
fn interrupted_transfers_are_not_visible_as_releases_and_retry_keeps_bytes() {
    let mut successful = FakeDrive::default();
    upload(&mut successful, "root", &mut snapshot()).unwrap();
    for failure in 1..=successful.writes {
        let mut drive = FakeDrive {
            fail_at: Some(failure),
            ..Default::default()
        };
        let mut snapshot = snapshot();
        let before = serde_json::to_vec(&snapshot.provenance).unwrap();
        assert!(upload(&mut drive, "root", &mut snapshot).is_err());
        assert!(named(&drive.children("root").unwrap(), "2.1", true)
            .unwrap()
            .is_none());
        drive.fail_at = None;
        upload(&mut drive, "root", &mut snapshot).unwrap();
        assert_eq!(before, serde_json::to_vec(&snapshot.provenance).unwrap());
    }
}

#[test]
fn uncertain_activation_is_reconciled_without_duplicate_release() {
    let mut drive = FakeDrive {
        lose_activation_response: true,
        ..Default::default()
    };
    let mut snapshot = snapshot();
    assert!(upload(&mut drive, "root", &mut snapshot).is_err());
    let count = drive.entries.len();
    upload(&mut drive, "root", &mut snapshot).unwrap();
    assert_eq!(drive.entries.len(), count);
}

#[test]
fn corruption_permissions_and_duplicate_versions_fail_closed() {
    for permission_failure in [false, true] {
        let mut drive = FakeDrive {
            permission_failure,
            corrupt_upload: !permission_failure,
            ..Default::default()
        };
        assert!(upload(&mut drive, "root", &mut snapshot()).is_err());
        assert!(named(&drive.children("root").unwrap(), "2.1", true)
            .unwrap()
            .is_none());
    }
    let mut drive = FakeDrive::default();
    drive.add("root", "2.1", true, vec![]);
    drive.add("root", "2.1", true, vec![]);
    assert!(upload(&mut drive, "root", &mut snapshot())
        .unwrap_err()
        .contains("duplicate"));
    assert_eq!(drive.writes, 0);
}

#[test]
fn shared_tau_and_published_payload_conflicts_are_not_overwritten() {
    let mut snapshot = snapshot();
    let mut drive = FakeDrive::default();
    upload(&mut drive, "root", &mut snapshot).unwrap();
    for name in [
        "verifier_keys.rkyv",
        &format!(
            "{}.rkyv",
            snapshot.provenance.artifacts["tau_sequence.rkyv"]
        ),
    ] {
        let mut changed = drive.entries.clone();
        let (_, _, bytes) = changed
            .values_mut()
            .find(|(_, e, _)| e.name == name)
            .unwrap();
        bytes[0] ^= 1;
        let mut bad = FakeDrive {
            entries: changed,
            public: drive.public.clone(),
            ..Default::default()
        };
        assert!(upload(&mut bad, "root", &mut snapshot).is_err());
        assert_eq!(bad.writes, 0);
    }
}

#[test]
fn invalid_local_inputs_never_call_drive() {
    for case in 0..11 {
        let mut s = snapshot();
        let mut drive = FakeDrive::default();
        match case {
            0 => s.provenance.release_eligible = false,
            1 => {
                s.provenance.generation_method =
                    libs::crs_provenance::CrsGenerationMethod::TrustedSetup
            }
            2 => {
                s.provenance.subcircuit_library.origin =
                    libs::input_origin::SubcircuitLibraryOrigin::LocalQapCompiler
            }
            3 => s.provenance.subcircuit_library.package_version = "9.0.0".into(),
            4 => s.provenance.phase1_source_provenance = None,
            5 => {
                s.payloads.pop();
            }
            6 => {
                s.payloads[0].file.set_len(1).unwrap();
            }
            7 => s.provenance.ceremony_transcript_sha256 = None,
            8 => {
                let Some(libs::crs_provenance::Phase1SourceProvenance::Filecoin(source)) =
                    &mut s.provenance.phase1_source_provenance
                else {
                    unreachable!()
                };
                source.source_blake2b512 = "00".repeat(64);
            }
            9 => {
                s.payloads[0].file.seek(SeekFrom::Start(0)).unwrap();
                std::io::Write::write_all(&mut s.payloads[0].file, b"!").unwrap();
            }
            _ => s.payloads[0].digest = "00".repeat(32),
        }
        assert!(upload(&mut drive, "root", &mut s).is_err());
        assert_eq!(drive.writes, 0);
        assert!(drive.entries.is_empty());
    }
}

// Called with an actual synthetic CRS from the two-contribution algebra test.
pub(crate) fn check_local_retry(crs: &SetupCrs) {
    let dir = tempfile::tempdir().unwrap();
    let output = dir.path().join("crs");
    finalize(&output, crs, metadata(), true).unwrap();
    let mut first = read_finalized_snapshot(&output).unwrap();
    let before = fs::read(output.join(CRS_PROVENANCE_FILE_NAME)).unwrap();
    let mut fresh = metadata();
    fresh.generated_at_utc = "2026-09-13T12:00:00Z".into();
    finalize(&output, crs, fresh, true).unwrap();
    let retry = read_finalized_snapshot(&output).unwrap();
    assert_eq!(
        before,
        fs::read(output.join(CRS_PROVENANCE_FILE_NAME)).unwrap()
    );
    assert_eq!(first.provenance, retry.provenance);
    // The first generation was unlinked by activation; its handles still read
    // the original bytes and do not follow the newly activated symlink.
    validate_snapshot(&mut first).unwrap();
    let mut bad = metadata();
    bad.ceremony_transcript_sha256 = Some("a".repeat(64));
    assert!(finalize(&output, crs, bad, true).is_err());
    assert_eq!(
        before,
        fs::read(output.join(CRS_PROVENANCE_FILE_NAME)).unwrap()
    );
    fs::write(output.join("verifier_keys.rkyv"), b"tampered").unwrap();
    assert!(finalize(&output, crs, metadata(), true).is_err());
}
