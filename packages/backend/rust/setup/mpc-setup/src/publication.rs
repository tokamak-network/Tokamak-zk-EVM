//! Finalize verified CRS generations and upload already completed artifacts.
use libs::crs_provenance::{parse_crs_provenance, CrsProvenance, CRS_PROVENANCE_FILE_NAME};
use libs::crs_publication_admission::admit_final_crs_publication;
use libs::univariate_setup::{stage_artifacts, SetupCrs};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::Path,
};

pub(crate) struct Payload {
    pub name: String,
    pub file: File,
    pub size: u64,
    pub digest: String,
}

pub(crate) struct Snapshot {
    pub provenance: CrsProvenance,
    pub payloads: Vec<Payload>,
}

/// Called only after the participant-local source and complete chain are verified.
/// Reproject on retries and compare actual keys before reusing provenance bytes.
pub(crate) fn finalize(
    output: &Path,
    crs: &SetupCrs,
    mut provenance: CrsProvenance,
    release_eligible: bool,
) -> Result<(), String> {
    let (stage, digests) = stage_artifacts(output, crs).map_err(|e| e.to_string())?;
    provenance.artifacts = [
        ("tau_sequence.rkyv".into(), digests.tau_sequence_sha256),
        ("prover_keys.rkyv".into(), digests.prover_keys_sha256),
        (
            "preprocess_keys.rkyv".into(),
            digests.preprocess_keys_sha256,
        ),
        ("verifier_keys.rkyv".into(), digests.verifier_keys_sha256),
    ]
    .into();
    let path = stage.staging_directory().map_err(|e| e.to_string())?;
    let exists = match fs::symlink_metadata(output) {
        Ok(_) => true,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
        Err(e) => return Err(e.to_string()),
    };
    let bytes = if release_eligible && exists {
        let bytes = fs::read(output.join(CRS_PROVENANCE_FILE_NAME)).map_err(|e| e.to_string())?;
        let old = admit_final_crs_publication(output)?;
        // Everything except the originally generated timestamp must match the
        // freshly verified and projected ceremony result.
        provenance.generated_at_utc = old.generated_at_utc.clone();
        if old != provenance || parse_crs_provenance(&bytes)? != old {
            return Err(
                "existing local CRS differs from the verified publication; use a new output path"
                    .into(),
            );
        }
        bytes
    } else {
        serde_json::to_vec_pretty(&provenance).map_err(|e| e.to_string())?
    };
    parse_crs_provenance(&bytes)?;
    fs::write(path.join(CRS_PROVENANCE_FILE_NAME), &bytes).map_err(|e| e.to_string())?;
    if release_eligible {
        admit_final_crs_publication(path)?;
    }
    stage.activate().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Clone, Debug)]
pub(crate) struct Entry {
    pub id: String,
    pub name: String,
    pub folder: bool,
    pub size: u64,
    pub digest: Option<String>,
}

/// Small transport boundary for the real Drive client and deterministic failure tests.
pub(crate) trait Drive {
    fn children(&mut self, parent: &str) -> Result<Vec<Entry>, String>;
    fn folder(&mut self, parent: &str, name: &str) -> Result<Entry, String>;
    fn upload(&mut self, parent: &str, name: &str, payload: &mut Payload) -> Result<Entry, String>;
    fn verify_file(&mut self, entry: &Entry, payload: &Payload) -> Result<(), String>;
    fn public_read(&mut self, entry: &Entry) -> Result<(), String>;
    fn rename(&mut self, entry: &Entry, name: &str) -> Result<Entry, String>;
}

fn named(entries: &[Entry], name: &str, folder: bool) -> Result<Option<Entry>, String> {
    let found: Vec<_> = entries.iter().filter(|e| e.name == name).collect();
    if found.len() > 1 {
        return Err(format!("duplicate Drive entry: {name}"));
    }
    match found.first() {
        Some(e) if e.folder != folder => Err(format!("wrong Drive entry type: {name}")),
        Some(e) => Ok(Some((*e).clone())),
        None => Ok(None),
    }
}

pub(crate) fn read_finalized_snapshot(directory: &Path) -> Result<Snapshot, String> {
    // Resolve the active CRS link once so all opened files come from one
    // immutable generation, even if the active link changes during upload.
    let directory = fs::canonicalize(directory).map_err(|e| e.to_string())?;
    let provenance_bytes =
        fs::read(directory.join(CRS_PROVENANCE_FILE_NAME)).map_err(|e| e.to_string())?;
    let provenance = parse_crs_provenance(&provenance_bytes)?;
    let mut payloads = Vec::new();
    for (name, digest) in &provenance.artifacts {
        let file = File::open(directory.join(name)).map_err(|e| format!("{name}: {e}"))?;
        payloads.push(Payload {
            name: name.clone(),
            size: file.metadata().map_err(|e| e.to_string())?.len(),
            file,
            digest: digest.clone(),
        });
    }
    let file = File::open(directory.join(CRS_PROVENANCE_FILE_NAME)).map_err(|e| e.to_string())?;
    payloads.push(Payload {
        name: CRS_PROVENANCE_FILE_NAME.into(),
        size: file.metadata().map_err(|e| e.to_string())?.len(),
        file,
        digest: format!("{:x}", Sha256::digest(&provenance_bytes)),
    });
    Ok(Snapshot {
        provenance,
        payloads,
    })
}

