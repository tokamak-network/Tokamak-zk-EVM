# Support Intermediate State Changes in L2 State Channel via SynthesizerAdapter

## Overview

This PR implements support for intermediate state changes in L2 State Channel transactions through the `SynthesizerAdapter` interface. The implementation enables sequential transaction processing by allowing state snapshots to be saved and restored between transactions, enabling a chain of proofs that share state.

## Key Features

### 1. State Snapshot Management

- **State Export**: After synthesis, the current state is automatically saved as a `state_snapshot.json` file
- **State Import**: Previous state can be loaded from a snapshot file to continue from a specific point
- **State Chaining**: Multiple transactions can be processed sequentially, with each transaction building upon the previous state

### 2. Simplified High-Level API

The new `synthesizeL2Transfer()` method provides a simplified interface that abstracts away low-level details:

```typescript
const result = await adapter.synthesizeL2Transfer({
  channelId: CHANNEL_ID,
  initializeTxHash: INITIALIZE_TX_HASH,
  senderL2PrvKey: senderL2PrivateKey,
  recipientL2Address: recipientL2Address,
  amount: '1',
  previousStatePath: './previous-state.json', // Optional: for chaining transactions
  outputPath: './outputs',
});
```

**Key Benefits**:
- No manual calldata generation required
- No manual state loading required
- No manual blockNumber fetching required
- Automatic state snapshot creation and management

### 3. Intermediate State Support

The adapter now supports processing transactions that depend on previous state:

- **First Transaction**: Fetches initial state from on-chain (via `StateInitialized` event or contract call)
- **Subsequent Transactions**: Loads state from `previousStatePath` parameter
- **State Root Tracking**: Maintains consistency by tracking `previousStateRoot` and `newStateRoot`

### 4. Enhanced State Management

- **State Snapshot Structure**: Includes `stateRoot`, `merkleLeaves`, `registeredKeys`, `storageEntries`, and metadata
- **Participant Balance Query**: New `getParticipantBalances()` method to inspect state after synthesis
- **State Restoration**: Full state restoration from snapshot, including Merkle tree reconstruction

## Implementation Details

### Core Changes

1. **SynthesizerAdapter.synthesizeL2Transfer()**
   - New high-level method for L2 state channel transfers
   - Handles state loading (from on-chain or file)
   - Automatically generates calldata for transfer operations
   - Manages state snapshot creation and persistence

2. **State Snapshot Loading**
   - Supports loading previous state from JSON files
   - Validates state snapshot structure
   - Restores Merkle tree and storage entries

3. **State Initialization**
   - Fetches initial state from `StateInitialized` event (supports both old and new event signatures)
   - Fallback to contract call if event not found
   - Handles compatibility with different contract versions

### Testing Infrastructure

Added comprehensive test examples:

- **adapter-verify-manual.ts**: Manual testing with command-line arguments
  - Supports custom sender keys and recipient addresses
  - Can chain multiple transactions using `--previous-state` flag
  - Includes full prove/verify workflow

- **adapter-verify.ts**: Automated sequential transfer testing
  - Demonstrates Proof #1 → Proof #2 → Proof #3 chain
  - Validates state root evolution
  - Tests participant balance tracking

## Usage Example

### Sequential Transaction Processing

```typescript
const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });

// Proof #1: Initial transfer
const result1 = await adapter.synthesizeL2Transfer({
  channelId: 1,
  initializeTxHash: '0x...',
  senderL2PrvKey: sender1Key,
  recipientL2Address: recipientAddress,
  amount: '1',
  outputPath: './outputs/proof-1',
});

// Proof #2: Chain from Proof #1
const result2 = await adapter.synthesizeL2Transfer({
  channelId: 1,
  initializeTxHash: '0x...',
  senderL2PrvKey: sender2Key,
  recipientL2Address: recipientAddress,
  amount: '0.5',
  previousStatePath: result1.stateSnapshotPath, // Chain from previous state
  outputPath: './outputs/proof-2',
});

// Query participant balances
const balances = await adapter.getParticipantBalances({
  stateSnapshotPath: result2.stateSnapshotPath,
  channelId: 1,
  rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
});
```

## Benefits

1. **Developer Experience**: Simplified API reduces boilerplate code
2. **State Continuity**: Enables building complex transaction sequences
3. **Testing**: Comprehensive test infrastructure for validating state transitions
4. **Flexibility**: Supports both in-memory and file-based state management

## Files Changed

- `packages/frontend/synthesizer/src/interface/adapters/synthesizerAdapter.ts`
  - Added `synthesizeL2Transfer()` method
  - Added `getParticipantBalances()` method
  - Enhanced state loading and restoration logic

- `packages/frontend/synthesizer/examples/L2StateChannel/adapter-verify-manual.ts`
  - New test file for manual testing with CLI arguments

- `packages/frontend/synthesizer/examples/L2StateChannel/adapter-verify.ts`
  - Enhanced with sequential transfer testing

## Testing

All changes have been tested with:
- Sequential transaction processing (Proof #1 → Proof #2)
- State snapshot creation and restoration
- Participant balance queries
- Full prove/verify workflow integration

## Related Documentation

- `STATE_CHAIN_USAGE.md`: Guide for state chain functionality
- `ADAPTER_UPDATE.md`: SynthesizerAdapter migration guide
- `STATE_CHANNEL_TRANSACTION_FLOW.md`: State channel transaction flow documentation

