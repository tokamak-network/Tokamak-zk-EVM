> Internal reference note: This document is maintained as a secondary repository reference. Start with `docs/README.md`, `docs/architecture.md`, or `docs/maintainer-guide.md` for the canonical maintainer entrypoints.

# Synthesizer Opcodes

Synthesizer currently covers most Cancun-era EVM opcodes.
The table below reflects `InstructionHandler` mappings in `core/src/synthesizer/handlers/instructionHandler.ts`.

| Status | Opcodes | Notes |
| ------ | ------- | ----- |
| ✅ | STOP, ADD, MUL, SUB, DIV/SDIV, MOD/SMOD, ADDMOD, MULMOD, EXP, SIGNEXTEND, LT/GT/SLT/SGT, EQ, ISZERO, AND/OR/XOR/NOT, BYTE, SHL/SHR/SAR | Arithmetic/bitwise mapped to ALU subcircuits. |
| ⚠️ | KECCAK256 | Implemented via Poseidon hashing of memory chunks (not true Keccak). |
| ✅ | ADDRESS, BALANCE, ORIGIN, CALLER, CALLVALUE, CALLDATALOAD/SIZE/COPY, CODESIZE/COPY, GASPRICE, EXTCODESIZE/COPY/HASH, RETURNDATASIZE/COPY | Uses reserved buffers; memory copies reconstructed via `MemoryManager`. |
| ✅ | BLOCKHASH, COINBASE, TIMESTAMP, NUMBER, PREVRANDAO, GASLIMIT, CHAINID, SELFBALANCE, BASEFEE | Loaded from block buffers. |
| ✅ | POP, MLOAD, MSTORE, MSTORE8, SLOAD, SSTORE, JUMP, JUMPI, JUMPDEST, PC, MSIZE, GAS | Stack/memory/storage synchronized with VM state. |
| ✅ | MCOPY, PUSH0, PUSH1–PUSH32, DUP1–DUP16, SWAP1–SWAP16, LOG0–LOG4 | LOGs are tracked for stack consistency; no proof output yet. |
| ✅ | CALL, CALLCODE, DELEGATECALL, STATICCALL, RETURN, REVERT | Call context cached; return/revert data captured via memory slices. |
| 🚫 | CREATE, CREATE2, SELFDESTRUCT, TLOAD, TSTORE, BLOB* opcodes, precompiles | Not synthesized. |

Notes:
- Gas accounting is observed from the VM but not yet enforced in circuit constraints.
- Storage ops enforce access-order Merkle proof verification for registered keys; unregistered keys are handled as dynamic inputs/outputs.
