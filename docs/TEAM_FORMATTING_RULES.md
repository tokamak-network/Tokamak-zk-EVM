# Team Formatting Rules - Summary

**Date**: November 14, 2025
**Discussion Reference**: Jake's feedback on PR #135

## TL;DR

✅ **Compact code is preferred** - Avoid unnecessary line breaks
✅ **120 character line width** - Up from 80
✅ **One info unit = one line** - Don't break down simple operations
✅ **Auto-formatting on save** - VSCode configured for team

## What Changed

### 1. Prettier Configuration

**Before**:
```json
{
  "printWidth": 80,
  "semi": false,  // Inconsistent across configs
}
```

**After**:
```json
{
  "printWidth": 120,
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "arrowParens": "avoid"
}
```

### 2. New Files Created

- **`.vscode/settings.json`** - Team VSCode settings (format on save)
- **`.editorconfig`** - Cross-editor consistency
- **`.prettierignore`** - Files to skip formatting
- **`FORMATTING_GUIDE.md`** - Detailed philosophy and examples
- **`FORMATTING_SETUP.md`** - How to set up your editor

### 3. New NPM Scripts

```bash
npm run format         # Format all code
npm run format:check   # Check formatting without changes
npm run lint:fix       # Auto-fix lint issues
```

## Key Examples

### ❌ Before (Too many line breaks)

```typescript
const senderL2PubKey = jubjub.Point.BASE.multiply(
  bytesToBigInt(senderL2PrvKey),
).toBytes();

publicKeyListL2: [
  jubjub.keygen(
    setLengthLeft(
      utf8ToBytes('0x838F176D94990E06af9B57E470047F9978403195'),
      32,
    ),
  ).publicKey,
]
```

### ✅ After (Compact and readable)

```typescript
const senderL2PubKey = jubjub.Point.BASE.multiply(bytesToBigInt(senderL2PrvKey)).toBytes();

publicKeyListL2: [
  jubjub.keygen(setLengthLeft(utf8ToBytes('0x838F176D94990E06af9B57E470047F9978403195'), 32)).publicKey,
]
```

## Philosophy

### The "Information Density" Principle

> Each line should contain one **meaningful unit of information**, not be arbitrarily broken at character limits.

**Examples**:

```typescript
// GOOD: One transformation chain = one line
const hash = sha256(serialize(transaction)).toHex();

// GOOD: Each array entry = one line (even if long)
const addresses = [
  computeAddress(keygen(privateKey1).publicKey),
  computeAddress(keygen(privateKey2).publicKey),
  computeAddress(keygen(privateKey3).publicKey),
];

// GOOD: Distinct operations get separate lines
program
  .command('run')
  .description('Run synthesizer for a given transaction hash')
  .argument('<txHash>', 'Ethereum transaction hash (0x...)')
  .option('-r, --rpc <url>', 'RPC URL for Ethereum node');
```

### When to Break Lines

✅ **DO break lines** for:
- Multiple distinct operations (like `.command()`, `.option()`)
- Complex function calls with many meaningful parameters
- Objects with multiple properties

❌ **DON'T break lines** for:
- Simple constant parameters (like buffer size `32`)
- Method chaining for transformations (`.toBytes()`, `.toString()`)
- Single complex expressions (better to extract to variable if too complex)

## Setup Instructions

### For VSCode Users (Recommended)

1. **Install Extensions**:
   - Prettier - Code formatter
   - ESLint

2. **Reload VSCode** - Settings will apply automatically from `.vscode/settings.json`

3. **Format on save** is enabled by default

### For Other Editors

1. Install Prettier and ESLint plugins
2. Configure them to use workspace settings
3. The `.editorconfig` will handle basic settings

### Manual Commands

```bash
# Format files
npm run format

# Check formatting
npm run format:check

# Fix lint errors
npm run lint:fix
```

## Team Agreement

✅ We prioritize **readability through compactness**
✅ We use **information density** as our guide
✅ We trust **individual judgment** for specific cases
✅ We let **automated tools** handle the details
❌ We don't break lines just to satisfy character limits
❌ We don't apply formatting rules blindly

## Discussion Points for Meeting

1. ✅ **Approved**: 120 character line width
2. ✅ **Approved**: Compact style over aggressive line breaking
3. ✅ **Approved**: Auto-format on save in VSCode
4. 🤔 **To discuss**: Pre-commit hooks (optional)
5. 🤔 **To discuss**: CI/CD formatting checks

## Questions?

- **"What if a line is too long?"** - Use judgment. Extract to a variable if it's truly complex.
- **"What about existing code?"** - We'll format gradually as we touch files, not all at once.
- **"What if I disagree with a format?"** - Discuss with team and update this guide.

## Resources

- **`FORMATTING_GUIDE.md`** - Detailed guide with many examples
- **`FORMATTING_SETUP.md`** - Technical setup instructions
- **`.prettierrc`** - Actual Prettier configuration

---

**Next Steps**:
1. Team reviews this document
2. Everyone sets up their editor (5 minutes)
3. Start using the new rules for new code
4. Gradually update existing code as we touch it

**Remember**: Tools serve us, we don't serve tools. These rules help us write better code, not restrict us.

