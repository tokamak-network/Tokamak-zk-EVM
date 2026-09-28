#![allow(dead_code)]

#[path = "../../common/contracts/rust/backend_build_metadata.rs"]
mod backend_build_metadata_contract;
#[path = "subcircuit_library/cargo_env.rs"]
mod cargo_env;
#[path = "subcircuit_library/generated.rs"]
mod generated;
#[path = "../../common/contracts/rust/input_origin.rs"]
mod input_origin_contract;
#[path = "subcircuit_library/integrity.rs"]
mod integrity;
#[path = "subcircuit_library/npm_snapshot.rs"]
mod npm_snapshot;
#[path = "subcircuit_library/source_selection.rs"]
mod source_selection;
#[path = "../../common/contracts/rust/subcircuit_source_digest.rs"]
mod subcircuit_source_digest;
#[path = "subcircuit_library/types.rs"]
mod types;
#[path = "../../../../versioning/compatibility.rs"]
mod version_contract;

use serde_json::Value;
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread::sleep;
use std::time::Duration;

const PACKAGE_NAME: &str = "@tokamak-zk-evm/subcircuit-library";
const RUNTIME_MODE: &str = "bundled";
const SNAPSHOT_ROOT_DIR: &str = "embedded-subcircuit-library";
const SNAPSHOT_INFO_FILE: &str = "resolved.json";
const SNAPSHOT_CIRCOM_DIR: &str = "circom";
const SNAPSHOT_CONSTANTS_FILE: &str = "constants.circom";
const SNAPSHOT_LIBRARY_DIR: &str = "library";
const LOCAL_BUILD_ROOT_DIR: &str = "local-subcircuit-library";
const LOCAL_BUILD_LOCK_FILE: &str = "local-subcircuit-library.lock";
const QAP_COMPILER_SCRIPT: &str = "scripts/qap-compiler.mjs";
const DIGEST_LIBRARY_DIRECTORIES: &[&str] = &["json", "r1cs", "wasm"];
const DIGEST_LIBRARY_FILES: &[&str] = &[
    "frontendCfg.json",
    "setupParams.json",
    "subcircuitInfo.json",
];

use types::ResolvedSubcircuitLibrary;

pub fn configure_embedded_release_subcircuit_library(
    out_dir: &Path,
    package_version: &str,
) -> io::Result<()> {
    emit_version_contract_rerun_rule();
    println!("cargo:rustc-check-cfg=cfg(tokamak_embedded_subcircuit_library)");
    source_selection::emit_input_origin_rerun_rules();
    match source_selection::selected_input_origin()? {
        source_selection::SelectedInputOrigin::LocalQapCompiler => {
            write_stub_embedded_module(out_dir)
        }
        source_selection::SelectedInputOrigin::NpmSnapshot => {
            let snapshot = prepare_production_npm_subcircuit_library(package_version)?;
            let compatible_backend_version =
                integrity::package_major_minor(package_version, "backend package version")?;
            cargo_env::emit_subcircuit_library_build_env(
                &snapshot.version,
                &snapshot.source_digest,
                &compatible_backend_version,
            );
            println!("cargo:rustc-cfg=tokamak_embedded_subcircuit_library");
            generate_embedded_module(&snapshot, out_dir)
        }
    }
}

pub fn configure_subcircuit_library_metadata(
    package_name: &str,
    package_version: &str,
) -> io::Result<PathBuf> {
    emit_version_contract_rerun_rule();
    emit_cli_package_rerun_rule();
    println!("cargo:rustc-check-cfg=cfg(tokamak_embedded_subcircuit_library)");
    source_selection::emit_input_origin_rerun_rules();
    if source_selection::selected_input_origin()?
        == source_selection::SelectedInputOrigin::NpmSnapshot
    {
        backend_build_metadata_contract::ensure_runtime_package(package_name)
            .map_err(io::Error::other)?;
        let snapshot = prepare_production_npm_subcircuit_library(package_version)?;
        let compatible_backend_version = read_cli_compatible_backend_version(package_version)?;
        integrity::validate_release_mpc_library_compatibility(
            &snapshot.version,
            &compatible_backend_version,
        )?;
        println!("cargo:rustc-cfg=tokamak_embedded_subcircuit_library");
        cargo_env::emit_subcircuit_library_build_env(
            &snapshot.version,
            &snapshot.source_digest,
            &compatible_backend_version,
        );
        cargo_env::emit_build_metadata(
            &snapshot,
            package_name,
            package_version,
            &compatible_backend_version,
        )?;
        return Ok(snapshot.snapshot_dir);
    }
    Ok(qap_compiler_root()?.join("subcircuits/library"))
}

fn prepare_release_subcircuit_library(
    package_version: &str,
) -> io::Result<Option<ResolvedSubcircuitLibrary>> {
    npm_snapshot::prepare_release_subcircuit_library(package_version)
}

