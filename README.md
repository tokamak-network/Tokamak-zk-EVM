# Tokamak zk-EVM

Tokamak zk-EVM converts Tokamak Network Layer 2 transaction execution into
Tokamak zk-SNARK proof artifacts. Its proving protocol is described in the
[Tokamak zk-SNARK paper](https://eprint.iacr.org/2024/507).

Tokamak zk-EVM consists of:

- A QAP compiler that builds the supported Circom subcircuits into the circuit
  artifacts used for setup and proving.
- A Synthesizer that replays a Tokamak L2 transaction and creates the
  transaction-specific artifacts required for proving.
- A proving protocol that preprocesses circuit and public data, generates a
  proof of correct execution, and verifies that proof.

## Scope and compatibility

Tokamak Network Layer 2 (Tokamak L2) is the execution model on which this
repository depends. A Tokamak L2 transaction has its own transaction shape and
signing flow, uses zero-knowledge-proof-friendly cryptographic primitives, and
executes against supplied state snapshots and block context. These are defined by
[TokamakL2JS](https://github.com/tokamak-network/TokamakL2JS), which supplies
the shared specification for transactions, state, cryptographic primitives, and
protocol constants used by Tokamak zk-EVM. Tokamak zk-EVM is limited to a
defined subset of EVM contract functions. It generates circuit artifacts for
those functions, produces proofs that Tokamak L2 transactions executed them
correctly, and verifies the resulting proofs.

Tokamak zk-EVM therefore does not claim compatibility with arbitrary native
Ethereum L1 execution. Its transaction format, signing and cryptographic
primitives, state representation, and supplied execution context differ from
the native Ethereum environment. A function that runs in an Ethereum toolchain
is not automatically a supported Tokamak zk-EVM function. In addition, contract
creation, precompiles, transient storage, blob opcodes, invalid/self-destruct
paths, and other unvalidated execution combinations are outside the supported
boundary.

Within that environment, a supported contract function must meet two
conditions. First, every successful call among the input and state combinations
that an application intends to support must use only supported execution
features. Second, those calls must retain one fixed execution trace and circuit
layout: changing a permitted input or state value must not change the executed
instruction path, call or return flow, number and order of memory or storage
accesses, or emitted logs.

For example, a private-state transfer can process different note values when
each successful transfer follows the same path and uses the same state
structure. A function is outside the supported boundary if a permitted input
selects a different branch, changes a loop or call count, or changes the memory
or storage-access pattern. A successful proof for one transaction does not by
itself establish support for every input and state. Applications must validate
their planned input and state combinations using the
[Synthesizer transaction-support guide](./packages/frontend/synthesizer/README.md#transaction-support).

## Concrete application

Despite the limits on compatibility with native Ethereum execution, the
Synthesizer can reuse an EVM contract function already used by a native
Ethereum DApp, including one compiled from Solidity, when the call falls within
the supported boundary. It reads that function's EVM bytecode while replaying
the Tokamak L2 call and produces the transaction-specific circuit artifacts
used to prove the execution. This lets a DApp defined in an Ethereum
smart-contract language such as Solidity reuse its contract code on Tokamak L2.
It also lets privacy-preserving DApps be defined in Ethereum smart-contract
languages.

### Abstract model of DApp execution on native Ethereum

```mermaid
sequenceDiagram
    participant DApp as On-chain DApp
    participant User as Off-chain user
    participant Validators as Ethereum validators

    DApp->>User: DApp contracts and state
    User->>Validators: Transaction
    DApp->>Validators: DApp contracts and state
    Validators->>Validators: Execute and validate transaction
    Validators->>DApp: Updated state
```

### Abstract model of privacy-preserving DApp execution on Tokamak L2 using Tokamak zk-EVM

```mermaid
sequenceDiagram
    participant DApp as On-chain DApp
    participant User as Off-chain user
    participant Validators as Ethereum validators

    DApp->>User: DApp contracts and state
    User->>User: Create and execute L2 transaction
    User->>User: Generate proof and public inputs
    User->>Validators: Public inputs and proof (no original transaction data)
    DApp->>Validators: DApp contracts and state
    Validators->>Validators: Verify proof
    Validators->>DApp: Updated state
```

[Tokamak Private App Channels](https://github.com/tokamak-network/Tokamak-zk-EVM-contracts)
is a concrete integration of this flow. Its
[BridgeCore](https://etherscan.io/address/0xB1815dF9382449F48E2c26cAd75a07a51E3d72Fa#code)
coordinates channels and shared custody. For each channel associated with a
DApp in the
[TPAC DApp registry](https://github.com/tokamak-network/Tokamak-zk-EVM-contracts#mainnet-registered-dapps),
it creates a [ChannelManager](https://etherscan.io/address/0x3108d92A38bFb4B3396DE7ad4D92318a8fbE61D7#code).
Each channel maintains its DApp's state commitment. Channel users generate a
proof locally that the registered DApp executed correctly. When the deployed
[TokamakVerifier](https://etherscan.io/address/0x9fDBDFDfD5CFbd38348FE709296E2E1063Bbd2Bd#code)
accepts the proof on-chain, the ChannelManager updates the channel's state
commitment.

The private-state note-transfer DApp is one TPAC example. A user calls a
transfer function defined by the
[PrivateStateController](https://etherscan.io/address/0x67C6233A99D9f122Fef9DC111e89948107b34c2F#code),
which is deployed on Ethereum mainnet. The DApp's state records note commitments
and nullifiers for spent notes. To transfer value, the owner must submit
privacy-sensitive data in transaction calldata, which identifies the sender,
recipients, and transferred amounts. When a user directly calls the controller
on native Ethereum, their transaction exposes this calldata. In the Tokamak L2
flow, the user submits only a proof and public inputs such as the current and
updated state commitments, and the relevant block context,
keeping privacy-sensitive data off-chain.

Using Tokamak zk-EVM with the Tokamak L2 execution environment keeps
transaction data off-chain, but it does not by itself make a native Ethereum
DApp privacy-preserving. [Data availability](https://ethereum.org/developers/docs/data-availability/)
nevertheless requires the DApp to keep the state data required for verification
and continued use available. To support privacy, a DApp must also avoid storing
privacy-sensitive data directly in the state it manages. For example, a DApp can
retain only commitments to sensitive data in its state and have its contract
functions validate the integrity of the original data. The private-state
note-transfer DApp is one such case. Tokamak zk-EVM lets a DApp define this
privacy boundary entirely in an Ethereum smart-contract language such as
Solidity, independently of the proving system.

## Packages

| Repository package | npm package | README | Description |
| --- | --- | --- | --- |
| QAP compiler | [`@tokamak-zk-evm/subcircuit-library`](https://www.npmjs.com/package/@tokamak-zk-evm/subcircuit-library) | [README](./packages/frontend/qap-compiler/README.md) | Builds the reusable circuit library for supported execution |
| Synthesizer-NodeJS | [`@tokamak-zk-evm/synthesizer-node`](https://www.npmjs.com/package/@tokamak-zk-evm/synthesizer-node) | [README](./packages/frontend/synthesizer/node-cli/README.md) | Turns Tokamak L2 transaction execution into circuit artifacts in Node.js |
| Synthesizer-browser | [`@tokamak-zk-evm/synthesizer-web`](https://www.npmjs.com/package/@tokamak-zk-evm/synthesizer-web) | [README](./packages/frontend/synthesizer/web-app/README.md) | Provides a browser interface for transaction synthesis |
| Backend-RUST | Not separately published | [README](./packages/backend/README.md) | Implements native trusted setup, preprocessing, proving, and verification |
| Backend-WASM | [`@tokamak-zk-evm/snark-browser-compat`](https://www.npmjs.com/package/@tokamak-zk-evm/snark-browser-compat) | [README](./packages/backend/wasm/README.md) | Provides a browser interface for preprocessing, proving, verification, and artifact conversion |
| CLI | [`@tokamak-zk-evm/cli`](https://www.npmjs.com/package/@tokamak-zk-evm/cli) | [README](./packages/cli/README.md) | Installs and runs the complete local proving workflow |

## Proof workflow

```mermaid
flowchart TD
    snapshot[Tokamak L2 snapshot] --> synthesizer[Synthesizer]
    library[Subcircuit library] --> synthesizer
    synthesizer --> artifacts[Transaction-specific artifacts]

    library --> rust[Backend-RUST]
    library --> wasm[Backend-WASM]
    artifacts --> rust
    artifacts --> wasm
    setup[Compatible setup material] --> rust
    setup --> wasm

    rust --> nativeOutput[Preprocess, proof, and verification]
    wasm --> browserOutput[Preprocess, proof, and verification]
```

The [CLI](./packages/cli/README.md) is the supported end-to-end local entry
point and uses the TokamakL2JS-defined transaction and state formats throughout
that workflow. To get started, follow the CLI README to install the local
runtime and run synthesis, preprocessing, proving, and verification. Each
package README provides its installation, commands, APIs, input formats,
examples, and operational responsibilities.

## Versioning and distribution

Tokamak zk-EVM releases its npm packages as one versioned set. The repository
root controls the shared package version, and the root
[CHANGELOG.md](./CHANGELOG.md) records the changes in each release. Together,
they identify the components and documented changes that belong to a version.

The `main` branch is kept aligned with deployed releases, so it is the source
reference for a published version.

Backend-RUST binaries are not published separately. Instead, the
[`@tokamak-zk-evm/cli`](https://www.npmjs.com/package/@tokamak-zk-evm/cli)
includes compatible backend source and builds it locally during the CLI
workflow.

For details, see the [version and release rules](./docs/version-rules.md).

## Learn more

- [Project overview on Medium](https://medium.com/tokamak-network/project-tokamak-zk-evm-67483656fd21) (updated January 2026)
- [Project slides](https://docs.google.com/presentation/d/1D49fRElwkZYbEvQXB_rp5DEy22HFsabnXyeMQdNgjRw/edit?usp=sharing)
- [Legacy Synthesizer GitBook](https://tokamak-network-zk-evm.gitbook.io/tokamak-network-zk-evm) (historical; package READMEs are current)
- [On-chain verifier and current deployment records](https://github.com/tokamak-network/Tokamak-zk-EVM-contracts)
- [LLM-readable repository map](./llms.txt)

## License

Tokamak zk-EVM is dual-licensed under
[MIT](./LICENSE-MIT) or [Apache-2.0](./LICENSE-APACHE), at your option.
Third-party dependencies and incorporated components retain their own
licenses.
