# MPT (Merkle Patricia Tree) Key Explanation

## What is MPT?

**MPT (Merkle Patricia Tree)** is a data structure used in Ethereum to store and verify state data efficiently. In the context of Tokamak zkEVM:

- **MPT Key** = Storage key used to identify a specific storage location in the L2 state
- **MPT Value** = The actual data stored at that location (e.g., ERC20 balance)
- **Merkle Tree** = Used to compute a state root that can be verified on-chain

## Current Implementation: XOR-Based MPT Key

### Formula

```typescript
MPT Key = L2 Address ^ Slot ^ Token Address
```

Where:
- `L2 Address`: 20-byte address derived from participant's public key
- `Slot`: Storage slot (typically 0 for ERC20 balance)
- `Token Address`: Token contract address (e.g., TON, WTON)

### Example

```typescript
// L2 Address
const l2Address = "0xb1afc197e193f544f6c00a98b4dbb8cb4105871a";

// Slot (ERC20 balance)
const slot = 0n;

// Token Address (TON)
const tokenAddress = "0xa30fe40285B8f5c0457DbC3B7C8A280373c40044";

// MPT Key = l2Address ^ slot ^ tokenAddress
const mptKey = l2Address ^ slot ^ tokenAddress;
// Result: 0x00000000000000000000000012a02595642b0084b3bdb6a3c85190c832c1875e
```

## Why XOR Instead of Standard EVM keccak256?

### Standard EVM Approach

In standard Ethereum, storage keys for mappings are calculated using:

```solidity
// Standard EVM
keccak256(abi.encodePacked(address, slot))
```

This is a **one-way hash function** - you cannot reverse it to get the original address.

### Tokamak L2 Approach: XOR

```typescript
// Tokamak L2
l2Address ^ slot ^ tokenAddress
```

This is a **reversible operation** - you can derive the L2 address from the MPT key.

### Reasons for Using XOR

#### 1. **ZK Circuit Efficiency** 🔐

- **Poseidon Hash**: ZK circuits use Poseidon hash (not keccak256) for efficiency
- **Field Arithmetic**: XOR operations are simpler in finite field arithmetic
- **Circuit Size**: XOR is cheaper to prove in ZK circuits than keccak256

#### 2. **Reversibility** 🔄

XOR is **reversible**, which allows:
- Deriving L2 address from on-chain MPT key
- No need to store L2 addresses separately
- Can reconstruct state from MPT keys alone

```typescript
// Forward: Generate MPT key
mptKey = l2Address ^ slot ^ tokenAddress

// Reverse: Derive L2 address
l2Address = mptKey ^ slot ^ tokenAddress
```

#### 3. **Token Isolation** 🪙

Including token address in XOR ensures:
- Same L2 address + different tokens = different MPT keys
- Prevents storage collisions
- Each token has its own isolated storage space

```typescript
// Same L2 address, different tokens
const mptKeyTON  = l2Address ^ 0n ^ TON_ADDRESS;
const mptKeyWTON = l2Address ^ 0n ^ WTON_ADDRESS;
// These are different!
```

#### 4. **On-Chain Storage Efficiency** 💾

- MPT keys are stored on-chain in the bridge contract
- Can derive L2 addresses from MPT keys when needed
- Reduces storage requirements

#### 5. **Compatibility with ZK Proofs** ✅

- Merkle tree proofs use Poseidon hash
- XOR-based keys work well with Poseidon-based Merkle trees
- Efficient proof generation and verification

## Comparison: Standard EVM vs Tokamak L2

| Aspect | Standard EVM | Tokamak L2 |
|--------|-------------|------------|
| **Key Generation** | `keccak256(address, slot)` | `address ^ slot ^ tokenAddress` |
| **Reversibility** | ❌ One-way (cannot reverse) | ✅ Reversible (can derive address) |
| **Hash Function** | keccak256 | XOR (no hash needed) |
| **ZK Circuit Cost** | High (keccak256 is expensive) | Low (XOR is cheap) |
| **Token Support** | Separate mappings per token | Token address in key |
| **On-Chain Storage** | Store addresses separately | Derive from MPT keys |

## How MPT Keys Are Used

### 1. State Initialization

```typescript
// Get MPT keys from on-chain
const mptKey = await bridgeContract.getL2MptKey(channelId, participant, token);

// Use MPT key as storage key in Merkle tree
registeredKeys.push(mptKey);
storageEntries.push({
  key: mptKey,
  value: depositAmount
});
```

### 2. Merkle Tree Construction

MPT keys are used as leaves in the Merkle tree:

```
Leaf = Poseidon(MPT Key, Storage Value)
```

The Merkle root is computed from all leaves and stored on-chain as the state root.

### 3. State Verification

On-chain verifiers can:
1. Receive MPT keys and values
2. Reconstruct Merkle tree
3. Verify the computed root matches the on-chain state root
4. Verify ZK proof that the computation was correct

## Security Considerations

### ✅ Advantages

1. **Deterministic**: Same inputs always produce same MPT key
2. **Collision Resistant**: Different (address, slot, token) combinations produce different keys
3. **Verifiable**: Can verify MPT key generation on-chain
4. **ZK Friendly**: Efficient in zero-knowledge circuits

### ⚠️ Considerations

1. **XOR Properties**: XOR has some mathematical properties that need careful handling
2. **Token Address Required**: Must know token address to derive L2 address
3. **Slot Must Match**: Must use correct slot (0 for ERC20 balance)

## Practical Example

```typescript
// Step 1: Get MPT key from on-chain
const mptKey = await bridgeContract.getL2MptKey(channelId, participant, token);
// Result: 106333227096392236344952488842267144396529043294

// Step 2: Derive L2 address
const l2Address = deriveL2AddressFromMptKey(mptKeyHex, 0n, tokenAddress);
// Result: 0xb1afc197e193f544f6c00a98b4dbb8cb4105871a

// Step 3: Verify by recreating MPT key
const recreated = generateL2StorageKey(l2Address, 0n, tokenAddress);
// Should match original mptKey
```

## Summary

**MPT Key** in Tokamak zkEVM:
- Is a **storage identifier** for L2 state
- Uses **XOR operation** instead of keccak256 hash
- Is **reversible** (can derive L2 address from key)
- Is **ZK-friendly** (efficient in zero-knowledge circuits)
- Includes **token address** to prevent collisions
- Is stored **on-chain** and used for state verification

This design balances:
- ✅ ZK circuit efficiency
- ✅ On-chain storage efficiency
- ✅ State verification capabilities
- ✅ Multi-token support

---

**References:**
- `constants.ts`: `generateL2StorageKey()`, `deriveL2AddressFromMptKey()`
- `TokamakL2StateManager.ts`: Merkle tree construction
- `BLS12-Poseidon-Merkle-tree-Groth16/`: ZK circuit implementation

