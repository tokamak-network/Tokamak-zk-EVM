# Synthesizer Dual-Target Packaging

This document describes the current packaging model and release assumptions for the workspace.

## Published packages

The repository exposes two published packages and one internal shared module:

1. `@tokamak-zk-evm/synthesizer-node`
2. `@tokamak-zk-evm/synthesizer-web`
3. `packages/frontend/synthesizer/core`

`core/` is not published as a standalone package.

The workspace version policy is synchronized:

- `@tokamak-zk-evm/synthesizer-node`
- `@tokamak-zk-evm/synthesizer-web`

should be released at the same version.

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
- installed subcircuit library loading
- Node WASM loading
- filesystem output helpers
- debug-only config execution adapters under `examples/config-runner.ts`

`node-cli/` may depend on `core/`, but it must not reimplement shared synthesis flow.

### `@tokamak-zk-evm/synthesizer-web`

`web-app/` owns:

- browser input loading from uploaded files or fetched URLs
- a bundled subcircuit-library runtime generated at build time
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
│       ├── app/
│       ├── app.ts
│       ├── circuit.ts
│       ├── index.ts
│       ├── subcircuit/
│       ├── subcircuit.ts
│       ├── synthesizer/
│       └── synthesizer.ts
├── node-cli/
│   ├── examples/
│   └── src/
│       ├── cli/
│       ├── io/
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
  - subcircuit-library resolution helpers
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

These entrypoints are intentionally narrower than the underlying directory tree so the adapter packages can depend on stable boundaries.

## Build and runtime differences

### Node package

- build: `esbuild` bundles the CLI and library entrypoints
- runtime subcircuit dependency: external
- runtime WASM loading: from the installed `@tokamak-zk-evm/subcircuit-library` package

### Web package

- build: a generated module imports subcircuit JSON and all WASM assets before `esbuild` runs
- runtime subcircuit dependency: bundled
- runtime WASM loading: from the generated bundled module, not from network fetch

## Stability rules

To keep the split stable:

- `core/` must remain environment-neutral
- config-only debug flows must stay outside the published `node-cli/src/` surface
- `web-app/` must keep browser delivery concerns outside `core/`
- package docs and published package metadata must describe the real split, not the old monolithic package
