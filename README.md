# Tokamak-zk-EVM

Tokamak zk-EVM is a tool that converts Ethereum transactions into ZKPs.

It's currently under development. In the near future, you can generate ZKPs off-chain and use them to replace on-chain Ethereum transactions.

## Getting started

This section describes how to use the **main CLI** named **`tokamak-cli`** for developers.

> Note: We also provide [Playground](https://github.com/tokamak-network/Tokamak-zk-EVM-playgrounds), a one-click application designed for non-developers (no prerequisite installation).

### Prerequisites
#### Alchemy API key
1. Create an Alchemy account and log in to the dashboard (https://dashboard.alchemy.com/).
2. Create a new app/project for **Ethereum Mainnet**.
3. Copy the **API Key** (the short token).  
   You will pass this key to the CLI as `--install <API_KEY>`.
> Note: You can paste the full RPC URL obtained from any provider other than Alchemy.

#### For Windows users
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
    - Make sure that you are in the root directory, `Tokamak-zk-evm`.
        ```bash
        docker build -f Docker_for_Windows -t tokamak-zkevm:win .

        # If you will use CUDA/GPU
        docker run --gpus all --rm -it -v "$(cygpath -m "$PWD"):/workspace" tokamak-zkevm:win bash 
        # Else
        docker run --rm -it -v "$(cygpath -m "$PWD"):/workspace" tokamak-zkevm:win bash 
        ```

#### For MacOS users
- Install Node.js – https://nodejs.org/
- Install Circom – https://docs.circom.io/getting-started/installation/
- Install Rust – https://www.rust-lang.org/tools/install
- Install CMake – https://cmake.org/download/
- Install dos2unix
    ```zsh 
    brew install dos2unix
    ```

#### For Linux users
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

### How to run (for all platforms)

From the repository root:

1) **Install** (Install deps, compile circuits, write RPC URL using your **Alchemy API key**, run trusted setup, then run OS-specific backend packaging)
```bash
./tokamak-cli --install <YOUR_ALCHEMY_API_KEY | FULL_RPC_URL>
```

2) **Synthesize** (prepare inputs using a transaction config JSON)
```bash
./tokamak-cli --synthesize <PATH_TO_CONFIG_JSON>
```
> A template for the config JSON lives in `synthesizer-input-template/`.

3) **Preprocess** (backend preprocess stage)
```bash
./tokamak-cli --preprocess
```

4) **Prove** (backend prove stage; outputs stay under `dist/<platform>/resource/prove/output`)
```bash
./tokamak-cli --prove
```

5) **Verify** (verify proof artifacts in dist; optional resource overlay path)
```bash
# Uses dist/<platform>/resource by default
./tokamak-cli --verify

# Or provide a directory containing a resource/ folder to overlay into dist before verifying
./tokamak-cli --verify <PATH_WITH_RESOURCE>
```

6) **Extract proof bundle** (optional; zip key artifacts)
```bash
./tokamak-cli --extract-proof <OUTPUT_DIR>
```

## Disclaimer
- The Tokamak‑zk‑EVM project and its maintainers are **not responsible for any leakage or misuse of your API keys or credentials**.
- For local testing, use a **free, non‑sensitive Alchemy API key**. Do **not** use production or paid keys, or keys tied to sensitive data.
- During `--setup`, the CLI writes your RPC endpoint to `packages/frontend/synthesizer/.env`. We **recommend deleting `.env` after use** (or rotating the key) and ensuring it is **not committed** to version control.

## Package Composition
![Tokamak-zk-EVM Flow Chart](.github/assets/flowchart.png)

### Frontend Packages (compilers)

| Package                                            | Description                                                                        | Language   | Status   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- | -------- |
| [`qap-compiler`](./packages/frontend/qap-compiler) | Library of subcircuits for basic EVM operations                                    | circom     | 🔥 Alpha |
| [`synthesizer`](./packages/frontend/synthesizer)   | Compiler that converts an Ethereum transaction into a circuit for Tokamak zk-SNARK | javascript | 🔥 Alpha |

### Backend Packages


| Package                                                   | Description                                                                       | Language       | Status  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------- | ------- |
| [`mpc-setup`](./packages/backend/setup/mpc-setup)         | Tokamak zk-SNARK's setup alogirhtm (multi-party computation version)              | rust           | 🧪 Beta |
| [`trusted-setup`](./packages/backend/setup/trusted-setup) | Tokamak zk-SNARK's setup algorithm (trusted single entity version)                | rust           | 🧪 Beta |
| [`prover`](./packages/backend/prove)                      | Tokamak zk-SNARK's proving algorithm                                              | rust           | 🧪 Beta |
| [`verify`](./packages/backend/verify)                     | Tokamak zk-SNARK's verifying algorithm                                            | rust, solidity | 🧪 Beta |

> Notes:
> - 🔥 Alpha: Initial proof-of-concept for testing
> - 🧪 Beta: Fully featured, but unstable and unoptimized
> - ⭐️ Stable (v1.0.0): Fully featured, stable, and optimized

## Development status
### Status as of Aug. 2025
- The Tokamak zk-SNARK backend is ready to use:
    - MSM and NTT are accelerated by [ICICLE APIs](https://github.com/ingonyama-zk/icicle).
    - It requires < 10GB memory.
    - A ZKP can be generated in 1-2 mins on CUDA or Apple silicon.
- The **alpha release** of our transaction-to-circuit compiler is ready to use:
    - Given honest input Ethereum state and an honest transaction, the circuit verifies that the output Ethereum state is derived exactly as specified in the transaction. 
### Future updates
- The **beta release** of our transactions-to-circuit compiler, which covers:
    - Signature verification of batch transactions,
    - Merkle proof verification of input Ethereum state,
    - Accurate derivation of output Ethereum state as specified by a sequence of transactions,
    - Merkle root update based on output Ethereum state.
- Off-chain tools for writing transactions and generating ZKPs.
- Ethereum bridge contracts that provide communication protocols between the Ethereum main network and off-chain.

## Documentation

- [Project Tokamak zk-EVM(Medium)](https://medium.com/tokamak-network/project-tokamak-zk-evm-67483656fd21) (Last updated in Apr. 2025)
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
