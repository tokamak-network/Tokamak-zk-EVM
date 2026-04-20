#[path = "../build-support/subcircuit_library.rs"]
mod subcircuit_library;

use std::io;

fn main() -> io::Result<()> {
    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").map_err(io::Error::other)?);
    subcircuit_library::configure_release_subcircuit_library(
        subcircuit_library::BuildOutputMode::EmbeddedModuleOnly { out_dir: &out_dir },
        env!("CARGO_PKG_NAME"),
        env!("CARGO_PKG_VERSION"),
    )?;

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=../build-support/subcircuit_library.rs");
    Ok(())
}
