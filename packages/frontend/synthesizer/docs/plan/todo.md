# Storage Verification Flow Refactor Plan

## 1. Goal

Replace the current deferred Merkle verification/finalization model with an immediate verification model:

1. `loadStorage` must verify registered storage immediately on every call.
2. `storeStorage` must run two proofs for registered storage:
   - pre-write proof against the current tree,
   - post-write proof against the updated tree,
   and add placements that check sibling equality between both proofs.
3. Remove `_updateMerkleTree` from the transaction finalization path.

This document is an implementation plan only (not the code change itself).

---

## 2. Current Behavior (Baseline)

- `loadStorage` verifies only on cold registered access and then caches the result in `state.cachedStorage`.
- `storeStorage` for registered keys assumes warm access and does not perform Merkle proof verification.
- `_updateMerkleTree` runs at the end of the tx to:
  - force verification coverage for registered keys,
  - pad missing leaves,
  - permute leaves,
  - recompute final roots with Poseidon,
  - emit `RES_MERKLE_ROOT` outputs.

Consequence: proof generation for storage correctness is partially deferred to tx-finalization.

---

## 3. Target Design Summary

### 3.1 Verification Timing

- `SLOAD` path: verify registered key immediately (always), no read-result caching.
- `SSTORE` path: verify registered key twice around the write.

### 3.2 State Tracking Strategy

- Remove/stop using registered-key read cache as verification gate.
- Keep only the minimum runtime tracking needed for:
  - pending pre-write proof context for `SSTORE`,
  - unregistered storage outputs (for existing `UNREGISTERED_CONTRACT_STORAGE_OUT` behavior),
  - current root pointer per address (for root output emission without `_updateMerkleTree`).

### 3.3 Finalization

- `_finalizeStorage()` no longer calls `_updateMerkleTree()`.
- Finalization will emit outputs from tracked state only.

---

## 4. Detailed Implementation Plan

## Phase A: Type and State Refactor

### A1. Introduce new storage proof record types

**Files**
- `src/synthesizer/handlers/stateManager.ts`
- optionally `src/synthesizer/types/*` if exported elsewhere

**Plan**
- Add a dedicated type for proof artifacts returned by verification helper methods, e.g.:
  - `indexPt`, `valuePt`, `leafPt`,
  - `siblingsRaw` (`bigint[][]`),
  - `siblingPts` (`DataPt[][]`),
  - `treeIndex`, `address`, `rootPt`.
- Add a dedicated type for pending pre-`SSTORE` context (per call-depth context):
  - key/value before write,
  - proof artifacts from pre-write verification.

### A2. Simplify runtime storage tracking

**Files**
- `src/synthesizer/handlers/stateManager.ts`
- `src/synthesizer/synthesizer.ts`
- `src/synthesizer/handlers/instructionHandler.ts`

**Plan**
- De-emphasize or remove usage of:
  - `verifiedStorageMTIndices`,
  - registered-key read history in `cachedStorage`.
- Keep tracking for unregistered write output generation.
- Add per-context pending slot for pre-`SSTORE` verification context.

**Rationale**
- Requirement explicitly removes caching-based deferred verification behavior.

---

## Phase B: `verifyStorage` Refactor (Core Primitive)

### B1. Split verification into reusable helper(s)

**Files**
- `src/synthesizer/handlers/instructionHandler.ts`
- `src/synthesizer/handlers/arithmeticManager.ts` (if signature extension is needed)

**Plan**
- Refactor existing `verifyStorage(...)` into an internal helper that can be used by both `loadStorage` and `storeStorage` stages.
- Helper responsibilities:
  1. Resolve merkle proof for `[addressIdx, leafIdx]`.
  2. Create `indexPt` / `valuePt` in buffers.
  3. Build `leafPt = Poseidon(keyPt, valuePt)`.
  4. Place Merkle proof verification constraints.
  5. Return proof artifacts (including sibling pointers) to caller.

