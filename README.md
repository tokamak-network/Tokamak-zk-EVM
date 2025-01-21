# Tokamak-zk-EVM

Tokamak-zk-EVM is a zero-knowledge Ethereum Virtual Machine implementation that enables scalable and private smart contract execution.

## Overview

This monorepo contains the core components of the Tokamak-zk-EVM ecosystem:

### Frontend Packages
| Package | Description | Language |
|---------|-------------|----------|
| [`qap-compiler`](./packages/frontend/qap-compiler) | Library of subcircuits for basic EVM operations | circom |
| [`synthesizer`](./packages/frontend/synthesizer) | Compiler that converts an Ethereum transaction into a circuit for Tokamak zk-SNARK | javascript |
### Backend Packages
| Package | Description | Language |
|---------|-------------|----------|
| [`mpc-setup`](./packages/backend/setup/mpc-setup) | Tokamak zk-SNARK's setup alogirhtm (multi-party computation version) | rust |
| [`trusted-setup`](./packages/backend/setup/trusted-setup) | Tokamak zk-SNARK's setup algorithm (trusted single entity version) | rust |
| [`prover`](./packages/backend/prove) | Tokamak zk-SNARK's proving algorithm | rust |
| [`verify`](./packages/backend/verify) | Tokamak zk-SNARK's verifying algorithm | rust, solidity |
### Libraries
| Package | Description | Language | 
|---------|-------------|----------|
| [`libs-rust-tools`](./packages/libs/internal/rust-tools) | Field, polynomial, signal processing related modules for Tokamak zk-SNARK | rust |

## Branches
### Active Branches
- `main` - Stable releases, currently containing frontend components (v0.1.x)
- `dev` - Active development branch

## Package Versions
| Package | Current Version | Status |
|---------|----------------|---------|
| `qap-compiler` | v0.1.0 | 🔥 Alpha |
| `synthesizer` | v0.1.0 | 🔥 Alpha |
| `prover` | - | 🚧 Planned |
| `mpc-setup` | - | 🚧 Planned |
| `trusted-setup` | - | 🚧 Planned |
| `verify-rust` | - | 🚧 Planned |
| `verify-sol` | - | 🚧 Planned |
| `libs-rust-tools` | v0.1.0 | 🔥 Alpha |


### Version Strategy
🔥 Alpha (v0.1.x)
- Initial implementation and testing

🧪 Beta (v0.2.x)
- System-wide testing and optimization

⭐️ Stable (v1.0.0)
- Production-ready release
- Full system integration and testing

### Development Status
- ✅ Frontend Components (current focus)
- 🚧 Backend Components (planned)

## Tokamak-zk-EVM flow chart
![Tokamak-zk-EVM Flow Chart](.github/assets/flowchart.png)

## Ethereum compatibility

## Documentation
- [Project Tokamak zk-EVM(Medium)](https://medium.com/tokamak-network/project-tokamak-zk-evm-67483656fd21)
- [Project Tokamak zk-EVM(Slide)](https://drive.google.com/file/d/1RAmyGDVteAzuBxJ05XEGIjfHC0MY-2_5/view)
- [Tokamak zk-SNARK Paper](https://eprint.iacr.org/2024/507)
- Frontend
    - [Synthesizer Documentation](./docs)
- [API Reference](./docs/api)

## Contributing
We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for details.

## License
This project is licensed under [MPL-2.0](./LICENSE).
