# Tokamak-zk-EVM/Synthesizer

## Overview
Synthesizer is a compiler that processes an Ethereum transaction and returns a wire map. This wire map serves as preprocessed input for [Tokamak zk-SNARK](https://eprint.iacr.org/2024/507).

## Features
- Zero-knowledge proof generation and verification capabilities
- Seamless integration with Ethereum's EVM
- Efficient witness calculation for zk-proofs
- TypeScript/JavaScript friendly API for blockchain developers

## Input/Output
### Input
1. Ethereum transactions
   - Playground: ____
2. Subcircuit library

### Output
[Output description]

## Installation

To obtain the latest version, simply require the project using `npm`:

```shell
npm install
```

This package provides the core Ethereum Virtual Machine (EVM) implementation which is capable of executing EVM-compatible bytecode. The package has been extracted from the [@ethereumjs/vm](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/vm) package along the VM `v6` release.

**Note:** Starting with the Dencun hardfork `EIP-4844` related functionality will become an integrated part of the EVM functionality with the activation of the point evaluation precompile. It is therefore strongly recommended to _always_ run the EVM with a KZG library installed and initialized, see [KZG Setup](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/tx/README.md#kzg-setup) for instructions.

## Usage
[Synthesizer specific usage examples]

## Architecture
[Synthesizer specific architecture]

## Development
[Synthesizer specific development guide]

## References
- This project is built on top of [EthereumJS EVM](./docs/ETHEREUMJS.md). See the detailed documentation for the underlying EVM implementation.
- [Tokamak zk-SNARK paper](https://eprint.iacr.org/2024/507)

## License
[MPL-2.0]