### B2. Enable sibling `DataPt` capture

**Problem**
- Existing `placeMerkleProofVerification(...)` internally creates sibling data points but does not expose them.

**Plan**
- Extend proof-placement flow so caller can capture sibling `DataPt`s used in proof.
- Two implementation options:
  1. Extend `placeMerkleProofVerification(...)` to return `DataPt[][]` sibling pointers.
  2. Move sibling-point creation into caller, pass both raw siblings and sibling pointers into proof placement.

**Preferred option**
- Option 2 (explicit data ownership in `InstructionHandler`) for easier sibling-to-sibling matching in `SSTORE` pre/post checks.

---

## Phase C: `loadStorage` Immediate Verification

### C1. Registered keys

**Files**
- `src/synthesizer/handlers/instructionHandler.ts`

**Plan**
- For every registered key access:
  - read value from `stateManager.getStorage(...)`,
  - execute verification helper immediately,
  - return the newly created `valuePt`.
- Do not read or write caching state for registered loads.

### C2. Unregistered keys

**Plan**
- Keep current behavior for unregistered loads (`UNREGISTERED_CONTRACT_STORAGE_IN`),
- but do not store read history unless strictly required by another downstream path.

**Note**
- This change increases proof/placement volume for repeated `SLOAD` on same slot, which is expected by design.

---

## Phase D: `SSTORE` Two-Phase Verification (Pre/Post)

### D1. Add pre-step hook for current opcode

**Files**
- `src/synthesizer/synthesizer.ts`
- `src/synthesizer/handlers/instructionHandler.ts`

**Plan**
- Add a new hook invoked for the **current** step before processing previous opcode logic (e.g. `beforeOpcodeExecution(context, stepResult)`).
- On current opcode `SSTORE`:
  - read symbolic key/value from `context.stackPt` (without pop),
  - verify stack/value consistency with VM step stack,
  - for registered keys, run pre-write storage verification,
  - persist proof artifacts into context as `pendingSstorePreProof`.

**Why this is required**
- Existing handler architecture processes previous opcode at the next step.
- Without a pre-step hook, the old storage value/proof context can be lost by the time `SSTORE` is handled.

### D2. Post-write verification in `storeStorage`

**Files**
- `src/synthesizer/handlers/instructionHandler.ts`

**Plan**
- In existing `SSTORE` handling path (post-write timing):
  - retrieve pending pre-write proof from context,
  - read updated storage value from state manager,
  - run post-write verification helper,
  - compare pre/post siblings using placements,
  - assert runtime consistency (`eqPt.value === 1n`) for fail-fast behavior.

### D3. Sibling equality placement plan

**Placement recipe**
- For each `(level, siblingIndex)` pair:
  - `eqPt = placeArith('EQ', [preSiblingPt, postSiblingPt])[0]`
- Keep all these `EQ` placements as explicit trace entries.

**Runtime validation**
- If any `eqPt.value !== 1n`, throw with a precise error containing address/key/level/index.

**Reasoning**
- This satisfies the requirement to add placements for sibling consistency checks while preserving current fail-fast coding style.

### D4. Unregistered `SSTORE`

**Plan**
- Keep unregistered write tracking for output emission.
- No Merkle proof for unregistered slots.

---

## Phase E: Remove `_updateMerkleTree` and Replace Finalization

### E1. Remove deferred root recomputation flow

**Files**
- `src/synthesizer/synthesizer.ts`

**Plan**
- Delete or fully bypass `_updateMerkleTree()`.
- Remove imports/constants only used by that path (`MAX_MT_LEAVES`, `PermutationForAddress`, etc.).

### E2. Final root output strategy without `_updateMerkleTree`

