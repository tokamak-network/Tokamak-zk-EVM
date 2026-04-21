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

pub struct ResolvedSubcircuitLibrary {
    pub version: String,
    pub integrity: String,
    pub snapshot_dir: PathBuf,
    pub release_dir: PathBuf,
}

pub enum BuildOutputMode<'a> {
    EmbeddedModuleOnly { out_dir: &'a Path },
    MetadataOnly,
}

pub fn configure_release_subcircuit_library(
    mode: BuildOutputMode<'_>,
    package_name: &str,
    package_version: &str,
) -> io::Result<()> {
    println!("cargo:rustc-check-cfg=cfg(tokamak_embedded_subcircuit_library)");
    if let Some(snapshot) = prepare_release_subcircuit_library()? {
        println!("cargo:rustc-cfg=tokamak_embedded_subcircuit_library");
        match mode {
            BuildOutputMode::EmbeddedModuleOnly { out_dir } => {
                generate_embedded_module(&snapshot, out_dir)?;
            }
            BuildOutputMode::MetadataOnly => {
                emit_build_metadata(&snapshot, package_name, package_version)?;
            }
        }
    } else if let BuildOutputMode::EmbeddedModuleOnly { out_dir } = mode {
        write_stub_embedded_module(out_dir)?;
    }
    Ok(())
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
        snapshot_dir,
        release_dir,
    };
    write_snapshot_info(&info_path, &snapshot)?;
    Ok(Some(snapshot))
}

pub fn emit_build_metadata(
    snapshot: &ResolvedSubcircuitLibrary,
    current_package_name: &str,
    current_package_version: &str,
) -> io::Result<()> {
    let metadata = serde_json::json!({
        "dependencies": {
            "subcircuitLibrary": {
                "buildVersion": snapshot.version,
                "declaredRange": DECLARED_RANGE,
                "packageName": PACKAGE_NAME,
                "runtimeMode": RUNTIME_MODE,
            }
        },
        "packageName": current_package_name,
        "packageVersion": current_package_version,
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
        snapshot_dir,
        release_dir: release_dir.to_path_buf(),
    }))
}

fn write_snapshot_info(path: &Path, snapshot: &ResolvedSubcircuitLibrary) -> io::Result<()> {
    let payload = serde_json::json!({
        "packageName": PACKAGE_NAME,
        "version": snapshot.version,
        "integrity": snapshot.integrity,
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
