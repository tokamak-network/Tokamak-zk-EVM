# Tokamak-zk-EVM/qap-compiler

## Overview
You can convert your Ethereum transactions into zero-knowledge proofs (zkp) even if you don't know zkp.

This repository provides a library of subcircuits for EVM's basic operations. Combined with Synthesizer in [synthesizer package](../synthesizer), you can build a zkp circuit specialized for each Ethereum transaction. The transaction specific-circuit will be used as preprocessed input for [Tokamak zk-SNARK](https://eprint.iacr.org/2024/507).

## Features
- Preliminary work for zero-knowledge proof generation and verification
- Compatible with Ethereum's EVM, which is based on 256-bit words.
- Combined with Synthesizer, almost any type of transaction can be circuited.

## Installation

This package requires [Circom](https://docs.circom.io/getting-started/installation) and [nodeJs](https://nodejs.org).

To obtain the latest version, simply require the project using `npm`:

```shell
npm install
```

## Usage
1. Configure the number of inputs and outputs in buffer subcircuits by changing the variable $N$ in [this code](./circuits/buffer.circom) (default: $N = 256$).
   > - There is no limit to $N$. However, the larger they are, the more time it takes to generate a zkp proof.
   > - If $N$ is insufficient, fewer types of Ethereum transactions can be circuited, and the Synthesizer may throw errors for more complicated transactions.
2. Run the script below in terminal. Windows users will need to use GitBash as their terminal.
```shell
./scripts/compile.sh
```
3. Check your [outputs](./outputs) 

## Composition of the subcircuit library

```text
circuits
├── templates
│   ├── 128bit
│   │   ├── adder.circom
│   │   ├── divider.circom
│   │   ├── exp.circom
│   │   └── multiplier.circom
│   ├── arithmetic_func.circom
│   ├── bit_extractor.circom
│   ├── comparators.circom
│   ├── divider.circom
│   └── two_to_the_power_of_n.circom
├── add.circom
├── addmod.circom
├── and.circom
├── buffer.circom
├── byte.circom
├── div.circom
├── eq.circom
├── exp.circom
├── gt.circom
├── iszero.circom
├── load.circom
├── lt.circom
├── mod.circom
├── mul.circom
├── mulmod.circom
├── not.circom
├── or.circom
├── sar.circom
├── sdiv.circom
├── sgt.circom
├── sha3.circom
├── shl.circom
├── shr.circom
├── signextend.circom
├── slt.circom
├── smod.circom
├── sub.circom
├── subexp.circom
└── xor.circom
```

- All subcircuits are written Circom language (for details, visit [Circom official document](https://docs.circom.io/).
- `templates`: The set of modules and functions frequently used by the sub-circuits. The circuits under `128bit` assume to take 128-bit length values.
- The list of subcircuits does not explicitly mean the compatibility with EVM. Synthesizer will combine these subcircuits to represent all signal processing performed within the EVM. Thus, the EVM-compatiblity depends on Synthesizer, and additions and changes to the subcircuits will be determined based on the needs of the Synthesizer.

## Subcircuits design
- All subcircuits are compatible with the EVM's basic operations on 256-bit words.
  - Due to the nature of finite fields for pairing-friendly elliptic curves (e.g., BN128), Circom supports 254-bit words.
  - So, each input and output of target operations will be split (by Synthesizer) into two 128-bit length values before being applied to the subcircuits.
  - As the result, the subcircuits have twice as many inputs and outputs as target operations.

- KECCAK256
    - Implementing Keccak hashing directly in a circuit, such as [Keccak256-circom](https://github.com/vocdoni/keccak256-circom), is computationally inefficient, resulting in approximately 151k constraints. Thus, we have chosen not to implement a Keccak circuit. Instead, Synthesizer will buffer subcircuits to emit the KECCAK256 input values from the circuit and reintroduce the KECCAK256 output values back into the circuit. Outside the circuit, the Keccak hash computation can be run by the verifier of the Tokamak-zk SNARK. Find details from [Synthesizer Doc.](https://tokamak.notion.site/Synthesizer-documentation-164d96a400a3808db0f0f636e20fca24?pvs=4)

- Number of constraints


| Subcircuit name | # of constraints |
|-------------|---------------------|
| 0x01 ADD    | 256                 |
| 0x02 MUL    | 522                 |
| 0x03 SUB    | 256                 |
| 0x04 DIV    | 1054                |
| 0x05 SDIV   | 4155                |
| 0x06 MOD    | 1054                |
| 0x07 SMOD   | 4155                |
| 0x08 ADDMOD | 1445                |
| 0x09 MULMOD | 2239                |
| 0x0A EXP    | 7982                |
| 0x0B SIGNEXTEND | 2823            |
| 0x12 SLT    | 520                 |
| 0x13 SGT    | 520                 |
| 0x1A BYTE   | 308                 |
| 0x1B SHL    | 326                 |
| 0x1C SHR    | 325                 |
| 0x1D SAR    | 1063                |

## Contributing
We welcome contributions! Please see our [Contributing Guidelines](../../../CONTRIBUTING.md) for details.

## References
- [Tokamak zk-SNARK paper](https://eprint.iacr.org/2024/507)

## Original contribution
- [JehyukJang](https://github.com/JehyukJang): Subcircuits planning and consulting
- [pleiadex](https://github.com/pleiadex): Initial subcircuits design and implementation. Script development.
- [jdhyun09](https://github.com/jdhyun09): Improvement of EVM-compatability. Constraints optimization.

## License
[MPL-2.0]
