# L2 State Channel Transfer Example

This example demonstrates L2 transfers on a pre-existing state channel (Channel 55) on Sepolia testnet.

## Channel 55 Configuration

| Property | Value |
|----------|-------|
| Channel ID | 55 |
| Token | TON |
| Init TX | `0x48ba10b55d6798a75ab904bb3317b546411a0e38f4ad6290573558648889136c` |

### Participants

| Name | L1 Address | Deposit | MPT Key |
|------|------------|---------|---------|
| Alice (Leader) | `0xF9Fa94D45C49e879E46Ea783fc133F41709f3bc7` | 1 TON | `0x025970d0...` |
| Bob | `0x322acfaA747F3CE5b5899611034FB4433f0Edf34` | 1 TON | `0x2f79d38b...` |
| Charlie | `0x31Fbd690BF62cd8C60A93F3aD8E96A6085Dc5647` | 1 TON | `0x4edcb654...` |

## Prerequisites

1. **Node.js** >= 18
2. **Environment Variables**: Add to `packages/frontend/synthesizer/.env`:

```bash
SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v3/YOUR_API_KEY"

# At least one participant's private key (to use as sender)
ALICE_PRIVATE_KEY="0x..."       # or CHANNEL_LEADER_PRIVATE_KEY
BOB_PRIVATE_KEY="0x..."
CHARLIE_PRIVATE_KEY="0x..."

# Or use JSON array format:
# CHANNEL_PARTICIPANT_PRIVATE_KEYS='["0x...", "0x..."]'
```

## Usage

```bash
cd packages/frontend/synthesizer
npx tsx examples/L2StateChannel/index.ts
```

### Interactive Prompts

1. **Select Sender**: Choose from accounts with available private keys
2. **Select Recipient**: Choose any participant (will prompt for key if needed)
3. **Enter Amount**: Transfer amount in TON

### Chained Transfers

The script automatically detects previous transfers and chains from them:

```
transfer-1/  →  transfer-2/  →  transfer-3/  → ...
   ↓               ↓               ↓
state_snapshot  state_snapshot  state_snapshot
```

Each new transfer uses the previous transfer's `state_snapshot.json` as its base state.

## Output Structure

```
examples/L2StateChannel/output/
├── 55/
│   └── channel_info.json       # Channel metadata
├── transfer-1/
│   ├── instance.json           # Circuit instance
│   ├── instance_description.json
│   ├── permutation.json
│   ├── placementVariables.json
│   ├── state_snapshot.json     # State after this transfer
│   └── transfer_info.json      # Transfer metadata
├── transfer-2/
│   └── ...
└── transfer-N/
    └── ...
```

### transfer_info.json

```json
{
  "transferNumber": 1,
  "channelId": 55,
  "sender": {
    "name": "Alice (Leader)",
    "l1Address": "0xF9Fa94D45C49e879E46Ea783fc133F41709f3bc7",
    "l2Address": "0x..."
  },
  "recipient": {
    "name": "Bob",
    "l1Address": "0x322acfaA747F3CE5b5899611034FB4433f0Edf34",
    "l2Address": "0x..."
  },
  "amount": "0.1",
  "tokenSymbol": "TON",
  "previousStateRoot": "0x...",
  "newStateRoot": "0x...",
  "basedOnTransfer": null,
  "createdAt": "2024-12-30T..."
}
```

## Proof Generation

After running the synthesizer, you can generate and verify proofs:

```bash
# Generate proof
./tokamak-cli --prove examples/L2StateChannel/output/transfer-1

# Verify proof
./tokamak-cli --verify examples/L2StateChannel/output/transfer-1
```

Or manually:

```bash
# Preprocess (first proof only)
./dist/bin/preprocess \
  packages/frontend/qap-compiler/subcircuits/library \
  examples/L2StateChannel/output/transfer-1 \
  dist/resource/setup/output \
  dist/resource/preprocess/output

# Prove
./dist/bin/prove \
  packages/frontend/qap-compiler/subcircuits/library \
  examples/L2StateChannel/output/transfer-1 \
  dist/resource/setup/output \
  examples/L2StateChannel/output/transfer-1

# Verify
./dist/bin/verify \
  packages/frontend/qap-compiler/subcircuits/library \
  examples/L2StateChannel/output/transfer-1 \
  dist/resource/setup/output \
  dist/resource/preprocess/output \
  examples/L2StateChannel/output/transfer-1
```

## How It Works

1. **L2 Key Derivation**: L2 private keys are derived from L1 private keys by signing a message:
   ```
   Message: "Tokamak-Private-App-Channel-{channelId}"
   L2 Keys = deriveL2KeysFromSignature(sign(message))
   ```

2. **State Restoration**: The SynthesizerAdapter fetches on-chain data from the initialize transaction and reconstructs the channel state.

3. **Transfer Simulation**: The transfer is executed in the synthesizer's EVM, generating circuit outputs.

4. **State Snapshot**: The resulting state is saved for chaining subsequent transfers.

## Related Files

- `index.ts` - Main example script
- `output/55/channel_info.json` - Channel metadata
- `../../src/interface/adapters/synthesizerAdapter.ts` - SynthesizerAdapter implementation
- `../../src/TokamakL2JS/utils/web.ts` - L2 key derivation utilities

## Full E2E Testing

For complete end-to-end testing including channel creation, use the CLI:

```bash
./tokamak-cli --channel-e2e
```

See `scripts/channel/README.md` for more details.
