# Changelog

All notable changes to Tokamak zk-EVM are documented in this file.

The repository uses a synchronized release version for the CLI, subcircuit library, synthesizer packages, and backend Rust workspace. This root changelog is the only changelog source. npm package artifacts do not include changelog files; package READMEs link back to this root changelog.

The format is based on Keep a Changelog.

## Unreleased

## [2.1.0] - 2026-05-02

### Repository

- Synchronized the release version to `2.1.0` across the CLI, subcircuit library, synthesizer packages, and backend workspace.
- Updated `npm run version:sync` to also derive and write the CLI-compatible backend version from the synchronized `MAJOR.MINOR` release line.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.1.0`.
- Updated `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion` to `2.1`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.1.0` dependency range.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.1.0`.
- Updated `tokamak-l2js` consumption to `0.1.4` and regenerated qap-compiler constants so `nMtDepth()` is `36`.
- Updated `qap-compiler --reload-constants` to verify the local `tokamak-l2js` install against the npm registry latest version before syncing constants.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.1.0`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.1.0` dependency range.
- Updated both synthesizer packages to consume `tokamak-l2js` through the `^0.1.4` dependency range.
- Refreshed private-state example fixtures with the current deployment contract addresses, bytecode, and transaction signatures.
- Regenerated the L2StateChannel and private-state example state roots for the `MT_DEPTH=36` configuration.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.1.0`.
- Moved the proving compatibility line to `2.1` for the `MT_DEPTH=36` subcircuit configuration.

## [2.0.16] - 2026-05-01

### Repository

- Synchronized the release version to `2.0.16` across the CLI, subcircuit library, synthesizer packages, and backend workspace.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.0.16`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.0.16` dependency range.
- Bundled the updated `2.0.16` backend runtime used by `--install`, `--preprocess`, `--prove`, and `--verify`; CLI command behavior is otherwise unchanged.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.0.16`.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.0.16`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.0.16` dependency range.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.0.16`.
- Pruned unused embedded subcircuit-library build-support metadata and compatibility helpers while keeping release backend subcircuit snapshots internal to the backend build.
- Switched setup and prove R1CS loading from generated JSON constraint files to binary `.r1cs` artifacts, including binary header validation and sparse row scanning.
- Optimized prove initialization by using sparse uvwXY generation, binary R1CS preload, and cached permutation power tables.
- Optimized prover polynomial work with coefficient-domain vanishing division, algebraic polynomial-combination rewrites, cached cross-stage terms, and special-form polynomial products.
- Optimized bivariate NTTs by using ICICLE column-batch transforms for real 2D shapes and direct 1D fast paths for single-axis shapes.
- Removed generic polynomial multiplication output shrinking after interpolation to avoid repeated size-optimization overhead.
- Fixed the `prove0` `B` zero-knowledge vanishing term to use the private-input domain exponent `l_D - l`.
- Expanded backend timing instrumentation and refreshed CUDA prove optimization reports and artifacts.

## [2.0.15] - 2026-04-30

### Repository

- Synchronized the release version to `2.0.15` across the CLI, subcircuit library, synthesizer packages, and backend workspace.
- Removed package-local changelog mirrors from npm package artifacts and linked package READMEs to the root changelog instead.
- Added the Tokamak zk-EVM version management rules and CRS compatibility check policy to `docs/version-rules.md`.
- Clarified that, within a fixed `MAJOR.MINOR` compatibility line, CRS reuse across patch releases is gated by subcircuit `sourceDigest` equality.
- Removed obsolete repository-local documentation files that are no longer part of the release documentation set.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.0.15`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.0.15` dependency range.
- Added `tokamakZkEvm.compatibleBackendVersion` as the CLI-owned backend compatibility version source of truth.
- Changed CRS install selection to use strict `MAJOR.MINOR` CRS archive names and reject patch-versioned CRS archives.
- Added CRS provenance, CRS artifact hash, backend metadata, and subcircuit source digest validation before installing downloaded CRS artifacts.
- Kept installed runtime state scoped to the installed package version and derived the CRS compatibility version from that package version.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.0.15`.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.0.15`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.0.15` dependency range.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.0.15`.
- Recorded the CLI-compatible backend version in backend build metadata.
- Recorded subcircuit-library source digests in backend build metadata for CRS compatibility checks.
- Restricted the subcircuit source digest to CRS-relevant constants, r1cs, wasm, json, and library configuration artifacts.
- Simplified subcircuit snapshot metadata by deriving the constants path from the unpacked snapshot layout instead of storing it separately.
- Changed dusk-backed MPC setup provenance and CRS archive naming to use the `MAJOR.MINOR` compatibility version.
- Added pre-publication validation that rejects CRS provenance or build metadata that does not match the CLI-compatible backend version.

### CI

