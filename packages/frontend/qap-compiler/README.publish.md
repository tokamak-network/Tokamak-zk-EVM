# QAP compiler

## Overview

`@tokamak-zk-evm/qap-compiler` provides the published Tokamak zk-EVM subcircuit library package.

The package contains prebuilt subcircuit artifacts and the synced `subcircuits/circom/constants.circom` file used to produce them.

## Installation

```shell
npm install @tokamak-zk-evm/qap-compiler
```

## Package Contents

- `subcircuits/library/**/*`
- `subcircuits/circom/constants.circom`

Consumers read these files directly from the installed package.

## References

- [Tokamak zk-SNARK paper](https://eprint.iacr.org/2024/507)

## Original contribution

- [JehyukJang](https://github.com/JehyukJang): Overall planning and direction. Constraints optimization.
- [pleiadex](https://github.com/pleiadex): Initial subcircuits design and implementation. Script development.
- [jdhyun09](https://github.com/jdhyun09): Improvement of EVM-compatability. Constraints optimization.

## License

Dual-licensed under `MIT OR Apache-2.0`.
