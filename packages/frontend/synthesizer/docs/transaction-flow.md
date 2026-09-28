> Internal reference note: This document is maintained as a secondary repository reference. Start with `docs/README.md`, `docs/architecture.md`, or `docs/maintainer-guide.md` for the canonical maintainer entrypoints.

# Synthesizer Transaction Flow

This document focuses on how opcodes are translated into placements while a transaction executes inside the shared `Synthesizer` runtime.

## Event-driven processing
- **beforeMessage**: clears call-memory stack, seeds transaction-related reserved variables (selector + 9 inputs, origin/caller/to caches), and resets the previous interpreter step tracker.
- **step**: receives the previous interpreter step and the current step, then dispatches the previous one to `InstructionHandler`. This gives access to both input and output stacks for the opcode.
- **afterMessage**: processes the final step, propagates return data, and commits or restores the frame-scoped storage and log snapshots.

## Opcode categories
- **Arithmetic / Bitwise**: ADD, MUL, SUB, DIV/SDIV, MOD/SMOD, ADDMOD, MULMOD, EXP, SIGNEXTEND, LT/GT/SLT/SGT, EQ, ISZERO, AND/OR/XOR/NOT, BYTE, SHL/SHR/SAR, KECCAK256 (mapped to Poseidon). `handleArith` prepares the corresponding composition and obtains its host output values through the resolved subcircuit library.
- **Environment**: ADDRESS, BALANCE, ORIGIN, CALLER, CALLVALUE, CALLDATALOAD/SIZE/COPY, CODESIZE/COPY, GASPRICE, EXTCODESIZE/COPY/HASH, RETURNDATASIZE/COPY. Inputs are validated against reserved buffer values; memory copies reconstruct data through `ContextManager`.
- **Block**: BLOCKHASH, COINBASE, TIMESTAMP, NUMBER, PREVRANDAO, GASLIMIT, CHAINID, SELFBALANCE, BASEFEE. Values are loaded from `BLOCK_IN`/`EVM_IN` buffers.
- **System / Control**: POP, MLOAD/MSTORE/MSTORE8, SLOAD/SSTORE, JUMP/JUMPI/JUMPDEST, PC, MSIZE, GAS, MCOPY, PUSH0/PUSH1–PUSH32, DUP1–DUP16, SWAP1–SWAP16, LOG0–LOG4, CALL/CALLCODE/DELEGATECALL/STATICCALL, RETURN, REVERT. Memory-aware opcodes use `ContextManager`; storage ops interact with `ContextManager.storageCache` and `ContextManager.initialStorageReads`; call opcodes update caller/origin caches.
- **Unsupported**: CREATE/CREATE2/SELFDESTRUCT, TLOAD/TSTORE, BLOB opcodes, and precompiles are not synthesized.

## Storage handling
- **SLOAD**: The first access to an address/key pair records one `STORAGE_LOAD` triple. Address and key are emitted as public outputs; the value enters through the same buffer as a private input and its symbolic buffer output is cached and returned. Later accesses constrain address/key equality with `StorageAccess` and return the latest cached value.
- **SSTORE**: Constrains repeated address/key identities with `StorageAccess`, then updates the location's latest cached value and dirty flag.
- **Finalization**: After `runTx` succeeds, `_finalizeStorageStore` emits one address/key/value triple for every dirty cache entry through `STORAGE_STORE`.

## Calls and context
- `_preTasksForCalls` tracks call depth, updates `cachedCallers`, and maintains `callMemoryPtsStack` for RETURN/REVERT data reconstruction.
- Caller/origin resolution uses EDDSA verification: Poseidon hash of transaction message, signature bits (`EDDSA_SIGNATURE`), and Jubjub base/public keys to derive the sender address.

## Memory aliasing
- `MemoryPt` keeps a timestamped map of writes. `ContextManager` uses `getDataAlias` to rebuild overlapping regions for MLOAD/MCOPY/CALLDATACOPY/etc., inserting SHL/SHR/AND placements to align bytes.
- For MCOPY and CALL-related copies, `memOut` slices from the interpreter step are compared against reconstructed values to ensure consistency before producing placements.
