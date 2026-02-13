# Synthsizer Introduction

Synthesizer is the frontend that turns an Ethereum transaction into a Tokamak zk-SNARK-ready circuit. It traces EVM execution, mirrors each opcode with pre-built subcircuits, and writes the witness and permutation files the backend prover expects.

## What it builds
- **Placements**: Ordered subcircuit instances that mirror opcode effects. Each placement records input/output `DataPt` connections.
- **Permutation**: Wire-equality constraints showing which placement wires must carry the same value.
- **Witness**: Concrete values for every wire (placement variables) plus public/private instance splits.

## Inputs
- **Transaction context**: Transaction hash and RPC endpoint. `createSynthesizerOptsForSimulationFromRPC` pulls block info, contract code, storage snapshots, and signs a Tokamak L2 transaction.
- **Subcircuit library**: Metadata and WASM artifacts produced by `@tokamak-zk-evm/qap-compiler` (Poseidon/Jubjub/ALU buffers, etc.).
- **L2 keys**: Deterministic L2 keypairs are generated inside the CLI for state-channel simulation; they drive EDDSA verification inside the circuit.

## Outputs
- `placementVariables.json`: Witness for every placement.
- `instance.json` and `instance_description.json`: Public/private instance split plus descriptions.
- `permutation.json`: Wire connection cycles enforcing equality constraints.
- Location: `outputs/` by default, or a caller-specified directory (CLI uses `examples/outputs`).

## Execution model
- Runs inside EthereumJS VM with a Tokamak L2 state manager seeded from L1 RPC.
- Hooks interpreter steps to keep symbolic `StackPt`/`MemoryPt` aligned with VM execution.
- Uses Poseidon/Jubjub primitives in place of Keccak/ECRecover; storage reads/writes verify Merkle proofs from the L1 snapshot.

## Scope and limits
- Most Cancun-era opcodes are handled; CREATE/CREATE2/SELFDESTRUCT and blob/TSTORE/TLOAD are not yet synthesized.
- KECCAK256 is represented via Poseidon hashing for circuit feasibility.
- Gas accounting is observed from the VM but not enforced in circuit constraints yet.

 
Tokamak zk-EVM Synthesizer turns a batch of Ethereum-like transactions into circuit-ready artifacts. The core lives in `src/synthesizer` (execution tracing, state management) and `src/circuitGenerator` (witness/public-instance/permutation generation). It interprets each opcode with Tokamak zk-EVM subcircuits and emits the witness/permutation files the zk-SNARK backend needs to produce and verify proofs.
