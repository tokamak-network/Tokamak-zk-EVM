# Tokamak-zk-EVM

Tokamak-zk-EVM is a zero-knowledge Ethereum Virtual Machine implementation that enables scalable and private smart contract execution.

## Package Composition

This monorepo contains the core components of the Tokamak-zk-EVM ecosystem:

### Frontend Packages
| Package | Description | Language |
|---------|-------------|----------|
| [`qap-compiler`](./packages/frontend/qap-compiler) | Library of subcircuits for basic EVM operations | circom |
| [`synthesizer`](./packages/frontend/synthesizer) | Compiler that converts an Ethereum transaction into a circuit for Tokamak zk-SNARK | javascript |
### Backend Packages
| Package | Description | Language |
|---------|-------------|----------|
| [`libs`](./packages/backend/libs) | Mathematical and signal processing related library functions for Tokamak zk-SNARK | rust |
| [`mpc-setup`](./packages/backend/setup/mpc-setup) | Tokamak zk-SNARK's setup alogirhtm (multi-party computation version) | rust |
| [`trusted-setup`](./packages/backend/setup/trusted-setup) | Tokamak zk-SNARK's setup algorithm (trusted single entity version) | rust |
| [`prover`](./packages/backend/prove) | Tokamak zk-SNARK's proving algorithm | rust |
| [`verify`](./packages/backend/verify) | Tokamak zk-SNARK's verifying algorithm | rust, solidity, javascript |

## Package Versions
| Package | Current Version | Status |
|---------|----------------|---------|
| `qap-compiler` | v0.2.0 | 🧪 Beta |
| `synthesizer` | v0.1.2 | 🔥 Alpha |
| `libs` | v0.1.0 | 🔥 Alpha |
| `prover` | - | 🚧 Planned |
| `mpc-setup` | - | 🚧 Planned |
| `trusted-setup` | - | 🚧 Planned |
| `verify-rust` | - | 🚧 Planned |
| `verify-sol` | - | 🚧 Planned |


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
- [Project Tokamak zk-EVM(Medium)](https://medium.com/tokamak-network/project-tokamak-zk-evm-67483656fd21) (Last updated in Apr. 2025)
- [Project Tokamak zk-EVM(Slide)](https://drive.google.com/file/d/1RAmyGDVteAzuBxJ05XEGIjfHC0MY-2_5/view) (Outdated. Will be updated soon)
- [Tokamak zk-SNARK Paper](https://eprint.iacr.org/2024/507) (Last updated in Mar. 2025)
- Frontend
    - [Synthesizer](https://tokamak.notion.site/Synthesizer-documentation-164d96a400a3808db0f0f636e20fca24)
<!-- - [API Reference](./docs/api) -->

## Contributing
We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for details.

## License
This project is licensed under [MPL-2.0](./LICENSE).
