# L2 State Channel Test Scripts

This directory contains test scripts for L2 State Channel functionality in the Tokamak zkEVM.

## Test Scripts

### 1. `test-state-chain.ts`
Basic state chain test demonstrating sequential state transitions.
- Tests basic state passing between proofs
- Verifies Merkle tree state consistency
- Simple Alice → Bob transfers

**Run:**
```bash
npx tsx examples/L2StateChannel/test-state-chain.ts
```

---

### 2. `test-bidirectional-transfer.ts`
Tests bidirectional transfers between two participants.
- Alice → Bob transfer
- Bob → Alice transfer
- State restoration and verification

**Run:**
```bash
npx tsx examples/L2StateChannel/test-bidirectional-transfer.ts
```

---

### 3. `test-calldata-state-chain.ts`
Tests state chain using calldata optimization.
- Uses raw calldata instead of full transaction objects
- More gas-efficient encoding
- Demonstrates calldata-based proof generation

**Run:**
```bash
npx tsx examples/L2StateChannel/test-calldata-state-chain.ts
```

---

### 4. `test-full-state-channel-flow.ts`
Complete state channel lifecycle test.
- Multi-party transfers (Alice, Bob, Charlie)
- State export and import
- State restoration verification
- Circuit placement optimization validation

**Run:**
```bash
npx tsx examples/L2StateChannel/test-full-state-channel-flow.ts
```

---

### 5. `test-sepolia-state-channel.ts`
**Most comprehensive test** - Full Sepolia testnet state channel simulation.

**Features:**
- Real Sepolia TON contract interaction
- 4 sequential proofs with verification
- Integrated prove/verify flow
- Participant balance tracking
- State restoration and final verification
- Automatic preprocess generation

**Run:**
```bash
npx tsx examples/L2StateChannel/test-sepolia-state-channel.ts
```

**Requirements:**
- Setup files must exist in `dist/macOS/resource/setup/output/`
- Run `tokamak-cli --install` first if needed

**Output:**
- Generates proof files in `test-outputs/proof-{1,2,3,4}/`
- Creates state snapshots for each proof
- Verification summary at the end

---

### 6. `test-single-proof.ts`
Simplified single proof generation for debugging.
- Generates only the first proof
- Useful for isolating Synthesizer issues
- Faster iteration during development

**Run:**
```bash
npx tsx examples/L2StateChannel/test-single-proof.ts
```

---

### 7. `onchain-channel-simulation.ts` ⭐ **NEW**
**Onchain data-driven simulation** using RollupBridgeCore contract.

**Features:**
- Fetches real channel data from RollupBridgeCore
- Uses actual participant addresses and deposits
- Validates against onchain `initialStateRoot`
- Simulates transactions based on real channel configuration

**Run:**
```bash
npx tsx examples/L2StateChannel/onchain-channel-simulation.ts
```

**Configuration:**
- Set `ROLLUP_BRIDGE_CORE_ADDRESS` for your deployment
- Set `CHANNEL_ID` for the channel to simulate
- Requires RPC access to Sepolia testnet

---

## Test Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    State Channel Lifecycle                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Initial State                                            │
│     ↓                                                        │
│  2. Transaction 1 → Proof #1 (Synthesizer + Prover)         │
│     ↓                                                        │
│  3. Verify Proof #1 (verify-rust)                           │
│     ↓                                                        │
│  4. Export State Snapshot                                   │
│     ↓                                                        │
│  5. Transaction 2 → Proof #2 (from previous state)          │
│     ↓                                                        │
│  6. Verify Proof #2                                         │
│     ↓                                                        │
│  7. ... (repeat for more proofs)                            │
│     ↓                                                        │
│  8. Final State Restoration & Verification                  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### State Snapshot
Each proof exports a state snapshot containing:
- `stateRoot`: Current Merkle tree root
- `merkleLeaves`: All leaves in the tree
- `registeredKeys`: Storage keys being tracked
- `storageEntries`: All storage slot values
- `userNonces`: Participant nonces

### Circuit Optimization
The Synthesizer reuses circuit placements when:
1. Same opcode sequence
2. Same input/output patterns
3. Sequential execution flow

### Proof Verification
Each proof is verified using:
- `instance.json`: Public inputs (a_pub_user, a_pub_block, a_pub_function)
- `permutation.json`: Permutation polynomial commitments
- `placementVariables.json`: Circuit wire assignments
- `proof.json`: zkSNARK proof

---

## Troubleshooting

### "Setup files not found"
Run trusted setup first:
```bash
tokamak-cli --install
```

### "Preprocess files not found"
The test will automatically run preprocess if needed.

### "Synthesizer: step error"
These are often "soft errors" that the Synthesizer recovers from.
Only worry if the circuit generation fails completely.

### "Proof verification failed"
Check that:
- QAP was compiled with correct `S_MAX` and `nEVMIn`
- Setup files match the current QAP
- Preprocess was run after QAP changes

---

## Development

When adding new test scripts:
1. Add them to this directory
2. Update this README
3. Follow the naming convention: `test-{feature}.ts`
4. Include clear console output with emojis for readability
5. Export state snapshots for multi-proof tests

---

## Resources

- [State Channel Specification](../../demo/STATE_CHANNEL_SPECIFICATION.md)
- [State Chain Usage](../../STATE_CHAIN_USAGE.md)
- [Transaction Flow](../../STATE_CHANNEL_TRANSACTION_FLOW.md)
- [RollupBridgeCore Documentation](https://github.com/tokamak-network/Tokamak-zk-EVM-contracts/blob/main/RollupBridgeCore_Documentation.md)

