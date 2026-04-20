#[path = "../build-support/subcircuit_library.rs"]
mod subcircuit_library;

use std::env;
use std::io;
use std::path::PathBuf;

fn main() -> io::Result<()> {
    println!("cargo:rustc-check-cfg=cfg(tokamak_embedded_subcircuit_library)");
    let out_dir = PathBuf::from(env::var("OUT_DIR").map_err(io::Error::other)?);

    if let Some(snapshot) = subcircuit_library::prepare_release_subcircuit_library()? {
        println!("cargo:rustc-cfg=tokamak_embedded_subcircuit_library");
        subcircuit_library::generate_embedded_module(&snapshot, &out_dir)?;
        subcircuit_library::emit_build_metadata(
            &snapshot,
            env!("CARGO_PKG_NAME"),
            env!("CARGO_PKG_VERSION"),
        )?;
    } else {
        subcircuit_library::write_stub_embedded_module(&out_dir)?;
    }

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=../build-support/subcircuit_library.rs");
    Ok(())
}