fn prepare_production_npm_subcircuit_library(
    package_version: &str,
) -> io::Result<ResolvedSubcircuitLibrary> {
    if env::var("PROFILE").ok().as_deref() != Some("release") {
        return Err(io::Error::other(
            "production-npm-subcircuit-library requires Cargo's release profile",
        ));
    }
    prepare_release_subcircuit_library(package_version)?.ok_or_else(|| {
        io::Error::other("production npm subcircuit-library snapshot was not resolved")
    })
}

fn generate_embedded_module(
    snapshot: &ResolvedSubcircuitLibrary,
    out_dir: &Path,
) -> io::Result<()> {
    generated::generate_embedded_module(snapshot, out_dir)
}

fn write_stub_embedded_module(out_dir: &Path) -> io::Result<()> {
    generated::write_stub_embedded_module(out_dir)
}

fn release_dir_from_out_dir() -> io::Result<PathBuf> {
    let out_dir = PathBuf::from(env::var("OUT_DIR").map_err(io::Error::other)?);
    out_dir
        .ancestors()
        .nth(3)
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            io::Error::other(format!(
                "cannot derive target/release from OUT_DIR {}",
                out_dir.display()
            ))
        })
}

fn qap_compiler_root() -> io::Result<PathBuf> {
    let backend_root = backend_root_from_manifest_dir()?;
    Ok(backend_root
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| {
            io::Error::other(format!(
                "cannot derive repository root from backend root {}",
                backend_root.display()
            ))
        })?
        .join("packages")
        .join("frontend")
        .join("qap-compiler"))
}

fn backend_root_from_manifest_dir() -> io::Result<PathBuf> {
    let mut current = PathBuf::from(env::var("CARGO_MANIFEST_DIR").map_err(io::Error::other)?);
    loop {
        if current.join("Cargo.toml").exists()
            && current
                .join("rust")
                .join("build-support")
                .join("subcircuit_library.rs")
                .exists()
        {
            return Ok(current);
        }

        if !current.pop() {
            return Err(io::Error::other(
                "cannot locate the backend workspace root from CARGO_MANIFEST_DIR",
            ));
        }
    }
}

fn cli_package_json_path() -> io::Result<PathBuf> {
    let backend_root = backend_root_from_manifest_dir()?;
    let repo_root_candidate = backend_root
        .parent()
        .and_then(Path::parent)
        .map(|path| path.join("packages").join("cli").join("package.json"));
    if let Some(path) = repo_root_candidate {
        if path.exists() {
            return Ok(path);
        }
    }

    let packaged_cli_candidate = backend_root
        .parent()
        .and_then(Path::parent)
        .map(|path| path.join("package.json"));
    if let Some(path) = packaged_cli_candidate {
        if path.exists() {
            return Ok(path);
        }
    }

    Err(io::Error::other(format!(
        "cannot locate @tokamak-zk-evm/cli package.json from backend root {}",
        backend_root.display()
    )))
}

fn emit_cli_package_rerun_rule() {
    if let Ok(path) = cli_package_json_path() {
        println!("cargo:rerun-if-changed={}", path.display());
    }
}

fn emit_version_contract_rerun_rule() {
    if let Ok(backend_root) = backend_root_from_manifest_dir() {
        if let Some(repository_root) = backend_root.parent().and_then(Path::parent) {
            println!(
                "cargo:rerun-if-changed={}",
                repository_root
                    .join("versioning")
                    .join("compatibility.rs")
                    .display()
            );
        }
        println!(
            "cargo:rerun-if-changed={}",
            backend_root
                .join("common")
                .join("contracts")
                .join("rust")
                .join("input_origin.rs")
                .display()
        );
        println!(
            "cargo:rerun-if-changed={}",
            backend_root
                .join("common")
                .join("contracts")
                .join("rust")
                .join("backend_build_metadata.rs")
                .display()
        );
    }
}

fn read_cli_compatible_backend_version(package_version: &str) -> io::Result<String> {
    let path = cli_package_json_path()?;
    let value: Value = serde_json::from_slice(&fs::read(&path)?).map_err(io::Error::other)?;
    let cli_version = value
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| io::Error::other(format!("{} is missing version", path.display())))?;
    let compatible_version = value
        .get("tokamakZkEvm")
        .and_then(|metadata| metadata.get("compatibleBackendVersion"))
        .and_then(Value::as_str)
        .ok_or_else(|| {
            io::Error::other(format!(
                "{} is missing tokamakZkEvm.compatibleBackendVersion",
                path.display()
            ))
        })?;

    let normalized_compatible =
        integrity::strict_major_minor(compatible_version, "tokamakZkEvm.compatibleBackendVersion")?;
    let cli_major_minor = integrity::package_major_minor(cli_version, "CLI package version")?;
    let backend_major_minor =
        integrity::package_major_minor(package_version, "backend package version")?;

    if normalized_compatible != cli_major_minor || normalized_compatible != backend_major_minor {
        return Err(io::Error::other(format!(
            "CLI compatible backend version {normalized_compatible} must match CLI package major.minor {cli_major_minor} and backend package major.minor {backend_major_minor}"
        )));
    }

    Ok(normalized_compatible)
}

