# Guide: Fetching On-Chain Data from RollupBridgeCore

This guide explains how to fetch the required data from the bridge contract based on the [RollupBridgeCore Documentation](https://github.com/tokamak-network/Tokamak-zk-EVM-contracts/blob/4a1df40c7002018f6b86a99a646f85b07807ea11/RollupBridgeCore_Documentation.md).

## Required Data

1. **Initial Merkle tree root**
2. **MPT key list**
3. **L2 address list**
4. **DKG result** (public key)
5. **Initial Groth16 proof**

---

## 1. Initial Merkle Tree Root

### Method: `getChannelInfo()`

The initial Merkle tree root is returned as part of the channel information.

```typescript
import { ethers } from 'ethers';
import { ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI } from './constants';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);

// Get channel info (includes initialRoot)
const [allowedTokens, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(channelId);

console.log('Initial Merkle Tree Root:', initialRoot);
```

**Documentation Reference:**

- Function: `getChannelInfo(uint256 channelId) → (address[] allowedTokens, ChannelState state, uint256 participantCount, bytes32 initialRoot)`
- The `initialRoot` is the fourth return value (bytes32)

**Alternative Method: From Transaction Event**

You can also get the initial root from the `StateInitialized` event emitted by the Proof Manager contract:

```typescript
import { ROLLUP_BRIDGE_PROOF_MANAGER_ADDRESS } from './constants';

// Get transaction receipt
const receipt = await provider.getTransactionReceipt(initializeTxHash);

// Parse StateInitialized event
const proofManagerContract = new ethers.Contract(
  ROLLUP_BRIDGE_PROOF_MANAGER_ADDRESS,
  ['event StateInitialized(uint256 indexed channelId, bytes32 currentStateRoot)'],
  provider,
);

// Find StateInitialized event in receipt logs
let initialRoot: string | null = null;
for (const log of receipt.logs) {
  try {
    const parsed = proofManagerContract.interface.parseLog({
      topics: log.topics,
      data: log.data,
    });
    if (parsed && parsed.name === 'StateInitialized') {
      initialRoot = parsed.args.currentStateRoot || parsed.args[1];
      break;
    }
  } catch (error) {
    continue;
  }
}
```

---

## 2. MPT Key List

### Method: `getL2MptKey()`

MPT keys are stored per participant and per token. You need to iterate through all participants and all allowed tokens.

```typescript
// Get participants and allowed tokens first
const participants = await bridgeContract.getChannelParticipants(channelId);
const [allowedTokens] = await bridgeContract.getChannelInfo(channelId);

// Fetch MPT keys for all participants and tokens
const mptKeys = new Map<string, Map<string, bigint>>(); // participant -> token -> key

for (const participant of participants) {
  mptKeys.set(participant, new Map());

  for (const token of allowedTokens) {
    try {
      const mptKey = await bridgeContract.getL2MptKey(channelId, participant, token);
      mptKeys.get(participant)!.set(token, mptKey);

      console.log(`${participant.substring(0, 10)}... - ${token.substring(0, 10)}...: MPT Key = ${mptKey}`);
    } catch (error) {
      console.error(`Error fetching MPT key for ${participant} - ${token}:`, error);
      mptKeys.get(participant)!.set(token, 0n);
    }
  }
}
```

**Documentation Reference:**

- Storage: `mapping(address => mapping(address => uint256)) l2MptKeys;` in Channel struct
- Function: `getL2MptKey(uint256 channelId, address participant, address token) → uint256`

**Note:** If the MPT key is `0`, it means no deposit has been made yet for that participant-token pair.

---

## 3. L2 Address List

### Method 1: Derive from MPT Key (Recommended - Most Reliable)

**This is the most reliable method** since MPT keys are always available on-chain. The L2 address can be reverse-engineered from the MPT key using XOR operation.

```typescript
import { deriveL2AddressFromMptKey } from './constants';

// First, get MPT keys for all participants and tokens
const mptKeys = new Map<string, Map<string, bigint>>();
const l2Addresses = new Map<string, string>();

for (const participant of participants) {
  mptKeys.set(participant, new Map());

  for (const token of allowedTokens) {
    // Get MPT key from contract
    const mptKey = await bridgeContract.getL2MptKey(channelId, participant, token);
    mptKeys.get(participant)!.set(token, mptKey);

    // Derive L2 address from MPT key (if MPT key is not zero)
    if (mptKey !== 0n) {
      const mptKeyHex = '0x' + mptKey.toString(16).padStart(64, '0');
      const l2Address = deriveL2AddressFromMptKey(mptKeyHex, 0n, token);
      l2Addresses.set(participant, l2Address);
      console.log(`L2 Address for ${participant}: ${l2Address} (derived from MPT key)`);
      break; // One token is enough to get the L2 address
    }
  }
}
```

**How it works:**

- MPT key = `l2Address ^ slot ^ tokenAddress` (XOR operation)
- Reverse: `l2Address = mptKey ^ slot ^ tokenAddress`
- Slot is typically `0` for ERC20 balance storage

**Example with actual MPT key:**

```typescript
import { deriveL2AddressFromMptKey } from './constants';
import { TON_ADDRESS, WTON_ADDRESS } from './constants';

// Your actual MPT key from on-chain (as decimal or hex)
const mptKeyDecimal = '106333227096392236344952488842267144396529043294';
const mptKeyBigInt = BigInt(mptKeyDecimal);
const mptKeyHex = '0x' + mptKeyBigInt.toString(16).padStart(64, '0');

// Derive L2 address (try with TON first)
const l2AddressFromTON = deriveL2AddressFromMptKey(mptKeyHex, 0n, TON_ADDRESS);
console.log('L2 Address (from TON MPT key):', l2AddressFromTON);

// If TON doesn't match, try WTON
const l2AddressFromWTON = deriveL2AddressFromMptKey(mptKeyHex, 0n, WTON_ADDRESS);
console.log('L2 Address (from WTON MPT key):', l2AddressFromWTON);

// Verify by recreating MPT key
function recreateMptKey(l2Address: string, slot: bigint, tokenAddress: string): string {
  const l2AddressBigInt = BigInt(l2Address);
  const tokenBigInt = BigInt(tokenAddress);
  const mptKeyBigInt = l2AddressBigInt ^ slot ^ tokenBigInt;
  return '0x' + mptKeyBigInt.toString(16).padStart(64, '0');
}

// Check which one matches
const recreatedFromTON = recreateMptKey(l2AddressFromTON, 0n, TON_ADDRESS);
if (recreatedFromTON.toLowerCase() === mptKeyHex.toLowerCase()) {
  console.log('✅ Verified: MPT key was generated with TON address');
  console.log('   L2 Address:', l2AddressFromTON);
}
```

**Step-by-step calculation:**

1. Convert MPT key to hex: `106333227096392236344952488842267144396529043294` → `0x...`
2. Get token address (e.g., TON: `0xa30fe40285B8f5c0457DbC3B7C8A280373c40044`)
3. XOR operation: `l2Address = mptKey ^ 0 ^ tokenAddress`
4. Result is 20-byte L2 address

**Note:** XOR is reversible, so if `A ^ B = C`, then `C ^ B = A`. This is why we can reverse the operation.

### Method 2: Derive from Public Key (If Available)

**Note:** These functions may not exist in all contract versions. Always use Method 1 (MPT key) as the primary method.

If public key functions are available, you can try:

```typescript
import { publicKeyToL2Address } from './constants';

const l2Addresses: string[] = [];

for (const participant of participants) {
  try {
    // Try getParticipantPublicKey first (participant-specific)
    const [pkx, pky] = await bridgeContract.getParticipantPublicKey(channelId, participant);
    const l2Address = publicKeyToL2Address(pkx, pky);
    l2Addresses.push(l2Address);
  } catch (error1) {
    // Fallback to channel-level public key
    try {
      const [pkx, pky] = await bridgeContract.getChannelPublicKey(channelId);
      const l2Address = publicKeyToL2Address(pkx, pky);
      l2Addresses.push(l2Address);
    } catch (error2) {
      console.warn(`Could not get public key for ${participant}, use MPT key method instead`);
      // Use Method 1 (MPT key derivation) instead
    }
  }
}
```

**Important:**

- `getParticipantPublicKey()` and `getChannelPublicKey()` may not exist in the actual contract
- Always use MPT key derivation (Method 1) as the primary method
- Public key methods should only be used as a fallback or for verification

---

## 4. DKG Result (Public Key)

### ⚠️ Important Note

**The public key getter functions (`getChannelPublicKey`, `getParticipantPublicKey`) may not exist in the actual deployed contract**, even though they are mentioned in the documentation.

### Method 1: Try Public Key Functions (May Not Work)

If the functions exist, you can try:

```typescript
// Channel-level public key
try {
  const [pkx, pky] = await bridgeContract.getChannelPublicKey(channelId);
  console.log('Channel Public Key:');
  console.log('  pkx:', pkx.toString());
  console.log('  pky:', pky.toString());
} catch (error) {
  console.warn('getChannelPublicKey not available:', error);
}

// OR participant-specific public keys
for (const participant of participants) {
  try {
    const [pkx, pky] = await bridgeContract.getParticipantPublicKey(channelId, participant);
    console.log(`Public Key for ${participant}:`);
    console.log('  pkx:', pkx.toString());
    console.log('  pky:', pky.toString());
  } catch (error) {
    console.warn(`getParticipantPublicKey not available for ${participant}:`, error);
  }
}
```

### Method 2: Extract from Transaction Events (Alternative)

The public key might be available in the channel creation transaction or events. Check the transaction that created the channel:

```typescript
// Get channel creation transaction
const channelCreationTx = await provider.getTransaction(channelCreationTxHash);

// Decode the transaction to see if public key is in the parameters
// This depends on how the channel was created
```

### Method 3: Not Required for State Simulation

**For most use cases (state simulation, MPT key derivation), the public key is not required.** The L2 address can be derived directly from the MPT key (see Method 1 in section 3).

**Documentation Reference (may not match actual contract):**

- Storage: `uint256 pkx; uint256 pky;` in Channel struct (according to docs)
- Function: `getChannelPublicKey(uint256 channelId) → (uint256 pkx, uint256 pky)` (may not exist)
- Function: `getChannelSignerAddr(uint256 channelId) → address` (may not exist)

---

## 5. Initial Groth16 Proof

### Method: Extract from Transaction Data

The initial Groth16 proof is passed as calldata to the `initializeChannelState` function. You need to extract it from the transaction data.

```typescript
// Get the initializeChannelState transaction
const initializeTxHash = '0x...'; // Your transaction hash
const tx = await provider.getTransaction(initializeTxHash);

if (!tx || !tx.data) {
  throw new Error('Transaction not found or has no data');
}

// Decode the transaction to extract the proof
const iface = new ethers.Interface(['function initializeChannelState(uint256 channelId, bytes calldata proof)']);

try {
  const decoded = iface.parseTransaction({ data: tx.data });
  if (decoded && decoded.name === 'initializeChannelState') {
    const channelId = decoded.args[0];
    const proofBytes = decoded.args[1]; // This is the proof as bytes

    console.log('Channel ID:', channelId.toString());
    console.log('Proof Data Length:', proofBytes.length, 'bytes');
    console.log('Proof Data (hex):', proofBytes);

    // The proof is in bytes format and needs to be parsed according to your proof structure
    // You may need to decode it further based on your proof format
  }
} catch (error) {
  console.error('Could not decode transaction:', error);
}
```

**Alternative: Check Proof Manager Events**

The proof might also be available in events emitted by the Proof Manager contract. Check for events like `ProofSubmitted` or similar:

```typescript
// Query events from Proof Manager
const proofManagerContract = new ethers.Contract(
  ROLLUP_BRIDGE_PROOF_MANAGER_ADDRESS,
  [
    'event ProofSubmitted(uint256 indexed channelId, bytes proof)',
    'event StateInitialized(uint256 indexed channelId, bytes32 currentStateRoot)',
  ],
  provider,
);

// Filter events for the channel
const filter = proofManagerContract.filters.ProofSubmitted(channelId);
const events = await proofManagerContract.queryFilter(filter, fromBlock, toBlock);

for (const event of events) {
  console.log('Proof submitted at block:', event.blockNumber);
  console.log('Proof data:', event.args.proof);
}
```

**Note:** The exact event names and structure may vary. Check the Proof Manager contract ABI for the correct event signatures.

---

## Complete Example

Here's a complete function that fetches all required data:

```typescript
import { ethers } from 'ethers';
import {
  ROLLUP_BRIDGE_CORE_ADDRESS,
  ROLLUP_BRIDGE_CORE_ABI,
  ROLLUP_BRIDGE_PROOF_MANAGER_ADDRESS,
  SEPOLIA_RPC_URL,
} from './constants';
import { publicKeyToL2Address } from './constants';

interface OnChainChannelData {
  channelId: number;
  initialRoot: string;
  mptKeys: Map<string, Map<string, bigint>>; // participant -> token -> key
  l2Addresses: Map<string, string>; // participant -> l2Address
  publicKey?: { pkx: bigint; pky: bigint }; // May be undefined if function doesn't exist
  initialProof?: string; // Proof bytes if available
}

async function fetchAllOnChainData(channelId: number, initializeTxHash?: string): Promise<OnChainChannelData> {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);

  // 1. Get initial root and channel info
  const [allowedTokens, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(channelId);

  // 2. Get participants
  const participants = await bridgeContract.getChannelParticipants(channelId);

  // 3. Get MPT keys for all participants and tokens, and derive L2 addresses
  const mptKeys = new Map<string, Map<string, bigint>>();
  const l2Addresses = new Map<string, string>();

  for (const participant of participants) {
    mptKeys.set(participant, new Map());

    // Get MPT keys for each token and derive L2 address
    for (const token of allowedTokens) {
      try {
        const mptKey = await bridgeContract.getL2MptKey(channelId, participant, token);
        mptKeys.get(participant)!.set(token, mptKey);

        // Derive L2 address from MPT key (most reliable method)
        if (mptKey !== 0n && !l2Addresses.has(participant)) {
          const mptKeyHex = '0x' + mptKey.toString(16).padStart(64, '0');
          const l2Address = deriveL2AddressFromMptKey(mptKeyHex, 0n, token);
          l2Addresses.set(participant, l2Address);
        }
      } catch (error) {
        mptKeys.get(participant)!.set(token, 0n);
      }
    }
  }

  // 4. Try to get channel public key (DKG result) - may not exist
  let publicKey: { pkx: bigint; pky: bigint } | undefined;
  try {
    const [pkx, pky] = await bridgeContract.getChannelPublicKey(channelId);
    publicKey = { pkx, pky };
  } catch (error) {
    console.warn('getChannelPublicKey not available, skipping DKG result');
  }

  // 5. Try to get initial proof from transaction
  let initialProof: string | undefined;
  if (initializeTxHash) {
    try {
      const tx = await provider.getTransaction(initializeTxHash);
      if (tx && tx.data) {
        const iface = new ethers.Interface([
          'function initializeChannelState(uint256 channelId, bytes calldata proof)',
        ]);
        const decoded = iface.parseTransaction({ data: tx.data });
        if (decoded && decoded.name === 'initializeChannelState') {
          initialProof = decoded.args[1];
        }
      }
    } catch (error) {
      console.warn('Could not extract proof from transaction:', error);
    }
  }

  return {
    channelId,
    initialRoot,
    mptKeys,
    l2Addresses,
    publicKey, // May be undefined if getChannelPublicKey doesn't exist
    initialProof,
  };
}

// Usage
const channelData = await fetchAllOnChainData(1, '0x...');
console.log('Initial Root:', channelData.initialRoot);
console.log('L2 Addresses:', Array.from(channelData.l2Addresses.entries()));
if (channelData.publicKey) {
  console.log('Public Key:', channelData.publicKey);
} else {
  console.log('Public Key: Not available (function may not exist in contract)');
}
```

---

## Summary Table

| Data                         | Function                                                    | Notes                                                    |
| ---------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| **Initial Merkle Tree Root** | `getChannelInfo()` → 4th return value                       | Or from `StateInitialized` event                         |
| **MPT Key List**             | `getL2MptKey(channelId, participant, token)`                | Iterate over all participants and tokens                 |
| **L2 Address List**          | **Derive from MPT key** using `deriveL2AddressFromMptKey()` | **Most reliable method** - MPT keys are always available |
| **DKG Result (Public Key)**  | `getChannelPublicKey()` or `getParticipantPublicKey()`      | **⚠️ May not exist** - check contract ABI first          |
| **Initial Groth16 Proof**    | Extract from `initializeChannelState` transaction data      | Or from Proof Manager events                             |

---

## References

- [RollupBridgeCore Documentation](https://github.com/tokamak-network/Tokamak-zk-EVM-contracts/blob/4a1df40c7002018f6b86a99a646f85b07807ea11/RollupBridgeCore_Documentation.md)
- Contract Addresses: See `constants.ts` in this directory
- Example Usage: See `test-initial-state.ts`, `onchain-channel-simulation.ts`, `test-sequential-transactions.ts`
