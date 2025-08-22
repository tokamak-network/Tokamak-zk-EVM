# QAP compiler

## Overview
> You can convert your Ethereum transactions into zero-knowledge proofs (zkp) even if you don't know zkp.

This package provides a library of subcircuits for EVM's basic operations. Combined with Synthesizer in [synthesizer package](../synthesizer), you can build a zkp circuit specialized for each Ethereum transaction. The transaction specific-circuit will be used as preprocessed input for [Tokamak zk-SNARK](https://eprint.iacr.org/2024/507).

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
1. Configure the sizes of four buffer subcircuits.
   > - If the sizes of buffers are insufficient, [frontend/synthesizer](../synthesizer) will throw an error.
   > - The default sizes are sufficient for testing ERC-20 transactions for TON, USDT, and USDC contracts.
   > - Higher buffer sizes may result in slowing down [the backend algorithms](../../backend).
2. Run the script below in terminal (Windows users need to use GitBash):
    ```shell
    ./scripts/compile.sh
    ```
3. Check your output, [a library of subcircuits](./subcircuits/library) 

## Subcircuits
- All subcircuits are written in [Circom](https://docs.circom.io/).
- They are defined in the [subcircuits/circom](./subcircuits/circom) folder.
> The library of subcircuits does not explicitly determine the compatibility with EVM. Synthesizer will combine these subcircuits to represent all signal processing performed within the EVM. Thus, the EVM-compatiblity is more likely to depend on Synthesizer, and the subcircuit library is kept to a minimum, depending on the Synthesizer's requirements.

### ALU subcircuits
- There are 5 Arithmetic and Logical Units (ALU) in the library.
- Each ALU deals with the following 256-bit operations for EVM:
   - ALU1: ADD, MUL, SUB, SubExp (a single loop for EXP), EQ, ISZERO, NOT
   - ALU2: DIV, SDIV, MOD, SMOD, ADDMOD, MULMOD
   - ALU3: SHL, SHR, SAR
   - ALU4: LT, GT, SLT, SGT
   - ALU5: SIGNEXTEND, BYTE
### KECCAK256
Implementing Keccak hashing directly in a circuit, such as [Keccak256-circom](https://github.com/vocdoni/keccak256-circom), is computationally inefficient, resulting in approximately 151k constraints. Thus, we have chosen not to implement a Keccak circuit. Instead, Synthesizer will buffer subcircuits to emit the KECCAK256 input values from the circuit and reintroduce the KECCAK256 output values back into the circuit. Outside the circuit, the Keccak hash computation can be run by the verifier of the Tokamak-zk SNARK. Find details from [Synthesizer Doc.](https://tokamak-network-zk-evm.gitbook.io/tokamak-network-zk-evm)
### Testing subcircuits
Enter the following commands in terminal (Windows users need to use GitBash):
```shell
./scripts/compile_test.sh
mocha ./subcircuits/test/test_script.js
```

### Number of constraints

| Subcircuit name | # of constraints |
|-----------------|------------------|
| ALU1            | 803              |
| ALU2            | 993              |
| ALU3            | 816              |
| ALU4            | 629              |
| ALU5            | 819              |
| OR              | 774              |
| XOR             | 774              |
| AND             | 774              |
| DecToBit        | 258              |
| Accumulator     | 329              |

## Contributing
We welcome contributions! Please see our [Contributing Guidelines](../../../CONTRIBUTING.md) for details.

## References
- [Tokamak zk-SNARK paper](https://eprint.iacr.org/2024/507)

## Original contribution
- [JehyukJang](https://github.com/JehyukJang): Overall planning and direction. Constraints optimization.
- [pleiadex](https://github.com/pleiadex): Initial subcircuits design and implementation. Script development.
- [jdhyun09](https://github.com/jdhyun09): Improvement of EVM-compatability. Constraints optimization.

## License
[MPL-2.0]