fn read_qap_compiler_version(qap_root: &Path) -> io::Result<String> {
    let value: Value = serde_json::from_slice(&fs::read(qap_root.join("package.json"))?)
        .map_err(io::Error::other)?;
    value
        .get("version")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| io::Error::other("qap-compiler package.json is missing version"))
}

fn ensure_qap_compiler_dependencies(qap_root: &Path) -> io::Result<()> {
    let required_paths = [
        qap_root.join("node_modules").join("circomlib"),
        qap_root
            .join("node_modules")
            .join("poseidon-bls12381-circom"),
        qap_root.join("node_modules").join("tsx"),
    ];
    if required_paths.iter().all(|path| path.exists()) {
        return Ok(());
    }

    run_command(
        Command::new("npm")
            .arg("ci")
            .arg("--ignore-scripts")
            .arg("--workspaces=false")
            .current_dir(qap_root),
        "npm ci --ignore-scripts --workspaces=false",
    )
}

fn run_qap_compiler_build(qap_root: &Path, output_dir: &Path) -> io::Result<()> {
    run_command(
        Command::new("node")
            .arg(QAP_COMPILER_SCRIPT)
            .arg("--build")
            .arg(output_dir)
            .current_dir(qap_root),
        "node scripts/qap-compiler.mjs --build <target-local-subcircuit-library>",
    )
}

