# `@tokamak-zk-evm/synthesizer-node`

File-based Node.js adapter for converting one Tokamak L2 transaction snapshot
into circuit-ready JSON artifacts.

## Install and run

The command below assumes a local copy of the
[`transferNotes1To2` example](../examples/privateState/transferNotes/transferNotes1To2)
at `./transferNotes1To2`; the example is not included in the npm package.

```bash
npm install @tokamak-zk-evm/synthesizer-node
npx synthesizer tokamak-ch-tx \
  --previous-state ./transferNotes1To2/previous_state_snapshot.json \
  --transaction ./transferNotes1To2/transaction.json \
  --block-info ./transferNotes1To2/block_info.json \
  --contract-code ./transferNotes1To2/contract_codes.json
```

Use this package when inputs and outputs belong on the local filesystem. Use
[`@tokamak-zk-evm/synthesizer-web`](../web-app/README.md) for browser
applications.

## Required input files

The command accepts four explicit JSON file paths. The files must describe the
same pre-transaction state and block context; their directory and filenames are
otherwise application choices.

| File                           | Role                                                          | Format and owner                                                                                                          | How to obtain it                                                                     | Example                                                         |
| ------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `previous_state_snapshot.json` | Reconstructs state immediately before execution               | [`tokamak-l2js` `StateSnapshot`](https://github.com/tokamak-network/TokamakL2JS/blob/main/src/interface/channel/types.ts) | Call `TokamakL2StateManager.captureStateSnapshot()` before executing the transaction | [File](../examples/privateState/transferNotes/transferNotes1To2/previous_state_snapshot.json) |
| `transaction.json`             | Supplies the signed Tokamak L2 transaction                    | [`tokamak-l2js` `TxSnapshot`](https://github.com/tokamak-network/TokamakL2JS/blob/main/src/interface/channel/types.ts)    | Call `TokamakL2Tx.captureTxSnapshot()`                                               | [File](../examples/privateState/transferNotes/transferNotes1To2/transaction.json)             |
| `block_info.json`              | Supplies block-opcode and execution-environment values        | Synthesizer `BlockInfo` JSON                                                                                              | Normalize the trusted application or L2 RPC block context                            | [File](../examples/privateState/transferNotes/transferNotes1To2/block_info.json)              |
| `contract_codes.json`          | Supplies deployed bytecode reached by the supported call flow | Synthesizer `ContractCodeEntry[]` JSON                                                                                    | Export deployment/state data or query the trusted state source                       | [File](../examples/privateState/transferNotes/transferNotes1To2/contract_codes.json)          |

`StateSnapshot` and `TxSnapshot` are defined by the `tokamak-l2js` version
recorded in this package's `buildMetadata`. Use those exported types and
capture methods instead of recreating compatibility interfaces.

### File formats

`previous_state_snapshot.json` contains:

| Field              | JSON shape                               | Meaning                                        |
| ------------------ | ---------------------------------------- | ---------------------------------------------- |
| `stateRoots`       | `string[]`                               | Tokamak state roots before execution           |
| `storageAddresses` | `string[]`                               | Storage-bearing contract addresses             |
| `storageKeys`      | `string[][]`                             | Original storage-slot keys grouped by address  |
| `storageTrieRoots` | `string[]`                               | Ethereum storage-trie roots grouped by address |
| `storageTrieDb`    | `{ "key": string, "value": string }[][]` | Trie records used to rebuild storage           |
| `channelId`        | `number`                                 | Tokamak L2 channel identifier                  |

The address-indexed arrays must stay aligned. `storageKeys` values are storage
slots; `storageTrieDb[*][*].key` values are trie database keys.

`transaction.json` contains `channelTransactionIndex`, `to`, hex calldata in `data`,
`senderPubKey`, and optional signature strings `v`, `r`, and `s`.

`block_info.json` contains `0x`-prefixed `coinBase`, `timeStamp`,
`blockNumber`, `prevRanDao`, `gasLimit`, `chainId`, `selfBalance`, and
`baseFee` values plus the `prevBlockHashes` array.

`contract_codes.json` is an array of deployed bytecode entries:

```json
[
  {
    "address": "0x...",
    "code": "0x..."
  }
]
```

## Commands

```bash
npx synthesizer tokamak-ch-tx \
  --previous-state ./inputs/previous_state_snapshot.json \
  --transaction ./inputs/transaction.json \
  --block-info ./inputs/block_info.json \
  --contract-code ./inputs/contract_codes.json

# Include supplementary execution analysis
npx synthesizer tokamak-ch-tx \
  --previous-state ./inputs/previous_state_snapshot.json \
  --transaction ./inputs/transaction.json \
  --block-info ./inputs/block_info.json \
  --contract-code ./inputs/contract_codes.json \
  --output-supplement
```

Relative paths are resolved from the current working directory. The
Synthesizer rejects incomplete or incoherent inputs rather than fetching
missing state.

## Outputs

By default, the command creates `outputs/` under the detected application root,
normally the current project root. The command prints each absolute output path
as it writes the file.

| File                        | Purpose                                               |
| --------------------------- | ----------------------------------------------------- |
| `placementVariables.json`   | Placement subcircuit IDs, offsets, and witness values |
| `selector.json`             | Capacity-length placement selector for preprocessing and proving |
| `instance.json`             | Public and function-instance field values             |
| `instance_description.json` | Human-readable instance descriptions                  |
| `permutation.json`          | Wire-equality cycles used by preprocess and prove     |
| `state_snapshot.json`       | Post-transaction `tokamak-l2js` `StateSnapshot`       |

`--output-supplement` additionally writes execution steps, expanded placements,
and observed message-code addresses under `supplement/`. Keep
`placementVariables.json`, `selector.json`, `instance.json`, and
`permutation.json` from the same run.

Transaction support follows the
[shared Synthesizer boundary](../README.md#transaction-support).

## npm publication

| Item              | Value                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Package           | [`@tokamak-zk-evm/synthesizer-node`](https://www.npmjs.com/package/@tokamak-zk-evm/synthesizer-node) |
| Published version | `npm view @tokamak-zk-evm/synthesizer-node version`                                                  |
| Release notes     | [Repository `CHANGELOG.md`](../../../../CHANGELOG.md)                                                |

## Security and application responsibilities

Validate that all four files came from the same trusted state source. Keep RPC
credentials and signing keys out of input files, terminal history, outputs,
and source control. Snapshots, witnesses, and execution logs may contain
sensitive application data. Successful synthesis establishes artifact
generation, not the security of the application, circuit library, setup, or
surrounding protocol.

## Project and license

- [Source](https://github.com/JehyukJang/Tokamak-zk-EVM/tree/main/packages/frontend/synthesizer/node-cli)
- [Issues](https://github.com/JehyukJang/Tokamak-zk-EVM/issues)
- [Workspace overview](../README.md)

Dual-licensed under `MIT OR Apache-2.0`.
