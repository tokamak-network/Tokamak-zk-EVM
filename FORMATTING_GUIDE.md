# Tokamak zkEVM - Formatting Guide

## Philosophy

Our formatting approach prioritizes **information density** and **readability** over strict line length limits. The key principle is:

> **One piece of meaningful information = One line**

This means we avoid unnecessary line breaks that make code harder to scan and edit.

## Core Principles

### 1. Avoid Unnecessary Line Breaks

❌ **Don't** break down simple function calls across multiple lines:

```typescript
// BAD: Too many line breaks for simple operations
const senderL2PubKey = jubjub.Point.BASE.multiply(
  bytesToBigInt(senderL2PrvKey),
).toBytes();

// GOOD: Keep simple transformations on one line
const senderL2PubKey = jubjub.Point.BASE.multiply(bytesToBigInt(senderL2PrvKey)).toBytes();
```

### 2. One Information Unit Per Line

When dealing with arrays or lists, each meaningful piece of information gets one line:

❌ **Don't** break down function arguments unnecessarily:

```typescript
// BAD: Breaking down every nested call
publicKeyListL2: [
  jubjub.keygen(
    setLengthLeft(
      utf8ToBytes('0x838F176D94990E06af9B57E470047F9978403195'),
      32,
    ),
  ).publicKey,
]
```

✅ **Do** keep each data entry as a single line:

```typescript
// GOOD: One entry per line, compact and scannable
publicKeyListL2: [
  senderL2PubKey,
  TOKEN_RECEPIENT_PUB_KEY,
  jubjub.keygen(setLengthLeft(utf8ToBytes('0x838F176D94990E06af9B57E470047F9978403195'), 32)).publicKey,
  jubjub.keygen(setLengthLeft(utf8ToBytes('0x01E371b2aD92aDf90254df20EB73F68015E9A000'), 32)).publicKey,
  jubjub.keygen(setLengthLeft(utf8ToBytes('0xbD224229Bf9465ea4318D45a8ea102627d6c27c7'), 32)).publicKey,
]
```

### 3. Break Lines for Multiple Distinct Operations

✅ **Do** use line breaks when there are multiple distinct operations with meaningful parameters:

```typescript
// GOOD: Each operation is distinct and has meaningful parameters
program
  .command('run')
  .description('Run synthesizer for a given transaction hash')
  .argument('<txHash>', 'Ethereum transaction hash (0x...)')
  .option('-r, --rpc <url>', 'RPC URL for Ethereum node')
  .action(async (txHash: string, options: { rpc?: string }) => {
    // ...
  });
```

### 4. Constants Without Information Don't Need New Lines

If a parameter is a constant without semantic meaning (like buffer size), keep it inline:

```typescript
// GOOD: 32 is just a buffer size constant, no need for new line
const pubKey = keygen(setLengthLeft(utf8ToBytes(address), 32)).publicKey;

// But if parameters have semantic meaning, break them out:
const result = processTransaction(
  sender,    // Who is sending
  receiver,  // Who is receiving
  amount,    // How much
  timestamp, // When
);
```

### 5. Method Chaining Guidelines

- **Simple transformations** (like `.toBytes()`, `.toString()`, `.trim()`): Keep on the same line
- **Data processing** (like `.slice()`, `.map()`, `.filter()`): Consider line breaks for clarity

```typescript
// GOOD: Simple transformations stay inline
const result = data.process().toBytes();

// GOOD: Complex processing gets line breaks
const filtered = transactions
  .filter(tx => tx.value > MIN_VALUE)
  .map(tx => tx.hash)
  .slice(0, 10);
```

## Configuration

### Prettier Settings

Our `.prettierrc` is configured to support this philosophy:

- `printWidth: 120` - Wider lines to accommodate compact code
- `singleQuote: true` - Consistent string quoting
- `semi: true` - Always use semicolons
- `trailingComma: "all"` - Better git diffs
- `arrowParens: "avoid"` - Keep single-param arrows compact

### Editor Setup

1. **Install Extensions** (VSCode):
   - Prettier - Code formatter
   - ESLint

2. **Settings are automatic**: The `.vscode/settings.json` file will apply team settings automatically

3. **Format on save**: Enabled by default for all TypeScript/JavaScript files

### Manual Formatting

If you need to format files manually:

```bash
# Format all files
npm run format

# Check formatting without changing files
npm run format:check

# Lint and fix issues
npm run lint:fix
```

## When to Deviate

These are **guidelines**, not rigid rules. You can deviate when:

1. **Nested complexity** becomes hard to understand (use your judgment)
2. **Debugging** requires intermediate values to be visible
3. **Comments** need to explain specific parameters
4. **Very long lines** (>120 chars) hurt readability in specific contexts

## Examples

### Array of Complex Objects

```typescript
// GOOD: Each object is one logical unit
const transactions = [
  { from: alice, to: bob, amount: 100, timestamp: now },
  { from: bob, to: charlie, amount: 50, timestamp: now + 1 },
  { from: charlie, to: alice, amount: 75, timestamp: now + 2 },
];
```

### Function with Many Parameters

```typescript
// GOOD: Break by logical groups if helpful
const result = createTransaction(
  sender, receiver, amount,  // Core transaction data
  signature, nonce,          // Authentication
  { gasLimit: 21000, gasPrice: 1000000000 }  // Options
);

// Also acceptable: Keep on one line if under 120 chars
const hash = hashTransaction(sender, receiver, amount, nonce);
```

### Nested Function Calls

```typescript
// GOOD: Compact for simple nesting
const signature = sign(hash(serialize(transaction)));

// GOOD: Break for complex nesting with multiple params
const signature = sign(
  hash(serialize(transaction, { format: 'hex', encoding: 'utf8' })),
  privateKey,
  { algorithm: 'ECDSA' }
);
```

## Team Agreement

- ✅ Prioritize **readability through compactness**
- ✅ Use **information density** as the guide
- ✅ Trust **individual judgment** for specific cases
- ✅ Let **Prettier handle** spacing and indentation
- ❌ Don't break lines just to stay under character limits
- ❌ Don't over-nest or over-break simple operations

---

**Last Updated**: November 14, 2025
**Maintainer**: Tokamak Network Team

