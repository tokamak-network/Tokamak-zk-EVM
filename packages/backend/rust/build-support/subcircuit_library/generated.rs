use super::{collect_files, ResolvedSubcircuitLibrary};
use std::fs;
use std::io;
use std::path::Path;

pub(crate) fn generate_embedded_module(
    snapshot: &ResolvedSubcircuitLibrary,
    out_dir: &Path,
) -> io::Result<()> {
    let mut files = Vec::new();
    collect_files(&snapshot.snapshot_dir, &snapshot.snapshot_dir, &mut files)?;
    files.sort();
    let mut generated = String::new();
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_BUILD_VERSION: &str = ");
    generated.push_str(&format!("{:?};\n", snapshot.version));
    generated.push_str("pub const SUBCIRCUIT_LIBRARY_INTEGRITY: &str = ");
    generated.push_str(&format!("{:?};\n", snapshot.integrity));
    generated.push_str(
        "\n#[derive(Clone, Copy)]\n\
         pub struct EmbeddedSubcircuitLibraryFile {\n\
         \tpub relative_path: &'static str,\n\
         \tpub bytes: &'static [u8],\n\
         }\n\n\
         pub static EMBEDDED_SUBCIRCUIT_LIBRARY_FILES: &[EmbeddedSubcircuitLibraryFile] = &[\n",
    );
    for file in files {
        let absolute = snapshot.snapshot_dir.join(&file);
        generated.push_str("    EmbeddedSubcircuitLibraryFile {\n");
        generated.push_str(&format!(
            "        relative_path: {:?},\n",
            file.replace('\\', "/")
        ));
        generated.push_str(&format!(
            "        bytes: include_bytes!({:?}),\n",
            absolute.to_string_lossy()
        ));
        generated.push_str("    },\n");
    }
    generated.push_str("];\n");
    fs::write(out_dir.join("embedded_subcircuit_library.rs"), generated)
}

pub(crate) fn write_stub_embedded_module(out_dir: &Path) -> io::Result<()> {
    fs::write(
        out_dir.join("embedded_subcircuit_library.rs"),
        "pub const SUBCIRCUIT_LIBRARY_BUILD_VERSION: &str = \"\";\n\
         pub const SUBCIRCUIT_LIBRARY_INTEGRITY: &str = \"\";\n\
         #[derive(Clone, Copy)]\n\
         pub struct EmbeddedSubcircuitLibraryFile {\n\
         \tpub relative_path: &'static str,\n\
         \tpub bytes: &'static [u8],\n\
         }\n\
         pub static EMBEDDED_SUBCIRCUIT_LIBRARY_FILES: &[EmbeddedSubcircuitLibraryFile] = &[];\n",
    )
}
