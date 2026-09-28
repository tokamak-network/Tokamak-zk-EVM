use crate::backend_build_metadata::BackendBuildMetadata;
use serde::Serialize;
use std::env;
use std::error::Error;
use std::ffi::OsStr;
use std::process::ExitCode;

const BACKEND_BUILD_IDENTITY_ARGUMENT: &str = "--build-identity-json";

/// The machine-readable outcome emitted by the verifier result mode.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationResult {
    pub contract_version: u8,
    pub verified: bool,
}

/// A user-facing error emitted by a backend workflow binary.
pub trait CliDiagnostic: Error {
    fn hint(&self) -> &'static str;
}

/// Render a workflow error consistently without moving workflow policy into `libs`.
pub fn render_error(error: &dyn CliDiagnostic) -> ExitCode {
    eprintln!("error: {error}");

    let mut source = error.source();
    while let Some(cause) = source {
        eprintln!("caused by: {cause}");
        source = cause.source();
    }

    eprintln!("hint: {}", error.hint());
    ExitCode::FAILURE
}

/// Prints a production binary's build metadata through the machine-readable
/// identity interface when it is the only requested argument.
pub fn print_backend_build_identity_if_requested(
    package_name: &str,
    package_version: &str,
    compatible_backend_version: Option<&str>,
    subcircuit_library_package_version: Option<&str>,
    subcircuit_library_source_digest: Option<&str>,
) -> Result<bool, String> {
    let arguments = env::args_os().skip(1).collect::<Vec<_>>();
    if !arguments
        .iter()
        .any(|argument| argument == OsStr::new(BACKEND_BUILD_IDENTITY_ARGUMENT))
    {
        return Ok(false);
    }
    if arguments.len() != 1 || arguments[0] != OsStr::new(BACKEND_BUILD_IDENTITY_ARGUMENT) {
        return Err(format!(
            "{BACKEND_BUILD_IDENTITY_ARGUMENT} cannot be combined with workflow arguments"
        ));
    }

    let compatible_backend_version = compatible_backend_version.ok_or_else(|| {
        format!(
            "{BACKEND_BUILD_IDENTITY_ARGUMENT} is unavailable because this binary was not built with the production subcircuit-library input"
        )
    })?;
    let subcircuit_library_package_version = subcircuit_library_package_version.ok_or_else(|| {
        format!(
            "{BACKEND_BUILD_IDENTITY_ARGUMENT} is unavailable because this binary was not built with the production subcircuit-library input"
        )
    })?;
    let subcircuit_library_source_digest = subcircuit_library_source_digest.ok_or_else(|| {
        format!(
            "{BACKEND_BUILD_IDENTITY_ARGUMENT} is unavailable because this binary was not built with the production subcircuit-library input"
        )
    })?;
    let metadata = BackendBuildMetadata::new(
        package_name,
        package_version,
        compatible_backend_version,
        subcircuit_library_package_version,
        subcircuit_library_source_digest,
    )?;
    println!(
        "{}",
        serde_json::to_string(&metadata)
            .map_err(|error| format!("failed to serialize backend build identity: {error}"))?
    );
    Ok(true)
}

/// Emits the verifier outcome as the sole standard-output record for the
/// verifier's machine-result mode.
pub fn print_verification_result(verified: bool) -> Result<(), String> {
    let result = VerificationResult {
        contract_version: 1,
        verified,
    };
    println!(
        "{}",
        serde_json::to_string(&result)
            .map_err(|error| format!("failed to serialize verification result: {error}"))?
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::VerificationResult;

    #[test]
    fn verification_result_has_a_minimal_versioned_shape() {
        let result = serde_json::to_value(VerificationResult {
            contract_version: 1,
            verified: true,
        })
        .expect("verification result must serialize");
        assert_eq!(
            result,
            serde_json::json!({ "contractVersion": 1, "verified": true })
        );
    }
}
