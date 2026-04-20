# Tokamak zk-EVM Subcircuit Library

Tokamak zk-EVM Subcircuit Library is a prebuilt R1CS subcircuit library package for Tokamak zk-EVM.

The published package exposes consumer-facing subcircuit artifacts, metadata, witness-generation helpers, and synced Circom constants used by Tokamak zk-EVM consumers on the `main` branch.

## Installation

```shell
npm install @tokamak-zk-evm/subcircuit-library
```

## Package Contents

- `subcircuits/library/r1cs/`: prebuilt R1CS subcircuit artifacts.
- `subcircuits/library/wasm/`: per-subcircuit WASM artifacts used for witness generation and runtime loading.
- `subcircuits/library/json/`: per-subcircuit JSON outputs generated alongside the compiled library.
- `subcircuits/library/*.json`: library-wide metadata such as setup parameters, global wiring, frontend configuration, and the subcircuit catalog.
- `subcircuits/library/*.js`: witness-generation helper scripts published with the library.
- `subcircuits/circom/constants.circom`: synced Circom constants used by the generated library.

## Consumers

- [`tokamak-cli`](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main): orchestrates install, setup, proving, and verification flows that package the generated subcircuit library into runnable resources.
- [`synthesizer`](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/synthesizer): consumes the published library metadata and WASM artifacts to synthesize transaction-specific circuit inputs.
- [`backend`](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/backend): uses the subcircuit library as setup and proving input for the Tokamak zk-SNARK backend.
- [`Tokamak-zk-EVM-contracts`](https://github.com/tokamak-network/Tokamak-zk-EVM-contracts): integrates the generated subcircuit library through repository-level coordination with the Tokamak zk-EVM stack.

## Example Integration

The `synthesizer` packages use the library as an installed artifact package rather than as a source dependency:

1. They load library-wide metadata such as setup parameters, wiring data, frontend configuration, and the subcircuit catalog from the published package.
2. They resolve that metadata into an internal subcircuit-library model used by the synthesizer runtime.
3. They load the matching WASM subcircuit artifacts from the installed package to drive witness generation and execution-specific subcircuit handling.
4. The web-facing synthesizer build can bundle those published assets ahead of time, while the Node-targeted synthesizer resolves them from the installed package at runtime.

## Compatibility

Published artifacts are consumer-facing and platform-neutral. Maintainer-side regeneration of the library is documented separately.

| Surface | Compatibility |
| --- | --- |
| Consumer support | Supported for `main`-branch consumers of `tokamak-cli`, `synthesizer`, `backend`, and `Tokamak-zk-EVM-contracts`. |
| Runtime shape | Consumers integrate against published R1CS, JSON metadata, WASM artifacts, witness-generation helpers, and synced Circom constants. |
| Maintainer tooling | Source regeneration of the library is maintained on Node.js 18+ for macOS and Linux. |

## FAQ

### Is this package source circuits or prebuilt artifacts?

It is the published prebuilt subcircuit library package. Consumers use the generated artifacts that are shipped through npm.

### How do consumers use this package?

Consumers install the package and read its published artifacts and metadata. They do not use it as an application-level API library.

### What formats does the package publish?

The package publishes R1CS artifacts, WASM artifacts, JSON metadata, witness-generation helper scripts, and synced `constants.circom`.

### Is it compatible with the Tokamak zk-EVM `main` branch?

Yes. This package is documented and maintained as the consumer-facing subcircuit library surface for `main`-branch Tokamak zk-EVM consumers.

### Was this package previously called QAP compiler?

The maintainer-side generation algorithm and tooling are still referred to as `qap-compiler` in repository-internal contexts. The published consumer package is the Tokamak zk-EVM Subcircuit Library.

## Further Documentation

- [Detailed package documentation](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/qap-compiler/docs/README.md)
- [Tokamak zk-SNARK paper](https://eprint.iacr.org/2024/507)

## Original Contribution

- [JehyukJang](https://github.com/JehyukJang): Overall planning and direction. Constraints optimization.
- [pleiadex](https://github.com/pleiadex): Initial subcircuits design and implementation. Script development.
- [jdhyun09](https://github.com/jdhyun09): Improvement of EVM compatibility. Constraints optimization.

## License

Dual-licensed under `MIT OR Apache-2.0`.
