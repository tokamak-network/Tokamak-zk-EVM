#![allow(dead_code)]

use serde_json::Value;
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread::sleep;
use std::time::Duration;

const PACKAGE_NAME: &str = "@tokamak-zk-evm/subcircuit-library";
const DECLARED_RANGE: &str = "latest";
const RUNTIME_MODE: &str = "bundled";
const SNAPSHOT_ROOT_DIR: &str = "embedded-subcircuit-library";
const SNAPSHOT_INFO_FILE: &str = "resolved.json";
const SNAPSHOT_LIBRARY_DIR: &str = "library";
const LOCAL_BUILD_ROOT_DIR: &str = "local-subcircuit-library";
const LOCAL_BUILD_LOCK_FILE: &str = "local-subcircuit-library.lock";
const QAP_COMPILER_SCRIPT: &str = "scripts/qap-compiler.mjs";

pub struct ResolvedSubcircuitLibrary {
    pub version: String,
    pub integrity: String,
    pub source_digest: String,
    pub snapshot_dir: PathBuf,
    pub release_dir: PathBuf,
}

pub fn configure_embedded_release_subcircuit_library(out_dir: &Path) -> io::Result<()> {
    println!("cargo:rustc-check-cfg=cfg(tokamak_embedded_subcircuit_library)");
    if let Some(snapshot) = prepare_release_subcircuit_library()? {
        println!("cargo:rustc-cfg=tokamak_embedded_subcircuit_library");
        generate_embedded_module(&snapshot, out_dir)?;
    } else {
        write_stub_embedded_module(out_dir)?;
    }
    Ok(())
}

pub fn configure_release_subcircuit_library_metadata(
    package_name: &str,
    package_version: &str,
) -> io::Result<()> {
    emit_cli_package_rerun_rule();
    println!("cargo:rustc-check-cfg=cfg(tokamak_embedded_subcircuit_library)");
    if let Some(snapshot) = prepare_release_subcircuit_library()? {
        println!("cargo:rustc-cfg=tokamak_embedded_subcircuit_library");
        emit_build_metadata(&snapshot, package_name, package_version)?;
    }
    Ok(())
}

pub fn configure_local_subcircuit_library_for_mpc_setup(
    out_dir: &Path,
    package_name: &str,
    package_version: &str,
) -> io::Result<()> {
    emit_cli_package_rerun_rule();
    emit_local_qap_rerun_rules();
    println!("cargo:rustc-check-cfg=cfg(tokamak_release_profile)");
    if env::var("PROFILE").ok().as_deref() == Some("release") {
        println!("cargo:rustc-cfg=tokamak_release_profile");
    }

    let compatible_backend_version = read_cli_compatible_backend_version(package_version)?;
    println!("cargo:rustc-env=TOKAMAK_ZKEVM_COMPATIBLE_BACKEND_VERSION={compatible_backend_version}");

    let library = prepare_local_subcircuit_library()?;
    emit_local_build_metadata(
        &library,
        package_name,
        package_version,
        &compatible_backend_version,
    )?;
    fs::write(
        out_dir.join("local_subcircuit_library.rs"),
        format!(
            "pub const LOCAL_SUBCIRCUIT_LIBRARY_PATH: &str = {:?};\n",
            library.library_dir.to_string_lossy()
        ),
    )
}

