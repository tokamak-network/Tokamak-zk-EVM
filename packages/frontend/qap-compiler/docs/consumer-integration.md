# Consumer Integration

This document explains how the Tokamak zk-EVM Subcircuit Library is consumed by the supported `main`-branch consumers.

## tokamak-cli

### Role

`tokamak-cli` is the top-level operator workflow for install, setup, proving, and verification flows in the Tokamak zk-EVM monorepo.

### How It Consumes the Package

`tokamak-cli` consumes the subcircuit library through repository-generated library output. Its install and packaging flow compiles the library, carries the generated artifacts into packaged runtime resources, and then uses those artifacts as part of the end-to-end CLI workflow.

### Main-Branch Compatibility

Supported on `main` through same-repository integration with the generated Tokamak zk-EVM subcircuit library output.

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

`backend` consumes the generated subcircuit library as setup and proving input. The library acts as the fixed subcircuit basis that is paired with synthesizer-produced transaction-specific data during the backend pipeline.

### Main-Branch Compatibility

Supported on `main` through repository-generated subcircuit library output consumed by the backend workflows.

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
