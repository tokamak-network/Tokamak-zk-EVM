# Synthesizer Terminology

- **Synthesizer**: Component that mirrors EVM execution with circuit placements and produces permutation/witness outputs.
- **Placement**: An instance of a subcircuit. Holds `inPts` and `outPts` (arrays of `DataPt`) plus metadata (`name`, `usage`, `subcircuitId`).
- **DataPt**: Symbolic value reference with a placement origin (`source`, `wireIndex`), bit size, concrete `value`, and hex encoding; may include buffer metadata (`extSource`/`extDest`).
- **Buffer placements**: Fixed subcircuits that interface external values:
  - `PUBLIC_IN`, `BLOCK_IN`, `EVM_IN`, `PRIVATE_IN` (inputs)
  - `PUBLIC_OUT` (outputs)
  Reserved variables in `types/buffers.ts` describe specific wires (e.g., `FUNCTION_SELECTOR`, `EDDSA_SIGNATURE`, `BLOCKHASH_i`).
- **StackPt / MemoryPt**: Symbolic mirrors of the EVM stack and memory. `StackPt` handles push/dup/swap/pop; `MemoryPt` tracks time-ordered writes and overlapping reads for alias reconstruction.
- **Cached storage**: `StateManager.cachedStorage` records reads/writes, Merkle indices, and values to enforce warm access and final root computation.
- **Subcircuit library**: Pre-built circuits (ALU, Poseidon, Jubjub, buffers) from `@tokamak-zk-evm/qap-compiler`. Metadata lives in `interface/qapCompiler/configuredTypes.ts` and `importedConstants.ts`.
- **Permutation**: Wire-equality cycles emitted to `permutation.json`, ensuring all placements that share a value are constrained together.
- **Public instance**: Extracted subset of witness values split into user, block, and function sections according to `setupParams` in `importedConstants.ts`.
- **Tokamak L2 state manager**: Adapter that loads L1 contract storage via RPC, provides Merkle proofs, and signs L2 transactions for synthesis.