pub fn prepare_release_subcircuit_library() -> io::Result<Option<ResolvedSubcircuitLibrary>> {
    if env::var("PROFILE").ok().as_deref() != Some("release") {
        return Ok(None);
    }

    let release_dir = release_dir_from_out_dir()?;
    let snapshot_root = release_dir.join(SNAPSHOT_ROOT_DIR);
    fs::create_dir_all(&snapshot_root)?;

    let lock_path = snapshot_root.join(".lock");
    let _guard = acquire_lock(&lock_path)?;
    let info_path = snapshot_root.join(SNAPSHOT_INFO_FILE);
    let npm_view = npm_view_latest()?;

    if let Some(existing) = try_read_snapshot(&info_path, &release_dir, &npm_view)? {
        return Ok(Some(existing));
    }

    let unpack_root = snapshot_root.join(format!(
        "{}-{}",
        sanitize(&npm_view.version),
        short_hash(&npm_view.integrity)
    ));
    let snapshot_dir = unpack_root.join(SNAPSHOT_LIBRARY_DIR);

    if !snapshot_dir.exists() {
        fetch_and_unpack_snapshot(&snapshot_root, &unpack_root, &npm_view.version)?;
    }

    let snapshot = ResolvedSubcircuitLibrary {
        version: npm_view.version,
        integrity: npm_view.integrity,
        source_digest: digest_library_files(&snapshot_dir)?,
        snapshot_dir,
        release_dir,
    };
    write_snapshot_info(&info_path, &snapshot)?;
    Ok(Some(snapshot))
}

struct LocalSubcircuitLibrary {
    version: String,
    source_digest: String,
    library_dir: PathBuf,
    profile_dir: PathBuf,
}

fn prepare_local_subcircuit_library() -> io::Result<LocalSubcircuitLibrary> {
    let profile_dir = release_dir_from_out_dir()?;
    let build_root = profile_dir.join(LOCAL_BUILD_ROOT_DIR);
    fs::create_dir_all(&build_root)?;
    let lock_path = build_root.join(LOCAL_BUILD_LOCK_FILE);
    let _guard = acquire_lock(&lock_path)?;

    let qap_root = qap_compiler_root()?;
    let version = read_qap_compiler_version(&qap_root)?;
    ensure_qap_compiler_dependencies(&qap_root)?;

    let staging_root = build_root.join(format!(
        "staging-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or(Duration::from_secs(0))
            .as_nanos()
    ));
    let staging_library_dir = staging_root.join("library");
    if staging_root.exists() {
        fs::remove_dir_all(&staging_root)?;
    }
    run_qap_compiler_build(&qap_root, &staging_library_dir)?;

    if !staging_library_dir.join("setupParams.json").exists() {
        return Err(io::Error::other(format!(
            "local qap-compiler build did not produce {}",
            staging_library_dir.join("setupParams.json").display()
        )));
    }

    let source_digest = digest_library_files(&staging_library_dir)?;
    let snapshot_dir = build_root.join(format!(
        "{}-{}",
        sanitize(&version),
        sanitize(&source_digest)
    ));
    let library_dir = snapshot_dir.join("library");
    if !library_dir.exists() {
        if snapshot_dir.exists() {
            fs::remove_dir_all(&snapshot_dir)?;
        }
        fs::rename(&staging_root, &snapshot_dir)?;
    } else {
        let _ = fs::remove_dir_all(&staging_root);
    }

    Ok(LocalSubcircuitLibrary {
        version,
        source_digest,
        library_dir,
        profile_dir,
    })
}

pub fn emit_build_metadata(
    snapshot: &ResolvedSubcircuitLibrary,
    current_package_name: &str,
    current_package_version: &str,
) -> io::Result<()> {
    let compatible_backend_version = read_cli_compatible_backend_version(current_package_version)?;
    let metadata = serde_json::json!({
        "dependencies": {
            "subcircuitLibrary": {
                "buildVersion": snapshot.version,
                "declaredRange": DECLARED_RANGE,
                "packageName": PACKAGE_NAME,
                "runtimeMode": RUNTIME_MODE,
                "sourceDigest": snapshot.source_digest,
            }
        },
        "packageName": current_package_name,
        "packageVersion": current_package_version,
        "compatibleBackendVersion": compatible_backend_version,
    });
    let path = snapshot
        .release_dir
        .join(format!("build-metadata-{current_package_name}.json"));
    fs::write(
        path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&metadata).map_err(io::Error::other)?
        ),
    )
}

