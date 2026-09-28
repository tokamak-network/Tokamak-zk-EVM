//! Single-command development trusted setup for the current univariate protocol.
use crate::TrustedSetupError;
use icicle_bls12_381::curve::{
    BaseField, CurveCfg, G1Affine, G2Affine, G2BaseField, G2CurveCfg, ScalarField,
};
use icicle_core::curve::Curve;
use icicle_core::traits::{Arithmetic, FieldImpl};
use libs::errors::ArtifactError;
use libs::field_structures::Tau;
use libs::frontend_artifacts::normalized_library::NormalizedSubcircuitLibrary;
use libs::r1cs::SubcircuitR1CS;
use libs::subcircuit_library::{
    selected_subcircuit_library_provenance, write_development_only_univariate_keys_provenance,
};
use libs::univariate_crs::UnivariateCrsShape;
use libs::univariate_setup::{generate_normalized, stage_artifacts, SetupScalars};
use rayon::prelude::*;
use std::path::PathBuf;
use std::time::Instant;

pub struct TrustedSetupConfig<'a> {
    pub qap_path: &'a str,
    pub output_path: &'a str,
    pub fixed_tau: bool,
}

/// Generate and activate all four role-local CRS files together. These direct
/// setup artifacts are development-only, including when scalars are random.
pub fn run_trusted_setup(config: &TrustedSetupConfig<'_>) -> Result<(), TrustedSetupError> {
    let started = Instant::now();
    let input_started = Instant::now();
    #[cfg(feature = "timing")]
    let input_span = libs::timing::SpanGuard::new("input.load_and_validate", "setup", vec![]);
    let qap_path = PathBuf::from(config.qap_path);
    let normalized_library =
        NormalizedSubcircuitLibrary::read_from_qap_path(&qap_path).map_err(|source| {
            ArtifactError::Read {
                artifact: "normalized subcircuit library",
                path: qap_path.clone(),
                source,
            }
        })?;
    let shape = UnivariateCrsShape::from_normalized_setup(
        &normalized_library.setup,
        normalized_library.public.free_public_len(),
    )?;

    let r1cs = normalized_library
        .subcircuits
        .par_iter()
        .enumerate()
        .map(|(index, subcircuit_info)| {
            if subcircuit_info.id != index {
                return Err(ArtifactError::Invalid {
                    artifact: "subcircuit information",
                    path: qap_path.join("subcircuitInfo.json"),
                    reason: format!(
                        "catalog entry {index} declares subcircuit ID {}",
                        subcircuit_info.id
                    ),
                });
            }
            let path = qap_path.join(format!("r1cs/subcircuit{index}.r1cs"));
            SubcircuitR1CS::from_normalized_r1cs_sparse_only(
                path.clone(),
                &normalized_library.setup,
                subcircuit_info,
            )
            .map_err(|source| ArtifactError::Read {
                artifact: "subcircuit R1CS",
                path,
                source,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let subcircuits = r1cs
        .iter()
        .zip(normalized_library.subcircuits.iter())
        .map(|(r1cs, subcircuit_info)| r1cs.as_normalized_univariate_subcircuit(subcircuit_info))
        .collect::<Vec<_>>();
    #[cfg(feature = "timing")]
    drop(input_span);
    println!(
        "Loaded and validated univariate setup inputs in {:.6} seconds",
        input_started.elapsed().as_secs_f64(),
    );

    let library = selected_subcircuit_library_provenance(&qap_path).map_err(|source| {
        ArtifactError::Invalid {
            artifact: "subcircuit library identity",
            path: qap_path,
            reason: source.to_string(),
        }
    })?;
    let (g1, g2, secret) = if config.fixed_tau {
        let (g1, g2, tau, xi, psi, delta) = fixed_inputs();
        (
            g1,
            g2,
            SetupScalars {
                tau,
                xi,
                psi,
                delta,
                weights: (1..=normalized_library.setup.m)
                    .into_par_iter()
                    .map(|j| ScalarField::from_bytes_le(&j.to_le_bytes()))
                    .collect(),
            },
        )
    } else {
        (
            CurveCfg::generate_random_affine_points(1)[0],
            G2CurveCfg::generate_random_affine_points(1)[0],
            SetupScalars::sample(&shape, normalized_library.setup.m),
        )
    };
    let generation_started = Instant::now();
    let crs = generate_normalized(&normalized_library, &subcircuits, &secret, g1, g2)
        .map_err(TrustedSetupError::Construction)?;
    println!(
        "Generated current-protocol CRS in {:.6} seconds",
        generation_started.elapsed().as_secs_f64()
    );
    let output_path = PathBuf::from(config.output_path);
    let io_error = |source| TrustedSetupError::WriteOutput {
        path: output_path.clone(),
        source,
    };
    let artifact_started = Instant::now();
    let (stage, digests) = stage_artifacts(&output_path, &crs).map_err(io_error)?;
    {
        #[cfg(feature = "timing")]
        let _span = libs::timing::SpanGuard::new("provenance.write", "setup", vec![]);
        write_development_only_univariate_keys_provenance(
            stage.staging_directory().map_err(io_error)?,
            library,
            &digests,
        )
        .map_err(io_error)?;
    }
    {
        #[cfg(feature = "timing")]
        let _span = libs::timing::SpanGuard::new("generation.activate", "setup", vec![]);
        stage.activate().map_err(io_error)?;
    }
    #[cfg(feature = "timing")]
    for event in libs::timing::take_events() {
        println!(
            "[setup-timing] {} {:?} {:.9} seconds",
            event.name,
            event.sizes.iter().map(|s| &s.dims).collect::<Vec<_>>(),
            event.nanos as f64 / 1e9
        );
    }
    println!(
        "Serialized and activated four CRS files with provenance in {:.6} seconds",
        artifact_started.elapsed().as_secs_f64()
    );
    println!(
        "Generated development-only CRS in {:.6} seconds",
        started.elapsed().as_secs_f64()
    );
    Ok(())
}

fn fixed_inputs() -> (
    G1Affine,
    G2Affine,
    ScalarField,
    ScalarField,
    ScalarField,
    ScalarField,
) {
    println!("Using hardcoded generators and development trapdoor");
    let g1 = G1Affine::from_limbs(
            BaseField::from_hex("0x0b001b4cc05fa01578be7d4e821d6ff58f2a05c584fba3cb31a37942dece65eadec9a878add2282f7c2513abb8d4ab05").into(),
            BaseField::from_hex("0x15e237775397ed22eef43dd36cdca277c9cf6fa7e4ffff0a5bb4b20a82392caacf0f63fb6cdb02bccf2f5af14970d6b9").into(),
        );
    let g2 = G2Affine::from_limbs(
            G2BaseField::from_hex("0x1116094a7c01d4fd8abcfea69c658c92c037765bee00556b8d4063c33540b316ac68a2d913d3adc3b43c7d7cc7505cfc17206c8ae661f247979b3f1daa7fb6d5f7ce9c17b5ed1d7e8b421a2508b3f09a603e6a5fab3fcde7364fd178d656ac36").into(),
            G2BaseField::from_hex("0x15bf297a4b9842fb1a3a6f2dbf6b94de06997b11b2f72436c22efbb48d2f74b0de7239ea182a2ee50c23ae3d0be6fdee09459611409874fe4b04b1a7e42cb84eb4ae01728dc55dbd1343fda8d0fe94a299fc757acc1d2602a49a005b4ff90190").into(),
        );
    let tau = Tau::gen_fixed();
    // This route is development-only. Reuse the fixed test trapdoor to
    // derive deterministic nonzero xi and psi values without treating the
    // resulting CRS as ceremony output.
    (g1, g2, tau.x, tau.alpha, tau.alpha.pow(2), tau.delta)
}
