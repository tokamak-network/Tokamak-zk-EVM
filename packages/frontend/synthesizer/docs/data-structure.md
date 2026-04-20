> Internal reference note: This document is maintained as a secondary repository reference. Start with `docs/README.md`, `docs/architecture.md`, or `docs/maintainer-guide.md` for the canonical maintainer entrypoints.

# Synthesizer Data Structures

The shared runtime tracks symbolic values during EVM execution and then converts that trace into circuit artifacts.
Most low-level structures live under `core/src/synthesizer/types/` and `core/src/synthesizer/dataStructure/`.

## DataPt

- Defined in `core/src/synthesizer/types/dataStructure.ts`
- Fields: `source` (placement id), `wireIndex`, `sourceBitSize`, `value` (`bigint`), `valueHex`
- Optional: `extSource` and `extDest` describe external meaning when the wire comes from or goes to a buffer
- Created via `DataPtFactory` helpers; deep copies are used to avoid accidental mutation

## Placements

- Defined in `core/src/synthesizer/types/placements.ts`
- Each entry is shaped like `{ name, usage, subcircuitId, inPts, outPts }`
- Buffer placements are created first by `BufferManager`; opcode handlers append new placements in execution order

## Buffers and reserved variables

- Buffer names: `PUBLIC_IN`, `BLOCK_IN`, `EVM_IN`, `PRIVATE_IN`, `PUBLIC_OUT`
- Buffer metadata lives in `core/src/subcircuit/configuredTypes.ts`
- Reserved variables such as `FUNCTION_SELECTOR`, `CONTRACT_ADDRESS`, `MERKLE_PROOF`, and `EDDSA_PUBLIC_KEY_X` are preloaded into buffers via `BufferManager`
- Buffer wires are the only entry and exit points for non-symbolic values

## StackPt and MemoryPt

- `StackPt` mirrors the EVM stack with `DataPt` entries; push, dup, swap, and pop operations stay aligned with VM execution
- `MemoryPt` (`core/src/synthesizer/dataStructure/memoryPt.ts`) tracks memory writes as a time-ordered map of `{ memByteOffset, containerByteSize, dataPt }`
- `MemoryPt.getDataAlias()` supports overlapping-read reconstruction for `MLOAD`, `MCOPY`, and related copy operations

## MemoryPts and DataAliasInfos

- `MemoryPts`
  - arrays of memory entries returned by memory reads or batch writes
- `DataAliasInfos`
  - shift and mask descriptions used to rebuild a value from overlapping memory fragments
  - consumed by `MemoryManager` to place `SHL`, `SHR`, and `AND` subcircuits

## Cached storage

- `StateManager.cachedStorage` is a `Map<bigint, { accessOrder: number; accessHistory: CachedStorageEntry[] }>`
- Each history entry captures Merkle index (if registered), key and value `DataPt`s, and access type (`Read` or `Write`)
- This cache supports warm and cold access handling and final Merkle-root verification in `_finalizeStorage()`

## Block and transaction context

- `BlockInfo` is defined in `core/src/app/types.ts`
- `SynthesizerOpts` is defined in `core/src/synthesizer/types/synthesizer.ts`
- Together they supply block metadata and the signed L2 transaction
- These values are injected into reserved buffers during initialization so opcode handlers can reference them as symbolic inputs

## Synthesis payload and result

The adapter-facing shapes live in `core/src/app/types.ts`:

- `SynthesisPayloadInput`
  - `previousState`
  - `transaction`
  - `blockInfo`
  - `contractCodes`
- `SynthesisInput`
  - payload plus `subcircuitLibrary` and `wasmBuffers`
- `SynthesisOutput`
  - circuit artifacts plus `finalStateSnapshot` and `evmAnalysis`
