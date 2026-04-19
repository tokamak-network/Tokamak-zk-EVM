# Synthesizer Architecture

The current workspace has three layers:

1. `core/` for shared synthesis logic
2. `node-cli/` for Node-specific adapters
3. `web-app/` for browser-specific adapters

## High-level pipeline

- the adapter layer prepares the common synthesis payload
- `core/src/app/synthesize.ts` runs synthesis from that payload plus resolved subcircuit assets
- `core/src/circuitGenerator/` produces circuit artifacts
- the adapter layer serializes or transports outputs

## Shared core

`core/` is an internal shared module, not a published package.

Its public entrypoints are:

- `core/src/app.ts`
  - `synthesizeFromSnapshotInput`
  - `createSynthesisOutputJsonFiles`
  - payload and output types
  - helpers for resolving subcircuit-library data and WASM buffers
- `core/src/synthesizer.ts`
  - `createSynthesizer`
  - `SynthesizerOpts`
  - `SynthesizerInterface`
  - `BlockInfo`
- `core/src/circuit.ts`
  - `CircuitGenerator`
  - `createCircuitGenerator`
  - `CircuitArtifacts`
- `core/src/subcircuit.ts`
  - subcircuit metadata parsing
  - library type guards
  - resolved subcircuit-library types

Implementation-heavy code lives under:

- `core/src/synthesizer/`
- `core/src/circuitGenerator/`
- `core/src/subcircuit/`

## Node package

`node-cli/` owns:

- `src/cli/`
  - the published CLI command entrypoint
- `src/io/`
  - filesystem output writers
- `src/subcircuit/`
  - installed subcircuit metadata loading
  - Node WASM loading
- `examples/config-runner.ts`
  - debug-only config execution adapters
  - RPC and env-backed config input preparation

The published Node package does not own synthesis flow.
It prepares file-based inputs, loads the installed subcircuit library, calls `core`, and writes JSON outputs.

## Web package

`web-app/` owns:

- `src/input/`
  - Blob and URL input loaders
- `src/subcircuit/`
  - runtime bridge to the bundled subcircuit JSON and WASM
- `src/output/`
  - browser download helpers
  - JSON POST helpers
- `src/synthesize.ts`
  - browser-facing `synthesize(input)` wrapper

The published web package does not fetch subcircuit assets at runtime.
Its build step generates a bundled module from `@tokamak-zk-evm/subcircuit-library`, and the runtime consumes that bundled data directly.

## Dependency direction

- `core/` depends on neither `node-cli/` nor `web-app/`
- `node-cli/` may depend on `core/`
- `web-app/` may depend on `core/`
- `node-cli/` and `web-app/` must not depend on each other
