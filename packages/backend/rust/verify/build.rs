mod build_fixed;
mod build_parameters;
#[allow(dead_code)]
#[path = "../build-support/normalized_library.rs"]
mod normalized_library;
#[path = "../build-support/subcircuit_library.rs"]
mod subcircuit_library;

use std::{env, fs, io, path::PathBuf};

fn main() -> io::Result<()> {
    let library_dir = subcircuit_library::configure_subcircuit_library_metadata(
        env!("CARGO_PKG_NAME"),
        env!("CARGO_PKG_VERSION"),
    )?;
    let setup_path = library_dir.join("setupParams.json");
    println!("cargo:rerun-if-changed={}", setup_path.display());
    let bytes = fs::read(&setup_path).map_err(|error| {
        io::Error::new(error.kind(), format!("{}: {error}", setup_path.display()))
    })?;
    let subcircuit_path = library_dir.join("subcircuitInfo.json");
    println!("cargo:rerun-if-changed={}", subcircuit_path.display());
    let subcircuit_bytes = fs::read(&subcircuit_path).map_err(|error| {
        io::Error::new(
            error.kind(),
            format!("{}: {error}", subcircuit_path.display()),
        )
    })?;
    let generated = build_parameters::generate(&bytes, &subcircuit_bytes).map_err(|error| {
        io::Error::new(error.kind(), format!("{}: {error}", setup_path.display()))
    })?;
    let out_dir = PathBuf::from(
        env::var_os("OUT_DIR").ok_or_else(|| io::Error::other("Cargo did not provide OUT_DIR"))?,
    );
    fs::write(out_dir.join("verifier_parameters.rs"), generated)?;
    println!("cargo:rerun-if-env-changed=TOKAMAK_VERIFIER_KEYS");
    let key_path = PathBuf::from(env::var_os("TOKAMAK_VERIFIER_KEYS").ok_or_else(|| {
        io::Error::other("TOKAMAK_VERIFIER_KEYS must identify the trusted-setup or downloaded verifier_keys.rkyv before building verify")
    })?);
    println!("cargo:rerun-if-changed={}", key_path.display());
    let resolved = fs::canonicalize(&key_path)?;
    println!("cargo:rerun-if-changed={}", resolved.display());
    let (_, nc, l_free) = build_parameters::read(&bytes, &subcircuit_bytes)?;
    let fixed =
        build_fixed::generate(&fs::read(&resolved)?, nc, l_free).map_err(io::Error::other)?;
    fs::write(out_dir.join("verifier_fixed.rs"), fixed)?;
    println!("cargo:rerun-if-changed=build_fixed.rs");
    println!("cargo:rerun-if-changed=src/decode.rs");
    println!("cargo:rerun-if-changed=../../common/contracts/univariate-domain-contract.v1.json");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=build_parameters.rs");
    println!("cargo:rerun-if-changed=../build-support/subcircuit_library.rs");
    println!("cargo:rerun-if-changed=../build-support/subcircuit_library");
    Ok(())
}
