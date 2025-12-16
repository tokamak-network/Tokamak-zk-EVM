# Synthesizer Data Structures

Synthesizer tracks symbolic values during EVM execution. These structures live under `src/synthesizer/types` and `src/synthesizer/dataStructure`.

## DataPt
- Defined in `types/dataStructure.ts`.
- Fields: `source` (placement id), `wireIndex`, `sourceBitSize`, `value` (`bigint`), `valueHex`.
- Optional: `extSource`/`extDest` describe external meaning when the wire comes from or goes to a buffer.
- Created via `DataPtFactory` helpers; deep copies are used to avoid accidental mutation.

## Placements
- Defined in `types/placements.ts`.
- Each entry: `{ name, usage, subcircuitId, inPts: DataPt[], outPts: DataPt[] }`.
- Buffer placements are created first by `BufferManager`; opcode handlers append new placements in execution order.

## Buffers and reserved variables
- Buffer names: `PUBLIC_IN`, `BLOCK_IN`, `EVM_IN`, `PRIVATE_IN`, `PUBLIC_OUT` (see `interface/qapCompiler/configuredTypes.ts`).
- Reserved variables (e.g., `FUNCTION_SELECTOR`, `CONTRACT_ADDRESS`, `MERKLE_PROOF`, `EDDSA_PUBLIC_KEY_X`) are preloaded into buffers via `BufferManager`. Metadata lives in `types/buffers.ts`.
- Buffer wires are the only entry/exit points for non-symbolic values.

## StackPt and MemoryPt
- `StackPt` mirrors the EVM stack with `DataPt` entries; push/dup/swap/pop operations are kept in sync with VM execution.
- `MemoryPt` (`dataStructure/memoryPt.ts`) tracks memory writes as a time-ordered map of `{ memByteOffset, containerByteSize, dataPt }`. Provides alias analysis (`getDataAlias`) so overlapping writes can be reconstructed for MLOAD/MCOPY/etc.

## MemoryPts and DataAliasInfos
- `MemoryPts`: Array of memory entries returned by memory reads or batch writes.
- `DataAliasInfos`: Shift/mask descriptions used to rebuild a value from overlapping memory fragments. Consumed by `MemoryManager` to place SHL/SHR/AND subcircuits.

## Cached storage
- `StateManager.cachedStorage`: `Map<bigint, { accessOrder: number; accessHistory: CachedStorageEntry[] }>` where each entry captures Merkle index (if registered), key/value DataPts, and access type (`Read`/`Write`).
- Enables warm/cold detection and final Merkle root verification in `_finalizeStorage()`.

## Block and transaction context
- `SynthesizerOpts` supplies block info (`coinBase`, `timeStamp`, `blockNumber`, `prevRanDao`, `gasLimit`, `chainId`, `baseFee`, `blockHashes`) and the signed L2 transaction (`nonce`, `to`, calldata, EDDSA signature/randomizer/public key).
- These are injected into buffers during initialization so opcode handlers can reference them as reserved variables.
