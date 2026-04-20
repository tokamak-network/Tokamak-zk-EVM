#[path = "../../build-support/subcircuit_library.rs"]
mod subcircuit_library;

use std::io;

fn main() -> io::Result<()> {
    println!("cargo:rustc-check-cfg=cfg(tokamak_embedded_subcircuit_library)");
    if let Some(snapshot) = subcircuit_library::prepare_release_subcircuit_library()? {
        println!("cargo:rustc-cfg=tokamak_embedded_subcircuit_library");
        subcircuit_library::emit_build_metadata(
            &snapshot,
            env!("CARGO_PKG_NAME"),
            env!("CARGO_PKG_VERSION"),
        )?;
    }
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=../../build-support/subcircuit_library.rs");
    Ok(())
}
