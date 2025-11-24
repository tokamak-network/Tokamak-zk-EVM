# 🚨 Security Analysis: NOT REGISTERED Storage Slots

**Date**: 2025-11-21
**Severity**: **HIGH**
**Status**: **REQUIRES IMMEDIATE REVIEW**

---

## Executive Summary

The current State Channel implementation has a **critical security vulnerability** regarding NOT REGISTERED storage slots (e.g., Slot 7 = totalSupply). These slots are:

- ✅ Included in PUBLIC_IN (proof input)
- ❌ NOT included in Merkle tree
- ❌ NOT included in state root
- ❌ NOT verifiable by L1 contract

**Impact**: Malicious participants can provide arbitrary values for NOT REGISTERED slots without detection.

---

## Technical Analysis

### 1. How REGISTERED Slots Work (e.g., Slot 0 = user balance)

```typescript
// instructionHandler.ts:583-607
if (MTIndex >= 0) {
  // ✅ REGISTERED: Read from L1, verify with Merkle proof
  const valueStored = await stateManager.getStorage(...);
  const valuePt = this.parent.addReservedVariableToBufferIn(
    'IN_VALUE',  // Goes into PUBLIC_IN
    resolved,
    true,
    `at MT index ${MTIndex}`
  );
  // Merkle proof will be verified on-chain
}
```

**Flow**:

1. Load from L1 StateManager
2. Add to PUBLIC_IN as `IN_VALUE`
3. Include in Merkle tree (TokamakL2StateManager.ts:93-106)
4. Generate Merkle proof
5. L1 verifier checks: `MerkleProof(leaf) == StateRoot`

### 2. How NOT REGISTERED Slots Work (e.g., Slot 7 = totalSupply)

```typescript
// instructionHandler.ts:610-621
// Cold access to general contract storage (non-user slot)
if (value === undefined) {
  throw new Error('Storage value must be presented');
}
const valuePt = this.parent.addReservedVariableToBufferIn(
  'OTHER_CONTRACT_STORAGE_IN', // Goes into PUBLIC_IN
  value, // ⚠️ No verification!
  true,
  `at MPT key ${bigIntToHex(key)}`,
);
```

**Flow**:

1. Value must be provided by caller
2. Add to PUBLIC_IN as `OTHER_CONTRACT_STORAGE_IN`
3. **NOT** included in Merkle tree
4. **NO** Merkle proof
5. L1 verifier receives value but **cannot verify** it!

### 3. State Root Calculation

```typescript
// TokamakL2StateManager.ts:93-106
public async convertLeavesIntoMerkleTreeLeaves(): Promise<bigint[]> {
  for (var index = 0; index < MAX_MT_LEAVES; index++) {
    const key = this.registeredKeys![index];  // Only REGISTERED keys!
    if (key === undefined) {
      leaves[index] = 0n;
    } else {
      const val = await this.getStorage(contractAddress, key);
      leaves[index] = poseidon_raw([BigInt(index), bytesToBigInt(key), bytesToBigInt(val), 0n]);
    }
  }
  return leaves;  // NOT REGISTERED slots are NOT included!
}
```

**State Root Only Includes**:

- ✅ Slot 0 (user balances) - userStorageSlots: [0]
- ❌ Slot 1 (allowances)
- ❌ Slot 2 (totalSupply)
- ❌ Slot 3-7 (other metadata)

### 4. L1 Verifier Limitations

```solidity
// VerifierV1.sol:1640-1655
// Step3: computation of A_pub
computeAPUB()

// Step4: computation of the final polynomial commitments
prepareLHSA()
prepareLHSB()
prepareLHSC()
prepareRHS1()
prepareRHS2()

// Step5: final pairing
final_result := finalPairing()
```

**What L1 Verifier Checks**:

- ✅ zkSNARK proof validity (pairing equation)
- ✅ Public inputs match (a_pub)
- ✅ Initial/Final state roots match Merkle tree
- ❌ **Does NOT verify OTHER_CONTRACT_STORAGE_IN values**

---

## Attack Scenario

### Scenario 1: totalSupply Manipulation

```typescript
// Malicious participant proposes off-chain TX
const maliciousProof = await synthesizeFromCalldata(calldata, {
  contractAddress: TON_CONTRACT,
  userStorageSlots: [0], // Only Slot 0 registered
  // ... other params
});

// During execution, EVM reads Slot 7 (totalSupply)
// SLOAD at key=7:
//   Real value:      1,000,000 TON
//   Provided value: 99,999,999 TON  ⚠️ Malicious!

// Circuit generates proof with:
//   - OTHER_CONTRACT_STORAGE_IN = 99,999,999
//   - State root unchanged (only includes Slot 0)

// L1 verifier accepts proof because:
//   1. zkSNARK proof is valid ✅
//   2. State root matches (Slot 0 correct) ✅
//   3. Cannot verify OTHER_CONTRACT_STORAGE_IN ❌
```

### Scenario 2: Allowance Manipulation

```typescript
// Alice approves Bob: 100 TON (Slot 1)
// Real allowance[Alice][Bob] = 100 TON

// Bob proposes malicious TX:
//   Claim allowance[Alice][Bob] = 9999 TON
//   Transfer 9999 TON from Alice to Bob

// Circuit accepts because:
//   - Allowance (Slot 1) is NOT REGISTERED
//   - Bob provides fake value: 9999 TON
//   - No Merkle proof to verify

// Final state:
//   - Alice balance: -9899 TON (underflow or revert)
//   - Bob balance: +9999 TON
//   - State root only tracks balances (Slot 0)
```

