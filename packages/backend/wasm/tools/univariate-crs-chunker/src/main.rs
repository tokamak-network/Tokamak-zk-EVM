use backend_univariate_crs_interface::{
    archive, ArchivedPreprocessKeysRkyv, ArchivedProverKeysRkyv, ArchivedTauSequenceRkyv,
    ArchivedUnivariateG1Rkyv, ArchivedUnivariateG2Rkyv, ArchivedVerifierKeysRkyv,
};
use clap::Parser;
use memmap2::Mmap;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io,
    path::{Path, PathBuf},
};

const DEFAULT_CHUNK_BYTES: usize = 64 * 1024 * 1024;
const CONTRACT: &str =
    include_str!("../../../../common/contracts/univariate-crs-chunk-contract.json");

#[derive(Debug, Parser)]
struct Config {
    #[arg(long, value_name = "FILE")]
    tau_sequence: PathBuf,
    #[arg(long, value_name = "DIRECTORY")]
    keys: PathBuf,
    #[arg(long, value_name = "DIRECTORY")]
    output: PathBuf,
    #[arg(long, default_value_t = DEFAULT_CHUNK_BYTES)]
    chunk_bytes: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema_id: String,
    source_package_version: &'static str,
    source_rkyv_sha256: serde_json::Value,
    sections: Vec<Section>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Section {
    label: String,
    encoding: &'static str,
    element_count: usize,
    element_byte_length: usize,
    chunks: Vec<Chunk>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Chunk {
    path: String,
    first_element: usize,
    element_count: usize,
    byte_length: usize,
    sha256: String,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    run(Config::parse())
}
fn map(path: &Path) -> io::Result<Mmap> {
    let file = File::open(path)?;
    // SAFETY: read-only mappings; callers must keep source artifacts immutable
    // throughout offline conversion, as for native archived CRS readers.
    unsafe { Mmap::map(&file) }
}
fn run(config: Config) -> Result<(), Box<dyn std::error::Error>> {
    if config.chunk_bytes < 192 {
        return Err("--chunk-bytes must be at least 192".into());
    }
    if config.output.exists() {
        return Err("output path already exists".into());
    }
    let tau_bytes = map(&config.tau_sequence)?;
    let prover_bytes = map(&config.keys.join("prover_keys.rkyv"))?;
    let preprocess_bytes = map(&config.keys.join("preprocess_keys.rkyv"))?;
    let verifier_bytes = map(&config.keys.join("verifier_keys.rkyv"))?;
    let tau = archive::access::<ArchivedTauSequenceRkyv, archive::rancor::Error>(&tau_bytes)?;
    let prover = archive::access::<ArchivedProverKeysRkyv, archive::rancor::Error>(&prover_bytes)?;
    let preprocess =
        archive::access::<ArchivedPreprocessKeysRkyv, archive::rancor::Error>(&preprocess_bytes)?;
    let verifier =
        archive::access::<ArchivedVerifierKeysRkyv, archive::rancor::Error>(&verifier_bytes)?;
    let contract: serde_json::Value = serde_json::from_str(CONTRACT)?;
    let schema = contract["sourceSchemaId"]
        .as_str()
        .ok_or("missing source schema")?;
    for actual in [
        &tau.schema_id,
        &prover.schema_id,
        &preprocess.schema_id,
        &verifier.schema_id,
    ] {
        if actual.as_str() != schema {
            return Err("unsupported CRS schema".into());
        }
    }
    fs::create_dir_all(config.output.join("chunks"))?;
    let mut sections = Vec::new();
    // The JSON contract owns section identity/order. This match only maps each
    // declared role to its archived storage; omitted queries stay omitted.
    for spec in contract["sections"].as_array().ok_or("missing sections")? {
        let label = spec["label"].as_str().ok_or("missing label")?;
        let g1 = |points: &[ArchivedUnivariateG1Rkyv]| {
            write_section(
                &config,
                label,
                "canonical-g1-affine-le",
                points.len(),
                96,
                |i, out| append_g1(out, &points[i]),
            )
        };
        let g2 = |points: &[ArchivedUnivariateG2Rkyv]| {
            write_section(
                &config,
                label,
                "canonical-g2-affine-le",
                points.len(),
                192,
                |i, out| append_g2(out, &points[i]),
            )
        };
        let section = match label {
            "crs.s0" => g1(tau.s0_g1.as_slice())?,
            "crs.sxi" => g1(tau.sxi_g1.as_slice())?,
            "crs.spsi" => g1(tau.spsi_g1.as_slice())?,
            "crs.tau-g2" => g2(tau.tau_powers_g2.as_slice())?,
            "crs.psi-g2" => g2(std::slice::from_ref(&tau.psi_g2))?,
            "crs.weighted" => g1(prover.weighted_g1.as_slice())?,
            "crs.weighted-shifted" => g1(prover.weighted_shifted_g1.as_slice())?,
            "crs.free-public-queries" => g1(prover.free_public_queries.as_slice())?,
            "crs.nonpublic-queries" => g1(prover.nonpublic_queries.as_slice())?,
            "crs.mask-u" => g1(&prover.mask_u)?,
            "crs.mask-v" => g1(&prover.mask_v)?,
            "crs.mask-w" => g1(&prover.mask_w)?,
            "crs.mask-b" => g1(&prover.mask_b)?,
            "crs.mask-selection" => g1(std::slice::from_ref(&prover.mask_selection))?,
            "crs.preprocess-sc" => g1(preprocess.sc_g1.as_slice())?,
            "crs.preprocess-selection" => g2(preprocess.selection_g2.as_slice())?,
            "crs.fixed-public-queries" => g1(preprocess.fixed_public_queries.as_slice())?,
            "crs.g1-handles" => {
                let points = [&verifier.one_g1, &verifier.xi_g1, &verifier.psi_g1];
                write_section(
                    &config,
                    label,
                    "canonical-g1-affine-le",
                    points.len(),
                    96,
                    |i, out| append_g1(out, points[i]),
                )?
            }
            "crs.g2" => {
                let points = [
                    &verifier.one_g2,
                    &verifier.tau_g2,
                    &verifier.tau_k_g2,
                    &verifier.delta_g2,
                ];
                write_section(
                    &config,
                    label,
                    "canonical-g2-affine-le",
                    points.len(),
                    192,
                    |i, out| append_g2(out, points[i]),
                )?
            }
            _ => return Err(format!("unmapped CRS contract section {label}").into()),
        };
        if spec["elementByteLength"].as_u64() != Some(section.element_byte_length as u64)
            || spec
                .get("elementCount")
                .is_some_and(|v| v.as_u64() != Some(section.element_count as u64))
        {
            return Err(format!("CRS section shape differs from contract: {label}").into());
        }
        sections.push(section);
    }
    let manifest = Manifest {
        schema_id: schema.to_owned(),
        source_package_version: env!("CARGO_PKG_VERSION"),
        source_rkyv_sha256: serde_json::json!({
            "tauSequence": hex_digest(&tau_bytes), "proverKeys": hex_digest(&prover_bytes),
            "preprocessKeys": hex_digest(&preprocess_bytes), "verifierKeys": hex_digest(&verifier_bytes),
        }),
        sections,
    };
    fs::write(
        config.output.join("canonical-manifest.json"),
        serde_json::to_vec_pretty(&manifest)?,
    )?;
    Ok(())
}
fn write_section(
    config: &Config,
    label: &str,
    encoding: &'static str,
    count: usize,
    width: usize,
    mut append: impl FnMut(usize, &mut Vec<u8>),
) -> io::Result<Section> {
    let per_chunk = config.chunk_bytes / width;
    let mut chunks = Vec::new();
    for (chunk_index, first) in (0..count).step_by(per_chunk).enumerate() {
        let end = (first + per_chunk).min(count);
        let mut bytes = Vec::with_capacity((end - first) * width);
        for i in first..end {
            append(i, &mut bytes);
        }
        let path = format!("chunks/{}-{chunk_index:06}.bin", label.replace('.', "-"));
        fs::write(config.output.join(&path), &bytes)?;
        chunks.push(Chunk {
            path,
            first_element: first,
            element_count: end - first,
            byte_length: bytes.len(),
            sha256: hex_digest(&bytes),
        });
    }
    Ok(Section {
        label: label.to_owned(),
        encoding,
        element_count: count,
        element_byte_length: width,
        chunks,
    })
}
fn append_g1(out: &mut Vec<u8>, point: &ArchivedUnivariateG1Rkyv) {
    out.extend_from_slice(&point.x);
    out.extend_from_slice(&point.y);
}
fn append_g2(out: &mut Vec<u8>, point: &ArchivedUnivariateG2Rkyv) {
    out.extend_from_slice(&point.x);
    out.extend_from_slice(&point.y);
}
fn hex_digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use backend_univariate_crs_interface::{
        PreprocessKeysRkyv, ProverKeysRkyv, TauSequenceRkyv, UnivariateG1Rkyv, UnivariateG2Rkyv,
        VerifierKeysRkyv,
    };

    #[test]
    fn reads_current_four_role_archives_and_rejects_bad_inputs() {
        let root = std::env::temp_dir().join(format!(
            "crs-role-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        let schema: serde_json::Value = serde_json::from_str(CONTRACT).unwrap();
        let schema = schema["sourceSchemaId"].as_str().unwrap().to_owned();
        let g1 = UnivariateG1Rkyv {
            x: [1; 48],
            y: [2; 48],
        };
        let g2 = UnivariateG2Rkyv {
            x: [3; 96],
            y: [4; 96],
        };
        let tau = TauSequenceRkyv {
            schema_id: schema.clone(),
            s0_g1: vec![g1; 5],
            sxi_g1: vec![g1; 3],
            spsi_g1: vec![g1; 3],
            tau_powers_g2: vec![g2; 3],
            psi_g2: g2,
        };
        let prover = ProverKeysRkyv {
            schema_id: schema.clone(),
            weighted_g1: vec![g1; 4],
            weighted_shifted_g1: vec![g1; 4],
            free_public_queries: vec![g1],
            nonpublic_queries: vec![],
            mask_u: [g1; 2],
            mask_v: [g1; 2],
            mask_w: [g1; 2],
            mask_b: [g1; 2],
            mask_selection: g1,
        };
        let preprocess = PreprocessKeysRkyv {
            schema_id: schema.clone(),
            sc_g1: vec![g1; 3],
            selection_g2: vec![g2; 5],
            fixed_public_queries: vec![g1; 2],
        };
        let mut verifier = VerifierKeysRkyv {
            schema_id: schema,
            one_g1: g1,
            xi_g1: g1,
            psi_g1: g1,
            one_g2: g2,
            tau_g2: g2,
            tau_k_g2: g2,
            delta_g2: g2,
        };
        fs::write(
            root.join("tau_sequence.rkyv"),
            archive::to_bytes::<archive::rancor::Error>(&tau).unwrap(),
        )
        .unwrap();
        fs::write(
            root.join("prover_keys.rkyv"),
            archive::to_bytes::<archive::rancor::Error>(&prover).unwrap(),
        )
        .unwrap();
        fs::write(
            root.join("preprocess_keys.rkyv"),
            archive::to_bytes::<archive::rancor::Error>(&preprocess).unwrap(),
        )
        .unwrap();
        let verifier_bytes = archive::to_bytes::<archive::rancor::Error>(&verifier).unwrap();
        fs::write(root.join("verifier_keys.rkyv"), &verifier_bytes).unwrap();
        let config = |name: &str| Config {
            tau_sequence: root.join("tau_sequence.rkyv"),
            keys: root.clone(),
            output: root.join(name),
            chunk_bytes: 192,
        };
        run(config("output")).unwrap();
        assert!(run(config("output")).is_err());
        let manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(root.join("output/canonical-manifest.json")).unwrap())
                .unwrap();
        assert_eq!(
            manifest["sourceRkyvSha256"]["verifierKeys"],
            hex_digest(&verifier_bytes)
        );
        assert_eq!(manifest["sections"].as_array().unwrap().len(), 19);
        for section in manifest["sections"].as_array().unwrap() {
            let expected = if section["encoding"] == "canonical-g1-affine-le" {
                [&g1.x[..], &g1.y[..]].concat()
            } else {
                [&g2.x[..], &g2.y[..]].concat()
            };
            for chunk in section["chunks"].as_array().unwrap() {
                let bytes =
                    fs::read(root.join("output").join(chunk["path"].as_str().unwrap())).unwrap();
                assert!(bytes.len() <= 192);
                for point in bytes.chunks_exact(expected.len()) {
                    assert_eq!(point, expected);
                }
            }
        }
        // These fixtures check archive shape and byte order, not curve admission.
        verifier.schema_id = "retired-protocol".into();
        fs::write(
            root.join("verifier_keys.rkyv"),
            archive::to_bytes::<archive::rancor::Error>(&verifier).unwrap(),
        )
        .unwrap();
        assert!(run(config("bad-schema")).is_err());
        assert!(!root.join("bad-schema").exists());
        fs::write(root.join("verifier_keys.rkyv"), b"truncated").unwrap();
        assert!(run(config("bad-archive")).is_err());
        fs::remove_file(root.join("preprocess_keys.rkyv")).unwrap();
        assert!(run(config("missing-preprocess")).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn chunk_boundaries_preserve_points_and_empty_sections() {
        let output = std::env::temp_dir().join(format!(
            "crs-chunker-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(output.join("chunks")).unwrap();
        let config = Config {
            tau_sequence: PathBuf::new(),
            keys: PathBuf::new(),
            output: output.clone(),
            chunk_bytes: 192,
        };
        let section = write_section(&config, "test", "test", 5, 96, |i, out| {
            out.extend([i as u8; 96])
        })
        .unwrap();
        assert_eq!(
            section
                .chunks
                .iter()
                .map(|c| c.element_count)
                .collect::<Vec<_>>(),
            [2, 2, 1]
        );
        let bytes: Vec<u8> = section
            .chunks
            .iter()
            .flat_map(|c| fs::read(output.join(&c.path)).unwrap())
            .collect();
        assert_eq!(
            bytes,
            (0..5).flat_map(|i| [i as u8; 96]).collect::<Vec<_>>()
        );
        let empty = write_section(&config, "empty", "test", 0, 96, |_, _| panic!()).unwrap();
        assert!(empty.chunks.is_empty());
        fs::remove_dir_all(output).unwrap();
    }
}
