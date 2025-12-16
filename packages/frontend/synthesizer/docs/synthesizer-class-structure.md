# Synthesizer Class Structure

This document summarizes the major classes that compose the Synthesizer runtime and output pipeline.

## Core runtime
- **Synthesizer** (`src/synthesizer/synthesizer.ts`): Orchestrates symbolic tracing. Subscribes to EVM events, manages handler instances, and exposes `synthesizeTX()` to run a signed Tokamak L2 transaction inside EthereumJS VM.
- **StateManager** (`src/synthesizer/handlers/stateManager.ts`): Owns placements, buffer placements, subcircuit metadata, storage/cache state (`cachedStorage`, `cachedEVMIn`, `cachedOrigin`, etc.), and symbolic containers (`StackPt`, `MemoryPt`).
- **InstructionHandler** (`src/synthesizer/handlers/instructionHandler.ts`): Opcode dispatcher. Maps Ethereum opcodes to handler functions that pop/push symbols, call arithmetic or memory helpers, verify storage proofs, and manage call depth.
- **BufferManager** (`src/synthesizer/handlers/bufferManager.ts`): Initializes buffer placements (PUBLIC_IN, BLOCK_IN, EVM_IN, PRIVATE_IN, PUBLIC_OUT) and loads reserved variables for block info, transaction inputs, Jubjub constants, and Merkle roots. Provides helpers to add reserved variables and arbitrary static inputs.
- **ArithmeticManager** (`src/synthesizer/handlers/arithmeticManager.ts`): Translates arithmetic/logic operations to library subcircuits, including Poseidon, Jubjub exponentiation, Merkle proof verification, and exponent batching.
- **MemoryManager** (`src/synthesizer/handlers/memoryManager.ts`): Handles memory copy/aliasing logic for MCOPY, MLOAD, MSTORE, CALLDATACOPY, RETURNDATACOPY, and related flows, producing placement inputs that reconstruct overlapping slices.

## Symbol containers and data types
- **DataPt** (`src/synthesizer/types/dataStructure.ts`): Describes a symbolic value with `source` (placement id), `wireIndex`, `sourceBitSize`, `value`, and hex representations; may include `extSource`/`extDest` for buffer metadata.
- **StackPt / MemoryPt** (`src/synthesizer/dataStructure/stackPt.ts`, `memoryPt.ts`): Symbolic stack and 2D memory timeline. Track data origins, detect aliasing, and expose helpers used by InstructionHandler.
- **Placements** (`src/synthesizer/types/placements.ts`): Ordered list of placement entries (`name`, `usage`, `subcircuitId`, `inPts`, `outPts`). Buffer placements are created first; additional placements are appended during execution.

## Circuit generation
- **CircuitGenerator** (`src/circuitGenerator/circuitGenerator.ts`): Facade for output generation. Holds the final placements and orchestrates variable/permutation builders. `writeOutputs(path?)` writes JSON artifacts.
- **VariableGenerator** (`src/circuitGenerator/handlers/variableGenerator.ts`): Removes unused EVM_IN wires, halves 256-bit words into 128-bit limbs, runs WASM subcircuit witnesses, and produces `placementVariables`, `publicInstance`, and descriptions.
- **PermutationGenerator** (`src/circuitGenerator/handlers/permutationGenerator.ts`): Builds permutation groups from placement wiring, validates equality constraints, and emits `permutation.json` plus permutation matrices.

## Interface layer
- **SynthesizerAdapter** (`src/interface/adapters/synthesizerAdapter.ts`): Convenience wrapper that fetches a transaction via RPC, executes it with an EVM constructed from RPC state, and returns the EVM, execution result, and permutation in memory.
- **CLI entry points** (`src/cli/index.ts`, `src/interface/cli/index.ts`): User-facing commands to run synthesis, parse transactions interactively, or list info.
- **RPC helpers** (`src/interface/rpc/rpc.ts`): Builds `SynthesizerOpts` from an L1 RPC endpoint (block info, Tokamak L2 state manager, L2 transaction signing).

## Tokamak L2 layer
- **TokamakL2JS** (`src/TokamakL2JS/*`): Poseidon/Jubjub helpers, L2 transaction constructors, and `TokamakL2StateManager` that mirrors L1 storage keys and Merkle proofs needed during synthesis.