fn emit_local_build_metadata(
    library: &LocalSubcircuitLibrary,
    current_package_name: &str,
    current_package_version: &str,
    compatible_backend_version: &str,
) -> io::Result<()> {
    let metadata = serde_json::json!({
        "dependencies": {
            "subcircuitLibrary": {
                "buildVersion": library.version,
                "declaredRange": "local",
                "packageName": PACKAGE_NAME,
                "runtimeMode": RUNTIME_MODE,
                "sourceDigest": library.source_digest,
            }
        },
        "packageName": current_package_name,
        "packageVersion": current_package_version,
        "compatibleBackendVersion": compatible_backend_version,
    });
    let path = library
        .profile_dir
        .join(format!("build-metadata-{current_package_name}.json"));
    fs::write(
        path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&metadata).map_err(io::Error::other)?
        ),
    )
}

pub fn generate_embedded_module(
    snapshot: &ResolvedSubcircuitLibrary,
    out_dir: &Path,
) -> io::Result<()> {
    let mut files = Vec::new();
    collect_files(&snapshot.snapshot_dir, &snapshot.snapshot_dir, &mut files)?;
    files.sort();

    let mut generated = String::new();
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_PACKAGE_NAME: &str = ");
    generated.push_str(&format!("{:?};\n", PACKAGE_NAME));
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_BUILD_VERSION: &str = ");
    generated.push_str(&format!("{:?};\n", snapshot.version));
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_DECLARED_RANGE: &str = ");
    generated.push_str(&format!("{:?};\n", DECLARED_RANGE));
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_RUNTIME_MODE: &str = ");
    generated.push_str(&format!("{:?};\n", RUNTIME_MODE));
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_INTEGRITY: &str = ");
    generated.push_str(&format!("{:?};\n", snapshot.integrity));
    generated.push_str(
        "\n#[derive(Clone, Copy)]\n\
         pub struct EmbeddedSubcircuitLibraryFile {\n\
         \tpub relative_path: &'static str,\n\
         \tpub bytes: &'static [u8],\n\
         }\n\n\
         pub static EMBEDDED_SUBCIRCUIT_LIBRARY_FILES: &[EmbeddedSubcircuitLibraryFile] = &[\n",
    );

    for file in files {
        let absolute = snapshot.snapshot_dir.join(&file);
        generated.push_str("    EmbeddedSubcircuitLibraryFile {\n");
        generated.push_str(&format!(
            "        relative_path: {:?},\n",
            file.replace('\\', "/")
        ));
        generated.push_str(&format!(
            "        bytes: include_bytes!({:?}),\n",
            absolute.to_string_lossy()
        ));
        generated.push_str("    },\n");
    }

    generated.push_str("];\n");
    fs::write(out_dir.join("embedded_subcircuit_library.rs"), generated)
}

pub fn write_stub_embedded_module(out_dir: &Path) -> io::Result<()> {
    fs::write(
        out_dir.join("embedded_subcircuit_library.rs"),
        "pub const SUBCIRCUIT_LIBRARY_PACKAGE_NAME: &str = \"@tokamak-zk-evm/subcircuit-library\";\n\
         pub const SUBCIRCUIT_LIBRARY_BUILD_VERSION: &str = \"\";\n\
         pub const SUBCIRCUIT_LIBRARY_DECLARED_RANGE: &str = \"\";\n\
         pub const SUBCIRCUIT_LIBRARY_RUNTIME_MODE: &str = \"\";\n\
         pub const SUBCIRCUIT_LIBRARY_INTEGRITY: &str = \"\";\n\
         #[derive(Clone, Copy)]\n\
         pub struct EmbeddedSubcircuitLibraryFile {\n\
         \tpub relative_path: &'static str,\n\
         \tpub bytes: &'static [u8],\n\
         }\n\
         pub static EMBEDDED_SUBCIRCUIT_LIBRARY_FILES: &[EmbeddedSubcircuitLibraryFile] = &[];\n",
    )
}

