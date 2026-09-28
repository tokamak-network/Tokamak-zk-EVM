use std::env;
use std::io;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SelectedInputOrigin {
    LocalQapCompiler,
    NpmSnapshot,
}

pub(crate) fn selected_input_origin() -> io::Result<SelectedInputOrigin> {
    let local = env::var_os("CARGO_FEATURE_LOCAL_DEVELOPMENT_SUBCIRCUIT_LIBRARY").is_some();
    let production = env::var_os("CARGO_FEATURE_PRODUCTION_NPM_SUBCIRCUIT_LIBRARY").is_some();
    match (local, production) {
        (true, false) => Ok(SelectedInputOrigin::LocalQapCompiler),
        (false, true) => Ok(SelectedInputOrigin::NpmSnapshot),
        (true, true) => Err(io::Error::other(
            "local-development-subcircuit-library and production-npm-subcircuit-library cannot be enabled together",
        )),
        (false, false) => Err(io::Error::other(
            "select either local-development-subcircuit-library or production-npm-subcircuit-library",
        )),
    }
}

pub(crate) fn emit_input_origin_rerun_rules() {
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_LOCAL_DEVELOPMENT_SUBCIRCUIT_LIBRARY");
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_PRODUCTION_NPM_SUBCIRCUIT_LIBRARY");
}
