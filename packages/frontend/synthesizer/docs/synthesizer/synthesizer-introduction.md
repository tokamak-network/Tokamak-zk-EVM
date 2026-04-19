# Synthesizer Introduction

Tokamak zk-EVM Synthesizer turns a Tokamak L2 transaction snapshot into circuit-ready artifacts.
It mirrors EVM execution with subcircuit placements, records wire-equality constraints, and emits the JSON files that the downstream prover consumes.

## Workspace layout

The workspace contains three parts:

- `core/`
  - internal shared runtime
  - synthesis orchestration
  - circuit generation
  - subcircuit metadata parsing
- `node-cli/`
  - published as `@tokamak-zk-evm/synthesizer-node`
  - runs synthesis from JSON files on Node.js
  - loads `@tokamak-zk-evm/subcircuit-library` at runtime
- `web-app/`
  - published as `@tokamak-zk-evm/synthesizer-web`
  - exposes browser-facing helpers and `synthesize(input)`
  - bundles the subcircuit library JSON and WASM at build time

## What the synthesizer produces

The shared runtime produces:

- placement variables for every subcircuit placement
- the public instance and its descriptions
- the wire-equality permutation
- the final state snapshot after execution
- EVM analysis data such as step logs and message code addresses

## Inputs

The common payload is defined by `core/src/app/types.ts`:

- `previousState`
  - Tokamak L2 state snapshot
- `transaction`
  - Tokamak L2 transaction snapshot
- `blockInfo`
  - block metadata used by block opcodes and buffer initialization
- `contractCodes`
  - deployed bytecode snapshots for addresses involved in the run

Adapters add the runtime-specific pieces:

- `node-cli/`
  - resolves the installed subcircuit metadata
  - loads WASM buffers from the installed package
- `web-app/`
  - uses the subcircuit JSON and WASM that were bundled into the published package

## Runtime model

The shared synthesis flow:

1. reconstructs a Tokamak L2 state manager from the snapshot input
2. recreates the signed L2 transaction
3. runs the shared `Synthesizer` runtime
4. generates circuit artifacts from the placement trace
5. serializes or exports those results through the adapter layer

## Scope and current limits

The implementation is designed for Tokamak zk-EVM circuit preparation, not for general-purpose Ethereum tracing.
Important current constraints:

- `KECCAK256` is represented with Poseidon-oriented circuit logic
- gas accounting is observed from the VM but not fully enforced as circuit constraints
- unsupported EVM features still include `CREATE`, `CREATE2`, `SELFDESTRUCT`, `TLOAD`, `TSTORE`, blob opcodes, and precompiles
