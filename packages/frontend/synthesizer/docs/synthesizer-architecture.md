# Synthesizer Architecture

The Synthesizer package instruments EthereumJS VM execution, mirrors opcode effects with Tokamak subcircuits, and emits circuit inputs for the zk-SNARK backend. This document reflects the current TypeScript implementation in `src/`.

## High-level pipeline
- Input: L1 transaction hash plus RPC URL, and the pre-built subcircuit assets from `@tokamak-zk-evm/qap-compiler`.
- RPC preparation: `src/interface/rpc/rpc.ts` builds a Tokamak L2 state manager from the L1 RPC state, signs an L2 transaction, and produces `SynthesizerOpts`.
- Core run: `src/synthesizer/synthesizer.ts` attaches to the EthereumJS EVM, observes every opcode step, and records placements via handler classes.
- Circuit generation: `src/circuitGenerator/circuitGenerator.ts` converts placements to `placementVariables.json`, `instance.json`, `instance_description.json`, and `permutation.json`.
- CLIs: `src/cli/index.ts` and `src/interface/cli/index.ts` wrap the flow for transactional runs and demos.

## Core modules
- **Synthesizer** (`src/synthesizer/synthesizer.ts`): Facade around handler classes. Hooks EVM events (`beforeMessage`, `step`, `afterMessage`) to prepare buffers, process opcodes, and finalize storage Merkle proofs before returning `RunTxResult`.
- **Handlers** (`src/synthesizer/handlers/*.ts`):
  - `InstructionHandler`: Dispatches opcode handlers; maintains stack/memory symbol state; orchestrates SLOAD/SSTORE proof checks and call pre-tasks.
  - `BufferManager`: Initializes buffer placements (PUBLIC_IN, BLOCK_IN, EVM_IN, PRIVATE_IN, PUBLIC_OUT) and loads reserved variables such as block info, transaction inputs, and Merkle roots.
  - `ArithmeticManager`: Maps arithmetic/logic ops to subcircuits, including Poseidon/Jubjub helpers.
  - `MemoryManager`: Resolves memory aliasing, MCOPY slices, and MSTORE/MLOAD transformations.
  - `StateManager`: Owns placements, subcircuit metadata, caches for storage access, and symbolic stack/memory containers.
- **Data structures** (`src/synthesizer/dataStructure/*.ts`, `src/synthesizer/types/*.ts`): Defines `DataPt`, `MemoryPts`, `StackPt`, placement entries, and reserved buffer metadata.
- **Circuit generation** (`src/circuitGenerator/*`):
  - `VariableGenerator` trims unused EVM_IN wires, halves 256-bit words into Circom-friendly limbs, generates placement variables, and extracts public instances.
  - `PermutationGenerator` builds permutation groups and writes the permutation file expected by the backend.
  - `circuitGenerator.writeOutputs()` writes JSON artifacts to `outputs/` or a provided directory.
- **Tokamak L2 state layer** (`src/TokamakL2JS/*`): L2 transaction type, Poseidon-based crypto helpers, and the L2 state manager that mirrors L1 storage via RPC with Merkle proofs.
- **Interface layer**:
  - `src/interface/cli/index.ts`: Interactive CLI (parse/synthesize/demo) for direct RPC-driven runs.
  - `src/cli/index.ts`: Minimal CLI focused on L2 state-channel simulation (`run`/`info` commands).
  - `src/interface/adapters/synthesizerAdapter.ts`: In-memory adapter that executes a transaction against RPC state and returns the resulting EVM, execution result, and permutation.

## Execution control flow
1. CLI builds `SynthesizerOpts` via `createSynthesizerOptsForSimulationFromRPC` (RPC, block number, contract, calldata, sender L2 keys).
2. `createSynthesizer` constructs the Synthesizer and attaches it to an EVM instance (`createEVM`).
3. During `synthesizeTX()`, every interpreter step feeds into `InstructionHandler`, which creates new placements and keeps stack/memory symbols aligned with the VM.
4. After the message completes, storage proofs are finalized (`_finalizeStorage`), Merkle roots updated, and warm/cold storage accesses recorded.
5. `CircuitGenerator.writeOutputs()` materializes placements into the four JSON files for the prover/verifier pipeline.

## External dependencies
- **EthereumJS**: VM, EVM, block, util, and statemanager packages drive execution and encoding utilities.
- **QAP compiler artifacts**: Subcircuit metadata (`configuredTypes.ts`, `importedConstants.ts`) and WASM witnesses are consumed by the circuit generator.
- **@noble/curves / poseidon-bls12381**: Used for Jubjub/poseidon operations during opcode handling and signature checks.
- **ethers**: RPC access for transaction and block data.
