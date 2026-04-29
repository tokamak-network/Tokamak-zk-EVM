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
const DECLARED_RANGE: &str = "local";
const RUNTIME_MODE: &str = "bundled";
const LOCAL_BUILD_ROOT_DIR: &str = "local-subcircuit-library";
const LOCAL_BUILD_LOCK_FILE: &str = "local-subcircuit-library.lock";

pub struct ResolvedSubcircuitLibrary {
    pub version: String,
    pub source_digest: String,
    pub library_dir: PathBuf,
    pub profile_dir: PathBuf,
}

pub fn configure_embedded_subcircuit_library(out_dir: &Path) -> io::Result<()> {
    emit_subcircuit_library_cfgs();
    let library = prepare_local_subcircuit_library()?;
    generate_embedded_module(&library, out_dir)
}

pub fn configure_subcircuit_library_metadata(
    package_name: &str,
    package_version: &str,
) -> io::Result<()> {
    emit_subcircuit_library_cfgs();
    let library = prepare_local_subcircuit_library()?;
    emit_build_metadata(&library, package_name, package_version)
}

fn emit_subcircuit_library_cfgs() {
    println!("cargo:rustc-check-cfg=cfg(tokamak_embedded_subcircuit_library)");
    println!("cargo:rustc-check-cfg=cfg(tokamak_release_profile)");
    println!("cargo:rustc-cfg=tokamak_embedded_subcircuit_library");
    if env::var("PROFILE").ok().as_deref() == Some("release") {
        println!("cargo:rustc-cfg=tokamak_release_profile");
    }

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

fn prepare_local_subcircuit_library() -> io::Result<ResolvedSubcircuitLibrary> {
    let profile_dir = profile_dir_from_out_dir()?;
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
        sanitize_component(&version),
        sanitize_component(&source_digest)
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

    Ok(ResolvedSubcircuitLibrary {
        version,
        source_digest,
        library_dir,
        profile_dir,
    })
}

pub fn emit_build_metadata(
    library: &ResolvedSubcircuitLibrary,
    current_package_name: &str,
    current_package_version: &str,
) -> io::Result<()> {
    let metadata = serde_json::json!({
        "dependencies": {
            "subcircuitLibrary": {
                "buildVersion": library.version,
                "declaredRange": DECLARED_RANGE,
                "packageName": PACKAGE_NAME,
                "runtimeMode": RUNTIME_MODE,
                "sourceDigest": library.source_digest,
            }
        },
        "packageName": current_package_name,
        "packageVersion": current_package_version,
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
    library: &ResolvedSubcircuitLibrary,
    out_dir: &Path,
) -> io::Result<()> {
    let mut files = Vec::new();
    collect_library_files(&library.library_dir, &library.library_dir, &mut files)?;
    files.sort();

    let mut generated = String::new();
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_PACKAGE_NAME: &str = ");
    generated.push_str(&format!("{:?};\n", PACKAGE_NAME));
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_BUILD_VERSION: &str = ");
    generated.push_str(&format!("{:?};\n", library.version));
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_DECLARED_RANGE: &str = ");
    generated.push_str(&format!("{:?};\n", DECLARED_RANGE));
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_RUNTIME_MODE: &str = ");
    generated.push_str(&format!("{:?};\n", RUNTIME_MODE));
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_SOURCE_DIGEST: &str = ");
    generated.push_str(&format!("{:?};\n", library.source_digest));
    generated.push_str(
        "\n#[derive(Clone, Copy)]\n\
         pub struct EmbeddedSubcircuitLibraryFile {\n\
         \tpub relative_path: &'static str,\n\
         \tpub bytes: &'static [u8],\n\
         }\n\n\
         pub static EMBEDDED_SUBCIRCUIT_LIBRARY_FILES: &[EmbeddedSubcircuitLibraryFile] = &[\n",
    );

    for file in files {
        let absolute = library.library_dir.join(&file);
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

fn profile_dir_from_out_dir() -> io::Result<PathBuf> {
    let out_dir = PathBuf::from(env::var("OUT_DIR").map_err(io::Error::other)?);
    out_dir
        .ancestors()
        .nth(3)
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            io::Error::other(format!(
                "cannot derive target profile directory from OUT_DIR {}",
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
            .arg("scripts/qap-compiler.mjs")
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

fn collect_library_files(root: &Path, current: &Path, files: &mut Vec<String>) -> io::Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            if path.file_name().and_then(|name| name.to_str()) == Some("info") {
                continue;
            }
            collect_library_files(root, &path, files)?;
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
    collect_library_files(root, root, &mut files)?;
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

fn sanitize_component(value: &str) -> String {
    value
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