- Moved source build validation to the front of the publish workflow.
- Changed the publish workflow to build release tarballs once in `source-build`, pass those tarballs through EVM compatibility, CRS, and pre-publish checks, and publish the same tested tarballs to npm.
- Moved EVM compatibility tests before subcircuit-library publishing so package-level smoke tests run before any npm publication.
- Kept `pre-publish-test-build` after subcircuit-library publishing so backend release builds can continue resolving `@tokamak-zk-evm/subcircuit-library@latest` from npm.
- Updated the published CRS check to select only the latest strict `MAJOR.MINOR` CRS archive and validate its embedded provenance, metadata, and hashes.

## [2.0.14] - 2026-04-29

### Repository

- Synchronized the release version to `2.0.14` across the CLI, subcircuit library, synthesizer packages, and backend workspace.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.0.14`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.0.14` dependency range.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.0.14`.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.0.14`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.0.14` dependency range.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.0.14`.
- Limited local qap-compiler subcircuit builds to `mpc-setup`; release builds of `trusted-setup`, `preprocess`, `prove`, and `verify` continue to resolve `@tokamak-zk-evm/subcircuit-library` from npm.

## [2.0.13] - 2026-04-29

### Repository

- Synchronized the release version to `2.0.13` across the CLI, subcircuit library, synthesizer packages, and backend workspace.

### Subcircuit Library

