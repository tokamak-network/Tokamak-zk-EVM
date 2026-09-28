# Tokamak zk-EVM Synthesizer

The Synthesizer replays one Tokamak Layer 2 (Tokamak L2) transaction and
produces the transaction-specific circuit artifacts required by the proving
backends.

## Choose a runtime

| Package                                                                                              | Use it when                                                     | Documentation                       |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------- |
| [`@tokamak-zk-evm/synthesizer-node`](https://www.npmjs.com/package/@tokamak-zk-evm/synthesizer-node) | A Node.js process reads and writes local JSON files             | [Node README](./node-cli/README.md) |
| [`@tokamak-zk-evm/synthesizer-web`](https://www.npmjs.com/package/@tokamak-zk-evm/synthesizer-web)   | A browser application supplies objects, uploaded files, or URLs | [Web README](./web-app/README.md)   |

Both npm packages use the shared runtime under `core/`; `core/` is not a
standalone public package. Check the npm pages for published versions and
[CHANGELOG.md](../../../CHANGELOG.md) for release notes.

## Shared input contract

Each runtime consumes one coherent transaction replay payload:

| Property        | Role                                                                      | Format owner                                                                                                              | Acquisition                                                                |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `previousState` | State immediately before execution, including storage reconstruction data | [`tokamak-l2js` `StateSnapshot`](https://github.com/tokamak-network/TokamakL2JS/blob/main/src/interface/channel/types.ts) | Call `TokamakL2StateManager.captureStateSnapshot()`                        |
| `transaction`   | Signed Tokamak L2 transaction to replay                                   | [`tokamak-l2js` `TxSnapshot`](https://github.com/tokamak-network/TokamakL2JS/blob/main/src/interface/channel/types.ts)    | Call `TokamakL2Tx.captureTxSnapshot()`                                     |
| `blockInfo`     | L2 block and execution-environment values                                 | Synthesizer `BlockInfo`                                                                                                   | Normalize the trusted application or L2 RPC block context                  |
| `contractCodes` | Deployed bytecode required by the supported call flow                     | Synthesizer `ContractCodeEntry[]`                                                                                         | Export application deployment/state data or query the trusted state source |

The complete
[`transferNotes1To2` example](./examples/privateState/transferNotes/transferNotes1To2)
contains the conventional JSON filenames. The Node and Web package READMEs
document each field and input method.

## Shared outputs

Primary outputs are:

| File                        | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `placementVariables.json`   | Placement IDs, offsets, and witness values for proving |
| `selector.json`             | Capacity-length placement selector for the univariate protocol |
| `instance.json`             | Public and function-instance field values              |
| `instance_description.json` | Human-readable descriptions aligned with the instance  |
| `permutation.json`          | Wire-equality cycles used by preprocessing and proving |
| `state_snapshot.json`       | `tokamak-l2js` state snapshot after execution          |

Supplementary execution logs and placement analysis are emitted only when
requested with `--output-supplement` in Node or `{ outputSupplement: true }` in
the Web output helpers.

The Node runtime resolves the installed subcircuit library at execution time.
The Web runtime bundles the compatible JSON and WASM circuit assets when the
package is built.

<a id="transaction-support-faq"></a>

## Transaction support

It supports contract calls when execution stays within the opcode sequence and
topology boundary described below. It should not be described as supporting
every arbitrary Ethereum transaction.

A supported contract
function is one whose successful calls have one fixed execution topology within
the supported input and state domain. In practical terms, changing an accepted
transaction input or state value must not change the successful EVM instruction
trace or the circuit layout derived from it.

The following properties must remain fixed for every successful call of that
function:

- The executed opcode sequence, including call and return flow.
- The number, order, and circuit roles of stack values consumed and produced.
- The geometry of every memory view: its byte range, contributing fragments,
  shifts, and ownership masks.
- The number and order of storage reads and writes, and the number and order
  of emitted logs.
- The number and wiring pattern of circuit placements and buffer entries.

Transaction, calldata, memory, and storage values may vary when their variation
does not alter any of those properties. For example, a private-state function
may process different note values while retaining the same successful execution
path and the same memory, storage, and stack access structure.

A contract is outside this supported class when an accepted input or state can
select a different successful branch, change a loop or call count, alter a
memory-view geometry, or otherwise add, remove, reorder, or reconnect circuit
placements. A successful synthesis of one transaction alone does not establish
that a function belongs to the class; validate the intended input and state
domain with the Synthesizer topology test matrix before relying on it.

Contract creation, precompiles, transient storage, blob opcodes,
invalid/self-destruct paths, and other unvalidated combinations are also outside
the supported Tokamak L2 boundary.

## Project and license

- [Maintainer documentation](./docs/README.md)
- [Subcircuit Library](../qap-compiler/README.md)
- [Release notes](../../../CHANGELOG.md)

The published Synthesizer packages are dual-licensed under
`MIT OR Apache-2.0`. Dependencies retain their own licenses.
