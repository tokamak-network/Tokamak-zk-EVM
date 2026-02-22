# Tokamak-zk-EVM

[![Build & Test](https://github.com/tokamak-network/Tokamak-zk-EVM/actions/workflows/build-release.yml/badge.svg?branch=main)](https://github.com/tokamak-network/Tokamak-zk-EVM/actions/workflows/build-release.yml)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](./LICENSE)
[![Tokamak Network](https://img.shields.io/badge/by-Tokamak%20Network-1f6feb)](https://tokamak.network/)

Tokamak zk-EVM is an open-source CLI and monorepo that converts [TokamakL2JS](https://github.com/tokamak-network/TokamakL2JS) transactions into zero-knowledge proofs (zk-SNARKs).

[TokamakL2JS](https://github.com/tokamak-network/TokamakL2JS), which is a variant of [EthereumJS](https://github.com/ethereumjs/ethereumjs-monorepo), specifies a layer 2 protocol of Tokamak Network.

If you are interested in converting Ethereum transactions to ZKP, check out branch "[archive-airdrop-Sep25](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/archive-airdrop-Sep25)" (incomplete development).

**Keywords:** `zkEVM`, `zk-SNARK`, `zero-knowledge proof`, `Ethereum`, `Layer 2`, `Tokamak`, `transaction proving`, `Rust`, `Circom`, `TypeScript`

## Quick Navigation

- [Getting Started](#getting-started)
- [How to Run](#how-to-run-for-all-platforms)
- [Package Composition](#package-composition)
- [Development Status](#development-status)
- [Documentation](#documentation)
- [AI and LLM Retrieval Docs](#ai-and-llm-retrieval-docs)
- [Contributing](#contributing)
- [Security](#security)
- [Support](#support)
- [Citation](#citation)
- [License](#license)

## Getting Started

This section describes how to use the **main CLI** named **`tokamak-cli`**.

## Prerequisites

### Alchemy API key

1. Create an Alchemy account and log in to the dashboard (https://dashboard.alchemy.com/).
2. Create a new app/project for **Ethereum Mainnet**.
3. Copy the **API Key** (the short token).  
    You will pass this key to the CLI as `--install <API_KEY>`.
   > Note: You can paste the full RPC URL obtained from any provider other than Alchemy.

### For Windows users

1. Install Docker Desktop for Windows – https://docs.docker.com/desktop/install/windows-install/
2. (If you want to use CUDA/GPU) Install **NVIDIA GPU driver** on Windows and verify Docker GPU pass-through.

   - Install [the latest NVIDIA driver](https://developer.nvidia.com/cuda/wsl).
   - Ensure Docker Desktop is using **Linux containers** with the **WSL 2** backend.
   - (Optional) Test that CUDA is visible inside containers (at the host):

     ```
     nvidia-smi

     docker run --rm --gpus all nvidia/cuda:12.2.0-runtime-ubuntu22.04 nvidia-smi
     ```

3. Run Docker

   - Make sure that you are in the root directory, `Tokamak-zk-EVM`.

     ```bash
     docker build -f dockerfile -t tokamak-zkevm:win .

     # If you will use CUDA/GPU
     docker run --gpus all --rm -it -v "$(cygpath -m "$PWD"):/workspace" tokamak-zkevm:win bash
     # Else
     docker run --rm -it -v "$(cygpath -m "$PWD"):/workspace" tokamak-zkevm:win bash
     ```

### For macOS users

**Option 1: Automatic Setup (Recommended)**

Run the setup script to automatically check and install all prerequisites:

```bash
./scripts/setup-macos.sh
```

This script will detect the following dependencies and install any missing automatically.

**Option 2: Manual Installation**

- Install Node.js – https://nodejs.org/
- Install Circom – https://docs.circom.io/getting-started/installation/
- Install Rust – https://www.rust-lang.org/tools/install
- Install CMake – https://cmake.org/download/
- Install Bun – https://bun.sh/ (required for Synthesizer binary build)
- Install dos2unix
  ```zsh
  brew install dos2unix
  ```

### For Linux users

- Install Node.js – https://nodejs.org/
- Install Circom – https://docs.circom.io/getting-started/installation/
- Install Rust – https://www.rust-lang.org/tools/install
- Install CMake – https://cmake.org/download/
- Install dos2unix
  - For example, Ubuntu/Debian:
    ```bash
    sudo apt-get update && sudo apt-get install -y dos2unix
    ```
- If you want to use CUDA for GPU acceleration:
  1. Install the **NVIDIA GPU driver** appropriate for your distro (verify with `nvidia-smi`).  
     Docs: https://docs.nvidia.com/cuda/
  2. Install **CUDA runtime libraries** (matching your driver’s supported CUDA version).  
     Follow the **CUDA Installation Guide for Linux** in the docs above.
  3. (Optional) Quick checks:
     ```bash
     nvidia-smi
     ldconfig -p | grep -E 'libcudart|libcublas|libcudnn' || true
     ```

### Before first run (line endings & permissions)

To avoid compatibility/permission issues on the main script itself:

- Convert CRLF → LF on the CLI script:

  ```bash
  # Run from the repo root
  dos2unix tokamak-cli
  ```

- Make the CLI executable:
  ```bash
  chmod +x tokamak-cli
  ```

## How to run (for all platforms)

From the repository root:

1. **Install** (Install deps, compile circuits, write RPC URL using your **Alchemy API key**, run trusted setup, then run OS-specific backend packaging)

```bash
./tokamak-cli --install <YOUR_ALCHEMY_API_KEY | FULL_RPC_URL>
```

2. **Synthesize** (prepare inputs using a transaction config JSON)

```bash
./tokamak-cli --synthesize <PATH_TO_CONFIG_JSON>
```

> A template for the config JSON lives in `synthesizer-input-template/`.

3. **Preprocess** (backend preprocess stage)

```bash
./tokamak-cli --preprocess
```

4. **Prove** (backend prove stage; outputs stay under `dist/<platform>/resource/prove/output`)

```bash
./tokamak-cli --prove
```

5. **Verify** (verify proof artifacts in dist; optional resource overlay path)

```bash
# Uses dist/<platform>/resource by default
./tokamak-cli --verify

# Or provide a directory containing a resource/ folder to overlay into dist before verifying
./tokamak-cli --verify <PATH_WITH_RESOURCE>
```

6. **Extract proof bundle** (optional; zip key artifacts)

```bash
./tokamak-cli --extract-proof <OUTPUT_ZIP_PATH>
```

## Disclaimer

- The Tokamak‑zk‑EVM project and its maintainers are **not responsible for any leakage or misuse of your API keys or credentials**.
- For local testing, use a **free, non‑sensitive Alchemy API key**. Do **not** use production or paid keys, or keys tied to sensitive data.
- During `--install`, the CLI writes your RPC endpoint to `packages/frontend/synthesizer/.env`. We **recommend deleting `.env` after use** (or rotating the key) and ensuring it is **not committed** to version control.

## Package Composition

![Tokamak-zk-EVM Flow Chart](.github/assets/flowchart.png)

### Frontend Packages (compilers)

| Package                                            | Description                                                                        | Language   | Status  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- | ------- |
| [`qap-compiler`](./packages/frontend/qap-compiler) | Library of subcircuits for basic EVM operations                                    | Circom     | 🧪 Beta |
| [`synthesizer`](./packages/frontend/synthesizer)   | Compiler that converts an Ethereum transaction into a circuit for Tokamak zk-SNARK | TypeScript | 🧪 Beta |

### Backend Packages

| Package                                                   | Description                                                          | Language       | Status  |
| --------------------------------------------------------- | -------------------------------------------------------------------- | -------------- | ------- |
| [`mpc-setup`](./packages/backend/setup/mpc-setup)         | Tokamak zk-SNARK's setup algorithm (multi-party computation version) | Rust           | 🧪 Beta |
| [`trusted-setup`](./packages/backend/setup/trusted-setup) | Tokamak zk-SNARK's setup algorithm (trusted single entity version)   | Rust           | 🧪 Beta |
| [`prover`](./packages/backend/prove)                      | Tokamak zk-SNARK's proving algorithm                                 | Rust           | 🧪 Beta |
| [`verify`](./packages/backend/verify)                     | Tokamak zk-SNARK's verifying algorithm                               | Rust, Solidity | 🧪 Beta |

> Notes:
>
> - 🔥 Alpha: Initial proof-of-concept for testing
> - 🧪 Beta: Fully featured, but unstable and unoptimized
> - ⭐️ Stable (v1.0.0): Fully featured, stable, and optimized

## Development status

### Sep. 2025

- Archived in branch "[archive-airdrop-Sep25](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/archive-airdrop-Sep25)".
- Incomplete conversion of Ethereum transactions into ZKPs.
- What does "incomplete" mean? ZKPs only include the execution of a transaction's opcodes. Verification of input state and the transaction signature, as well as reconstruction of output state, are excluded.
- The Tokamak zk-SNARK backend is ready to use:
  - MSM and NTT are accelerated by [ICICLE APIs](https://github.com/ingonyama-zk/icicle).
  - It requires < 10GB memory.
  - A ZKP can be generated in 1-2 mins on CUDA or Apple silicon.

## Jan. 2026

- The current main branch.
- Complete conversion of Tokamak Layer 2 transactions into ZKPs, which covers:
  - Verification of transaction signatures,
  - Verification of input state,
  - Execution of transaction opcodes,
  - Reconstruction of output state.
- Compatible with [Tokamak Private App Channels](https://github.com/tokamak-network/Tokamak-zkp-channel-manager).

## Documentation

- [Project Tokamak Network ZKP (Medium)](https://medium.com/tokamak-network/project-tokamak-zk-evm-67483656fd21) (Last updated in Nov. 2025)
- [Project Tokamak zk-EVM(Slide)](https://docs.google.com/presentation/d/1D49fRElwkZYbEvQXB_rp5DEy22HFsabnXyeMQdNgjRw/edit?usp=sharing) (Last updated in Jul. 2025)
- [Tokamak zk-SNARK Paper](https://eprint.iacr.org/2024/507) (Last updated in Apr. 2025)
- Frontend - [Synthesizer](https://tokamak-network-zk-evm.gitbook.io/tokamak-network-zk-evm) (work in progress)
<!-- - [API Reference](./docs/api) -->

## AI and LLM Retrieval Docs

- [llms.txt](./llms.txt) (index for model/tool agents)
- [llms-full.txt](./llms-full.txt) (expanded machine-readable project context)
- [FAQ](./docs/FAQ.md) (short, retrieval-friendly Q&A)

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for details.

## Security

Please read [SECURITY.md](./SECURITY.md) to report vulnerabilities responsibly.

## Support

For usage questions and troubleshooting, start from [SUPPORT.md](./SUPPORT.md).

## Citation

If this project helps your research or product, cite it via [CITATION.cff](./CITATION.cff).

## License

This project is dual-licensed under:

- [MIT License](./LICENSE-MIT)
- [Apache License 2.0](./LICENSE-APACHE)

You may choose either license when using this software. This dual-licensing approach is standard in the Rust ecosystem and provides maximum compatibility with other open-source projects.
