pub fn compatible_backend_version() -> String {
    let mut parts = env!("CARGO_PKG_VERSION").split('.');
    let major = parts.next().expect("package version is missing major");
    let minor = parts.next().expect("package version is missing minor");
    format!("{major}.{minor}")
}
