#[path = "../../build-support/subcircuit_library.rs"]
mod subcircuit_library;

use std::io;

fn main() -> io::Result<()> {
    subcircuit_library::configure_release_subcircuit_library_metadata(
        env!("CARGO_PKG_NAME"),
        env!("CARGO_PKG_VERSION"),
    )?;
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=../../build-support/subcircuit_library.rs");
    Ok(())
}
