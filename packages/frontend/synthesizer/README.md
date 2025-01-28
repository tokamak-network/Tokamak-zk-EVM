# Tokamak-zk-EVM/synthesizer

## What is Synthesizer
You can convert your Ethereum transactions into zero-knowledge proofs (zkp) even if you don't know zkp.

Synthesizer is a compiler that takes an Ethereum transaction as input and returns a wire map (in the form of a permutation map). Combined with the library subcircuits in [qap-compiler package](../qap-compiler), this wire map forms a zkp circuit specialized for the transaction. The transaction specific-circuit will be used as preprocessed input for [Tokamak zk-SNARK](https://eprint.iacr.org/2024/507).

For technical details, see [Synthesizer Documentation](https://tokamak.notion.site/Synthesizer-documentation-164d96a400a3808db0f0f636e20fca24?pvs=4).

### Features
- Preliminary work for zero-knowledge proof generation and verification
- Seamless integration with Ethereum's EVM
- Efficient witness calculation for zk-proofs
- TypeScript/JavaScript friendly API for blockchain developers
- Synthesizer is built on top of [@ethereumJS/evm](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/evm) as a hardfork.

## How to use Synthesizer

### Prerequisite

- Make sure you have the following installed on your system:

   - **Node.js** (v18 or later)
   - **npm** (package manager)

- Make sure you have the Tokamak zk-EVM repository cloned on your system. For example,
   ```bash
   git clone https://github.com/tokamak-network/Tokamak-zk-EVM.git
   cd Tokamak-zk-EVM
   ```
- Make sure you have installed [Playground](../../playground/).
### A. **Package install**
1. Open a new terminal and go to the package directory.
2. Install dependencies:
    ```shell
    npm install
    ```
    This package install includes some packages in [EthereumJS-monorepo](https://github.com/ethereumjs/ethereumjs-monorepo/).

### B. **Start Synthesizer through Playground**
1. Run [Playground](../../playground/README.md#how-to-use-playground)
2. In the Playground GUI, type a target transaction ID, which is the hash of the target transaction to run Synthesizer. You can get a transaction ID from [etherscan.io](https://etherscan.io).
3. Click the button "Process".
4. If the transaction contains logs, the GUI will display the outputs of your ZKP circuit, which are expected to be the same as the transaction logs. Verify that the displayed outputs match the transaction logs (we are aware that some transactions are not being processed correctly. We are working on a fix). 
![image](https://github.com/user-attachments/assets/3572fc8f-bbc1-4ccb-9c3c-78a37f37e7a4)
![image](https://github.com/user-attachments/assets/4695e0d2-0b0d-49fc-88aa-028e79df2fb1)

6. Now you are ready to move on to the backend of Tokamak zk-EVM.


## Supported EVM Operations
| Opcode | Name         | Description                                              | Status |
|--------|--------------|----------------------------------------------------------|--------|
| 0      | STOP         | Halts execution                                          | ✅      |
| 1      | ADD          | Addition operation                                       | ✅      |
| 2      | MUL          | Multiplication operation                                 | ✅      |
| 3      | SUB          | Subtraction operation                                    | ✅      |
| 4      | DIV          | Integer division operation                               | ✅      |
| 5      | SDIV         | Signed integer division operation (truncated)           | ✅      |
| 6      | MOD          | Modulo remainder operation                               | ✅      |
| 7      | SMOD         | Signed modulo remainder operation                        | ✅      |
| 8      | ADDMOD       | Modulo addition operation                                | ✅      |
| 9      | MULMOD       | Modulo multiplication operation                          | ✅      |
| 0a     | EXP          | Exponential operation                                    | ✅      |
| 0b     | SIGNEXTEND   | Extend length of two’s complement signed integer         | ✅      |
| 10     | LT           | Less-than comparison                                     | ✅      |
| 11     | GT           | Greater-than comparison                                  | ✅      |
| 12     | SLT          | Signed less-than comparison                              | ✅      |
| 13     | SGT          | Signed greater-than comparison                           | ✅      |
| 14     | EQ           | Equality comparison                                      | ✅      |
| 15     | ISZERO       | Is-zero comparison                                       | ✅      |
| 16     | AND          | Bitwise AND operation                                    | ✅      |
| 17     | OR           | Bitwise OR operation                                     | ✅      |
| 18     | XOR          | Bitwise XOR operation                                    | ✅      |
| 19     | NOT          | Bitwise NOT operation                                    | ✅      |
| 1a     | BYTE         | Retrieve single byte from word                           | ✅      |
| 1b     | SHL          | Left shift operation                                     | ✅      |
| 1c     | SHR          | Logical right shift operation                            | ✅      |
| 1d     | SAR          | Arithmetic (signed) right shift operation               | ✅      |
| 20     | KECCAK256    | Compute Keccak-256 hash                                  | ⚠️      |
| 30     | ADDRESS      | Get address of currently executing account               | ✅      |
| 31     | BALANCE      | Get balance of the given account                         | ✅      |
| 32     | ORIGIN       | Get execution origination address                        | ✅      |
| 33     | CALLER       | Get caller address                                       | ✅      |
| 34     | CALLVALUE    | Get deposited value by the instruction/transaction       | ✅      |
| 35     | CALLDATALOAD | Get input data of current environment                    | ✅      |
| 36     | CALLDATASIZE | Get size of input data in current environment            | ✅      |
| 37     | CALLDATACOPY | Copy input data in current environment to memory         | ✅      |
| 38     | CODESIZE     | Get size of code running in current environment          | ✅      |
| 39     | CODECOPY     | Copy code running in current environment to memory       | ✅      |
| 3a     | GASPRICE     | Get price of gas in current environment                  | ✅      |
| 3b     | EXTCODESIZE  | Get size of an account’s code                            | ✅      |
| 3c     | EXTCODECOPY  | Copy an account’s code to memory                         | ✅      |
| 3d     | RETURNDATASIZE | Get size of output data from the previous call         | ✅      |
| 3e     | RETURNDATACOPY | Copy output data from the previous call to memory      | ✅      |
| 3f     | EXTCODEHASH  | Get hash of an account’s code                            | ✅      |
| 40     | BLOCKHASH    | Get the hash of one of the 256 most recent complete blocks | ✅    |
| 41     | COINBASE     | Get the block’s beneficiary address                      | ✅      |
| 42     | TIMESTAMP    | Get the block’s timestamp                                | ✅      |
| 43     | NUMBER       | Get the block’s number                                   | ✅      |
| 44     | PREVRANDAO   | Get the block’s difficulty                               | ✅      |
| 45     | GASLIMIT     | Get the block’s gas limit                                | ✅      |
| 46     | CHAINID      | Get the chain ID                                         | ✅      |
| 47     | SELFBALANCE  | Get balance of currently executing account               | ✅      |
| 48     | BASEFEE      | Get the base fee                                         | ✅      |
| 49     | BLOBHASH     | Get versioned hashes                                     | ✅      |
| 4a     | BLOBBASEFEE  | Returns the value of the blob base-fee                   | ✅      |
| 50     | POP          | Remove item from stack                                   | ✅      |
| 51     | MLOAD        | Load word from memory                                    | ✅      |
| 52     | MSTORE       | Save word to memory                                      | ✅      |
| 53     | MSTORE8      | Save byte to memory                                      | ✅      |
| 54     | SLOAD        | Load word from storage                                   | ✅      |
| 55     | SSTORE       | Save word to storage                                     | ✅      |
| 56     | JUMP         | Alter the program counter                                | ✅      |
| 57     | JUMPI        | Conditionally alter the program counter                  | ✅      |
| 58     | PC           | Get the value of the program counter                     | ✅      |
| 59     | MSIZE        | Get the size of active memory in bytes                   | ✅      |
| 5a     | GAS          | Get the amount of available gas                          | ✅      |
| 5b     | JUMPDEST     | Mark a valid destination for jumps                       | ✅      |
| 5c     | TLOAD        | Load word from transient storage                         | ✅      |
| 5d     | TSTORE       | Save word to transient storage                           | ✅      |
| 5e     | MCOPY        | Copy memory areas                                        | ✅      |
| 5f     | PUSH0        | Place value 0 on stack                                   | ✅      |
| 60 - 7f| PUSHx        | Place x byte item on stack                               | ✅      |
| 80 - 8f| DUPx         | Duplicate xst stack item                                 | ✅      |
| 90 - 9f| SWAPx        | Exchange 1st and xnd stack items                         | ✅      |
| a0 - a4| LOGx         | Append log record with x topics                          | ✅      |
| f0     | CREATE       | Create a new account with associated code                | ❌      |
| f1     | CALL         | Message-call into an account                             | ✅      |
| f2     | CALLCODE     | Message-call into this account with alternative code     | ✅      |
| f3     | RETURN       | Halt execution returning output data                     | ✅      |
| f4     | DELEGATECALL | Static message-call into an account                      | ✅      |
| f5     | CREATE2      | Create a new account with associated code at predictable | ❌      |
| fa     | STATICCALL   | Static message-call into an account                      | ✅      |
| fd     | REVERT       | Halt execution reverting state changes                   | ❌      |
| fe     | INVALID      | Designated invalid instruction                           | ✅      |
| ff     | SELFDESTRUCT | Halt execution and delete account                        | ❌      |

> **Notes**
> - This list is based on [Cancun hardfork](https://www.evm.codes/).
> - ❌: Will be supported in the future release
> - ⚠️: Implemented in a different way than the zkp circuit
> - Precompiled operations will be supported in the future.
> - Synthesizers and the resulting zkp circuits will support tracking of gas usage in the future.
> - Find details in [Synthesizer Doc](https://tokamak.notion.site/Synthesizer-documentation-164d96a400a3808db0f0f636e20fca24?pvs=4)

## Contributing
We welcome contributions! Please see our [Contributing Guidelines](../../../CONTRIBUTING.md) for details.

## Original contribution
- [JehyukJang](https://github.com/JehyukJang): Algorithm design and development. Core functionality implementation.
- [SonYoungsung](https://github.com/SonYoungsung): Auxiliary functionality implementation. Code organization and optimization. Interface implementation.

## License
[MPL-2.0]
