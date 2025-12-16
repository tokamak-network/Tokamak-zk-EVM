# Synthesizer Transaction Flow

This document focuses on how opcodes are translated into placements while an EVM transaction executes.

## Event-driven processing
- **beforeMessage**: clears call-memory stack, seeds transaction-related reserved variables (selector + 9 inputs, origin/caller/to caches), and resets the previous interpreter step tracker.
- **step**: receives the previous interpreter step and the current step, then dispatches the previous one to `InstructionHandler`. This gives access to both input and output stacks for the opcode.
- **afterMessage**: processes the final step, runs storage finalization (Merkle updates/unregistered writes), and resets internal trackers.

## Opcode categories
- **Arithmetic / Bitwise**: ADD, MUL, SUB, DIV/SDIV, MOD/SMOD, ADDMOD, MULMOD, EXP, SIGNEXTEND, LT/GT/SLT/SGT, EQ, ISZERO, AND/OR/XOR/NOT, BYTE, SHL/SHR/SAR, KECCAK256 (mapped to Poseidon). Handled in `handleArith` via `ArithmeticManager.placeArith`/`placePoseidon`/`placeExp`.
- **Environment**: ADDRESS, BALANCE, ORIGIN, CALLER, CALLVALUE, CALLDATALOAD/SIZE/COPY, CODESIZE/COPY, GASPRICE, EXTCODESIZE/COPY/HASH, RETURNDATASIZE/COPY. Inputs are validated against reserved buffer values; memory copies reconstruct data through `MemoryManager`.
- **Block**: BLOCKHASH, COINBASE, TIMESTAMP, NUMBER, PREVRANDAO, GASLIMIT, CHAINID, SELFBALANCE, BASEFEE. Values are loaded from `BLOCK_IN`/`EVM_IN` buffers.
- **System / Control**: POP, MLOAD/MSTORE/MSTORE8, SLOAD/SSTORE, JUMP/JUMPI/JUMPDEST, PC, MSIZE, GAS, MCOPY, PUSH0/PUSH1–PUSH32, DUP1–DUP16, SWAP1–SWAP16, LOG0–LOG4, CALL/CALLCODE/DELEGATECALL/STATICCALL, RETURN, REVERT. Memory-aware opcodes use `MemoryManager`; storage ops interact with `cachedStorage`; call opcodes update caller/origin caches.
- **Unsupported**: CREATE/CREATE2/SELFDESTRUCT, TLOAD/TSTORE, BLOB opcodes, and precompiles are not synthesized.

## Storage handling
- **SLOAD**: Verifies Merkle proofs for registered keys using `TokamakL2StateManager`’s initial tree and `INI_MERKLE_ROOT`. Unregistered keys are loaded via `UNREGISTERED_CONTRACT_STORAGE_IN`.
- **SSTORE**: Requires warm access for registered keys; records new values in `cachedStorage` for final proof updates. Unregistered writes are captured and later emitted through `UNREGISTERED_CONTRACT_STORAGE_OUT`.
- **Finalization**: `_finalizeStorage` updates the Merkle root (`RES_MERKLE_ROOT`) and emits verification placements for all accessed registered keys in access order.

## Calls and context
- `_preTasksForCalls` tracks call depth, updates `cachedCallers`, and maintains `callMemoryPtsStack` for RETURN/REVERT data reconstruction.
- Caller/origin resolution uses EDDSA verification: Poseidon hash of transaction message, signature bits (`EDDSA_SIGNATURE`), and Jubjub base/public keys to derive the sender address.

## Memory aliasing
- `MemoryPt` keeps a timestamped map of writes. `MemoryManager` uses `getDataAlias` to rebuild overlapping regions for MLOAD/MCOPY/CALLDATACOPY/etc., inserting SHL/SHR/AND placements to align bytes.
- For MCOPY and CALL-related copies, `memOut` slices from the interpreter step are compared against reconstructed values to ensure consistency before producing placements.
