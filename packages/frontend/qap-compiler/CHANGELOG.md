# Changelog

## Unreleased

## [1.0.3](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/subcircuit-library-v1.0.3) - 2026-04-20

Summary:
- Added published build metadata for the subcircuit library package.
- Aligned the published build metadata schema with the synthesizer package format.

Consumer impact:
- The published package now includes `build-metadata.json` with the `tokamak-l2js` build version and declared dependency range.

Notes:
- The build metadata file is generated during `dist` assembly from the installed dependency versions used for the package build.

## [1.0.2](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/subcircuit-library-v1.0.2) - 2026-04-20

Summary:
- Repositioned the package as the consumer-facing Tokamak zk-EVM subcircuit library.
- Unified the GitHub and npm README around a single consumer-facing document.

Consumer impact:
- Clarified the published artifact surface, consumer compatibility, and package role.
- Excluded `info` build logs from the published `dist` package.

Notes:
- Added package-specific documentation for consumer integration and maintainer-side generation/release flow.
- Added package-scoped changelog tracking for npm releases.

## [1.0.1](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/subcircuit-library-v1.0.1) - 2026-04-17

Summary:
- Bumped the published package to `1.0.1`.
- Finalized the rename from `qap-compiler` to `subcircuit-library` for the published package.

Consumer impact:
- Published package metadata and naming aligned with the new npm package identity.

Notes:
- Introduced trusted publishing and streamlined `dist`-based release preparation.

## [1.0.0](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/subcircuit-library-v1.0.0) - 2026-04-16

Summary:
- Reworked the package around a generated `dist` publish flow.
- Promoted the package version to `1.0.0`.

Consumer impact:
- Established the published subcircuit library package as a dedicated npm delivery surface.

Notes:
- Added the CLI build toolkit flow and initial publish automation groundwork.

## Pre-1.0 History

This section is reconstructed from repository history and summarizes pre-`1.0.0` milestones.

### 0.0.2 - 2025-04-24

Summary:
- Published the second pre-`1.0` package revision.

Consumer impact:
- Refined the early published QAP-compiler package flow used before the subcircuit-library naming transition.

Notes:
- Followed the initial `0.0.1` packaging baseline with release-focused fixes.

### 0.0.1 - 2025-04-15

Summary:
- Introduced the first npm versioned package state for the project.

Consumer impact:
- Established the earliest packaged delivery of the generated subcircuit library artifacts.

Notes:
- This was still part of the pre-`1.0` QAP-compiler era and predates the current product naming.
