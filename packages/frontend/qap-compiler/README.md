# QAP compiler

## Overview

`@tokamak-zk-evm/qap-compiler` is the source package used by maintainers to regenerate the published Tokamak zk-EVM subcircuit library package.

The maintainer workflow is:

1. Sync `subcircuits/circom/constants.circom` from `tokamak-l2js`.
2. Build `subcircuits/library`.
3. Copy the generated publishable contents into `dist`.
4. Publish `./dist` to npm.

## Installation

```shell
npm install
```

## CLI

Reload `subcircuits/circom/constants.circom` from the published `tokamak-l2js` package:

```shell
npx qap-compiler --reload-constants
```

Build the library into the package-internal `subcircuits/library` directory:

```shell
npx qap-compiler --build
```

Build the library into a custom directory:

```shell
npx qap-compiler --build ./qap-library
```

Create the publishable `dist` package from the current `subcircuits/library` output and the synced `constants.circom` file:

```shell
npx qap-compiler --dist
```

## Publish Flow

Run the commands below in order before publishing:

```shell
npm install
npx qap-compiler --reload-constants
npx qap-compiler --build
npx qap-compiler --dist
npm publish ./dist
```

`dist` contains:

- `subcircuits/library/**/*`
- `subcircuits/circom/constants.circom`
- npm package metadata and licenses for publishing

## Notes

- `--build` without an explicit output directory keeps the previous behavior and overwrites `subcircuits/library`.
- `--dist` expects the package-internal `subcircuits/library` output produced by `npx qap-compiler --build`.
- `qap-compiler --build` prefers a system-installed `circom` and falls back to the bundled `circom2` wrapper only when `circom` is not available on `PATH`.
- Supported platforms are macOS and Linux.

## References

- [Tokamak zk-SNARK paper](https://eprint.iacr.org/2024/507)

## Original contribution

- [JehyukJang](https://github.com/JehyukJang): Overall planning and direction. Constraints optimization.
- [pleiadex](https://github.com/pleiadex): Initial subcircuits design and implementation. Script development.
- [jdhyun09](https://github.com/jdhyun09): Improvement of EVM-compatability. Constraints optimization.

## License

Dual-licensed under `MIT OR Apache-2.0`.
