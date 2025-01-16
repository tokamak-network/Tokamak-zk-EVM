# Tokamak-zk-EVM/Synthesizer

## Overview
Synthesizer is a compiler that processes an Ethereum transaction and returns a wire map. This wire map serves as preprocessed input for [Tokamak zk-SNARK](https://eprint.iacr.org/2024/507).

## Features
- Zero-knowledge proof generation and verification capabilities
- Seamless integration with Ethereum's EVM
- Efficient witness calculation for zk-proofs
- TypeScript/JavaScript friendly API for blockchain developers

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

#### Input
1. Ethereum transactions
- Playground: ____
2. Subcircuit library
- 
#### Output

## Supported EVM Operations
| Opcode | Name | Description | Status |
|--------|------|-------------|---------|
| `0x00` | STOP | Halts execution | ✅ |
| `0x01` | ADD | Addition operation | ✅ |
| `0x02` | MUL | Multiplication operation | ✅ |
| `0x03` | SUB | Subtraction operation | ✅ |
| `0x04` | DIV | Integer division operation | ✅ |
| `0x05` | SDIV | Signed integer division operation | ✅ |
| `0x06` | MOD | Modulo remainder operation | ✅ |
| `0x07` | SMOD | Signed modulo remainder operation | ✅ |
| `0x08` | ADDMOD | Modulo addition operation | ✅ |
| `0x09` | MULMOD | Modulo multiplication operation | ✅ |
| `0x0A` | EXP | Exponential operation | ✅ |
| `0x0B` | SIGNEXTEND | Extend length of signed integer | ✅ |
| `0x10` | LT | Less-than comparison | ✅ |
| `0x11` | GT | Greater-than comparison | ✅ |
| `0x12` | SLT | Signed less-than comparison | ✅ |
| `0x13` | SGT | Signed greater-than comparison | ✅ |
| `0x14` | EQ | Equality comparison | ✅ |
| `0x15` | ISZERO | Simple not operator | ✅ |
| `0x16` | AND | Bitwise AND operation | ✅ |
| `0x17` | OR | Bitwise OR operation | ✅ |
| `0x18` | XOR | Bitwise XOR operation | ✅ |
| `0x19` | NOT | Bitwise NOT operation | ✅ |
| `0x1A` | BYTE | Retrieve single byte from word | ✅ |
| `0x1B` | SHL | Shift left | ✅ |
| `0x1C` | SHR | Logical shift right | ✅ |
| `0x1D` | SAR | Arithmetic shift right | ✅ |
| `0x20` | KECCAK256 | Compute Keccak-256 hash | ✅ |
| `0x30` | ADDRESS | Get address of currently executing account | ✅ |
| `0x31` | BALANCE | Get balance of the given account | ✅ |
| `0x32` | ORIGIN | Get execution origination address | ✅ |
| `0x33` | CALLER | Get caller address | ✅ |
| `0x34` | CALLVALUE | Get deposited value by the instruction/transaction | ✅ |
| `0x35` | CALLDATALOAD | Get input data of current environment | ✅ |
| `0x36` | CALLDATASIZE | Get size of input data in current environment | ✅ |
| `0x37` | CALLDATACOPY | Copy input data in current environment to memory | ✅ |
| `0x38` | CODESIZE | Get size of code running in current environment | ✅ |
| `0x39` | CODECOPY | Copy code running in current environment to memory | ✅ |
| `0xF1` | CALL | Message-call into an account | ✅ |
| `0xF2` | CALLCODE | Message-call into this account with alternative account's code | ✅ |
| `0xF3` | RETURN | Halt execution returning output data | ✅ |
| `0xF4` | DELEGATECALL | Message-call into this account with an alternative account's code, but persisting the current values for sender and value | ✅ |
| `0xF8` | EXTCALL | External message-call into an account | ✅ |
| `0xF9` | EXTDELEGATECALL | External delegate call | ✅ |
| `0xFA` | STATICCALL | Static message-call into an account | ✅ |
| `0xFB` | EXTSTATICCALL | External static call | ✅ |

> **Note**: This list shows currently supported operations. More opcodes will be added in future releases.

## Architecture
![Tokamak-zk-EVM Flow Chart](../../../.github/assets/flowchart.png)

## Development
[Synthesizer specific development guide]

## References
- This project is built on top of [EthereumJS EVM](./docs/ETHEREUMJS.md). See the detailed documentation for the underlying EVM implementation.
- [Tokamak zk-SNARK paper](https://eprint.iacr.org/2024/507)

## License
[MPL-2.0]
