# QAP compiler

## Overview

`@tokamak-zk-evm/qap-compiler` is a toolkit package for generating the Tokamak zk-EVM subcircuit library.

The package ships the Circom sources, templates, and build scripts needed to compile the library locally. Consumers are expected to install the package and run the build command to generate their own `library` output directory.

## Installation

```shell
npm install @tokamak-zk-evm/qap-compiler
```

## Usage

Build the library into a directory in the current project:

```shell
npx qap-compiler --build ./qap-library
```

If `output-dir` is omitted, `qap-compiler` keeps the previous behavior and writes into the package-internal `subcircuits/library` directory.

```shell
npx qap-compiler --build
```

The legacy script entrypoint remains available for compatibility:

```shell
./scripts/compile.sh [output-dir]
```

## Constants Reload

`qap-compiler --reload-constants` updates `subcircuits/circom/constants.circom` from the published `tokamak-l2js` package and then exits.

This command is intended for package maintainers before publishing a new npm release. Consumers normally need only `qap-compiler --build [output-dir]`.

```shell
npx qap-compiler --reload-constants
```

## Package Contents

The published package includes:

- `subcircuits/circom/*.circom`
- `templates/**/*.circom` except `templates/unused`
- `functions/*.circom`
- The build scripts under `scripts/`

The published package excludes generated `subcircuits/library` artifacts. Consumers generate those artifacts locally by running the build command.

## Notes

- The build command uses the package-local `circom2` and `tsx` executables from its installed dependencies.
- Supported platforms are macOS and Linux.
- The package is intended to be installed as a project dependency and executed with `npx`.

## References

- [Tokamak zk-SNARK paper](https://eprint.iacr.org/2024/507)

## Original contribution

- [JehyukJang](https://github.com/JehyukJang): Overall planning and direction. Constraints optimization.
- [pleiadex](https://github.com/pleiadex): Initial subcircuits design and implementation. Script development.
- [jdhyun09](https://github.com/jdhyun09): Improvement of EVM-compatability. Constraints optimization.

## License

Dual-licensed under `MIT OR Apache-2.0`.
