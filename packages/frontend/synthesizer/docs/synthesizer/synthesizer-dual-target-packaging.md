# Synthesizer Dual-Target Packaging

This document describes the current packaging model for the split Synthesizer codebase.

## Published packages

The repository exposes two published packages and one internal shared module:

1. `@tokamak-zk-evm/synthesizer-node`
2. `@tokamak-zk-evm/synthesizer-web`
3. `packages/frontend/synthesizer/core`

`core/` is not published as a standalone package.

## Responsibilities

### `core/`

`core/` owns:
- shared synthesis execution flow
- circuit generation
- shared subcircuit metadata parsing
- shared synthesis runtime types

`core/` must stay environment-neutral.

It must not depend on:
- `node:*`
- filesystem APIs
- `commander`
- browser globals
- package-install path resolution

### `@tokamak-zk-evm/synthesizer-node`

`node-cli/` owns:
- the CLI entrypoint
- Node RPC helpers
- installed subcircuit library loading
- Node WASM loading
- filesystem output helpers

`node-cli/` may depend on `core/`, but it must not reimplement shared synthesis flow.

### `@tokamak-zk-evm/synthesizer-web`

`web-app/` owns:
- browser input loading from uploaded files or fetched URLs
- browser subcircuit providers
- browser output adapters for downloads and JSON POST
- the browser-facing `synthesize(input)` wrapper

`web-app/` may depend on `core/`, but it must not reimplement shared synthesis flow.

## Dependency direction

The allowed dependency graph is:

```text
core
├── node-cli
└── web-app
```

Rules:
- `core/` must not depend on `node-cli/` or `web-app/`
- `node-cli/` may depend on `core/`
- `web-app/` may depend on `core/`
- `node-cli/` and `web-app/` must not depend on each other

## Current layout

```text
packages/frontend/synthesizer/
├── .vscode/
├── package.json
├── core/
│   └── src/
│       ├── app.ts
│       ├── circuit.ts
│       ├── subcircuit.ts
│       ├── synthesizer.ts
│       ├── app/
│       ├── circuitGenerator/
│       ├── subcircuit/
│       └── synthesizer/
├── node-cli/
│   └── src/
│       ├── cli/
│       ├── io/
│       ├── rpc/
│       ├── subcircuit/
│       └── synthesizer/
└── web-app/
    └── src/
        ├── input/
        ├── output/
        ├── subcircuit/
        ├── synthesize.ts
        └── types.ts
```

## Shared core API

The current shared entrypoints are:

- `core/src/app.ts`
  - `synthesizeFromSnapshotInput`
  - `createSynthesisOutputJsonFiles`
  - subcircuit library resolution helpers
- `core/src/circuit.ts`
  - `createCircuitGenerator`
  - `CircuitGenerator`
  - `CircuitArtifacts`
- `core/src/synthesizer.ts`
  - `createSynthesizer`
  - `SynthesizerInterface`
  - `SynthesizerOpts`
  - `BlockInfo`
- `core/src/subcircuit.ts`
  - subcircuit parsing helpers
  - resolved-library types

These entrypoints are intentionally narrower than the underlying directory tree so adapter packages can depend on stable boundaries.

## Node adapter flow

`node-cli/src/cli/index.ts`:
1. loads JSON input files
2. loads the installed subcircuit library
3. loads WASM buffers from the installed package
4. calls `synthesizeFromSnapshotInput`
5. writes output files through `node-cli/src/io/jsonWriter.ts`

## Web adapter flow

`web-app/` exposes:
- `loadSynthesisInputFromFiles`
- `loadSynthesisInputFromUrls`
- `createFetchSubcircuitLibraryProvider`
- `createFileSubcircuitLibraryProvider`
- `prepareSynthesisInput`
- `synthesize`
- `saveSynthesisOutputToFiles`
- `postSynthesisOutput`

The browser package prepares inputs, calls shared synthesis flow, and returns or transports results without using Node filesystem APIs.

## Workspace root rule

`packages/frontend/synthesizer/` is a private workspace root, not a published package.

It should contain:
- shared source modules
- published child packages
- workspace-level debug entrypoints
- architecture documents

It should not become a runtime output location.
