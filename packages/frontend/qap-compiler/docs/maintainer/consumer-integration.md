# Consumer Integration

Last updated: 2026-09-23

Audience: maintainers validating the repository's package boundaries and
consumer relationships. This is not a standalone application guide.

This document explains how the Tokamak zk-EVM Subcircuit Library is consumed by the supported `main`-branch consumers.

## tokamak-cli

### Role

`tokamak-cli` is the top-level operator workflow for install, setup, proving, and verification flows in the Tokamak zk-EVM monorepo.

### How It Consumes the Package

`tokamak-cli` consumes the synchronized published subcircuit-library package as
the production backend build input. Development builds may use repository-local
generated output, but that path is not the published consumer contract.

### Main-Branch Compatibility

Supported on `main` through the synchronized package and backend identity
checks described in the repository [version and release rules](../../../../../docs/version-rules.md).

### Integration Notes

`tokamak-cli` depends on the generated library as a build and packaging input rather than as a standalone application API. Its compatibility is tied to the structure and meaning of the published subcircuit artifacts.

## synthesizer

### Role

`synthesizer` converts Tokamak zk-EVM transaction and state inputs into transaction-specific circuit data used by the rest of the stack.

### How It Consumes the Package

`synthesizer` consumes the published subcircuit library package directly. It reads library-wide metadata, resolves the subcircuit catalog into its internal model, and loads the corresponding WASM subcircuit artifacts for runtime use. The web-facing build can bundle those published assets ahead of time, while the Node-targeted flow can resolve them from the installed package at runtime.

### Main-Branch Compatibility

Supported on `main` through direct package consumption across the synthesizer packages.

### Integration Notes

The synthesizer expects the published metadata and artifact layout to remain aligned with its library-resolution logic. It treats the subcircuit library as an installed artifact package rather than as a source-circuit workspace.

## backend

### Role

`backend` provides the setup, proving, and verification algorithms used by the Tokamak zk-SNARK stack.

### How It Consumes the Package

`backend` consumes the synchronized published subcircuit library as setup and
proving input. Development builds can select local QAP output explicitly; the
production backend embeds the npm snapshot selected by the release build.

### Main-Branch Compatibility

Supported on `main` through the synchronized package snapshot and its recorded
source digest.

### Integration Notes

The backend integration is centered on the compiled library artifacts themselves. It depends on the subcircuit library as a stable proving/setup input surface, not on the maintainer-side generation tooling interface.

## Tokamak-zk-EVM-contracts

### Role

`Tokamak-zk-EVM-contracts` is the external contracts repository that coordinates with the Tokamak zk-EVM stack for private-channel and proof-verification workflows.

### How It Consumes the Package

`Tokamak-zk-EVM-contracts` consumes the subcircuit library through repository-level integration with the Tokamak zk-EVM codebase. In that integration model, the generated library output is part of the coordinated stack rather than a separate consumer application API.

### Main-Branch Compatibility

Supported on `main` as the external consumer repository coordinated with the Tokamak zk-EVM stack.

### Integration Notes

This integration is defined at the repository and generated-artifact level. It should be understood as a coordinated stack integration, not as a standalone npm-package-only workflow.
