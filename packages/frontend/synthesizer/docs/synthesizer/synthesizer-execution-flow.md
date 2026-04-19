# Synthesizer Execution Flow

The execution flow is now shared by `core/` and called by target-specific adapters.

## 1) Prepare input payload

The adapter prepares:
- previous state snapshot
- transaction snapshot
- block info
- contract code list
- resolved subcircuit library
- WASM buffers

Examples:
- `node-cli/src/cli/index.ts`
  - reads JSON input files
  - uses `node-cli/src/subcircuit/installedLibrary.ts`
  - loads WASM with `node-cli/src/subcircuit/wasmLoader.ts`
- `web-app/src/input/index.ts`
  - loads the same payload from uploaded `Blob`s or fetched URLs
- `web-app/src/subcircuit/index.ts`
  - builds browser-compatible subcircuit providers

## 2) Run shared synthesis flow

`core/src/app/synthesize.ts`:
- reconstructs the Tokamak L2 state manager from the snapshot
- seeds sender nonce state
- constructs the shared Synthesizer runtime
- executes `synthesizeTX()`
- captures the final state snapshot
- builds circuit artifacts

## 3) Generate circuit outputs

The shared result contains:
- `placementVariables`
- `publicInstance`
- `publicInstanceDescription`
- `permutation`
- `finalStateSnapshot`
- `evmAnalysis`

`core/src/app/io.ts` turns that result into JSON strings.

## 4) Adapter-specific output handling

- `node-cli/src/io/jsonWriter.ts`
  - writes JSON files to disk
- `web-app/src/output/index.ts`
  - creates downloadable `Blob`s
  - creates JSON payloads for POST requests

The synthesis flow itself is shared. Only input and output handling differ by target.
