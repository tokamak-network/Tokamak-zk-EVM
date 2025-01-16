# Tokamak-zk-EVM

Tokamak-zk-EVM is a zero-knowledge Ethereum Virtual Machine implementation that enables scalable and private smart contract execution.

## Overview

This monorepo contains the core components of the Tokamak-zk-EVM ecosystem:

### Frontend Packages
| Package | Description |
|---------|------------|
| [`qap-compiler`](./packages/frontend/qap-compiler) | description |
| [`synthesizer`](./packages/frontend/synthesizer) | Compiler that processes Ethereum transactions into wire maps for Tokamak zk-SNARK proof generation |
### Backend Packages
| Package | Description |
|---------|------------|
| [`prover`](./packages/backend/prover) | description |
| [`mpc-setup`](./packages/backend/setup/mpc-setup) | description |
| [`trusted-setup`](./packages/backend/setup/trusted-setup) | description |
| [`verify-rust`](./packages/backend/verify/rust) | description |
| [`verify-sol`](./packages/backend/verify/solidity) | description |
### Libraries
| Package | Description |
|---------|------------|
| [`libs-rust-tools`](./packages/libs/internal/rust-tools) | description |

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

## Tokamak-zk-EVM flow chart
![Tokamak-zk-EVM Flow Chart](.github/assets/flowchart.png)

## Ethereum compatibility
> 📝 **Note**: This section will be updated as new EVM features are implemented

## Documentation
- [Project Tokamak zk-EVM(Medium)](https://medium.com/tokamak-network/project-tokamak-zk-evm-67483656fd21)
- [Project Tokamak zk-EVM(Slide)](https://drive.google.com/file/d/1RAmyGDVteAzuBxJ05XEGIjfHC0MY-2_5/view)
- [Tokamak zk-SNARK Paper](https://eprint.iacr.org/2024/507)
- Frontend
    - Synthesizer(will be updated soon) 
<!-- - [API Reference](./docs/api) -->

## ActiveBranches
- `main` - Stable releases, currently containing frontend components (v0.1.x)
- `dev` - Active development branch

## Contributing
We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for details.

## License
This project is licensed under [MPL-2.0](./LICENSE).