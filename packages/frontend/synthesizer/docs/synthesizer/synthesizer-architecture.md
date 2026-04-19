# Synthesizer Architecture

The current Synthesizer layout has three layers:

1. `core/` for shared synthesis logic
2. `node-cli/` for Node-specific adapters
3. `web-app/` for browser-specific adapters

## High-level pipeline

- Adapter layer prepares inputs and subcircuit assets.
- `core/src/app/synthesize.ts` runs synthesis from an input snapshot.
- `core/src/circuitGenerator/` produces circuit artifacts.
- Adapter layer serializes or transports outputs.

## Shared core

Key shared entrypoints:
- `core/src/app.ts`
  - shared synthesis orchestration
  - shared output JSON serialization
  - shared subcircuit library resolution helpers
- `core/src/synthesizer.ts`
  - `createSynthesizer`
  - shared runtime types
- `core/src/circuit.ts`
  - `createCircuitGenerator`
  - `CircuitGenerator`
  - circuit artifact types
- `core/src/subcircuit.ts`
  - shared subcircuit metadata parsing
  - resolved library types

Core runtime internals still live under:
- `core/src/synthesizer/`
- `core/src/circuitGenerator/`
- `core/src/subcircuit/`

## Node package

`node-cli/` owns:
- `src/cli/`
  - CLI command entrypoint
- `src/io/`
  - filesystem output writers
  - environment helpers
- `src/rpc/`
  - RPC helpers that build `SynthesizerOpts`
- `src/subcircuit/`
  - installed subcircuit metadata loading
  - Node WASM loading

The Node package should not duplicate synthesis flow. It should prepare inputs, call `core`, and write files.

## Web package

`web-app/` owns:
- `src/input/`
  - Blob and URL input loaders
- `src/subcircuit/`
  - fetch-based or uploaded-file subcircuit library providers
- `src/output/`
  - browser download helpers
  - JSON POST helpers
- `src/synthesize.ts`
  - browser-facing `synthesize(input)` wrapper

The web package should prepare browser-friendly inputs, call `core`, and return in-memory outputs.

## Dependency direction

- `core/` depends on neither `node-cli/` nor `web-app/`
- `node-cli/` may depend on `core/`
- `web-app/` may depend on `core/`
- `node-cli/` and `web-app/` must not depend on each other
