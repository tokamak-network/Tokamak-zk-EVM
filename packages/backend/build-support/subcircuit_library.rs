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
const SNAPSHOT_CIRCOM_DIR: &str = "circom";
const SNAPSHOT_CONSTANTS_FILE: &str = "constants.circom";
const LOCAL_BUILD_ROOT_DIR: &str = "local-subcircuit-library";
const LOCAL_BUILD_LOCK_FILE: &str = "local-subcircuit-library.lock";
const QAP_COMPILER_SCRIPT: &str = "scripts/qap-compiler.mjs";
const DIGEST_LIBRARY_DIRECTORIES: &[&str] = &["json", "r1cs", "wasm"];
const DIGEST_LIBRARY_FILES: &[&str] = &[
    "frontendCfg.json",
    "globalWireList.json",
    "setupParams.json",
    "subcircuitInfo.json",
];

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
    println!(
        "cargo:rustc-env=TOKAMAK_ZKEVM_COMPATIBLE_BACKEND_VERSION={compatible_backend_version}"
    );

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
    let staging_constants_path = staging_root
        .join(SNAPSHOT_CIRCOM_DIR)
        .join(SNAPSHOT_CONSTANTS_FILE);
    fs::create_dir_all(staging_root.join(SNAPSHOT_CIRCOM_DIR))?;
    fs::copy(
        qap_root
            .join("subcircuits")
            .join(SNAPSHOT_CIRCOM_DIR)
            .join(SNAPSHOT_CONSTANTS_FILE),
        &staging_constants_path,
    )?;

    if !staging_library_dir.join("setupParams.json").exists() {
        return Err(io::Error::other(format!(
            "local qap-compiler build did not produce {}",
            staging_library_dir.join("setupParams.json").display()
        )));
    }

    let source_digest = digest_subcircuit_source(&staging_constants_path, &staging_library_dir)?;
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
        || parts
            .iter()
            .any(|part| part.is_empty() || !part.chars().all(|ch| ch.is_ascii_digit()))
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
        || parts
            .iter()
            .any(|part| part.is_empty() || !part.chars().all(|ch| ch.is_ascii_digit()))
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

    let normalized_compatible =
        strict_major_minor(compatible_version, "tokamakZkEvm.compatibleBackendVersion")?;
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

fn digest_subcircuit_source(constants_path: &Path, library_dir: &Path) -> io::Result<String> {
    let mut files = Vec::new();
    push_digest_input(
        &mut files,
        "circom/constants.circom",
        constants_path.to_path_buf(),
    )?;
    for file in DIGEST_LIBRARY_FILES {
        push_digest_input(
            &mut files,
            format!("library/{file}"),
            library_dir.join(file),
        )?;
    }
    for directory in DIGEST_LIBRARY_DIRECTORIES {
        collect_digest_directory(
            &mut files,
            &format!("library/{directory}"),
            &library_dir.join(directory),
        )?;
    }
    files.sort_by(|left, right| left.0.cmp(&right.0));

    let mut hash = 0xcbf29ce484222325u64;
    for (logical_path, absolute_path) in files {
        digest_bytes(&mut hash, logical_path.as_bytes());
        digest_bytes(&mut hash, &(logical_path.len() as u64).to_le_bytes());
        digest_bytes(&mut hash, &fs::read(absolute_path)?);
    }
    Ok(format!("{hash:016x}"))
}

fn digest_bytes(hash: &mut u64, bytes: &[u8]) {
    for byte in bytes {
        *hash ^= u64::from(*byte);
        *hash = hash.wrapping_mul(0x100000001b3);
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
