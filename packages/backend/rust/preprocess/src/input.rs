use crate::{generate_preprocess, PreprocessDevice, PreprocessError};
use backend_interface::PreprocessBytes;
use backend_univariate_crs_interface::{archive, PreprocessKeysRkyv};
use libs::frontend_artifacts::{
    normalized_library::{NormalizedSetupParams, NormalizedSubcircuitLibrary, PublicWireSource},
    read_placement_selector, Instance, Permutation,
};
use libs::univariate_crs::{UnivariateCrsShape, UNIVARIATE_CRS_SCHEMA_ID};
use libs::univariate_field::{canonical_scalar, ProtocolField};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub struct PreprocessInputPaths<'a> {
    pub qap_path: &'a Path,
    pub synthesizer_path: &'a Path,
    pub keys_path: &'a Path,
    pub output_path: &'a Path,
}

fn io<T>(path: &Path, result: std::io::Result<T>) -> Result<T, PreprocessError> {
    result.map_err(|source| PreprocessError::Io {
        path: path.to_owned(),
        source,
    })
}

pub fn preprocess(
    paths: &PreprocessInputPaths<'_>,
    device: PreprocessDevice,
) -> Result<PathBuf, PreprocessError> {
    let started = std::time::Instant::now();
    let library = io(
        paths.qap_path,
        NormalizedSubcircuitLibrary::read_from_qap_path(paths.qap_path),
    )?;
    let selector_path = paths.synthesizer_path.join("selector.json");
    let selector = io(
        &selector_path,
        read_placement_selector(
            &selector_path,
            library.setup.s,
            library.actual_subcircuit_count(),
        ),
    )?;
    let permutation_path = paths.synthesizer_path.join("permutation.json");
    let permutation = io(
        &permutation_path,
        Permutation::read_box_from_json(permutation_path.clone()),
    )?;
    let instance_path = paths.synthesizer_path.join("instance.json");
    let instance = io(
        &instance_path,
        Instance::read_from_json(instance_path.clone()),
    )?;
    let key_path = paths.keys_path.join("preprocess_keys.rkyv");
    let bytes = io(&key_path, fs::read(&key_path))?;
    let keys = archive::from_bytes::<PreprocessKeysRkyv, archive::rancor::Error>(&bytes)
        .map_err(|e| PreprocessError::Invalid(format!("{}: {e}", key_path.display())))?;
    drop(bytes);
    println!("preprocess input: {:.6} s", started.elapsed().as_secs_f64());
    let output = generate_preprocess(&keys, &library, &selector, &permutation, &instance, device)?
        .encode()
        .map_err(|e| PreprocessError::Invalid(e.into()))?;
    io(paths.output_path, fs::create_dir_all(paths.output_path))?;
    let path = paths.output_path.join(PreprocessBytes::FILE_NAME);
    let temporary = path.with_extension(format!("bin.tmp-{}", std::process::id()));
    io(&temporary, fs::write(&temporary, output))?;
    io(&path, fs::rename(&temporary, &path))?;
    Ok(path)
}

pub(crate) fn fixed_values<F: ProtocolField>(
    library: &NormalizedSubcircuitLibrary,
    selector: &[Option<usize>],
    instance: &Instance,
) -> Result<Vec<F>, PreprocessError> {
    let public = &library.public;
    // Only public-buffer public wires use the fixed placement == subcircuit ID
    // specialization. Neither intermediate wires nor private wires use it.
    for segment in public.segments() {
        if selector.get(segment.subcircuit_id) != Some(&Some(segment.subcircuit_id))
            || selector
                .iter()
                .enumerate()
                .any(|(i, k)| *k == Some(segment.subcircuit_id) && i != segment.subcircuit_id)
        {
            return Err("public buffer must occur only at its matching placement"
                .to_owned()
                .into());
        }
    }
    let values = instance
        .a_pub_user
        .iter()
        .chain(instance.a_pub_block.iter())
        .chain(instance.a_pub_function.iter())
        .collect::<Vec<_>>();
    if values.len() != public.len() {
        return Err("public instance length mismatch".to_owned().into());
    }
    let mut fixed = Vec::new();
    for (g, text) in values.into_iter().enumerate() {
        let text = text.strip_prefix("0x").unwrap_or(text);
        let padded = if text.len() % 2 == 1 {
            format!("0{text}")
        } else {
            text.to_owned()
        };
        let mut bytes = hex::decode(padded).map_err(|e| e.to_string())?;
        bytes.reverse();
        if bytes.len() > 32 {
            return Err("public scalar exceeds 32 bytes".to_owned().into());
        }
        bytes.resize(32, 0);
        if !canonical_scalar(&bytes) {
            return Err("noncanonical public scalar".to_owned().into());
        }
        let value = F::from_le(&bytes);
        if public.source(g) == Some(PublicWireSource::Padding) {
            if value != F::zero() {
                return Err("nonzero public padding".to_owned().into());
            }
        } else if g >= public.free_public_len() {
            fixed.push(value);
        }
    }
    Ok(fixed)
}

pub(crate) fn validate_keys(
    keys: &PreprocessKeysRkyv,
    shape: &UnivariateCrsShape,
    setup: &NormalizedSetupParams,
    fixed_count: usize,
) -> Result<(), PreprocessError> {
    if keys.schema_id != UNIVARIATE_CRS_SCHEMA_ID
        || keys.sc_g1.len() != shape.connection_domain_size
        || keys.selection_g2.len() != setup.s * (setup.t - 1) + 1
        || keys.fixed_public_queries.len() != fixed_count
    {
        return Err(
            "preprocess CRS schema or query lengths do not match the selected library"
                .to_owned()
                .into(),
        );
    }
    // Reject noncanonical field bytes before either library can reduce them.
    // This is format admission, not cryptographic ceremony verification.
    use ark_ff::{BigInteger, PrimeField};
    let modulus = ark_bls12_381::Fq::MODULUS.to_bytes_le();
    let canonical = |bytes: &[u8]| {
        bytes
            .chunks_exact(48)
            .all(|c| c.iter().rev().cmp(modulus.iter().rev()).is_lt())
    };
    if keys
        .sc_g1
        .iter()
        .chain(&keys.fixed_public_queries)
        .any(|p| !canonical(&p.x) || !canonical(&p.y))
        || keys
            .selection_g2
            .iter()
            .any(|p| !canonical(&p.x) || !canonical(&p.y))
    {
        return Err("noncanonical preprocess CRS coordinate".to_owned().into());
    }
    Ok(())
}
