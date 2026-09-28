use sha2::{Digest, Sha256};

pub const SOURCE_DIGEST_PREFIX: &str = "sha256:";

pub fn digest_subcircuit_source_entries<'a, I>(entries: I) -> Result<String, String>
where
    I: IntoIterator<Item = (&'a str, &'a [u8])>,
{
    let mut entries = entries
        .into_iter()
        .map(|(path, content)| (path.as_bytes(), content))
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.0.cmp(right.0));

    let mut previous_path: Option<&[u8]> = None;
    let mut digest = Sha256::new();
    for (path, content) in entries {
        validate_path(path)?;
        if previous_path == Some(path) {
            return Err(format!(
                "subcircuit source digest repeats path {}",
                String::from_utf8_lossy(path)
            ));
        }
        previous_path = Some(path);
        digest.update((path.len() as u64).to_be_bytes());
        digest.update(path);
        digest.update((content.len() as u64).to_be_bytes());
        digest.update(content);
    }

    Ok(format!("{SOURCE_DIGEST_PREFIX}{:x}", digest.finalize()))
}

pub fn validate_source_digest(value: &str) -> Result<(), String> {
    let Some(hex) = value.strip_prefix(SOURCE_DIGEST_PREFIX) else {
        return Err(format!(
            "subcircuit source digest must use {SOURCE_DIGEST_PREFIX}<64 lowercase hexadecimal characters>"
        ));
    };
    if hex.len() != 64
        || !hex
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(format!(
            "subcircuit source digest must use {SOURCE_DIGEST_PREFIX}<64 lowercase hexadecimal characters>"
        ));
    }
    Ok(())
}

fn validate_path(path: &[u8]) -> Result<(), String> {
    let path = std::str::from_utf8(path)
        .map_err(|_| "subcircuit source digest path must be valid UTF-8".to_string())?;
    if !path.starts_with("subcircuits/")
        || path.contains('\\')
        || path
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err(format!(
            "subcircuit source digest path must be a package-relative POSIX path below subcircuits/: {path:?}"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{digest_subcircuit_source_entries, validate_source_digest};

    #[test]
    fn fixed_vector_is_order_independent_and_framed() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../fixtures/subcircuit-source-digest-vectors.json"
        ))
        .unwrap();
        let vector = &fixture["vectors"][0];
        let entries = vector["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| {
                (
                    entry["path"].as_str().unwrap().to_string(),
                    hex::decode(entry["contentHex"].as_str().unwrap()).unwrap(),
                )
            })
            .collect::<Vec<_>>();
        let expected = vector["expected"].as_str().unwrap();
        assert_eq!(
            digest_subcircuit_source_entries(
                entries
                    .iter()
                    .map(|(path, content)| (path.as_str(), content.as_slice()))
            )
            .unwrap(),
            expected
        );
        assert_eq!(
            digest_subcircuit_source_entries(
                entries
                    .iter()
                    .rev()
                    .map(|(path, content)| (path.as_str(), content.as_slice()))
            )
            .unwrap(),
            expected
        );
        validate_source_digest(expected).unwrap();
    }

    #[test]
    fn rejects_noncanonical_digests_and_paths() {
        assert!(validate_source_digest(&format!("sha256:{}", "A".repeat(64))).is_err());
        assert!(validate_source_digest(&"0".repeat(64)).is_err());
        assert!(digest_subcircuit_source_entries([("library/a", b"a".as_slice())]).is_err());
        assert!(digest_subcircuit_source_entries([
            ("subcircuits/library/a", b"a".as_slice()),
            ("subcircuits/library/a", b"b".as_slice()),
        ])
        .is_err());
    }
}