#[derive(Clone)]
struct NpmView {
    version: String,
    integrity: String,
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
        if current
            .join("build-support")
            .join("subcircuit_library.rs")
            .exists()
        {
            return Ok(current);
        }

        if !current.pop() {
            return Err(io::Error::other(
                "cannot locate packages/backend from CARGO_MANIFEST_DIR",
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

fn strict_major_minor(value: &str, label: &str) -> io::Result<String> {
    let parts = value.split('.').collect::<Vec<_>>();
    if parts.len() != 2
        || parts.iter().any(|part| part.is_empty() || !part.chars().all(|ch| ch.is_ascii_digit()))
    {
        return Err(io::Error::other(format!(
            "{label} must be strict MAJOR.MINOR, got {value:?}"
        )));
    }
    Ok(format!(
        "{}.{}",
        parts[0].parse::<u64>().map_err(io::Error::other)?,
        parts[1].parse::<u64>().map_err(io::Error::other)?
    ))
}

fn package_major_minor(value: &str, label: &str) -> io::Result<String> {
    let parts = value.split('.').collect::<Vec<_>>();
    if parts.len() != 3
        || parts.iter().any(|part| part.is_empty() || !part.chars().all(|ch| ch.is_ascii_digit()))
    {
        return Err(io::Error::other(format!(
            "{label} must be strict MAJOR.MINOR.PATCH, got {value:?}"
        )));
    }
    Ok(format!(
        "{}.{}",
        parts[0].parse::<u64>().map_err(io::Error::other)?,
        parts[1].parse::<u64>().map_err(io::Error::other)?
    ))
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

    let normalized_compatible = strict_major_minor(
        compatible_version,
        "tokamakZkEvm.compatibleBackendVersion",
    )?;
    let cli_major_minor = package_major_minor(cli_version, "CLI package version")?;
    let backend_major_minor = package_major_minor(package_version, "backend package version")?;

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

fn npm_view_latest() -> io::Result<NpmView> {
    let output = Command::new("npm")
        .arg("view")
        .arg(PACKAGE_NAME)
        .args(["version", "dist.integrity", "--json"])
        .output()?;
    if !output.status.success() {
        return Err(io::Error::other(format!(
            "npm view failed: {}",
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
    let source_root = package_root.join("subcircuits").join("library");
    if !source_root.exists() {
        return Err(io::Error::other(format!(
            "packed npm package does not contain subcircuits/library at {}",
            source_root.display()
        )));
    }
    let target_root = unpack_root.join(SNAPSHOT_LIBRARY_DIR);
    fs::rename(source_root, &target_root)?;
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

fn collect_digest_files(root: &Path, current: &Path, files: &mut Vec<String>) -> io::Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            if path.file_name().and_then(|name| name.to_str()) == Some("info") {
                continue;
            }
            collect_digest_files(root, &path, files)?;
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

fn digest_library_files(root: &Path) -> io::Result<String> {
    let mut files = Vec::new();
    collect_digest_files(root, root, &mut files)?;
    files.sort();

    let mut hash = 0xcbf29ce484222325u64;
    for file in files {
        digest_bytes(&mut hash, file.as_bytes());
        digest_bytes(&mut hash, &(file.len() as u64).to_le_bytes());
        digest_bytes(&mut hash, &fs::read(root.join(file))?);
    }
    Ok(format!("{hash:016x}"))
}

fn digest_bytes(hash: &mut u64, bytes: &[u8]) {
    for byte in bytes {
        *hash ^= u64::from(*byte);
        *hash = hash.wrapping_mul(0x100000001b3);
    }
}

fn short_hash(input: &str) -> String {
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

fn sanitize(input: &str) -> String {
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
    if !snapshot_dir.exists() {
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
        source_digest: digest_library_files(&snapshot_dir)?,
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
