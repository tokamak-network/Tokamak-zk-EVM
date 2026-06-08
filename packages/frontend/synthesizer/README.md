# Tokamak zk-EVM Synthesizer

Tokamak zk-EVM Synthesizer turns a Tokamak L2 transaction snapshot into circuit-ready artifacts for the downstream proving pipeline.

## Packages

- `@tokamak-zk-evm/synthesizer-node`
  - Use this package when you want a Node.js CLI that reads JSON files from disk and writes JSON outputs back to disk.
  - Package docs: [node-cli/README.md](./node-cli/README.md)
- `@tokamak-zk-evm/synthesizer-web`
  - Use this package when you want a browser-facing API that accepts payload objects or uploaded files.
  - Package docs: [web-app/README.md](./web-app/README.md)

The shared synthesis runtime lives in `core/` and is not published as a standalone package.

## Shared Input Model

Both published packages work from the same transaction payload shape:

- `previousState`
- `transaction`
- `blockInfo`
- `contractCodes`

## Shared Output Model

Both packages produce the same synthesized artifacts:

- `placementVariables.json`
- `instance.json`
- `instance_description.json`
- `permutation.json`
- `state_snapshot.json`
- `step_log.json`
- `message_code_addresses.json`

## Runtime Model

- `@tokamak-zk-evm/synthesizer-node` loads `@tokamak-zk-evm/subcircuit-library` from the installed dependency at runtime.
- `@tokamak-zk-evm/synthesizer-web` bundles the published subcircuit-library JSON and WASM artifacts at build time.

## Documentation

- Consumer landing: [README.md](./README.md)
- Repository changelog: [../../../CHANGELOG.md](../../../CHANGELOG.md)
- Maintainer docs index: [docs/README.md](./docs/README.md)

## FAQ

### Which package should I install?

Install `@tokamak-zk-evm/synthesizer-node` for file-based Node.js execution. Install `@tokamak-zk-evm/synthesizer-web` for browser-style runtimes and UI integrations.

### What input does the synthesizer need?

Both packages expect one complete transaction replay payload with `previousState`, `transaction`, `blockInfo`, and `contractCodes`.

### What does the synthesizer emit?

The synthesizer emits circuit-ready placement data, public instances, permutation constraints, the final state snapshot, and execution analysis files.

<a id="transaction-support-faq"></a>

### Does the current implementation support any arbitrary transaction/call data, or is it limited to simple token/native transfers for now?

Partially, yes.

The Synthesizer is not limited to simple native transfers or a hardcoded ERC20 transfer template. It accepts a complete transaction replay payload, including transaction data, contract code, previous state, and block information, then follows the Tokamak L2/EVM execution path to produce circuit-ready artifacts. In practical terms, this means it can be used for contract-call transactions, including calls into contracts with non-trivial internal logic, as long as the execution stays within the currently supported opcode set and runtime model.

For complex contracts, support is not determined by whether the transaction is an ERC20 transfer, a native transfer, or another simple transaction type. Instead, support depends on whether the execution stays within the opcode set, call flows, storage/memory/log handling, and runtime model currently supported by Tokamak zk-EVM. The current implementation includes broad support for arithmetic, calldata handling, memory, storage reads and writes, logs, block/environment opcodes, and message-call flows such as CALL, CALLCODE, DELEGATECALL, and STATICCALL. Current examples and validation coverage focus on ERC20 transfer flows and private-state mint, transfer, and redeem flows, so those are the strongest documented support cases today.

However, it should not yet be described as supporting every arbitrary Ethereum transaction. Transactions that require unsupported behavior, such as contract creation, precompiled contracts, transient storage, blob opcodes, invalid/selfdestruct paths, or other unvalidated opcode/control-flow combinations, are outside the supported consumer claim. These limitations are under intentional scope boundaries rather than underdevelopment or future works. Tokamak zk-EVM is designed under the strict assumption that it is used in Ethereum Layer 2 execution, so features that are outside that target runtime model are intentionally excluded from the consumer support claim.

### How does this relate to `@tokamak-zk-evm/subcircuit-library`?

The synthesizer depends on the published subcircuit library for metadata and WASM artifacts. The Node package resolves those assets from the installed package at runtime, while the web package bundles them at build time.

### Is `core/` a public npm package?

No. `core/` is an internal shared runtime used by both published packages.
