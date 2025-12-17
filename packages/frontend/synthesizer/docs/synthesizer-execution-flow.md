# Synthesizer Execution Flow

This walkthrough follows the default CLI (`src/cli/index.ts`) using an L1 transaction hash and RPC URL.

## 1) Build simulation inputs
- CLI normalizes the transaction hash and fetches the transaction/receipt via `ethers`.
- L2 key pairs are deterministically generated for state-channel simulation.
- `createSynthesizerOptsForSimulationFromRPC` (`src/interface/rpc/rpc.ts`) gathers:
  - Block info at `blockNumber - 1` (hashes, base data, chain id).
  - Tokamak L2 state manager seeded from L1 storage proofs for the contract and user slots.
  - Signed Tokamak L2 transaction with calldata and EDDSA keys.

## 2) Construct the Synthesizer
- `createSynthesizer(opts)` instantiates `Synthesizer` with handlers and buffers.
- `BufferManager` seeds reserved variables: Merkle roots, block info, transaction inputs (selector + 9 args), EDDSA public key/signature/randomizer, Jubjub constants, and cached origin/caller slots.

## 3) Attach to the VM
- `synthesizeTX()` builds an EthereumJS `Block` and `EVM`, attaches Synthesizer event hooks, and runs `runTx` with the signed L2 transaction.
- Event hooks:
  - `beforeMessage`: resets call-memory stack and prepares transaction buffers.
  - `step`: processes the **previous** interpreter step via `InstructionHandler` (ensures access to input/output stacks).
  - `afterMessage`: finalizes the last step, updates Merkle proofs, and records unregistered storage writes.

## 4) Opcode handling
- `InstructionHandler` pops/pushes symbolic stack entries, calls arithmetic/memory helpers, and validates environment/block data.
- Storage:
  - `SLOAD` pulls Merkle proofs from the initial tree (`TokamakL2StateManager`), verifies against `INI_MERKLE_ROOT`, and caches reads.
  - `SSTORE` appends writes to `cachedStorage`; registered keys must already be warm.
  - `_finalizeStorage` recomputes the final Merkle root and writes unregistered contract storage to `PRV_OUT`.
- Calls: pre-call tasks update cached caller/origin and call-memory stacks so nested calls get correct context.

## 5) Generate circuit artifacts
- After `synthesizeTX` finishes, `createCircuitGenerator` hydrates a `CircuitGenerator` with the Synthesizer placements.
- `VariableGenerator` trims unused EVM_IN wires, halves 256-bit limbs, runs WASM witnesses, and extracts public instances.
- `PermutationGenerator` builds permutation groups and validates equality constraints.
- `writeOutputs(path)` writes:
  - `placementVariables.json`
  - `instance.json`
  - `instance_description.json`
  - `permutation.json`
  - (CLI uses `examples/outputs`; default is `outputs/` if no path is given.)
