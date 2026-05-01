use std::io;

fn main() -> io::Result<()> {
    println!("cargo:rerun-if-changed=build.rs");
    Ok(())
}
