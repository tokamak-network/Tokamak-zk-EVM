use super::{
    subcircuit_source_digest, version_contract, DIGEST_LIBRARY_DIRECTORIES, DIGEST_LIBRARY_FILES,
};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub(crate) fn strict_major_minor(value: &str, label: &str) -> io::Result<String> {
    version_contract::parse_compatible_backend_version(value)
        .map(|version| version.to_string())
        .map_err(|error| io::Error::other(format!("{label} {error}")))
}

pub(crate) fn package_major_minor(value: &str, label: &str) -> io::Result<String> {
    version_contract::compatibility_from_package_version(value)
        .map(|version| version.to_string())
        .map_err(|error| io::Error::other(format!("{label} {error}")))
}

pub(crate) fn validate_release_mpc_library_compatibility(
    library_version: &str,
    compatible_backend_version: &str,
) -> io::Result<()> {
    let library_compatible_version =
        package_major_minor(library_version, "npm subcircuit-library package version")?;
    if library_compatible_version != compatible_backend_version {
        return Err(io::Error::other(format!(
            "release MPC setup requires npm subcircuit-library compatibility class {compatible_backend_version}, but resolved {library_version} (class {library_compatible_version})"
        )));
    }
    Ok(())
}

pub(crate) fn digest_subcircuit_source(
    constants_path: &Path,
    library_dir: &Path,
) -> io::Result<String> {
    let mut files = Vec::new();
    push_digest_input(
        &mut files,
        "subcircuits/circom/constants.circom",
        constants_path.to_path_buf(),
    )?;
    for file in DIGEST_LIBRARY_FILES {
        push_digest_input(
            &mut files,
            format!("subcircuits/library/{file}"),
            library_dir.join(file),
        )?;
    }
    for directory in DIGEST_LIBRARY_DIRECTORIES {
        collect_digest_directory(
            &mut files,
            &format!("subcircuits/library/{directory}"),
            &library_dir.join(directory),
        )?;
    }
    let entries = files
        .into_iter()
        .map(|(logical_path, absolute_path)| {
            fs::read(absolute_path).map(|content| (logical_path, content))
        })
        .collect::<io::Result<Vec<_>>>()?;
    subcircuit_source_digest::digest_subcircuit_source_entries(
        entries
            .iter()
            .map(|(logical_path, content)| (logical_path.as_str(), content.as_slice())),
    )
    .map_err(io::Error::other)
}

pub(crate) fn constants_path_for_library_dir(library_dir: &Path) -> io::Result<PathBuf> {
    Ok(library_dir
        .parent()
        .ok_or_else(|| {
            io::Error::other(format!(
                "cannot derive snapshot root from {}",
                library_dir.display()
            ))
        })?
        .join(super::SNAPSHOT_CIRCOM_DIR)
        .join(super::SNAPSHOT_CONSTANTS_FILE))
}

pub(crate) fn sanitize(input: &str) -> String {
    input
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

pub(crate) fn short_hash(input: &str) -> String {
    let mut out = String::new();
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        }
        if out.len() == 12 {
            break;
        }
    }
    if out.is_empty() {
        "snapshot".to_string()
    } else {
        out
    }
}

fn push_digest_input(
    files: &mut Vec<(String, PathBuf)>,
    logical_path: impl Into<String>,
    absolute_path: PathBuf,
) -> io::Result<()> {
    if !absolute_path.is_file() {
        return Err(io::Error::other(format!(
            "subcircuit source digest input is missing: {}",
            absolute_path.display()
        )));
    }
    files.push((logical_path.into(), absolute_path));
    Ok(())
}

fn collect_digest_directory(
    files: &mut Vec<(String, PathBuf)>,
    logical_prefix: &str,
    directory: &Path,
) -> io::Result<()> {
    if !directory.is_dir() {
        return Err(io::Error::other(format!(
            "subcircuit source digest directory is missing: {}",
            directory.display()
        )));
    }
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            return Err(io::Error::other(format!(
                "subcircuit source digest directory contains unexpected non-file entry: {}",
                path.display()
            )));
        }
        let name = entry.file_name();
        let name = name.to_str().ok_or_else(|| {
            io::Error::other(format!(
                "subcircuit source digest input has non-UTF-8 file name: {}",
                path.display()
            ))
        })?;
        push_digest_input(files, format!("{logical_prefix}/{name}"), path)?;
    }
    Ok(())
}
