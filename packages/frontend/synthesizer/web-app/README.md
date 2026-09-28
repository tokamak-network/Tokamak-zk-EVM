# `@tokamak-zk-evm/synthesizer-web`

Browser adapter for converting one Tokamak L2 transaction snapshot into
circuit-ready artifacts. Compatible subcircuit-library JSON and WASM assets
are bundled at package build time.

## Install and run

```bash
npm install @tokamak-zk-evm/synthesizer-web
```

```ts
import { loadSynthesisInputFromUrls, saveSynthesisOutputToFiles, synthesize } from '@tokamak-zk-evm/synthesizer-web';

const input = await loadSynthesisInputFromUrls({
  previousState: '/inputs/previous_state_snapshot.json',
  transaction: '/inputs/transaction.json',
  blockInfo: '/inputs/block_info.json',
  contractCodes: '/inputs/contract_codes.json',
});

const output = await synthesize(input);
saveSynthesisOutputToFiles(output);
```

`saveSynthesisOutputToFiles()` starts browser downloads for the generated JSON
files. Each URL passed to `loadSynthesisInputFromUrls()` must return successful
JSON and be either same-origin or accessible through CORS.

Use this package for browser applications. Use
[`@tokamak-zk-evm/synthesizer-node`](../node-cli/README.md) for local
filesystem workflows.

## Input APIs

All APIs produce the same logical input:

| API                                       | Input form                           |
| ----------------------------------------- | ------------------------------------ |
| `synthesize(input)`                       | Parsed JavaScript objects            |
| `loadSynthesisInputFromFiles(files)`      | Four browser `File` or `Blob` values |
| `loadSynthesisInputFromUrls(urls, init?)` | Four URLs returning JSON             |

| Property / conventional file                     | Role                                                          | Format and owner                                                                                                          | How to obtain it                                                     | Example                                                         |
| ------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `previousState` / `previous_state_snapshot.json` | Reconstructs state immediately before execution               | [`tokamak-l2js` `StateSnapshot`](https://github.com/tokamak-network/TokamakL2JS/blob/main/src/interface/channel/types.ts) | Call `TokamakL2StateManager.captureStateSnapshot()` before execution | [File](../examples/privateState/transferNotes/transferNotes1To2/previous_state_snapshot.json) |
| `transaction` / `transaction.json`               | Supplies the signed Tokamak L2 transaction                    | [`tokamak-l2js` `TxSnapshot`](https://github.com/tokamak-network/TokamakL2JS/blob/main/src/interface/channel/types.ts)    | Call `TokamakL2Tx.captureTxSnapshot()`                               | [File](../examples/privateState/transferNotes/transferNotes1To2/transaction.json)             |
| `blockInfo` / `block_info.json`                  | Supplies block-opcode and environment values                  | Synthesizer `BlockInfo`                                                                                                   | Normalize the trusted application or L2 RPC block context            | [File](../examples/privateState/transferNotes/transferNotes1To2/block_info.json)              |
| `contractCodes` / `contract_codes.json`          | Supplies deployed bytecode reached by the supported call flow | Synthesizer `ContractCodeEntry[]`                                                                                         | Export deployment/state data or query the trusted state source       | [File](../examples/privateState/transferNotes/transferNotes1To2/contract_codes.json)          |

The package imports `StateSnapshot` and `TxSnapshot` from the `tokamak-l2js`
version recorded in `buildMetadata`.

### Input formats

`previousState` contains `stateRoots`, `storageAddresses`, `storageKeys`,
`storageTrieRoots`, `storageTrieDb`, and `channelId`. Address-indexed arrays
must stay aligned. Storage-slot keys and trie database keys are different
values.

`transaction` contains `channelTransactionIndex`, `to`, hex calldata in `data`,
`senderPubKey`, and optional signature strings `v`, `r`, and `s`.

`blockInfo` contains `0x`-prefixed `coinBase`, `timeStamp`, `blockNumber`,
`prevRanDao`, `gasLimit`, `chainId`, `selfBalance`, and `baseFee` values plus
`prevBlockHashes`.

`contractCodes` is an array:

```json
[
  {
    "address": "0x...",
    "code": "0x..."
  }
]
```

Use the four values from one coherent state and block context. See the complete
[`transferNotes1To2` example](../examples/privateState/transferNotes/transferNotes1To2).

## Outputs

`saveSynthesisOutputToFiles()` downloads:

| File                        | Purpose                                           |
| --------------------------- | ------------------------------------------------- |
| `placementVariables.json`   | Placement IDs, offsets, and witness values        |
| `selector.json`             | Capacity-length placement selector for preprocessing and proving |
| `instance.json`             | Public and function-instance values               |
| `instance_description.json` | Human-readable instance descriptions              |
| `permutation.json`          | Wire-equality cycles used by preprocess and prove |
| `state_snapshot.json`       | Post-transaction `tokamak-l2js` state snapshot    |

Pass `{ outputSupplement: true }` to output helpers for execution logs,
expanded placements, and observed message-code addresses:

```ts
saveSynthesisOutputToFiles(output, { outputSupplement: true });
await postSynthesisOutput(url, output, undefined, { outputSupplement: true });
```

Keep selector, placement, instance, and permutation artifacts from the same
result.
Transaction support follows the
[shared Synthesizer boundary](../README.md#transaction-support).

## npm publication

| Item              | Value                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Package           | [`@tokamak-zk-evm/synthesizer-web`](https://www.npmjs.com/package/@tokamak-zk-evm/synthesizer-web) |
| Published version | `npm view @tokamak-zk-evm/synthesizer-web version`                                                 |
| Runtime           | ESM browser package with bundled circuit assets                                                    |
| Release notes     | [Repository `CHANGELOG.md`](../../../../CHANGELOG.md)                                              |

## Security and application responsibilities

Authenticate remote input sources and keep RPC credentials, wallet secrets,
and signing keys out of browser bundles, URLs, and JSON payloads. Decide
whether snapshots, witnesses, and logs may be uploaded, cached, or downloaded
before calling the helpers. Successful synthesis does not establish the
security of the application, circuit library, setup, or surrounding protocol.

## Project and license

- [Source](https://github.com/JehyukJang/Tokamak-zk-EVM/tree/main/packages/frontend/synthesizer/web-app)
- [Issues](https://github.com/JehyukJang/Tokamak-zk-EVM/issues)
- [Workspace overview](../README.md)

Dual-licensed under `MIT OR Apache-2.0`.
