# L2 State Channel Example

This example demonstrates the complete flow of L2 State Channel operations:
1. **Channel Setup** - Open channel and deposit tokens
2. **Channel Initialization** - Initialize channel state via frontend
3. **L2 Transfer Simulation** - Simulate L2 token transfers
4. **Proof Generation & Verification** - Generate and verify zk proofs

## Prerequisites

- Node.js 18+
- Sepolia testnet tokens (ETH for gas, TON for deposits)
- Access to [Tokamak-zkp-channel-manager](https://github.com/tokamak-network/Tokamak-zkp-channel-manager) frontend

## Setup

### 1. Environment Variables

Create a `.env` file in the synthesizer root (`packages/frontend/synthesizer/.env`):

```env
# Required
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# Leader private key (channel creator)
CHANNEL_LEADER_PRIVATE_KEY=0x...

# Participant private keys as JSON array
CHANNEL_PARTICIPANT_PRIVATE_KEYS=["0x...", "0x..."]

# Optional: Use existing channel
CHANNEL_ID=55
INITIALIZE_TX_HASH=0x...
```

### 2. Install Dependencies

```bash
cd packages/frontend/synthesizer
npm install
```

## Usage

### End-to-End Test (Recommended)

Run the complete flow:

```bash
npx tsx examples/L2StateChannel/index.ts
```

This script will:
1. **Phase 1**: Create channel and deposit tokens (interactive)
2. **Phase 2**: Wait for you to initialize via frontend
3. **Phase 3**: Simulate L2 transfer (select sender, recipient, amount)
4. **Phase 4**: Generate and verify proof

### Channel Setup Only

If you only want to set up a channel:

```bash
npx tsx examples/L2StateChannel/channel-setup/index.ts
```

## Interactive Prompts

### Configuration

```
📋 Step 1: Leader Configuration
? Use leader from .env? 0x1234...abcd (0xF9Fa94D45...) (Y/n)

📋 Step 2: Participant Configuration
? Use participants from .env? (Y/n)

📋 Step 3: Channel Settings
? Target contract address: (0xa30fe40285B8f5c0457DbC3B7C8A280373c40044)

📋 Step 4: Deposit Amounts
? Use the same deposit amount for all participants? (Y/n)
? Deposit amount (in TON): (10)
```

### Channel Initialization

After Phase 1, you'll see instructions to initialize via frontend:

```
┌─────────────────────────────────────────────────────────────┐
│                    MANUAL STEP REQUIRED                     │
├─────────────────────────────────────────────────────────────┤
│  1. Clone: git clone https://github.com/tokamak-network/    │
│            Tokamak-zkp-channel-manager                      │
│  2. Run: npm install && npm run dev                         │
│  3. Open: http://localhost:3000                             │
│  4. Connect Leader wallet                                   │
│  5. Navigate to "Initialize State"                          │
│  6. Select Channel and click "Initialize"                   │
│  7. Copy the TX Hash                                        │
└─────────────────────────────────────────────────────────────┘

? Channel initialization status:
❯ ✅ Initialization complete - Enter TX Hash
  ⏳ Still working on it - Wait
  ❌ Cancel and exit
```

### L2 Transfer

```
📋 Available Accounts:

   [0] Leader
       L1: 0xF9Fa94D45C49e879E46Ea783fc133F41709f3bc7
       L2: 0x023e0294ece0a62b866e631c38b8fde21adc964c

   [1] Participant 2
       L1: 0x322acfaA747F3CE5b5899611034FB4433f0Edf34
       L2: 0x09a5f429db26d80c0167b2e91a8338dfef029906

? Select SENDER account: Leader (0xF9Fa94D4...)
? Select RECIPIENT account: Participant 2 (L2: 0x09a5f429db...)
? Transfer amount (in TON): 1
```

## Output Structure

```
L2StateChannel/
└── output/
    └── {channelId}/
        ├── channel_info.json      # Channel details & participants
        └── proof-1/
            ├── instance.json      # Circuit instance
            ├── proof.json         # Generated proof
            ├── state_snapshot.json
            └── ...
```

### channel_info.json

```json
{
  "channelId": 55,
  "targetContract": "0xa30fe40285B8f5c0457DbC3B7C8A280373c40044",
  "targetTokenSymbol": "TON",
  "initTxHash": "0x...",
  "status": "initialized",
  "participants": [
    {
      "address": "0xF9Fa94D45C49e879E46Ea783fc133F41709f3bc7",
      "name": "Leader",
      "deposit": "1000000000000000000",
      "mptKey": "0x60d4f30b8f452d2f5726bb14c3226f5d64a32eba..."
    },
    ...
  ],
  "createdAt": "2025-12-29T..."
}
```

## Using Existing Channel

To skip channel setup and use an existing initialized channel:

1. Set environment variables:
```env
CHANNEL_ID=55
INITIALIZE_TX_HASH=0xcae04be327f6213a351e58525b20e72d405ee25da3c2fc2072e50df51c0a03a3
```

2. Run the script - it will detect and use the existing channel

## Troubleshooting

### Binary Not Found

Make sure the binaries are built:
```bash
# From project root
cd dist/bin
ls  # Should show: preprocess, prove, verify
```

### RPC Connection Failed

- Check your `SEPOLIA_RPC_URL` is correct
- Ensure you have a valid Alchemy/Infura API key
- Try a public RPC: `https://rpc.sepolia.org`

### Insufficient Funds

- Get Sepolia ETH from faucets
- Get test TON tokens from Tokamak faucet

## Related Files

- `index.ts` - Main end-to-end test script
- `channel-setup/index.ts` - Channel setup only
- `synthesizer/adapter.ts` - SynthesizerAdapter for L2 transfer simulation
- `constants/index.ts` - Contract addresses and ABIs

