# Tokamak Synthesizer Binary Usage Guide

## 🔨 Build Binary

```bash
cd packages/frontend/synthesizer

# Build for current platform
./build-binary.sh

# Output: ./bin/synthesizer
```

## 🚀 Commands

### 1. Info Command

Display synthesizer information:

```bash
./bin/synthesizer info
```

### 2. L2 Transfer Command

Execute L2 State Channel transfer:

```bash
./bin/synthesizer l2-transfer \
  --channel-id 3 \
  --init-tx 0xcf31e988b30825eb4e8a5f3ceb0a2b5cd2462dc4881dc6e2f58cfdb184acaeea \
  --sender-key 0x1234567890abcdef... \
  --recipient 0x4c3cc9fad192ce627e6eea0f3d88db04d5c2cff5 \
  --amount 1 \
  --output ./outputs/transfer-1 \
  --bridge 0x68862886384846d53bbba89aa4f64f4789dda089 \
  --sepolia
```

**Required Options:**
- `--channel-id <id>` - Channel ID number
- `--init-tx <hash>` - Initialize transaction hash
- `--sender-key <key>` - Sender L2 private key (hex format with or without 0x prefix)
- `--recipient <address>` - Recipient L2 address
- `--amount <amount>` - Transfer amount in ether (e.g., "1" for 1 TON)

**Optional Options:**
- `--previous-state <path>` - Path to previous state_snapshot.json (for chained transfers)
- `--output <dir>` - Output directory for results (default: current directory)
- `--bridge <address>` - RollupBridge contract address (default: Sepolia address)
- `-r, --rpc-url <url>` - Custom RPC URL
- `-s, --sepolia` - Use Sepolia testnet (default: mainnet)

### 3. Get Balances Command

Get participant balances from state snapshot:

```bash
./bin/synthesizer get-balances \
  --snapshot ./outputs/transfer-1/state_snapshot.json \
  --channel-id 3 \
  --bridge 0x68862886384846d53bbba89aa4f64f4789dda089 \
  --sepolia
```

**Required Options:**
- `--snapshot <path>` - Path to state_snapshot.json
- `--channel-id <id>` - Channel ID number

**Optional Options:**
- `--bridge <address>` - RollupBridge contract address
- `-r, --rpc-url <url>` - Custom RPC URL
- `-s, --sepolia` - Use Sepolia testnet

## 🔗 Chained Transfers Example

```bash
# First transfer (no previous state)
./bin/synthesizer l2-transfer \
  --channel-id 3 \
  --init-tx 0xcf31e988b30825eb4e8a5f3ceb0a2b5cd2462dc4881dc6e2f58cfdb184acaeea \
  --sender-key $ALICE_L2_KEY \
  --recipient $BOB_L2_ADDR \
  --amount 1 \
  --output ./outputs/tx1 \
  --sepolia

# Second transfer (with previous state)
./bin/synthesizer l2-transfer \
  --channel-id 3 \
  --init-tx 0xcf31e988b30825eb4e8a5f3ceb0a2b5cd2462dc4881dc6e2f58cfdb184acaeea \
  --sender-key $BOB_L2_KEY \
  --recipient $CHARLIE_L2_ADDR \
  --amount 0.5 \
  --previous-state ./outputs/tx1/state_snapshot.json \
  --output ./outputs/tx2 \
  --sepolia

# Third transfer (with previous state)
./bin/synthesizer l2-transfer \
  --channel-id 3 \
  --init-tx 0xcf31e988b30825eb4e8a5f3ceb0a2b5cd2462dc4881dc6e2f58cfdb184acaeea \
  --sender-key $CHARLIE_L2_KEY \
  --recipient $ALICE_L2_ADDR \
  --amount 1 \
  --previous-state ./outputs/tx2/state_snapshot.json \
  --output ./outputs/tx3 \
  --sepolia

# Check final balances
./bin/synthesizer get-balances \
  --snapshot ./outputs/tx3/state_snapshot.json \
  --channel-id 3 \
  --sepolia
```

## 🧪 Run Tests

Automated test script that runs all commands:

```bash
# Set environment variables
export ALICE_L2_KEY=0x...
export BOB_L2_KEY=0x...
export CHARLIE_L2_KEY=0x...
export ALICE_L2_ADDR=0x...
export BOB_L2_ADDR=0x...
export CHARLIE_L2_ADDR=0x...

# Optional: custom configuration
export CHANNEL_ID=3
export INIT_TX_HASH=0xcf31e988b30825eb4e8a5f3ceb0a2b5cd2462dc4881dc6e2f58cfdb184acaeea
export BRIDGE_ADDRESS=0x68862886384846d53bbba89aa4f64f4789dda089

# Run tests
./test-binary.sh
```

The test script will:
1. Test info command
2. Execute Transfer #1 (Alice → Bob, 1 TON)
3. Get balances after Transfer #1
4. Execute Transfer #2 (Bob → Charlie, 0.5 TON)
5. Get balances after Transfer #2
6. Execute Transfer #3 (Charlie → Alice, 1 TON)
7. Get final balances

Test outputs are saved in: `./test-outputs/binary-test/`

## 📦 Deploy Binary

Copy binary to dist/macOS/bin:

```bash
cp bin/synthesizer ../../../dist/macOS/bin/
```

Or use from any location:

```bash
./bin/synthesizer --help
```

## 🔍 Output Files

Each transfer generates:
- `state_snapshot.json` - Current state snapshot (for chaining)
- `instance.json` - Circuit instance data
- `placementVariables.json` - Placement variables
- `instance_description.json` - Instance description
- `permutation.json` - Permutation rules

## 💡 Tips

1. **Private Keys**: Always keep L2 private keys secure and never commit them
2. **State Chaining**: Use `--previous-state` to chain transactions
3. **Output Organization**: Use descriptive output directory names
4. **Balance Checking**: Run `get-balances` after each transfer to verify state
5. **Network Selection**: Use `--sepolia` for testing, omit for mainnet

## 🐛 Troubleshooting

**Binary not found:**
```bash
# Build first
./build-binary.sh
```

**Permission denied:**
```bash
chmod +x ./bin/synthesizer
```

**RPC errors:**
```bash
# Use custom RPC
./bin/synthesizer l2-transfer ... --rpc-url https://your-rpc-url
```

**Missing dependencies:**
```bash
# Make sure WASM files are in resource/ directory
./build-binary.sh  # This copies WASM files automatically
```
