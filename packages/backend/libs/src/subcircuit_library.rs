use clap::Args;
use std::fs;
use std::path::PathBuf;

#[derive(Args, Debug, Clone)]
pub struct SubcircuitLibraryArg {
    /// Subcircuit library directory produced by the QAP compiler
    #[arg(long, value_name = "PATH")]
    pub subcircuit_library: String,
}

pub fn resolve_subcircuit_library_path(path: &str) -> PathBuf {
    fs::canonicalize(path)
        .unwrap_or_else(|_| panic!("cannot resolve subcircuit library path {path}"))
}