- Required the official system `circom` compiler for subcircuit builds instead of falling back to the bundled `circom2` package.
- Removed the `circom2` package dependency from the subcircuit library build toolchain.
- Recorded the system `circom` compiler metadata in the generated subcircuit library build metadata.
- Updated the release publish workflow to install and verify `circom 2.2.2` before building the subcircuit library.
- Switched the subcircuit library publish workflow dependency installation from `npm install` to `npm ci`.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.0.13`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.0.13` dependency range.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.0.13`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.0.13` dependency range.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.0.13`.

## [2.0.12] - 2026-04-29

### Repository

- Introduced root-level version synchronization tooling for the release packages and backend workspace.
- Centralized changelog maintenance in this root `CHANGELOG.md`.
- Synchronized the release version to `2.0.12` across the CLI, subcircuit library, synthesizer packages, and backend workspace.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.0.12`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.0.12` dependency range.
- Switched CLI release readiness checks to validate this root changelog.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.0.12`.
- Switched dist package generation to copy this root changelog into the published package artifact.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.0.12`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.0.12` dependency range.
- Switched package changelog mirroring and release validation to use this root changelog.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.0.12`.

## [2.0.11] - 2026-04-28

### CLI

- Fixed `--doctor` argument validation, reduced duplicate CLI stage file lists, and removed the undocumented `tokamak-zk-evm` binary alias in favor of `tokamak-cli`.

## [2.0.10] - 2026-04-27

### CLI

- Allowed `--install --docker` on Windows hosts with Docker Desktop by using the Linux Docker runtime cache for Docker installs and backend commands.
- Included the ICICLE manifest in Docker install images and added a Dockerfile guard for that file.
- Fixed Windows Docker-mode uninstall to remove the Linux Docker runtime cache instead of failing native platform detection.
- Removed host `zip` and `unzip` command dependencies from stage input archives and proof bundle export.
- Fixed `--verbose` parsing for preprocess, prove, verify, and proof export commands.
- Hardened CUDA Docker mode by checking driver compatibility, forcing the selected CUDA ICICLE asset during Docker installs, validating bootstrap consistency, and falling back to non-GPU Docker runs when CUDA is no longer available.
- Added Docker image existence checks for saved bootstraps, CUDA fallback handling to the generated Docker run script, and Windows-specific doctor install guidance.

## [2.0.9] - 2026-04-26

### CLI

- Removed the npm `postinstall` hook so installing the package no longer runs `tokamak-cli --install` automatically.

## [2.0.8] - 2026-04-26

### CLI

- Added `--doctor` output for the absolute runtime workspace path.

## [2.0.7] - 2026-04-24

### CLI

- Simplified internal CLI stage and backend build orchestration with no intended user-facing behavior changes.

## [2.0.6] - 2026-04-24

### CLI

- Switched CRS download length detection to use the published Google Drive folder listing metadata instead of issuing a direct-download HEAD request before resumable downloads.

## [2.0.5] - 2026-04-24

### CLI

- Simplified CRS archive cache reuse so the CLI now compares the published archive version, timestamp, and file size instead of unpacking cached archives to verify provenance hashes.

## [2.0.4] - 2026-04-24

### CLI

- Added Linux-only `--install --docker` support that installs through an Ubuntu 22 Docker image, records Docker bootstrap files under `~/.tokamak-zk-evm/linux/docker`, and runs backend preprocess, prove, and verify commands through that bootstrap when Docker is available.
- Moved Docker install image construction to a static Dockerfile that is shipped in the npm package.
- Documented the Docker install image contents and the rationale for its conservative dependency set.
- Reworked install caches so CRS reuse is validated with `crs_provenance.json` version and SHA-256 artifact hashes, and ICICLE tarball reuse is validated with packaged SHA-256 manifests.

## [2.0.3] - 2026-04-22

### CLI

- Switched the default CLI workspace root to `~/.tokamak-zk-evm` so the runtime now uses the existing top-level Tokamak workspace directly.

## [2.0.2] - 2026-04-22

### CLI

- Avoided duplicate CLI publish attempts in the GitHub Actions release workflow while keeping `npm run publish` available for maintainers.
- Aligned CLI setup artifact handling with the current CRS package format by expecting `sigma_verify.json` during install and verification.

## [2.0.1] - 2026-04-22

### CLI

- Added `--uninstall` so the CLI can remove its local workspace and cached runtime files for the current platform.
- Changed the default CLI workspace root from `~/.tokamak-zk-evm/cli` to `~/.tokamak-zk-evm`.
- Changed Linux runtime installation to download the ICICLE CUDA backend only when an NVIDIA GPU is detected.

## [2.0.0] - 2026-04-21

### CLI

- Removed the dependency on the repository root `tokamak-cli` wrapper and root shell packaging scripts.
- Moved runtime installation into the CLI package itself.
- Added resumable CRS downloads with progress output.
- Flattened proof bundle export so `--extract-proof` output can be passed back into `--verify`.
- Clarified working-directory behavior and runtime output locations in the package documentation.

## [1.0.3] - 2026-04-20

### Subcircuit Library

- Added published build metadata for the subcircuit library package.
- Aligned the published build metadata schema with the synthesizer package format.
- Included `build-metadata.json` with the `tokamak-l2js` build version and declared dependency range in the published package.

## [1.0.2] - 2026-04-28

### Backend Workspace

- Added memory-aware tiled GPU matrix multiplication for the R1CS-to-QAP evaluation path.
- Added retry handling that halves the GPU matrix multiplication tile width after allocation failures.
- Added environment overrides for GPU matrix multiplication tile width and memory budget selection.
- Added a tiled matrix multiplication regression test against the existing untiled implementation.
- Bumped the backend workspace version from `1.0.1` to `1.0.2`.
- Changed `read_R1CS_gen_uvwXY` to use the tiled GPU matrix multiplication path while keeping the CPU path unchanged.

### Synthesizer

- Updated the published `@tokamak-zk-evm/subcircuit-library` dependency range to `^1.0.3`.

### Subcircuit Library

- Repositioned the package as the consumer-facing Tokamak zk-EVM subcircuit library.
- Unified the GitHub and npm README around a single consumer-facing document.
- Clarified the published artifact surface, consumer compatibility, and package role.
- Excluded `info` build logs from the published `dist` package.

## [1.0.1] - 2026-04-22

### Backend Workspace

- Added release-time embedding of the latest published `@tokamak-zk-evm/subcircuit-library` snapshot for backend release binaries.
- Added per-package `build-metadata-<package>.json` generation for backend release builds.
- Added CRS publication hardening for `dusk_backed_mpc_setup`, including release-only publication checks, build-metadata validation, duplicate-version rejection, and Drive publication metadata.
- Added Google Drive archive publication support for dusk-backed CRS outputs, including public viewer sharing configuration and publication metadata capture.
- Bumped the backend workspace version from `1.0.0` to `1.0.1`.
- Switched release CLI contracts to use embedded subcircuit library assets instead of runtime `--subcircuit-library` paths.
- Shared final CRS artifact generation between `trusted-setup` and `mpc-setup`.
- Changed the verification artifact format from `sigma_verify.rkyv` to `sigma_verify.json`.
- Updated backend packaging and debug launch configurations to include release build metadata and match the embedded release input model.
- Refreshed backend documentation to match the current release and publication flow.
- Removed legacy and duplicate `mpc-setup` utilities, compatibility paths, and deprecated helper binaries that were no longer part of the wrapper-first flow.

### Synthesizer

- Removed the extra `ethers` installation requirement from the published package docs and metadata.

### Subcircuit Library

- Bumped the published package to `1.0.1`.
- Finalized the rename from `qap-compiler` to `subcircuit-library` for the published package.
- Introduced trusted publishing and streamlined `dist`-based release preparation.

## [1.0.0] - 2026-04-20

### Synthesizer

- Established the published Node CLI surface for file-based Tokamak zk-EVM synthesis runs.
- Established the published browser-facing package with bundled subcircuit-library assets.
- Established the shared synthesis runtime that both published packages consume.

### Subcircuit Library

- Reworked the package around a generated `dist` publish flow.
- Promoted the package version to `1.0.0`.
- Established the published subcircuit library package as a dedicated npm delivery surface.
- Added the CLI build toolkit flow and initial publish automation groundwork.
