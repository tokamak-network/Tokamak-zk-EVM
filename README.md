# Tokamak-zk-EVM

Tokamak-zk-EVM is a zero-knowledge Ethereum Virtual Machine implementation that enables scalable and private smart contract execution.

## Tokamak-zk-EVM flow chart

![Tokamak-zk-EVM Flow Chart](.github/assets/flowchart.png)

## Usage

We provide [Playground](https://github.com/tokamak-network/Tokamak-zk-EVM-playgrounds), a graphical user interface that helps you easily follow the execution of Tokamak zk‑EVM.

This section describes how to use the **main CLI** named **`tokamak-cli`**.

### Prerequisites

Make sure the following are installed:

- **Node.js** – https://nodejs.org/
- **Circom** – https://docs.circom.io/getting-started/installation/
- **Rust** – https://www.rust-lang.org/tools/install
- **CMake** – https://cmake.org/download/
- **CUDA (Linux only, for GPU acceleration)**  
  - Install the **NVIDIA GPU driver** appropriate for your distro (verify with `nvidia-smi`).  
    Docs: https://docs.nvidia.com/cuda/
  - Install **CUDA runtime libraries** (matching your driver’s supported CUDA version).  
    Follow the **CUDA Installation Guide for Linux** in the docs above.
  - (If you will run inside Docker) install the **NVIDIA Container Toolkit** so containers can access the GPU:  
    https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html
  - Quick checks:
    ```bash
    # On host
    nvidia-smi
    ldconfig -p | grep -E 'libcudart|libcublas|libcudnn' || true
    
    # With Docker (should print the GPU info)
    docker run --rm --gpus all nvidia/cuda:12.2.0-runtime-ubuntu22.04 nvidia-smi
    ```

  > **Windows users (Docker):** You can skip installing CUDA libraries on the host. The provided Docker image (`Docker_for_Windows`, based on `nvidia/cuda:12.2.0-runtime-ubuntu22.04`) already includes the CUDA runtime.

- **Docker (Windows only, recommended)** – https://docs.docker.com/desktop/install/windows-install/

You will also need an **Alchemy API key**:

1. Create an Alchemy account and log in to the dashboard (https://dashboard.alchemy.com/).
2. Create a new app/project for **Ethereum Mainnet**.
3. Copy the **API Key** (the short token).  
   You will pass this key to the CLI as `--setup <API_KEY>` (do **not** paste the full RPC URL).

> Tip: The CLI writes `RPC_URL='https://eth-mainnet.g.alchemy.com/v2/<API_KEY>'` into `packages/frontend/synthesizer/.env`.

---

### Windows users (Docker)

A Dockerfile named **`Docker-for-Windows`** is provided for Windows users. Build the image and start a container from the **repo root**:

> Note: You do **not** need to install CUDA libraries on Windows. The Docker image builds with the CUDA runtime included; you only need an NVIDIA driver on the host and to run the container with `--gpus all`.

**PowerShell**
```powershell
cd C:\path\to\Tokamak-zk-EVM
docker build -f Docker-for-Windows -t tokamak-zkevm:win .
docker run --rm -it \
  -v "$(pwd -W):/workspace" \
  tokamak-zkevm:win \
  bash -lc "cd /workspace && exec bash"
```


**Git Bash (fix path conversion)**
```bash
cd /c/path/to/Tokamak-zk-EVM
docker build -f Docker-for-Windows -t tokamak-zkevm:win .
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" docker run --rm -it -v "$(pwd -W):/workspace" -w /workspace tokamak-zkevm:win bash
```

> If you see an error like:
> `docker: Error response from daemon: the working directory 'C:/Program Files/Git/workspace' is invalid, it needs to be an absolute path`,
> Git Bash converted `/workspace` into a Windows path. The command above disables MSYS path conversion (`MSYS_NO_PATHCONV` and `MSYS2_ARG_CONV_EXCL`) and passes a proper Windows form for the host path (`$(pwd -W)`).

Once inside the container shell, follow the **All platforms** steps below (run `./tokamak-cli …` from `/workspace`).

---

### Before first run (line endings & permissions)

To avoid compatibility/permission issues on the main script itself:

- Convert CRLF → LF on the CLI script:
  ```bash
  # Run from the repo root
  dos2unix tokamak-cli
  ```
  > Note: Our CLI automatically normalizes and fixes permissions for *sub* scripts it calls,
  > but the **main** `tokamak-cli` file itself must be runnable.

- Make the CLI executable:
  ```bash
  chmod +x tokamak-cli
  ```


### All platforms (macOS, Linux, Windows-in-Docker)

From the repository root:

1) **Build** (install frontend deps, run OS-specific backend packaging)
```bash
./tokamak-cli --build
```

2) **Setup** (compile circuits, write RPC URL using your **Alchemy API key**, run trusted setup)
```bash
./tokamak-cli --setup <YOUR_ALCHEMY_API_KEY>
```

