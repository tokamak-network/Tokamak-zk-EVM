//! Circuit admission for the current univariate protocol. No online proof
//! verification or prover CRS is required by this command.
mod engine;
mod input;

use backend_interface::PreprocessBytes;
use backend_univariate_crs_interface::PreprocessKeysRkyv;
use engine::{Cpu, Engine, Icicle};
use libs::frontend_artifacts::{
    normalized_library::NormalizedSubcircuitLibrary, Instance, Permutation,
};
use libs::univariate_crs::UnivariateCrsShape;
use libs::univariate_field::ProtocolField;
use libs::univariate_relation::normalized_connection_permutation_targets;

pub use input::{preprocess, PreprocessInputPaths};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, clap::ValueEnum)]
pub enum PreprocessDevice {
    #[default]
    Cpu,
    Cuda,
}

#[derive(Debug, thiserror::Error)]
pub enum PreprocessError {
    #[error(transparent)]
    Artifact(#[from] libs::errors::ArtifactError),
    #[error(transparent)]
    Crs(#[from] libs::errors::CrsError),
    #[error(transparent)]
    Device(#[from] libs::errors::DeviceError),
    #[error(transparent)]
    Shape(#[from] libs::univariate_crs::UnivariateCrsError),
    #[error(transparent)]
    Relation(#[from] libs::univariate_relation::UnivariateRelationError),
    #[error("preprocess: {0}")]
    Invalid(String),
    #[error("{}: {source}", path.display())]
    Io {
        path: std::path::PathBuf,
        source: std::io::Error,
    },
}

impl From<String> for PreprocessError {
    fn from(value: String) -> Self {
        Self::Invalid(value)
    }
}

impl libs::cli::CliDiagnostic for PreprocessError {
    fn hint(&self) -> &'static str {
        match self {
            Self::Device(_) => {
                "Install the requested CUDA backend, or explicitly select --device cpu."
            }
            Self::Io { .. } => "Check the reported file path and access permissions.",
            _ => "Use matching current-protocol CRS, library and synthesizer inputs.",
        }
    }
}

impl PreprocessDevice {
    /// CPU never discovers or initializes an ICICLE backend. CUDA failure is
    /// returned to the caller, never retried on CPU.
    pub fn initialize(self) -> Result<(), PreprocessError> {
        if self == Self::Cuda {
            let failure = |reason: String| libs::errors::DeviceError::Initialization {
                device: "CUDA",
                reason,
            };
            icicle_runtime::load_backend_from_env_or_default()
                .map_err(|e| failure(e.to_string()))?;
            let device = icicle_runtime::Device::new("CUDA", 0);
            if !icicle_runtime::is_device_available(&device) {
                return Err(failure("CUDA was requested but is unavailable".into()).into());
            }
            icicle_runtime::set_device(&device).map_err(|e| failure(e.to_string()))?;
        }
        Ok(())
    }
}

pub fn generate_preprocess(
    keys: &PreprocessKeysRkyv,
    library: &NormalizedSubcircuitLibrary,
    selector: &[Option<usize>],
    permutation: &[Permutation],
    instance: &Instance,
    device: PreprocessDevice,
) -> Result<PreprocessBytes, PreprocessError> {
    device.initialize()?;
    match device {
        PreprocessDevice::Cpu => generate::<Cpu>(keys, library, selector, permutation, instance),
        PreprocessDevice::Cuda => {
            generate::<Icicle>(keys, library, selector, permutation, instance)
        }
    }
}

fn root<F: ProtocolField>(size: usize) -> Result<F, PreprocessError> {
    libs::univariate_field::canonical_root(size)
        .map(|r| F::from_le(&r.canonical_le()))
        .ok_or_else(|| PreprocessError::Invalid("unsupported protocol domain".into()))
}

fn generate<E: Engine>(
    keys: &PreprocessKeysRkyv,
    library: &NormalizedSubcircuitLibrary,
    selector: &[Option<usize>],
    permutation: &[Permutation],
    instance: &Instance,
) -> Result<PreprocessBytes, PreprocessError> {
    let setup = &library.setup;
    let shape = UnivariateCrsShape::from_normalized_setup(setup, library.public.free_public_len())?;
    let targets =
        normalized_connection_permutation_targets(&shape, library, selector, permutation)?;
    let fixed = input::fixed_values::<E::F>(library, selector, instance)?;
    input::validate_keys(keys, &shape, setup, fixed.len())?;
    E::initialize(
        (shape.selection_domain_size + 1)
            .next_power_of_two()
            .max(shape.connection_domain_size),
    )?;

    let start = std::time::Instant::now();
    let connection_root = root::<E::F>(shape.connection_domain_size)?;
    let mut power = E::F::one();
    let powers: Vec<_> = (0..shape.connection_domain_size)
        .map(|_| {
            let value = power;
            power = power * connection_root;
            value
        })
        .collect();
    let evaluations = targets.into_iter().map(|i| powers[i]).collect::<Vec<_>>();
    let sc = E::coefficients(&E::interpolate(&evaluations, connection_root));
    let s_c = E::msm_g1(&keys.sc_g1[..sc.len()], &sc)?;
    println!("preprocess S_C: {:.6} s", start.elapsed().as_secs_f64());

    let start = std::time::Instant::now();
    let zu = selection_complement::<E>(setup, selector, shape.selection_domain_size)?;
    // The CRS bases already contain the shift tau^h; the scalars are Z_u's
    // coefficients, not coefficients of a second shifted polynomial.
    let e_kappa = E::msm_g2(&keys.selection_g2, &zu)?;
    println!("preprocess E_kappa: {:.6} s", start.elapsed().as_secs_f64());

    let start = std::time::Instant::now();
    let c_fix = E::msm_g1(&keys.fixed_public_queries, &fixed)?;
    println!("preprocess C_fix: {:.6} s", start.elapsed().as_secs_f64());
    Ok(PreprocessBytes {
        s_c,
        c_fix,
        e_kappa,
    })
}

fn selection_complement<E: Engine>(
    setup: &libs::frontend_artifacts::normalized_library::NormalizedSetupParams,
    selector: &[Option<usize>],
    size: usize,
) -> Result<Vec<E::F>, PreprocessError> {
    let omega = root::<E::F>(size)?;
    // Inactive placements select the library's reserved virtual empty ID.
    // Z_v has only s roots; divide Z_S by Z_v instead of multiplying s(t-1)
    // unselected linear factors. The polynomial objects remain engine-native.
    let mut level = selector
        .iter()
        .enumerate()
        .map(|(i, k)| {
            let selected = omega.pow(i + setup.s * k.unwrap_or(setup.t - 1));
            E::polynomial(&[E::F::zero() - selected, E::F::one()])
        })
        .collect::<Vec<_>>();
    while level.len() > 1 {
        level = level
            .chunks_exact(2)
            .map(|pair| E::mul(&pair[0], &pair[1]))
            .collect();
    }
    let mut vanishing = vec![E::F::zero(); size + 1];
    vanishing[0] = E::F::zero() - E::F::one();
    vanishing[size] = E::F::one();
    let zu = E::divide_exact(&E::polynomial(&vanishing), &level[0])?;
    let coefficients = E::coefficients(&zu);
    if coefficients.len() != size - setup.s + 1 {
        return Err("unexpected selection-complement degree".to_owned().into());
    }
    Ok(coefficients)
}

#[cfg(test)]
mod tests;
