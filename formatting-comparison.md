# Formatting Rules - Before vs After Comparison

This document shows real examples of how our new formatting rules work.

## Test Results from `formatting-test.ts`

### ✅ Example 1: Simple Method Chaining (Compact)

**Our Rule**: Keep simple transformations on one line

```typescript
// STAYS COMPACT - Good! ✅
const hash1 = createHash('sha256').update('hello world').digest('hex');
const result1 = Buffer.from(createHash('sha256').update('data').digest()).toString('hex');
```

**Why**: These are simple transformation chains with no complex logic

---

### ✅ Example 2: Array of Long Expressions

**Our Rule**: Each array entry = one line (even if long)

```typescript
// Each entry stays on one line - Good! ✅
const publicKeyList = [
  'simple-string-entry',
  createHash('sha256').update('address1').digest('hex'),
  createHash('sha256').update('address2').digest('hex'),
  createHash('sha256').update('address3').digest('hex'),
];
```

**Why**: Each entry is one piece of information (one address)

---

### ⚠️ Example 3: Very Long Line (Automatic Break)

**Our Rule**: 120 char limit triggers automatic break

```typescript
// Prettier automatically breaks this (exceeds 120 chars)
const publicKeyList = [
  createHash('sha256')
    .update('very-long-address-that-might-exceed-eighty-characters-but-stays-on-one-line')
    .digest('hex'),
];
```

**Note**: This is the only case where Prettier broke the line. The string itself was too long, so Prettier made a judgment call. This is acceptable.

---

### ✅ Example 4: Function Parameters

**Our Rule**: Keep on one line if under 120 chars

```typescript
// Prettier kept this on one line - Good! ✅
function createTransaction(sender: string, receiver: string, amount: number, timestamp: number, signature: string) {
  return { sender, receiver, amount, timestamp, signature };
}
```

**Why**: Function signature is under 120 chars, so it stays compact

---

### ✅ Example 5: Method Chaining with Distinct Operations

**Our Rule**: Break lines for distinct operations

```typescript
// Each operation gets its own line - Good! ✅
app
  .command('run')
  .description('Run synthesizer for a given transaction hash')
  .argument('<txHash>', 'Ethereum transaction hash (0x...)')
  .option('-r, --rpc <url>', 'RPC URL for Ethereum node')
  .action(async (txHash: string, options: { rpc?: string }) => {
    console.log(`Processing ${txHash}`);
  });
```

**Why**: Each method call is a distinct operation with meaningful parameters

---

### ✅ Example 6: Objects Stay Formatted

```typescript
// Object formatting unchanged - Good! ✅
const config = {
  host: 'localhost',
  port: 8545,
  network: 'mainnet',
  timeout: 30000,
  retries: 3,
};
```

**Why**: Object properties are always distinct pieces of information

---

### ✅ Example 7: Complex Inline Expression

**Our Rule**: Keep inline if it's under 120 chars

```typescript
// Stays on one line - Good! ✅
const processedData = someFunction(inputData, transformData(rawInput, 32, 'utf8', true), outputFormat);
```

**Why**: Under 120 chars, and `32`, `'utf8'`, `true` are just constants

---

### ✅ Example 8: Object with Method Calls

```typescript
// Each property on one line - Good! ✅
const transaction = {
  from: createHash('sha256').update('sender').digest('hex'),
  to: createHash('sha256').update('receiver').digest('hex'),
  value: 1000,
  data: Buffer.from('transaction data').toString('hex'),
  signature: createHash('sha256').update('signature').digest('hex'),
};
```

**Why**: Each property value is a complete transformation chain

---

### ✅ Example 9: Array of Objects

```typescript
// Compact objects in array - Good! ✅
const transactions = [
  { from: 'alice', to: 'bob', amount: 100 },
  { from: 'bob', to: 'charlie', amount: 50 },
  { from: 'charlie', to: 'alice', amount: 75 },
];
```

**Why**: Small objects stay inline, one per array entry

---

### ✅ Example 10: Ternary Expressions

```typescript
// Ternary stays compact - Good! ✅
const value = someCondition ? calculateValue(input1, input2, input3) : getDefaultValue();
```

**Why**: Simple ternary under 120 chars stays on one line

---

## Comparison: Old vs New Settings

### Old Settings (printWidth: 80)

```typescript
// ❌ Would have broken this unnecessarily
const senderL2PubKey = jubjub.Point.BASE.multiply(bytesToBigInt(senderL2PrvKey)).toBytes();

// ❌ Would have broken array entries
publicKeyListL2: [
  jubjub.keygen(setLengthLeft(utf8ToBytes('0x838F176D94990E06af9B57E470047F9978403195'), 32)).publicKey,
];
```

### New Settings (printWidth: 120)

```typescript
// ✅ Stays compact and readable
const senderL2PubKey = jubjub.Point.BASE.multiply(bytesToBigInt(senderL2PrvKey)).toBytes();

// ✅ Each entry is one line
publicKeyListL2: [
  jubjub.keygen(setLengthLeft(utf8ToBytes('0x838F176D94990E06af9B57E470047F9978403195'), 32)).publicKey,
];
```

---

## Summary of Results

| Scenario                       | Behavior                          | Result        |
| ------------------------------ | --------------------------------- | ------------- |
| Simple method chains           | Stays on one line                 | ✅ Perfect    |
| Array entries                  | One line each (unless >120 chars) | ✅ Perfect    |
| Function params                | One line if <120 chars            | ✅ Perfect    |
| Method chaining (distinct ops) | Breaks per operation              | ✅ Perfect    |
| Objects                        | Properties on separate lines      | ✅ Perfect    |
| Nested functions               | Compact if <120 chars             | ✅ Perfect    |
| Very long expressions (>120)   | Automatic break                   | ⚠️ Acceptable |

## Conclusion

The new formatting rules work exactly as intended! 🎉

- **Compact code**: ✅ Achieved
- **Information density**: ✅ Maintained
- **Readability**: ✅ Improved
- **120 char limit**: ✅ Respected when necessary

The only automatic breaks happen when lines truly exceed 120 characters, which is the expected behavior.

---

**Generated**: November 14, 2025
**Test File**: `formatting-test.ts`