**Plan**
- Introduce tracked current-root pointers per address in synthesizer state.
- Initialize from initial roots at tx start.
- Update tracked root pointer whenever post-write verification proves a new root for a registered address.
- In finalization, emit `RES_MERKLE_ROOT` from tracked pointers (initial root for untouched addresses, latest proved root for touched addresses).

**Important**
- No final leaf permutation/compression pass remains.
- Correctness now relies on immediate proof chain at access/write time.

---

## Phase F: Cleanup of Obsolete State/Checks

### F1. Remove verification coverage checks tied to deferred mode

**Plan**
- Remove `verifiedStorageMTIndices` usage and mismatch checks against `registeredKeys` count.
- Remove assumptions like “registered storage writes are expected to be warm access”.

### F2. Keep only necessary caches

**Plan**
- Keep unregistered write list/map for output extraction.
- Remove registered read/write history cache unless needed for debugging.

---

## Phase G: Validation and Tests

### G1. Unit-level checks (handler behavior)

1. `SLOAD` on registered key twice creates two independent verification traces.
2. `SSTORE` on registered key creates pre-proof, post-proof, and sibling `EQ` placements.
3. `SSTORE` sibling mismatch (forced via mock/proof tamper) throws deterministic error.
4. Unregistered `SLOAD`/`SSTORE` still populate input/output buffers correctly.

### G2. Integration scenarios

1. Single `SSTORE` tx: verify root tracking and `RES_MERKLE_ROOT` emission.
2. Multiple `SSTORE` on same key in one tx.
3. Interleaved `SLOAD`/`SSTORE` on same key.
4. Nested calls with depth changes (`CALL`/`DELEGATECALL`) and `SSTORE` in child context.

### G3. Non-regression matrix

- Existing ERC20 example configs should continue to synthesize.
- Compare placement count delta before/after (expected increase).

---

## 5. Risks and Mitigations

1. **Constraint/placement growth** due to no load cache.
   - Mitigation: document expected overhead; optionally add future feature flag for dedup mode.
2. **Pre/post timing bugs for `SSTORE`** in event-driven execution.
   - Mitigation: explicit pre-step hook + context-bound pending proof object + strict stack consistency assertions.
3. **State manager API uncertainty for root retrieval/update**.
   - Mitigation: define adapter layer in `InstructionHandler` for proof/root access; if API lacks direct root getter, derive from proof path or add wrapper method.
4. **Behavioral drift in final root outputs after removing `_updateMerkleTree`**.
   - Mitigation: add integration assertion comparing emitted roots against state manager’s final roots.

---

## 6. Step-by-Step Execution Order

1. Add new types and context fields for pending pre-`SSTORE` proof artifacts.
2. Refactor `verifyStorage` into reusable helper returning proof artifacts.
3. Implement current-step pre-hook in synthesizer event flow.
4. Rework `loadStorage` to always verify registered slots immediately with no read cache.
5. Rework `storeStorage` for post-write verification and sibling equality placements.
6. Remove `_updateMerkleTree` from finalize path and add root-output emission from tracked roots.
7. Remove obsolete deferred-verification fields/checks.
8. Run test matrix and compare placement traces.
9. Update docs/comments reflecting immediate verification model.

---

## 7. Requirement Satisfaction Checklist

- [x] `loadStorage` verifies immediately on each access.
- [x] `loadStorage` no longer relies on cached verification result.
- [x] `storeStorage` verifies once before update and once after update for registered keys.
- [x] sibling equality check placements are inserted for both proofs.
- [x] `_updateMerkleTree` is removed from execution path.
- [x] final Merkle root output path is preserved without deferred tree recomputation.

---

## 8. Alternative (If Proof Size Becomes Too Large)

If immediate-verification-only mode is too expensive, keep this refactor as default and add an optional optimization mode:

- `strict_immediate_verification = true` (default): exact behavior from this plan.
- `strict_immediate_verification = false`: optional dedup for repeated `SLOAD` on unchanged slot within one context.

This alternative should be considered only after baseline correctness is implemented.
