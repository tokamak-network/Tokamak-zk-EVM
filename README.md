# Tokamak-zk-EVM

Tokamak zk-EVM is a monorepo for turning Tokamak Layer 2 transaction execution into zk-SNARK proof artifacts. It provides the command-line workflow, transaction Synthesizer packages, prebuilt subcircuit artifacts, and backend proving and verification code used by the Tokamak zk-EVM stack.

[TokamakL2JS](https://github.com/tokamak-network/TokamakL2JS), which is a variant of [EthereumJS](https://github.com/ethereumjs/ethereumjs-monorepo), specifies the Tokamak Layer 2 transaction and state model consumed by this repository.

## Package Chooser

| Need | Install or read | Role |
| --- | --- | --- |
| Complete local workflow | [`@tokamak-zk-evm/cli`](./packages/cli/README.md) | Installs the local runtime and runs synthesize, preprocess, prove, verify, and proof extraction commands. |
| File-based synthesis in Node.js | [`@tokamak-zk-evm/synthesizer-node`](./packages/frontend/synthesizer/node-cli/README.md) | Reads Tokamak L2 transaction replay JSON files from disk and writes synthesized JSON artifacts back to disk. |
| Browser-facing synthesis APIs | [`@tokamak-zk-evm/synthesizer-web`](./packages/frontend/synthesizer/web-app/README.md) | Accepts payload objects or uploaded files and uses bundled subcircuit-library assets. |
| Prebuilt circuit artifacts | [`@tokamak-zk-evm/subcircuit-library`](./packages/frontend/qap-compiler/README.md) | Publishes R1CS artifacts, WASM witness-generation artifacts, JSON metadata, and related subcircuit-library files. |

## Canonical Documentation

- [CLI package README](./packages/cli/README.md): local install, command usage, runtime requirements, and proof-flow commands.
- [Synthesizer workspace README](./packages/frontend/synthesizer/README.md): Synthesizer package chooser, shared input model, shared output model, and runtime model.
- [Synthesizer Node README](./packages/frontend/synthesizer/node-cli/README.md): file-based Node.js CLI usage.
- [Synthesizer Web README](./packages/frontend/synthesizer/web-app/README.md): browser-style API usage.
- [Subcircuit Library README](./packages/frontend/qap-compiler/README.md): published subcircuit artifact package contents and compatibility.
- [llms.txt](./llms.txt): root LLM-readable map for repository and package documentation.
- [CHANGELOG.md](./CHANGELOG.md): canonical release-note source for all npm-published packages in this monorepo.

## Repository FAQ

### What is Tokamak zk-EVM?

Tokamak zk-EVM is a monorepo for turning Tokamak Layer 2 transaction execution into zk-SNARK proof artifacts. It contains the command-line package, the transaction Synthesizer packages, the prebuilt subcircuit library package, and the Rust backend code for setup, proving, and verification.

### What is a Tokamak Layer 2 transaction?

A Tokamak Layer 2 transaction is the transaction format used by Tokamak's L2 execution model. In Tokamak zk-EVM, it is the unit of execution that the Synthesizer replays from a transaction snapshot: the snapshot carries the L2 transaction data, sender/signature material, calldata, previous state, contract code, and block context needed to reconstruct the transition and produce proof inputs. The TypeScript toolkit for Tokamak L2 transactions, state snapshots, and ZKP-friendly cryptography is `tokamak-l2js`: https://www.npmjs.com/package/tokamak-l2js. Its source repository is https://github.com/tokamak-network/TokamakL2JS.

### What are the main package groups in this monorepo?

The monorepo has four main supported package groups. The CLI package is the end-to-end user entry point. The Synthesizer packages convert Tokamak L2 transaction replay data into circuit-ready inputs. The subcircuit library package publishes the prebuilt R1CS, WASM witness-generation artifacts, and metadata consumed by the Synthesizer and backend. The backend packages implement setup, proof generation, and proof verification for the Tokamak zk-SNARK proving system.

### Which npm package should I install?

If you are new to Tokamak zk-EVM or want the complete local workflow, install `@tokamak-zk-evm/cli`. It is the main package for installing the local runtime and running synthesize, preprocess, prove, verify, and proof extraction commands. Use `@tokamak-zk-evm/synthesizer-node` only when you specifically need the file-based Node.js Synthesizer package. Use `@tokamak-zk-evm/synthesizer-web` only when you need browser-facing synthesis APIs. Use `@tokamak-zk-evm/subcircuit-library` only when you need to consume the published prebuilt subcircuit artifacts directly.

### What does `tokamak-cli` do?

`tokamak-cli` installs and prepares the local Tokamak zk-EVM runtime, runs synthesis from Tokamak L2 transaction snapshots, runs backend preprocessing and proving, verifies proof artifacts, and can extract proof bundles for later verification.

### What is the subcircuit library?

The subcircuit library is the published package of prebuilt circuit artifacts used by Tokamak zk-EVM. It contains R1CS artifacts, WASM witness-generation artifacts, JSON metadata, and related files that let the Synthesizer and backend use a consistent circuit library without rebuilding every circuit from source.

### What does the Synthesizer do?

The Synthesizer takes a Tokamak L2 transaction replay payload and turns it into the artifacts required by the proving pipeline. Its input includes previous state, transaction data, block information, and contract code. Its output includes circuit placement data, public instances, permutation data, final state data, and execution analysis files.

### What backend proving and verification protocol does Tokamak zk-EVM use?

The backend proving and verification packages are based on Tokamak zk-SNARK. The protocol is described in `An Efficient SNARK for Field-Programmable and RAM Circuits` by Jehyuk Jang and Jamie Judd, IACR Cryptology ePrint Archive 2024/507: https://eprint.iacr.org/2024/507.

### Is there an on-chain Solidity verifier implementation?

Yes. The on-chain Solidity verifier implementation lives in the `tokamak-network/Tokamak-zk-EVM-contracts` repository: https://github.com/tokamak-network/Tokamak-zk-EVM-contracts. The Tokamak verifier contract source is `bridge/src/verifiers/TokamakVerifier.sol`: https://github.com/tokamak-network/Tokamak-zk-EVM-contracts/blob/main/bridge/src/verifiers/TokamakVerifier.sol. The current Ethereum mainnet deployment artifact lists `tokamakVerifier` at `0x0C467a5082323Cc6F4b7077A9dFb0bbdaf6eC626`, which can be inspected on Etherscan: https://etherscan.io/address/0x0C467a5082323Cc6F4b7077A9dFb0bbdaf6eC626.

### What is the difference between `synthesizer-node` and `synthesizer-web`?

`@tokamak-zk-evm/synthesizer-node` is a Node.js CLI package that reads JSON files from disk and writes synthesized JSON artifacts back to disk. `@tokamak-zk-evm/synthesizer-web` is a browser-facing package that accepts payload objects or uploaded files and bundles the subcircuit library assets at build time.

### Does the Synthesizer support complex contract-call transactions?

Partially, yes. The Synthesizer is not limited to simple native transfers or a hardcoded ERC20 transfer template. It accepts a complete transaction replay payload, including transaction data, contract code, previous state, and block information, then follows the Tokamak L2/EVM execution path to produce circuit-ready artifacts. For complex contracts, support is not determined by whether the transaction is an ERC20 transfer, a native transfer, or another simple transaction type. Instead, support depends on whether the execution stays within the opcode set, call flows, storage/memory/log handling, and runtime model currently supported by Tokamak zk-EVM.

### Is Tokamak zk-EVM intended for arbitrary Ethereum L1 execution?

No. Tokamak zk-EVM is designed under the strict assumption that it is used in Ethereum Layer 2 execution. Features outside that target runtime model are intentionally excluded from the consumer support claim.

### Which features are intentionally scoped out?

Transactions that require unsupported behavior, such as contract creation, precompiled contracts, transient storage, blob opcodes, invalid/selfdestruct paths, or other unvalidated opcode/control-flow combinations, are outside the supported consumer claim. These limitations are intentional scope boundaries rather than underdevelopment or future work.

### Are the WASM verifier packages officially supported?

No. The WASM verifier packages are deprecated. For local verification, use the supported CLI and backend verification flow. For on-chain verification, use the Solidity verifier contracts in `tokamak-network/Tokamak-zk-EVM-contracts` and the deployed verifier addresses published with the bridge artifacts. The WASM verifier packages should be treated only as historical or reference material.

### Where are release notes maintained?

Release notes are maintained in the root `CHANGELOG.md`. Package artifacts do not include package-local changelog files; package READMEs link back to the root changelog as the canonical release-note source.

If you are interested in converting Ethereum transactions to ZKP, check out branch "[archive-airdrop-Sep25](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/archive-airdrop-Sep25)" (incomplete development).

## Developer Notes

Application developers and service operators should read
[DEVELOPER_NOTES.md](./DEVELOPER_NOTES.md) before changing qap-compiler capacity parameters,
regenerating the subcircuit library, or publishing CRS artifacts.

# Getting started

This section describes how to use the **main CLI** named **`tokamak-cli`**.

## Native npm installation

`@tokamak-zk-evm/cli` performs a **full local install** during `npm install`. The package does not
download prebuilt Rust backend binaries. Instead it:

1. installs `@tokamak-zk-evm/subcircuit-library` and `@tokamak-zk-evm/synthesizer-node`,
2. builds the backend Rust binaries locally on the consumer machine, and
3. downloads CRS artifacts unless setup is explicitly skipped.

Because of that, the consumer machine must already have the required local build toolchain.
The default install path also requires outbound HTTPS access to the npm registry, crates.io,
GitHub, GitHub Releases, and Google Drive.

### Supported native platforms

- macOS
- Linux

Native Windows is not supported for the npm package flow. Use WSL2 or the Docker flow below on Windows.

### Required tools for native npm installation

The local machine must provide all of the following before `npm install @tokamak-zk-evm/cli`:

- Node.js 20 or newer
- npm
- Rust and Cargo
- `bash`
- `cmake`
- `curl`
- `tar`
- `unzip`
- A working C/C++ build toolchain
- `pkg-config` on Linux
- Outbound HTTPS access to the npm registry, crates.io, GitHub, GitHub Releases, and Google Drive

`npm` remains part of the minimum toolchain even after the package is installed. During the backend
release build, the Rust build scripts resolve and pack the published
`@tokamak-zk-evm/subcircuit-library` package to embed the release snapshot and metadata.

### macOS setup

1. Install Apple developer tools.
   Either of the following is acceptable:

   - `xcode-select --install`
   - a full Xcode installation with the active developer directory configured

   Example:

   ```bash
   xcode-select --install
   ```

2. Install Homebrew if it is not already installed:
   https://brew.sh/
3. Install Node.js and CMake:
   ```bash
   brew install node cmake
   ```
4. Install Rust:
   ```bash
   curl https://sh.rustup.rs -sSf | sh
   source "$HOME/.cargo/env"
   ```
5. Verify the required tools:
   ```bash
   node --version
   npm --version
   rustc --version
   cargo --version
   cmake --version
   curl --version
   tar --version
   unzip -v
   cc --version
   c++ --version
   install_name_tool -h
   ```
6. Install the CLI package:
   ```bash
   npm install -g @tokamak-zk-evm/cli
   ```

The macOS packaging path rewrites runtime library search paths with `install_name_tool`, so the
selected Apple developer tools must provide `cc`, `c++`, and `install_name_tool`.

### Linux setup

The exact package names depend on the distribution. On Ubuntu or Debian, the following is a good baseline:

1. Install the system build prerequisites:
   ```bash
   sudo apt-get update
   sudo apt-get install -y build-essential curl cmake unzip tar pkg-config bash
   ```
2. Install Node.js 20 or newer.
   - Use https://nodejs.org/ or NodeSource if the distro package is older than 20.
3. Install Rust:
   ```bash
   curl https://sh.rustup.rs -sSf | sh
   source "$HOME/.cargo/env"
   ```
4. Verify the required tools:
   ```bash
   node --version
   npm --version
   rustc --version
   cargo --version
   cmake --version
   curl --version
   tar --version
   unzip -v
   cc --version
   c++ --version
   make --version
   pkg-config --version
   ```
5. Install the CLI package:
   ```bash
   npm install -g @tokamak-zk-evm/cli
   ```

### Windows setup

Native Windows installation of `@tokamak-zk-evm/cli` is not supported.

Use one of:

- WSL2 with an Ubuntu environment, then follow the Linux setup above.
- Docker Desktop with the repository checkout flow below.

## Repository checkout and Docker

This repository checkout flow is useful for contributors or for Windows users who want an isolated environment.

### Windows users

1. Install Docker Desktop for Windows – https://docs.docker.com/desktop/install/windows-install/
2. If you want CUDA/GPU support, install the NVIDIA GPU driver and verify Docker GPU pass-through.
   - Install [the latest NVIDIA driver](https://developer.nvidia.com/cuda/wsl).
   - Ensure Docker Desktop is using Linux containers with the WSL 2 backend.
   - Optional host checks:
     ```bash
     nvidia-smi
     docker run --rm --gpus all nvidia/cuda:12.2.0-runtime-ubuntu22.04 nvidia-smi
     ```
3. Run Docker Compose from the repository root, `Tokamak-zk-EVM`.
   - CPU environment:
     ```bash
     docker compose build cli
     docker compose run --rm cli
     ```
   - GPU environment:
     ```bash
     docker compose build cli-gpu
     docker compose run --rm cli-gpu
     ```
   - Both services mount the repository to `/workspace` and start an interactive Bash shell there.

### macOS or Linux contributors

If you are running the CLI from a repository checkout instead of the published npm package, build the local CLI package and invoke its generated entrypoint directly:

```bash
npm install
npm --prefix packages/cli run build
node packages/cli/dist/cli.js --install
```

Inside the repository workspace, the CLI package skips its automatic `postinstall` runtime setup, so the explicit build step is required before the first local run.

For that checkout-based flow, install the same Node/Rust/CMake prerequisites listed above before the first run.

## How to run (for all platforms)

Use one of the following CLI entrypoints:

```bash
# Published npm package
tokamak-cli

# Repository checkout from the repository root, after npm install and build
node packages/cli/dist/cli.js
```

In the examples below, replace `<CLI>` with the entrypoint that matches your setup.

The CLI stores runtime artifacts under `~/.tokamak-zk-evm/<platform>/runtime/resource` by default.

1. **Install** (install published runtime packages, build backend binaries, and prepare setup artifacts)

```bash
<CLI> --install
```

By default, `--install` downloads the latest compatible CRS archive from the published Google Drive
folder. Use `<CLI> --install --trusted-setup` to generate CRS locally, or
`<CLI> --install --no-setup` to skip setup artifact provisioning.

2. **Synthesize** (prepare inputs from one Tokamak L2 transaction snapshot)

```bash
<CLI> --synthesize <INPUT_DIR>

# Or pass explicit file paths
<CLI> --synthesize \
  --previous-state <PREVIOUS_STATE_SNAPSHOT_JSON> \
  --transaction <TRANSACTION_JSON> \
  --block-info <BLOCK_INFO_JSON> \
  --contract-code <CONTRACT_CODES_JSON>
```

`<INPUT_DIR>` must contain `previous_state_snapshot.json`, `transaction.json`, `block_info.json`, and `contract_codes.json`.

3. **Preprocess** (backend preprocess stage)

```bash
<CLI> --preprocess
```

4. **Prove** (backend prove stage; outputs stay under the CLI runtime cache)

```bash
<CLI> --prove
```

5. **Verify** (verify proof artifacts already stored in the CLI runtime cache)

```bash
# Uses the installed runtime cache by default
<CLI> --verify

# Or provide a directory or zip file containing proof.json, preprocess.json, and instance.json
<CLI> --verify <PROOF_DIR_OR_ZIP>
```

6. **Extract proof bundle** (optional; zip key artifacts so they can be passed back to `--verify`)

```bash
<CLI> --extract-proof <OUTPUT_ZIP_PATH>
```

## Disclaimer

- The Tokamak‑zk‑EVM project and its maintainers are **not responsible for any leakage or misuse of your API keys or credentials**.

## Package Composition

![Tokamak-zk-EVM Flow Chart](.github/assets/flowchart.png)

### Frontend Packages (compilers)

| Package                                                        | Description                                                                               | Language   | Repo Version | Published Package                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| [`qap-compiler`](./packages/frontend/qap-compiler)             | Maintainer-side generator for the published subcircuit library package                    | Circom     | `2.0.12`     | [`@tokamak-zk-evm/subcircuit-library`](https://www.npmjs.com/package/@tokamak-zk-evm/subcircuit-library) |
| [`synthesizer-node`](./packages/frontend/synthesizer/node-cli) | Node CLI package that converts Tokamak L2 transaction snapshots into circuit inputs       | TypeScript | `2.0.12`     | [`@tokamak-zk-evm/synthesizer-node`](https://www.npmjs.com/package/@tokamak-zk-evm/synthesizer-node)     |
| [`synthesizer-web`](./packages/frontend/synthesizer/web-app)   | Browser-facing package that converts Tokamak L2 transaction snapshots into circuit inputs | TypeScript | `2.0.12`     | [`@tokamak-zk-evm/synthesizer-web`](https://www.npmjs.com/package/@tokamak-zk-evm/synthesizer-web)       |

### CLI Package

| Package                         | Description                                                                                       | Language   | Repo Version | Published Package                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- | ------------ | -------------------------------------------------------------------------- |
| [`tokamak-cli`](./packages/cli) | npm-distributed launcher package that builds the backend locally and exposes the Tokamak CLI flow | TypeScript | `2.0.12`     | [`@tokamak-zk-evm/cli`](https://www.npmjs.com/package/@tokamak-zk-evm/cli) |

### Backend Packages

| Package                                                   | Description                                                          | Language       | Repo Version | Distribution                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| [`mpc-setup`](./packages/backend/setup/mpc-setup)         | Tokamak zk-SNARK's setup algorithm (multi-party computation version) | Rust           | `2.0.12`     | [Published CRS artifacts](https://drive.google.com/drive/u/0/folders/14xqCbLoyoVmUVTTlopiXtKnoHPBGL-Sv) |
| [`trusted-setup`](./packages/backend/setup/trusted-setup) | Tokamak zk-SNARK's setup algorithm (trusted single entity version)   | Rust           | `2.0.12`     | Source-only in this repository                                                                          |
| [`prover`](./packages/backend/prove)                      | Tokamak zk-SNARK's proving algorithm                                 | Rust           | `2.0.12`     | Source-only in this repository                                                                          |
| [`verify`](./packages/backend/verify-rust)                | Tokamak zk-SNARK's verifying algorithm                               | Rust, Solidity | `2.0.12`     | Source-only in this repository                                                                          |

Release versions are synchronized from the root repository version. The root [CHANGELOG.md](./CHANGELOG.md) is the canonical changelog for npm-published package consumers; record only changes that affect published package artifacts or their consumer-facing behavior. Package artifacts do not include changelog files; package READMEs link to the root changelog instead.

## Development Status

### Sep. 2025

- Archived in branch "[archive-airdrop-Sep25](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/archive-airdrop-Sep25)".
- Incomplete conversion of Ethereum transactions into ZKPs.
- What does "incomplete" mean? ZKPs only include the execution of a transaction's opcodes. Verification of input state and the transaction signature, as well as reconstruction of output state, are excluded.
- The Tokamak zk-SNARK backend is ready to use:
  - MSM and NTT are accelerated by [ICICLE APIs](https://github.com/ingonyama-zk/icicle).
  - It requires < 10GB memory.
  - A ZKP can be generated in 1-2 mins on CUDA or Apple silicon.

## Jan. 2026

- Complete conversion of Tokamak Layer 2 transactions into ZKPs, which covers:
  - Verification of transaction signatures,
  - Verification of input state,
  - Execution of transaction opcodes,
  - Reconstruction of output state.
- Compatible with [Tokamak Private App Channels](https://github.com/tokamak-network/private-app-channel-manager).

## Apr. 2026

- The current main branch.
- Performance optimizations in the Tokamak zk-SNARK backend `prove` package reduce proof generation time by at least 2x in CPU environments.
- Security patches in the `qap-compiler` package strengthen the subcircuit library.
- Compatible with the new version of [Tokamak Private App Channels](https://github.com/tokamak-network/Tokamak-zk-EVM-contracts/blob/main/README.md).

## Documentation

- [Project Tokamak Network ZKP (Medium)](https://medium.com/tokamak-network/project-tokamak-zk-evm-67483656fd21) (Last updated in Nov. 2025)
- [Project Tokamak zk-EVM(Slide)](https://docs.google.com/presentation/d/1D49fRElwkZYbEvQXB_rp5DEy22HFsabnXyeMQdNgjRw/edit?usp=sharing) (Last updated in Jul. 2025)
- [Tokamak zk-SNARK Paper](https://eprint.iacr.org/2024/507) (Last updated in Apr. 2025)
- Frontend - [Synthesizer](https://tokamak-network-zk-evm.gitbook.io/tokamak-network-zk-evm) (work in progress)
<!-- - [API Reference](./docs/api) -->

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for details.

## License

This project is dual-licensed under:

- [MIT License](./LICENSE-MIT)
- [Apache License 2.0](./LICENSE-APACHE)

You may choose either license when using this software. This dual-licensing approach is standard in the Rust ecosystem and provides maximum compatibility with other open-source projects.