---

## Why This Exists

### Design Rationale (Assumed)

1. **Gas Optimization**:

   - Only track user balances (Slot 0)
   - Reduce Merkle tree size
   - Lower proof generation cost

2. **State Channel Assumption**:

   - Only `transfer()` function used
   - No `transferFrom()` (requires allowances)
   - No `mint()`/`burn()` (requires totalSupply)

3. **Limited Scope**:
   - Participants only care about their own balances
   - Other metadata "doesn't matter" for transfers

### Why This is Dangerous

1. **EVM Execution Can Read Any Slot**:

   - Even simple `transfer()` might read totalSupply
   - ERC20 implementations vary
   - Proxies/upgradeable contracts might add logic

2. **No Runtime Verification**:

   - Circuit accepts any value for NOT REGISTERED slots
   - L1 verifier cannot cross-check

3. **Multi-Participant Trust**:
   - One malicious participant can cheat
   - Other participants verify locally but...
   - Different nodes might provide different slot values

---

## Proposed Solutions

### Option 1: Register All Read Slots (RECOMMENDED)

```typescript
// Analyze bytecode to find all SLOAD operations
const analyzedSlots = await analyzeBytecode(contractAddress);

// Register all slots that might be read
userStorageSlots: analyzedSlots; // e.g., [0, 1, 2, 7]
```

**Pros**:

- Complete security
- All storage changes tracked in state root
- L1 verifiable

**Cons**:

- Larger Merkle tree
- Higher proof cost
- More complex setup

### Option 2: Static Analysis + Whitelist

```typescript
// Only allow functions that touch known slots
const ALLOWED_SELECTORS = [
  '0xa9059cbb', // transfer(address,uint256) - only reads Slot 0
];

// Reject if function reads unexpected slots
if (sloadKey !== expectedSlot) {
  throw new Error(`Unexpected SLOAD at slot ${sloadKey}`);
}
```

**Pros**:

- Maintains gas efficiency
- Prevents unexpected behavior

**Cons**:

- Limited functionality
- Requires manual auditing
- Breaks with upgrades

### Option 3: Optimistic Verification

```typescript
// Include OTHER_CONTRACT_STORAGE_IN in fraud proof challenge
// L1 contract:
function challengeOtherStorage(
  uint256 key,
  uint256 claimedValue,
  bytes32 stateRoot
) external {
  uint256 actualValue = ITarget(targetContract).getStorageAt(key);
  require(actualValue != claimedValue, "No fraud");

  // Slash malicious participant
  slashProposer(stateRoot);
}
```

**Pros**:

- Maintains efficiency
- Fraud proofs provide security

**Cons**:

- Complex implementation
- Requires challenge period
- Liveness assumptions

### Option 4: Restrict to Balance-Only Contracts

```typescript
// Only support contracts where:
// 1. Only Slot 0 is ever read/written
// 2. No totalSupply checks
// 3. No allowance logic
// 4. Simple token transfers only

// Deploy custom ERC20 for State Channels
contract StateChannelToken {
  mapping(address => uint256) public balances;  // Slot 0 only

  function transfer(address to, uint256 amount) external {
    require(balances[msg.sender] >= amount);
    balances[msg.sender] -= amount;
    balances[to] += amount;
  }
}
```

**Pros**:

- Minimal complexity
- Maximum efficiency

**Cons**:

- Not compatible with existing tokens
- Limited functionality

---

## Recommended Action

### Immediate (Short-term)

1. **Add Warning Documentation**:

   - Document that NOT REGISTERED slots are unverified
   - Warn about security implications
   - Recommend thorough testing

2. **Add Runtime Checks**:

   ```typescript
   if (MTIndex < 0 && process.env.NODE_ENV !== 'test') {
     throw new Error(
       `SECURITY: Attempted to read NOT REGISTERED slot ${key}. ` +
         `This value cannot be verified by L1 and may be tampered with!`,
     );
   }
   ```

3. **Bytecode Analysis**:
   - Analyze target contract before synthesis
   - Auto-detect all SLOAD operations
   - Require all read slots to be registered

### Long-term (Production)

1. **Implement Option 1** (Register All Read Slots):

   - Automatic slot detection
   - Full Merkle tree coverage
   - Complete L1 verification

2. **Add Circuit Constraints**:

   - Verify OTHER_CONTRACT_STORAGE_IN against L1 state root
   - Require Merkle proofs for ALL storage reads

3. **Audit & Formal Verification**:
   - Security audit of storage handling
   - Formal verification of state root correctness
   - Prove that all storage reads are verifiable

---

## References

- Code: `packages/frontend/synthesizer/src/synthesizer/handlers/instructionHandler.ts:610-621`
- Code: `packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts:93-106`
- Verifier: `packages/backend/verify/solidity/src/VerifierV1.sol`

---

## Conclusion

**The current implementation is UNSAFE for production use with NOT REGISTERED storage slots.**

All storage slots that might be read during EVM execution MUST be registered in `userStorageSlots` to ensure L1 verifiability. Otherwise, malicious participants can provide arbitrary values that will be accepted by the circuit but cannot be verified on-chain.

**Next Steps**:

1. Review this analysis with the team
2. Decide on mitigation strategy
3. Implement solution before production deployment
4. Add comprehensive tests for storage slot handling
