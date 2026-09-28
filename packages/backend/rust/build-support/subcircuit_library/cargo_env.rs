use super::backend_build_metadata_contract::{metadata_file_name, BackendBuildMetadata};
use super::{ResolvedSubcircuitLibrary, PACKAGE_NAME};
use std::fs;
use std::io;

pub(crate) fn emit_build_metadata(
    snapshot: &ResolvedSubcircuitLibrary,
    current_package_name: &str,
    current_package_version: &str,
    compatible_backend_version: &str,
) -> io::Result<()> {
    let metadata = BackendBuildMetadata::new(
        current_package_name,
        current_package_version,
        compatible_backend_version,
        &snapshot.version,
        &snapshot.source_digest,
    )
    .map_err(io::Error::other)?;
    fs::write(
        snapshot
            .release_dir
            .join(metadata_file_name(current_package_name).map_err(io::Error::other)?),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&metadata).map_err(io::Error::other)?
        ),
    )
}

pub(crate) fn emit_subcircuit_library_build_env(
    version: &str,
    source_digest: &str,
    compatible_backend_version: &str,
) {
    println!(
        "cargo:rustc-env=TOKAMAK_ZKEVM_COMPATIBLE_BACKEND_VERSION={compatible_backend_version}"
    );
    println!("cargo:rustc-env=TOKAMAK_ZKEVM_SUBCIRCUIT_LIBRARY_PACKAGE_NAME={PACKAGE_NAME}");
    println!("cargo:rustc-env=TOKAMAK_ZKEVM_SUBCIRCUIT_LIBRARY_PACKAGE_VERSION={version}");
    println!("cargo:rustc-env=TOKAMAK_ZKEVM_SUBCIRCUIT_LIBRARY_SOURCE_DIGEST={source_digest}");
}
