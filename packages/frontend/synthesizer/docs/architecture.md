# Synthesizer Architecture

The synthesizer workspace has three layers:

1. `core/` for shared synthesis logic
2. `node-cli/` for Node-specific adapters
3. `web-app/` for browser-specific adapters

## High-Level Flow

The runtime flow is:

1. an adapter prepares the common synthesis payload
2. the adapter resolves subcircuit metadata and WASM assets
3. `core/src/app/synthesize.ts` runs the shared synthesis flow
4. `core/src/circuitGenerator/` derives circuit artifacts
5. the adapter serializes or transports the result

## Shared Core

`core/` is internal and not published as a standalone package.

Stable entrypoints:

- `core/src/app.ts`
  - synthesis payload and output types
  - `synthesizeFromSnapshotInput`
  - `createSynthesisOutputJsonFiles`
- `core/src/synthesizer.ts`
  - `createSynthesizer`
  - `SynthesizerInterface`
  - `SynthesizerOpts`
  - `BlockInfo`
- `core/src/circuit.ts`
  - `createCircuitGenerator`
  - `CircuitGenerator`
  - `CircuitArtifacts`
- `core/src/subcircuit.ts`
  - resolved subcircuit-library metadata helpers and types

Implementation-heavy code lives under:

- `core/src/synthesizer/`
- `core/src/circuitGenerator/`
- `core/src/subcircuit/`

## Node Adapter

`node-cli/` owns:

- `src/cli/` for the published `synthesizer` CLI
- `src/io/` for filesystem output writing
- `src/subcircuit/` for installed-library metadata and Node WASM loading

`examples/` at the workspace root owns:

- debug-only or example-oriented flows
- reusable fixture inputs and helper scripts used across adapters

The Node package reads snapshot files, loads the installed `@tokamak-zk-evm/subcircuit-library`, calls `core`, and writes JSON artifacts to disk.

## Web Adapter

`web-app/` owns:

- `src/input/` for `Blob` and URL loaders
- `src/subcircuit/` for the bundled subcircuit runtime bridge
- `src/output/` for browser downloads and JSON POST helpers
- `src/synthesize.ts` for the browser-facing `synthesize(input)` wrapper

The web package bundles the published subcircuit-library JSON and WASM artifacts at build time and does not fetch those assets at runtime.

## Dependency Rules

- `core/` must not depend on `node-cli/` or `web-app/`
- `node-cli/` may depend on `core/`
- `web-app/` may depend on `core/`
- `node-cli/` and `web-app/` must not depend on each other
