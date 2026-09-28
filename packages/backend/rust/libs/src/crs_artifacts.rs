//! Atomic publication of the current four-file univariate CRS generation.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub const TAU_SEQUENCE_RKYV_FILE_NAME: &str = "tau_sequence.rkyv";
pub const PROVER_KEYS_RKYV_FILE_NAME: &str = "prover_keys.rkyv";
pub const PREPROCESS_KEYS_RKYV_FILE_NAME: &str = "preprocess_keys.rkyv";
pub const VERIFIER_KEYS_RKYV_FILE_NAME: &str = "verifier_keys.rkyv";

/// A complete but inactive CRS generation. Calling `activate` atomically
/// switches the active symlink and immediately removes its former target.
pub struct StagedUnivariateCrs {
    active_output: PathBuf,
    generations_directory: PathBuf,
    staging_directory: Option<PathBuf>,
}

impl StagedUnivariateCrs {
    pub fn staging_directory(&self) -> io::Result<&Path> {
        self.staging_directory.as_deref().ok_or_else(|| {
            io::Error::other("univariate CRS staging directory is no longer available")
        })
    }

    pub fn write_provenance(&self, provenance: &[u8]) -> io::Result<()> {
        fs::write(
            self.staging_directory()?.join("crs_provenance.json"),
            provenance,
        )
    }

    pub fn activate(mut self) -> io::Result<()> {
        let staged = self.staging_directory()?.to_path_buf();
        let former = fs::read_link(&self.active_output).ok();
        let temporary_link = self
            .active_output
            .with_extension(format!("next-{}", std::process::id()));
        if temporary_link.exists() {
            fs::remove_file(&temporary_link)?;
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(&staged, &temporary_link)?;
        #[cfg(not(unix))]
        return Err(io::Error::other(
            "atomic CRS activation requires symlink support",
        ));
        fs::rename(&temporary_link, &self.active_output)?;
        self.staging_directory = None;
        if let Some(former) = former {
            let former = if former.is_absolute() {
                former
            } else {
                self.active_output
                    .parent()
                    .unwrap_or_else(|| Path::new("."))
                    .join(former)
            };
            if former.starts_with(&self.generations_directory) && former != staged {
                fs::remove_dir_all(former)?;
            }
        }
        Ok(())
    }
}

impl Drop for StagedUnivariateCrs {
    fn drop(&mut self) {
        if let Some(staged) = &self.staging_directory {
            let _ = fs::remove_dir_all(staged);
        }
    }
}

pub(crate) fn create_univariate_stage(active_output: &Path) -> io::Result<StagedUnivariateCrs> {
    // Activation atomically replaces an active symlink.  Never let that rename
    // replace a caller-owned regular file or directory at the requested output
    // path: setup must fail before it creates a staged generation in that case.
    if let Ok(metadata) = fs::symlink_metadata(active_output) {
        if !metadata.file_type().is_symlink() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                format!(
                    "CRS output path is occupied by a non-symlink: {}",
                    active_output.display()
                ),
            ));
        }
    }
    let parent = active_output
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let generations_directory = parent.join("generations");
    fs::create_dir_all(&generations_directory)?;
    static NEXT_GENERATION: AtomicU64 = AtomicU64::new(0);
    let staged = generations_directory.join(format!(
        ".staging-{}-{}",
        std::process::id(),
        NEXT_GENERATION.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir(&staged)?;
    Ok(StagedUnivariateCrs {
        active_output: active_output.to_path_buf(),
        generations_directory,
        staging_directory: Some(staged),
    })
}
