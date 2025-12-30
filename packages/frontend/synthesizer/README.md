# Tokamak zk-EVM Synthesizer

Tokamak zk-EVM Synthesizer turns a batch of Ethereum-like transactions into a circuit for zero-knowledge proving. The core lives in `src/synthesizer` (execution tracing, state management) and `src/circuitGenerator` (witness/public-instance/permutation generation). It interprets each opcode with Tokamak zk-EVM subcircuits and emits the witness/permutation files the zk-SNARK backend needs to produce and verify proofs.

## Core problem and approach
- Problem: generate a circuit trace that mirrors EVM execution (stack/memory/call frames plus validation of storage reads/writes) for a transaction batch so a prover can show correct execution and an L1 contract can verify it without replaying the batch.
- Why it matters: the prover can keep state-change details private while the L1 contract still checks correctness (see `outputs/instance_description.json` for what becomes public).
- Why it is challenging: any drift from EVM semantics makes proofs fail or forgeable, breaking security.
- How it is solved: `src/synthesizer` hooks EthereumJS VM events, mirrors each opcode to Tokamak subcircuits, tracks symbolic stack/memory, and validates storage. `src/circuitGenerator` consumes these placements and uses [qap-compiler](../qap-compiler/README.md) metadata to emit `placementVariables`, public/private instances, and permutation cycles for the backend prover.

More detail is in `doc/synthesizer.md`.

## What it does
- Assumes a prepared execution context for a transaction batch on [EthereumJS VM](https://github.com/ethereumjs/ethereumjs-monorepo) (helpers in `src/interface/` can build this, but any source works).
- Runs the VM with that context, hooking each opcode execution.
- Records opcode-level subcircuit placements, enforces Merkle proof checks for storage, analyzes wiring between placements, and finalizes a batch-specific circuit.
- Writes circuit artifacts (`placementVariables.json`, `instance.json`, `instance_description.json`, `permutation.json`) to `./outputs/`, ready for the zk backend.

## Package layout
- Core: `src/synthesizer`, `src/circuitGenerator`.
- Input helpers: `src/interface` collects transaction/block/state inputs for the synthesizer; sources are not limited to L1 RPC.
- Tokamak L2 primitives: `src/TokamakL2JS` (planned to become an independent package).

## Run example (L2 TON transfer)
`examples/L2TONTransfer/main.ts` is the end-to-end example. It derives L2 keypairs from seeds, builds `SynthesizerOpts` via `createSynthesizerOptsForSimulationFromRPC`, runs `synthesizeTX()`, and writes outputs to `outputs/` by default.

### Prerequisites
- Node.js >= 18
- tsx
- An Ethereum RPC provider URL (e.g., Alchemy: https://www.alchemy.com/)
- A subcircuit library generated in [qap-compiler](../qap-compiler/README.md)

### Install
```bash
cd packages/frontend/synthesizer
npm install
```

### Inputs
- Ethereum RPC provider URL: create an `./.env` file:
```bash
RPC_URL='<your endpoint>'
# Example: RPC_URL='https://eth-mainnet.g.alchemy.com/v2/e_QJdxxxxxxxxxxisG_xQ'
```
- Transaction batch configuration in `examples/L2TONTransfer/input.json`
- Subcircuit library: install and run [qap-compiler](../qap-compiler/README.md) (no need to copy files into this package)

### Synthesize
```bash
tsx examples/L2TONTransfer/main.ts examples/L2TONTransfer/input.json
```

### Outputs
`./outputs/`:
- `placementVariables.json`
- `instance.json`
- `instance_description.json`
- `permutation.json`

## Run example (L2 State Channel)

Interactive L2 transfer simulation using Channel 55. Requires `.env` in `examples/L2StateChannel/` (see `env.sample`).

```bash
npx tsx examples/L2StateChannel/index.ts
```

See [examples/L2StateChannel/README.md](./examples/L2StateChannel/README.md) for details.

## Supported opcodes (high level)
- Arithmetic/bitwise: ADD…SAR, EXP, SIGNEXTEND, KECCAK256 (⚠️ Poseidon stand-in)
- Environment/Block: ADDRESS…EXTCODEHASH, BLOCKHASH, COINBASE, TIMESTAMP, NUMBER, PREVRANDAO, GASLIMIT, CHAINID, SELFBALANCE, BASEFEE
- Stack/Memory/Control: POP, MLOAD/MSTORE/MSTORE8, SLOAD/SSTORE, MCOPY, PUSH0/PUSH1–PUSH32, DUP/SWAP, LOG0–LOG4, CALL/CALLCODE/DELEGATECALL/STATICCALL, RETURN, REVERT
- Not synthesized: CREATE/CREATE2/SELFDESTRUCT, TLOAD/TSTORE, blob opcodes, precompiles

## Contributing
See `CONTRIBUTING.md` at the repo root. Dual-licensed under MIT or Apache-2.0.