pub(crate) fn upload(
    drive: &mut impl Drive,
    root: &str,
    snapshot: &mut Snapshot,
) -> Result<String, String> {
    validate_snapshot(snapshot)?;
    let version = snapshot.provenance.compatible_backend_version.clone();
    let listing = drive.children(root)?;
    let complete = named(&listing, &version, true)?;
    let tau_folder = match named(&listing, "tau_sequence", true)? {
        Some(e) => e,
        None if complete.is_none() => drive.folder(root, "tau_sequence")?,
        None => return Err("published version references a missing tau folder".into()),
    };
    // The reader must be able to list this shared folder, not only fetch its file.
    drive.public_read(&tau_folder)?;
    let tau = snapshot
        .payloads
        .iter_mut()
        .find(|p| p.name == "tau_sequence.rkyv")
        .ok_or("missing tau payload")?;
    let tau_name = format!("{}.rkyv", tau.digest);
    ensure_file(drive, &tau_folder.id, &tau_name, tau, complete.is_some())?;

    let staging_name = format!(
        ".tokamak-{}-{}",
        version,
        snapshot
            .provenance
            .ceremony_transcript_sha256
            .as_deref()
            .ok_or("missing transcript digest")?
    );
    let staging = named(&listing, &staging_name, true)?;
    let folder = match (&complete, staging) {
        (Some(e), _) => e.clone(),
        (None, Some(e)) => e,
        (None, None) => drive.folder(root, &staging_name)?,
    };
    let result = (|| {
        let existing = drive.children(&folder.id)?;
        if existing.iter().any(|e| {
            !snapshot.payloads.iter().any(|p| {
                p.name != "tau_sequence.rkyv"
                    && (p.name == e.name
                        || (complete.is_none()
                            && e.name == format!(".upload-{}-{}", p.name, p.digest)))
            })
        }) {
            return Err("version folder contains unexpected entries".into());
        }
        for payload in snapshot
            .payloads
            .iter_mut()
            .filter(|p| p.name != "tau_sequence.rkyv")
        {
            let name = payload.name.clone();
            ensure_file(drive, &folder.id, &name, payload, complete.is_some())?;
        }
        drive.public_read(&folder)?;
        if complete.is_none() {
            if named(&drive.children(root)?, &version, true)?.is_some() {
                return Err("another publisher created this version; refusing activation".into());
            }
            drive.rename(&folder, &version)?;
        }
        let visible =
            named(&drive.children(root)?, &version, true)?.ok_or("published folder not visible")?;
        if visible.id != folder.id {
            return Err("published folder identity changed".into());
        }
        for entry in drive.children(&folder.id)? {
            println!(
                "[mpc] published {}: https://drive.google.com/file/d/{}/view",
                entry.name, entry.id
            );
        }
        let tau_entry = named(&drive.children(&tau_folder.id)?, &tau_name, false)?
            .ok_or("published tau not visible")?;
        println!(
            "[mpc] published tau_sequence.rkyv: https://drive.google.com/file/d/{}/view",
            tau_entry.id
        );
        Ok(format!(
            "https://drive.google.com/drive/folders/{}",
            folder.id
        ))
    })();
    result.map_err(|e: String| {
        format!(
            "publication folder {} ({}): {e}; local CRS preserved",
            folder.name, folder.id
        )
    })
}

fn ensure_file(
    drive: &mut impl Drive,
    parent: &str,
    name: &str,
    payload: &mut Payload,
    complete: bool,
) -> Result<(), String> {
    let entry = match named(&drive.children(parent)?, name, false)? {
        Some(e) => e,
        None if !complete => drive.upload(parent, name, payload)?,
        None => return Err(format!("published release is missing {name}")),
    };
    drive.verify_file(&entry, payload)?;
    drive.public_read(&entry)?;
    Ok(())
}

fn validate_snapshot(snapshot: &mut Snapshot) -> Result<(), String> {
    use libs::crs_provenance::Phase1SourceProvenance;
    libs::crs_publication_admission::validate_publication_metadata(&snapshot.provenance)?;
    let Some(Phase1SourceProvenance::Filecoin(source)) =
        &snapshot.provenance.phase1_source_provenance
    else {
        return Err("publication requires Filecoin source evidence".into());
    };
    if source.source_url != crate::filecoin_source::SOURCE_URL
        || source.source_blake2b512 != crate::filecoin_source::SOURCE_DIGEST
    {
        return Err("publication Filecoin pin mismatch".into());
    }
    let expected: std::collections::BTreeSet<_> = snapshot
        .provenance
        .artifacts
        .keys()
        .map(String::as_str)
        .chain([CRS_PROVENANCE_FILE_NAME])
        .collect();
    let actual: std::collections::BTreeSet<_> =
        snapshot.payloads.iter().map(|p| p.name.as_str()).collect();
    if expected != actual || actual.len() != snapshot.payloads.len() {
        return Err("publication payload set mismatch".into());
    }
    for payload in &mut snapshot.payloads {
        if payload.size == 0
            || payload.file.metadata().map_err(|e| e.to_string())?.len() != payload.size
        {
            return Err("publication local file size changed".into());
        }
        if payload.name == CRS_PROVENANCE_FILE_NAME {
            if payload.size > 1024 * 1024 {
                return Err("publication provenance too large".into());
            }
            let mut bytes = Vec::new();
            payload
                .file
                .seek(SeekFrom::Start(0))
                .map_err(|e| e.to_string())?;
            payload
                .file
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            if parse_crs_provenance(&bytes)? != snapshot.provenance {
                return Err("publication provenance bytes differ".into());
            }
        } else if snapshot.provenance.artifacts.get(&payload.name) != Some(&payload.digest) {
            return Err("publication payload digest identity mismatch".into());
        }
        payload
            .file
            .seek(SeekFrom::Start(0))
            .map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut buffer = vec![0u8; 1024 * 1024];
        loop {
            let n = payload.file.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            hash.update(&buffer[..n]);
        }
        if format!("{:x}", hash.finalize()) != payload.digest {
            return Err("publication local hash mismatch".into());
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "publication_tests.rs"]
pub(crate) mod tests;