fn run_command(command: &mut Command, description: &str) -> io::Result<()> {
    let output = command.output()?;
    if output.status.success() {
        return Ok(());
    }

    Err(io::Error::other(format!(
        "{description} failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )))
}

#[derive(Clone)]
struct NpmView {
    version: String,
    integrity: String,
}

fn npm_view_exact(package_version: &str) -> io::Result<NpmView> {
    version_contract::parse_package_version(package_version).map_err(io::Error::other)?;
    let package_spec = format!("{PACKAGE_NAME}@{package_version}");
    let output = Command::new("npm")
        .arg("view")
        .arg(&package_spec)
        .args(["version", "dist.integrity", "--json"])
        .output()?;
    if !output.status.success() {
        return Err(io::Error::other(format!(
            "npm view {package_spec} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    let value: Value = serde_json::from_slice(&output.stdout).map_err(io::Error::other)?;
    let version = value
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| io::Error::other("npm view output missing version"))?;
    let integrity = value
        .get("dist.integrity")
        .and_then(Value::as_str)
        .ok_or_else(|| io::Error::other("npm view output missing dist.integrity"))?;
    if version != package_version {
        return Err(io::Error::other(format!(
            "npm view {package_spec} resolved version {version}, expected {package_version}"
        )));
    }
    Ok(NpmView {
        version: version.to_string(),
        integrity: integrity.to_string(),
    })
}

fn fetch_and_unpack_snapshot(
    snapshot_root: &Path,
    unpack_root: &Path,
    version: &str,
) -> io::Result<()> {
    if unpack_root.exists() {
        fs::remove_dir_all(unpack_root)?;
    }
    fs::create_dir_all(snapshot_root)?;

    let pack_output = Command::new("npm")
        .arg("pack")
        .arg(format!("{PACKAGE_NAME}@{version}"))
        .arg("--silent")
        .current_dir(snapshot_root)
        .output()?;
    if !pack_output.status.success() {
        return Err(io::Error::other(format!(
            "npm pack failed: {}",
            String::from_utf8_lossy(&pack_output.stderr)
        )));
    }
    let tarball_name = String::from_utf8_lossy(&pack_output.stdout)
        .trim()
        .to_string();
    if tarball_name.is_empty() {
        return Err(io::Error::other("npm pack returned an empty tarball name"));
    }
    let tarball_path = snapshot_root.join(&tarball_name);

    fs::create_dir_all(unpack_root)?;
    let tar_output = Command::new("tar")
        .arg("-xzf")
        .arg(&tarball_path)
        .arg("-C")
        .arg(unpack_root)
        .output()?;
    if !tar_output.status.success() {
        return Err(io::Error::other(format!(
            "tar extraction failed: {}",
            String::from_utf8_lossy(&tar_output.stderr)
        )));
    }

    let package_root = unpack_root.join("package");
    let package_subcircuits = package_root.join("subcircuits");
    let source_library_root = package_subcircuits.join(SNAPSHOT_LIBRARY_DIR);
    if !source_library_root.exists() {
        return Err(io::Error::other(format!(
            "packed npm package does not contain subcircuits/library at {}",
            source_library_root.display()
        )));
    }
    let source_constants_path = package_subcircuits
        .join(SNAPSHOT_CIRCOM_DIR)
        .join(SNAPSHOT_CONSTANTS_FILE);
    if !source_constants_path.exists() {
        return Err(io::Error::other(format!(
            "packed npm package does not contain subcircuits/circom/constants.circom at {}",
            source_constants_path.display()
        )));
    }
    let target_library_root = unpack_root.join(SNAPSHOT_LIBRARY_DIR);
    fs::rename(source_library_root, &target_library_root)?;
    let target_circom_root = unpack_root.join(SNAPSHOT_CIRCOM_DIR);
    fs::create_dir_all(&target_circom_root)?;
    fs::rename(
        source_constants_path,
        target_circom_root.join(SNAPSHOT_CONSTANTS_FILE),
    )?;
    let _ = fs::remove_dir_all(package_root);
    let _ = fs::remove_file(tarball_path);
    Ok(())
}

fn collect_files(root: &Path, current: &Path, files: &mut Vec<String>) -> io::Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_files(root, &path, files)?;
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .map_err(io::Error::other)?
            .to_string_lossy()
            .replace('\\', "/");
        files.push(relative);
    }
    Ok(())
}

fn emit_local_qap_rerun_rules() {
    if let Ok(qap_root) = qap_compiler_root() {
        for relative_path in [
            "package.json",
            "package-lock.json",
            "scripts",
            "subcircuits/circom",
            "templates",
            "functions",
        ] {
            println!(
                "cargo:rerun-if-changed={}",
                qap_root.join(relative_path).display()
            );
        }
    }
    println!("cargo:rerun-if-env-changed=PATH");
}

fn try_read_snapshot(
    path: &Path,
    release_dir: &Path,
    npm_view: &NpmView,
) -> io::Result<Option<ResolvedSubcircuitLibrary>> {
    if !path.exists() {
        return Ok(None);
    }
    let value: Value = serde_json::from_slice(&fs::read(path)?).map_err(io::Error::other)?;
    let snapshot_dir = PathBuf::from(
        value
            .get("snapshotDir")
            .and_then(Value::as_str)
            .ok_or_else(|| io::Error::other("resolved snapshot metadata missing snapshotDir"))?,
    );
    let constants_path = integrity::constants_path_for_library_dir(&snapshot_dir)?;
    if !snapshot_dir.exists() {
        return Ok(None);
    }
    if !constants_path.exists() {
        return Ok(None);
    }
    let package_name = value
        .get("packageName")
        .and_then(Value::as_str)
        .ok_or_else(|| io::Error::other("resolved snapshot metadata missing packageName"))?
        .to_string();
    if package_name != PACKAGE_NAME {
        return Ok(None);
    }
    let version = value
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| io::Error::other("resolved snapshot metadata missing version"))?
        .to_string();
    let integrity = value
        .get("integrity")
        .and_then(Value::as_str)
        .ok_or_else(|| io::Error::other("resolved snapshot metadata missing integrity"))?
        .to_string();
    if version != npm_view.version || integrity != npm_view.integrity {
        return Ok(None);
    }
    Ok(Some(ResolvedSubcircuitLibrary {
        version,
        integrity,
        source_digest: integrity::digest_subcircuit_source(&constants_path, &snapshot_dir)?,
        snapshot_dir,
        release_dir: release_dir.to_path_buf(),
    }))
}

fn write_snapshot_info(path: &Path, snapshot: &ResolvedSubcircuitLibrary) -> io::Result<()> {
    let payload = serde_json::json!({
        "packageName": PACKAGE_NAME,
        "version": snapshot.version,
        "integrity": snapshot.integrity,
        "sourceDigest": snapshot.source_digest,
        "snapshotDir": snapshot.snapshot_dir,
    });
    fs::write(
        path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&payload).map_err(io::Error::other)?
        ),
    )
}

fn acquire_lock(lock_path: &Path) -> io::Result<LockGuard> {
    let mut attempts = 0u32;
    loop {
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(lock_path)
        {
            Ok(_) => return Ok(LockGuard(lock_path.to_path_buf())),
            Err(err) if err.kind() == io::ErrorKind::AlreadyExists => {
                attempts += 1;
                if attempts > 600 {
                    return Err(io::Error::other(format!(
                        "timed out waiting for build lock {}",
                        lock_path.display()
                    )));
                }
                sleep(Duration::from_millis(200));
            }
            Err(err) => return Err(err),
        }
    }
}

struct LockGuard(PathBuf);

impl Drop for LockGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
