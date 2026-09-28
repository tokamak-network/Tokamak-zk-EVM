use super::{
    acquire_lock, fetch_and_unpack_snapshot, integrity, npm_view_exact, release_dir_from_out_dir,
    try_read_snapshot, write_snapshot_info, ResolvedSubcircuitLibrary, SNAPSHOT_LIBRARY_DIR,
    SNAPSHOT_ROOT_DIR,
};
use std::env;
use std::fs;
use std::io;

pub(crate) fn prepare_release_subcircuit_library(
    package_version: &str,
) -> io::Result<Option<ResolvedSubcircuitLibrary>> {
    if env::var("PROFILE").ok().as_deref() != Some("release") {
        return Ok(None);
    }

    let release_dir = release_dir_from_out_dir()?;
    let snapshot_root = release_dir.join(SNAPSHOT_ROOT_DIR);
    fs::create_dir_all(&snapshot_root)?;
    let _guard = acquire_lock(&snapshot_root.join(".lock"))?;
    let info_path = snapshot_root.join(super::SNAPSHOT_INFO_FILE);
    let npm_view = npm_view_exact(package_version)?;

    if let Some(existing) = try_read_snapshot(&info_path, &release_dir, &npm_view)? {
        return Ok(Some(existing));
    }

    let unpack_root = snapshot_root.join(format!(
        "{}-{}",
        integrity::sanitize(&npm_view.version),
        integrity::short_hash(&npm_view.integrity)
    ));
    let snapshot_dir = unpack_root.join(SNAPSHOT_LIBRARY_DIR);
    let constants_path = integrity::constants_path_for_library_dir(&snapshot_dir)?;
    if !constants_path.exists() || !snapshot_dir.exists() {
        fetch_and_unpack_snapshot(&snapshot_root, &unpack_root, &npm_view.version)?;
    }

    let snapshot = ResolvedSubcircuitLibrary {
        version: npm_view.version,
        integrity: npm_view.integrity,
        source_digest: integrity::digest_subcircuit_source(&constants_path, &snapshot_dir)?,
        snapshot_dir,
        release_dir,
    };
    write_snapshot_info(&info_path, &snapshot)?;
    Ok(Some(snapshot))
}
