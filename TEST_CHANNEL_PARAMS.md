# Test Channel Creation Parameters

Guide for creating test channels on the Channel Manager UI

---

## 📋 Quick Reference

### 1. Allowed Tokens (1/4)

**Token 1**: `0xa30fe40285b8f5c0457dbc3b7c8a280373c40044` (Sepolia TON)

Or use ETH:

- **Token 1**: `0x0000000000000000000000000000000000000001` (ETH)

> 💡 For initial testing, use **1 token only** to allow maximum 16 participants

---

### 2. Participants (3/16)

Use these test L1 addresses (from `test-sepolia-state-channel.ts`):

**Participant 1 (Alice)**: `0xf9fa94d45c49e879e46ea783fc133f41709f3bc7`

**Participant 2 (Bob)**: `0x322acfaa747f3ce5b5899611034fb4433f0edf34`

**Participant 3 (Charlie)**: `0x31fbd690bf62cd8c60a93f3ad8e96a6085dc5647`

> ⚠️ **Important**: L2 MPT keys are NO LONGER provided during channel creation. Each participant will provide their L2 MPT key when making deposits for each token type.

---

### 3. Channel Timeout

**Recommended**: `7` days

- Minimum: 1 day
- Maximum: 365 days
- Gives enough time for testing without being too long

---

### 4. Public Key Coordinates (FROST Group Key)

These are the **aggregated group public key** coordinates for FROST threshold signatures.

#### Option A: Generate via DKG (Recommended)

Use the DKG (Distributed Key Generation) process to generate a proper group key with all participants.

#### Option B: Test Values (For Quick Testing)

If you need dummy values for testing the UI:

**Public Key X Coordinate**:

```
0x0000000000000000000000000000000000000000000000000000000000000001
```

**Public Key Y Coordinate**:

```
0x0000000000000000000000000000000000000000000000000000000000000002
```

> ⚠️ **Warning**: These dummy values are for UI testing only. For actual channel operations, you MUST use proper FROST keys generated via DKG.

---

## 🚀 Step-by-Step Instructions

1. **Connect Wallet**

   - Make sure you're connected to Sepolia Testnet
   - Use the wallet that will be the channel leader: `0xf9fa94d45c49e879e46ea783fc133f41709f3bc7`
   - Ensure you have at least 0.001 ETH for the leader bond

2. **Add Token**

   - Click "Add Token"
   - Paste: `0xa30fe40285b8f5c0457dbc3b7c8a280373c40044` (TON)
   - Or paste: `0x0000000000000000000000000000000000000001` (ETH)

3. **Add Participants**

   - Participant 1: `0xf9fa94d45c49e879e46ea783fc133f41709f3bc7`
   - Participant 2: `0x322acfaa747f3ce5b5899611034fb4433f0edf34`
   - Participant 3: `0x31fbd690bf62cd8c60a93f3ad8e96a6085dc5647`

4. **Set Timeout**

   - Enter: `7` (days)

5. **Public Key Coordinates**

   - **Option A (Recommended)**: Run DKG first to generate proper keys
   - **Option B (Quick Test)**: Use dummy values above (X=0x01, Y=0x02)

6. **Create Channel**
   - Click "Create Channel (0.001 ETH bond)"
   - Approve transaction
   - Wait for confirmation

---

## 📝 Important Notes

### Token Requirements

- ✅ Token must be pre-approved via `setAllowedTargetContract`
- ✅ Sepolia TON (`0xa30fe40285b8f5c0457dbc3b7c8a280373c40044`) should already be approved
- ✅ ETH (`0x0...001`) is always allowed

### Participant Limits

| Tokens | Max Participants |
| ------ | ---------------- |
| 1      | 16               |
| 2      | 8                |
| 3      | 5                |
| 4      | 4                |

### L2 MPT Keys

- 🔄 **Changed**: No longer provided during channel creation
- 📦 **Now**: Each participant provides L2 MPT key during token deposit
- 🔑 **Per Token**: Each token type requires separate L2 MPT key

### Leader Bond

- 💰 **Amount**: 0.001 ETH
- ♻️ **Refundable**: Returned on successful channel closure
- ⚠️ **Slashable**: If proof not submitted within 7 days after timeout

---

## 🔑 Generating Proper FROST Keys

For production use, generate proper FROST keys using the DKG process:

```typescript
// Example: Generate L2 keys for participants
import { jubjub } from '@noble/curves/misc';
import { setLengthLeft, bigIntToBytes, bytesToBigInt } from '@ethereumjs/util';
import { fromEdwardsToAddress } from '@tokamak/synthesizer';

// Generate private key (deterministic for testing)
const privateKey = setLengthLeft(bigIntToBytes(BigInt(1) * 123456789n), 32);

// Generate public key
const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();

// Convert to L2 address
const l2Address = fromEdwardsToAddress(publicKey);

console.log('Private Key:', privateKey);
console.log('Public Key:', publicKey);
console.log('L2 Address:', l2Address);
```

For FROST aggregated keys, use the ZecFrost contract deployed at:
`0x37A3E42C63f0dCD91133c2E514071b7705e5a9ED`

---

## 🧪 After Channel Creation

✅ **Channel Successfully Created!**

**Channel Details**:

- **Channel ID**: 1
- **Transaction**: [View on Etherscan](https://sepolia.etherscan.io/tx/0x9c72d07a67f3df084e73e25d60191bc0de4ce38b9662725779a59f296ba4c00a)
- **Created**: Nov-24-2025 12:35:48 PM UTC
- **Leader**: 0xF9Fa94D45C49e879E46Ea783fc133F41709f3bc7 (Alice)
- **Bond Paid**: 0.001 ETH
- **Status**: Success

**Next Steps**:

1. **Deposit tokens**: Each participant deposits with their L2 MPT key
2. **Submit transactions**: Off-chain L2 transactions
3. **Generate proofs**: Using synthesizer + prover
4. **Submit proofs**: On-chain verification
5. **Withdraw**: Close channel and withdraw funds

The `onchain-channel-simulation.ts` has been updated with Channel ID 1:

```typescript
const CHANNEL_ID = 1; // ✅ Updated!
```

---

## 📚 Related Files

- Test script: `packages/frontend/synthesizer/examples/L2StateChannel/test-sepolia-state-channel.ts`
- On-chain simulation: `packages/frontend/synthesizer/examples/L2StateChannel/onchain-channel-simulation.ts`
- Contract addresses: `DEPLOYED_CONTRACTS.md`
- Channel Manager UI: Sepolia testnet
