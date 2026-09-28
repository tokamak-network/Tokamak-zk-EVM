//! Native artifact ingress for the univariate reference prover.

use crate::univariate::{
    engine::{Cpu, Engine, Icicle},
    prepare::prepare,
    prove as prove_protocol, ProverRandomizers, ProvingInput,
};
use crate::univariate_crs::ProverCrs;
use crate::{ProveError, ProveInputPaths};
use backend_interface::ProofBytes;
use libs::errors::{ArtifactError, CrsError};
use libs::frontend_artifacts::{
    normalized_library::NormalizedSubcircuitLibrary, read_placement_selector, Instance,
    Permutation, PlacementVariables,
};
use libs::r1cs::SubcircuitR1CS;
use libs::univariate_relation::NormalizedUnivariateSubcircuit;
use std::fs;
use std::path::PathBuf;

/// Chooses the arithmetic engine for the native univariate prover.
#[derive(clap::ValueEnum, Clone, Copy, Debug, Default)]
pub enum ProverDevice {
    #[default]
    Cpu,
    Cuda,
}

pub fn prove(paths: &ProveInputPaths<'_>, device: ProverDevice) -> Result<(), ProveError> {
    prove_with_validated_crs(paths, device, None)
}

pub fn prove_with_validated_crs(
    paths: &ProveInputPaths<'_>,
    device: ProverDevice,
    validated: Option<libs::subcircuit_library::ValidatedUnivariateCrsBytes>,
) -> Result<(), ProveError> {
    #[cfg(feature = "timing")]
    let loading = crate::timing::SpanGuard::new("univariate.library", "input", vec![]);
    let qap_path = PathBuf::from(paths.qap_path);
    let library = NormalizedSubcircuitLibrary::read_from_qap_path(&qap_path).map_err(|source| {
        ArtifactError::Read {
            artifact: "normalized subcircuit library",
            path: qap_path.clone(),
            source,
        }
    })?;
    let r1cs = library
        .subcircuits
        .iter()
        .enumerate()
        .map(|(index, info)| {
            if info.id != index {
                return Err(ArtifactError::Invalid {
                    artifact: "subcircuit information",
                    path: PathBuf::from(paths.qap_path).join("subcircuitInfo.json"),
                    reason: format!("catalog entry {index} declares subcircuit ID {}", info.id),
                });
            }
            let path = qap_path.join(format!("r1cs/subcircuit{index}.r1cs"));
            SubcircuitR1CS::from_normalized_r1cs_sparse_only(path.clone(), &library.setup, info)
                .map_err(|source| ArtifactError::Read {
                    artifact: "subcircuit R1CS",
                    path,
                    source,
                })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let subcircuits = r1cs
        .iter()
        .zip(library.subcircuits.iter())
        .map(|(r1cs, info)| r1cs.as_normalized_univariate_subcircuit(info))
        .collect::<Vec<_>>();
    let tau_path = PathBuf::from(paths.tau_sequence_path);
    let keys_path = PathBuf::from(paths.keys_path);
    #[cfg(feature = "timing")]
    drop(loading);
    #[cfg(feature = "timing")]
    let loading = crate::timing::SpanGuard::new("univariate.crs", "input", vec![]);
    let crs = match validated {
        Some(bytes) => ProverCrs::from_owned_bytes(bytes, &library),
        // Explicit development bypass and library callers retain their file ingress.
        None => ProverCrs::read(&tau_path, &keys_path, &library),
    }
    .map_err(|source| CrsError::Read {
        path: keys_path,
        source,
    })?;

    let selector_path = PathBuf::from(paths.synthesizer_path).join("selector.json");
    #[cfg(feature = "timing")]
    drop(loading);
    #[cfg(feature = "timing")]
    let loading = crate::timing::SpanGuard::new("univariate.fixture", "input", vec![]);
    let selector = read_placement_selector(
        &selector_path,
        library.setup.s,
        library.actual_subcircuit_count(),
    )
    .map_err(|source| ArtifactError::Read {
        artifact: "placement selector",
        path: selector_path,
        source,
    })?;
    let permutation_path = PathBuf::from(paths.synthesizer_path).join("permutation.json");
    let permutation =
        Permutation::read_box_from_json(permutation_path.clone()).map_err(|source| {
            ArtifactError::Read {
                artifact: "permutation",
                path: permutation_path,
                source,
            }
        })?;
    let placement_path = PathBuf::from(paths.synthesizer_path).join("placementVariables.json");
    let placements =
        PlacementVariables::read_box_from_json(placement_path.clone()).map_err(|source| {
            ArtifactError::Read {
                artifact: "placement variables",
                path: placement_path,
                source,
            }
        })?;
    let instance_path = PathBuf::from(paths.synthesizer_path).join("instance.json");
    let instance =
        Instance::read_from_json(instance_path.clone()).map_err(|source| ArtifactError::Read {
            artifact: "public instance",
            path: instance_path,
            source,
        })?;

    #[cfg(feature = "timing")]
    drop(loading);
    match device {
        ProverDevice::Cpu => finish::<Cpu>(
            paths,
            &crs,
            &library,
            &selector,
            &permutation,
            &placements,
            &instance,
            &subcircuits,
        ),
        ProverDevice::Cuda => finish::<Icicle>(
            paths,
            &crs,
            &library,
            &selector,
            &permutation,
            &placements,
            &instance,
            &subcircuits,
        ),
    }
}
fn finish<E: Engine>(
    paths: &ProveInputPaths<'_>,
    crs: &ProverCrs,
    library: &NormalizedSubcircuitLibrary,
    selector: &[Option<usize>],
    permutation: &[Permutation],
    placements: &[PlacementVariables],
    instance: &Instance,
    subcircuits: &[NormalizedUnivariateSubcircuit<'_>],
) -> Result<(), ProveError> {
    let prepared = crate::time_block!("univariate.maps", "prepare", {
        prepare::<E>(
            crs,
            library,
            selector,
            permutation,
            placements,
            instance,
            subcircuits,
        )?
    });
    let randomizers = ProverRandomizers::sample();
    let (proof, _) = prove_protocol::<E>(ProvingInput {
        crs,
        library,
        selector,
        prepared: &prepared,
        randomizers: &randomizers,
    })?;
    let output_dir = PathBuf::from(paths.output_path);
    crate::time_block!("univariate.output", "output", {
        fs::create_dir_all(&output_dir).map_err(|source| ProveError::WriteOutput {
            path: output_dir.clone(),
            source,
        })?;
        let output_path = output_dir.join(ProofBytes::FILE_NAME);
        let bytes = proof.encode().map_err(|e| ProveError::WriteOutput {
            path: output_path.clone(),
            source: std::io::Error::other(e),
        })?;
        fs::write(&output_path, bytes).map_err(|source| ProveError::WriteOutput {
            path: output_path,
            source,
        })?;
    });
    Ok(())
}
