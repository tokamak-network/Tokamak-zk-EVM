#[allow(dead_code)]
#[path = "../build-support/subcircuit_library.rs"]
mod subcircuit_library;

use std::io;

fn main() -> io::Result<()> {
    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").map_err(io::Error::other)?);
    subcircuit_library::configure_embedded_release_subcircuit_library(&out_dir)?;

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=../build-support/subcircuit_library.rs");
    Ok(())
}
