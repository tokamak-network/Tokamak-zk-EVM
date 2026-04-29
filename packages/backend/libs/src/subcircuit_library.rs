use clap::Args;
use std::env;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

include!(concat!(env!("OUT_DIR"), "/embedded_subcircuit_library.rs"));

static MATERIALIZED_PATH: OnceLock<PathBuf> = OnceLock::new();

#[derive(Args, Debug, Clone, Default)]
pub struct SubcircuitLibraryArg {}

impl SubcircuitLibraryArg {
    pub fn as_deref(&self) -> Option<&str> {
        None
    }
}

pub fn resolve_subcircuit_library_path(local_path: Option<&str>) -> PathBuf {
    let _ = local_path;
    materialize_embedded_subcircuit_library()
        .expect("failed to materialize embedded subcircuit library")
}

fn materialize_embedded_subcircuit_library() -> io::Result<PathBuf> {
    if let Some(path) = MATERIALIZED_PATH.get() {
        return Ok(path.clone());
    }

    let cache_root = cache_root_dir()?
        .join("tokamak-zk-evm")
        .join("subcircuit-library")
        .join(snapshot_directory_name());
    let library_root = cache_root.join("library");
    let sentinel = library_root.join("setupParams.json");
    if !sentinel.exists() {
        fs::create_dir_all(&cache_root)?;
        let staging_root = cache_root.join(format!(
            "staging-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or(Duration::from_secs(0))
                .as_nanos()
        ));
        let staging_library = staging_root.join("library");
        fs::create_dir_all(&staging_library)?;

        for file in EMBEDDED_SUBCIRCUIT_LIBRARY_FILES {
            let target_path = staging_library.join(file.relative_path);
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(target_path, file.bytes)?;
        }

        match fs::rename(&staging_library, &library_root) {
            Ok(_) => {
                let _ = fs::remove_dir_all(&staging_root);
            }
            Err(err) if library_root.exists() => {
                let _ = fs::remove_dir_all(&staging_root);
                if !sentinel.exists() {
                    return Err(err);
                }
            }
            Err(err) => {
                let _ = fs::remove_dir_all(&staging_root);
                return Err(err);
            }
        }
    }

    let _ = MATERIALIZED_PATH.set(library_root.clone());
    Ok(MATERIALIZED_PATH.get().cloned().unwrap_or(library_root))
}

fn cache_root_dir() -> io::Result<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = env::var_os("HOME") {
            return Ok(PathBuf::from(home).join("Library").join("Caches"));
        }
    }

    if let Some(cache_home) = env::var_os("XDG_CACHE_HOME") {
        return Ok(PathBuf::from(cache_home));
    }

    if let Some(home) = env::var_os("HOME") {
        return Ok(PathBuf::from(home).join(".cache"));
    }

    Ok(env::temp_dir())
}

fn snapshot_directory_name() -> String {
    format!(
        "{}-{}",
        sanitize_component(SUBCIRCUIT_LIBRARY_BUILD_VERSION),
        sanitize_component(SUBCIRCUIT_LIBRARY_SOURCE_DIGEST)
    )
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
