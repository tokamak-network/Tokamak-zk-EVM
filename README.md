# Tokamak-zk-EVM

Tokamak-zk-EVM is a zero-knowledge Ethereum Virtual Machine implementation that enables scalable and private smart contract execution.

## Overview

This monorepo contains the core components of the Tokamak-zk-EVM ecosystem:

### Frontend Packages
| Package | Description |
|---------|------------|
| [`tokamak-zk-evm-qap-compiler`](./packages/circuit) | description |
| [`tokamak-zk-evm-synthesizer`](./packages/frontend/synthesizer) | Compiler that processes Ethereum transactions into wire maps for Tokamak zk-SNARK proof generation |
### Backend Packages
| Package | Description |
|---------|------------|
| [`tokamak-zk-evm-prover`](./packages/circuit) | description |
| [`tokamak-zk-evm-mpc-setup`](./packages/circuit) | description |
| [`tokamak-zk-evm-trusted-setup`](./packages/circuit) | description |
| [`tokamak-zk-evm-verify-rust`](./packages/circuit) | description |
| [`@tokamak-zk-evm/verify-sol`](./packages/circuit) | description |
### Libraries
| Package | Description |
|---------|------------|
| [`tokamak-zk-evm-libs-rust-tools`](./packages/circuit) | description |

## Branches
### Active Branches
- `main` - Stable releases, currently containing frontend components (v0.1.x)
- `develop` - Active development branch

### Version Strategy
- Alpha releases will use `0.1.x` versioning
- Beta releases will start from `0.2.x` with backend integration
- First stable release will be `1.0.0`

### Development Status
- ✅ Frontend Components (current focus)
- 🚧 Backend Components (planned)

## Tokamak-zk-EVM flow chart
![Tokamak-zk-EVM Flow Chart](.github/assets/root/flowchart.png)

## Ethereum compatibility

## Documentation
- [Tokamak zk-SNARK Paper](https://eprint.iacr.org/2024/507)
- [Technical Documentation](./docs)
- [API Reference](./docs/api)

## Contributing
We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for details.


## License
This project is licensed under [MPL-2.0](./LICENSE).