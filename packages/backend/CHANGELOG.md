# Changelog

All notable changes to the backend workspace are documented in this file.

The format is based on Keep a Changelog.

## [1.0.1] - 2026-04-22

### Added
- Added release-time embedding of the latest published `@tokamak-zk-evm/subcircuit-library` snapshot for backend release binaries.
- Added per-package `build-metadata-<package>.json` generation for backend release builds.
- Added CRS publication hardening for `dusk_backed_mpc_setup`, including release-only publication checks, build-metadata validation, duplicate-version rejection, and Drive publication metadata.
- Added Google Drive archive publication support for dusk-backed CRS outputs, including public viewer sharing configuration and publication metadata capture.

### Changed
- Bumped the backend workspace version from `1.0.0` to `1.0.1`.
- Switched release CLI contracts to use embedded subcircuit library assets instead of runtime `--subcircuit-library` paths.
- Shared final CRS artifact generation between `trusted-setup` and `mpc-setup`.
- Changed the verification artifact format from `sigma_verify.rkyv` to `sigma_verify.json`.
- Updated backend packaging and debug launch configurations to include release build metadata and match the embedded release input model.
- Refreshed backend documentation to match the current release and publication flow.

### Removed
- Removed legacy and duplicate `mpc-setup` utilities, compatibility paths, and deprecated helper binaries that were no longer part of the wrapper-first flow.