3) **Prove** (generate and verify a proof for a transaction; copy artifacts)
```bash
# Save to a custom directory (recommended)
./tokamak-cli --prove <TX_HASH> <PATH_TO_SAVE_PROOF>

# Or omit the directory to use the default path:
./tokamak-cli --prove <TX_HASH>
# → artifacts are copied to ./.your_proof by default
```

> Notes
> - Run the commands from the **repo root**.
> - The CLI auto-detects your OS to use the correct backend dist (`dist-mac`, `dist-linux20`, or `dist-linux22`).
> - Ensure your transaction hash is on the **Ethereum Mainnet**, matching the Alchemy RPC URL written in `.env`.

## Disclaimer

- The Tokamak‑zk‑EVM project and its maintainers are **not responsible for any leakage or misuse of your API keys or credentials**.
- For local testing, use a **free, non‑sensitive Alchemy API key**. Do **not** use production or paid keys, or keys tied to sensitive data.
- During `--setup`, the CLI writes your RPC endpoint to `packages/frontend/synthesizer/.env`. We **recommend deleting `.env` after use** (or rotating the key) and ensuring it is **not committed** to version control.

## Package Composition

This monorepo contains the core components of the Tokamak-zk-EVM ecosystem:

### Frontend Packages

| Package                                            | Description                                                                        | Language   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| [`qap-compiler`](./packages/frontend/qap-compiler) | Library of subcircuits for basic EVM operations                                    | circom     |
| [`synthesizer`](./packages/frontend/synthesizer)   | Compiler that converts an Ethereum transaction into a circuit for Tokamak zk-SNARK | javascript |

### Backend Packages

| Package                                                   | Description                                                                       | Language       |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------- |
| [`libs`](./packages/backend/libs)                         | Mathematical and signal processing related library functions for Tokamak zk-SNARK | rust           |
| [`mpc-setup`](./packages/backend/setup/mpc-setup)         | Tokamak zk-SNARK's setup alogirhtm (multi-party computation version)              | rust           |
| [`trusted-setup`](./packages/backend/setup/trusted-setup) | Tokamak zk-SNARK's setup algorithm (trusted single entity version)                | rust           |
| [`prover`](./packages/backend/prove)                      | Tokamak zk-SNARK's proving algorithm                                              | rust           |
| [`verify`](./packages/backend/verify)                     | Tokamak zk-SNARK's verifying algorithm                                            | rust, solidity |

## Package Versions

| Package         | Current Version | Status     |
| --------------- | --------------- | ---------- |
| `qap-compiler`  | v0.5.0          | 🧪 Beta    |
| `synthesizer`   | v0.5.0          | 🧪 Beta    |
| `libs`          | v0.5.0          | 🧪 Beta    |
| `prove`         | v0.5.0          | 🧪 Beta    |
| `mpc-setup`     | -               | 🚧 Planned |
| `trusted-setup` | v0.5.0          | 🧪 Beta    |
| `verify-rust`   | v0.5.0          | 🧪 Beta    |
| `verify-sol`    | v0.0.1          | 🔥 Alpha   |

### Version Strategy

🔥 Alpha

- Initial implementation and testing

🧪 Beta

- System-wide testing and optimization

⭐️ Stable (v1.0.0)

- Production-ready release
- Full system integration and testing

## Documentation

- [Project Tokamak zk-EVM(Medium)](https://medium.com/tokamak-network/project-tokamak-zk-evm-67483656fd21) (Last updated in Apr. 2025)
- [Project Tokamak zk-EVM(Slide)](https://docs.google.com/presentation/d/1D49fRElwkZYbEvQXB_rp5DEy22HFsabnXyeMQdNgjRw/edit?usp=sharing) (Last updated in Jul. 2025)
- [Tokamak zk-SNARK Paper](https://eprint.iacr.org/2024/507) (Last updated in Apr. 2025)
- Frontend - [Synthesizer](https://tokamak-network-zk-evm.gitbook.io/tokamak-network-zk-evm)
<!-- - [API Reference](./docs/api) -->

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for details.

## License

This project is licensed under [MPL-2.0](./LICENSE).
