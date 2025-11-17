# SynthesizerAdapter Update - Migration Guide

## What Changed

The `SynthesizerAdapter` has been completely rewritten to match the new Synthesizer core architecture used in `main.ts` examples.

## Old Architecture (Deprecated)

```typescript
// ❌ OLD - No longer works
const adapter = new SynthesizerAdapter(rpcUrl, isMainnet);
const { evm, executionResult, permutation } = await adapter.parseTransaction({
  txHash,
  contractAddr,
  calldata,
  sender,
});
```

**Problems**:
- Used `createEVM()` which was refactored
- Direct `evm.runCode()` call (old pattern)
- Referenced `Finalizer` directly (changed location/API)
- Didn't match the `main.ts` pattern

## New Architecture (Current)

```typescript
// ✅ NEW - Matches main.ts pattern
const adapter = new SynthesizerAdapter({ rpcUrl });
const result = await adapter.synthesize(txHash, outputPath);

// Returns:
// {
//   instance: { a_pub: [...] },
//   placementVariables: [...],
//   permutation: { sigma: [...], m_i, n_pub },
//   metadata: { txHash, blockNumber, ... }
// }
```

## Key Differences

### 1. Constructor
```typescript
// OLD
new SynthesizerAdapter(rpcUrl: string, isMainnet: boolean)

// NEW
new SynthesizerAdapter({ rpcUrl: string })
```

### 2. Method Names
```typescript
// OLD
adapter.parseTransaction({ txHash, ... })
adapter.parseTransactionByHash(txHash)

// NEW
adapter.synthesize(txHash, outputPath?)
adapter.parseTransactionByHash(txHash, outputPath?) // Still available for compatibility
```

### 3. Internal Flow

**OLD**:
```
createEVM() → evm.runCode() → Finalizer.exec() → return data
```

**NEW**:
```
createSynthesizerOptsForSimulationFromRPC()
  ↓
createSynthesizer(opts)
  ↓
synthesizer.synthesizeTX()
  ↓
createCircuitGenerator(synthesizer)
  ↓
access circuitGenerator.variableGenerator data
```

### 4. Return Type

**OLD**:
```typescript
{
  evm: EVM,
  executionResult: ExecResult,
  permutation: Permutation
}
```

**NEW**:
```typescript
{
  instance: { a_pub: string[] },
  placementVariables: any[],
  permutation: { sigma: number[], m_i: number, n_pub: number },
  metadata: { txHash, blockNumber, from, to, contractAddress, eoaAddresses }
}
```

### 5. Address Handling

**OLD**: Required explicit contract address, sender, calldata validation

**NEW**: Automatically extracts EOA addresses from transaction and logs
```typescript
// Automatically detects:
// - Sender from tx.from
// - Receiver from Transfer event logs
// - Generates L2 keypairs for state channel
```

## Migration Examples

### Basic Usage

```typescript
// OLD
const adapter = new SynthesizerAdapter('https://eth-mainnet.g.alchemy.com/v2/KEY', true);
const { permutation } = await adapter.parseTransaction({
  txHash: '0x123...',
  contractAddr: '0xabc...',
  sender: '0xdef...',
});
const a_pub = permutation.a_pub;

// NEW
const adapter = new SynthesizerAdapter({ rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/KEY' });
const result = await adapter.synthesize('0x123...');
const a_pub = result.instance.a_pub;
```

### With File Output

```typescript
// OLD
const { permutation } = await adapter.parseTransaction({
  txHash: '0x123...',
  outputPath: './outputs',
});

// NEW
const result = await adapter.synthesize('0x123...', './outputs');
// Files written to ./outputs/instance.json, placementVariables.json, permutation.json
```

### Browser Usage

```typescript
// OLD
import { SynthesizerAdapter } from './interface/adapters/synthesizerAdapter';
const adapter = new SynthesizerAdapter(rpcUrl, true);
const { permutation } = await adapter.parseTransaction({ txHash });

// NEW (same for browser!)
import { BrowserSynthesizerAdapter } from '@tokamak-zk-evm/synthesizer/browser';
const adapter = new BrowserSynthesizerAdapter({ rpcUrl });
const result = await adapter.synthesize(txHash);
```

## New Features

### 1. Automatic EOA Detection
```typescript
// Automatically finds:
// - Sender address (tx.from)
// - Receiver address (from Transfer event logs)
// - Generates L2 keypairs for all participants
```

### 2. L2 State Channel Support
```typescript
// Uses the L2 state channel architecture:
// - TokamakL2StateManager
// - L2 keypairs for privacy
// - Poseidon hashing
// - EdDSA signatures
```

### 3. Better Metadata
```typescript
result.metadata = {
  txHash: '0x123...',
  blockNumber: 12345,
  from: '0xabc...',
  to: '0xdef...',
  contractAddress: '0xdef...',
  eoaAddresses: ['0xabc...', '0xdef...', ...]
}
```

## Breaking Changes Checklist

- [ ] Update constructor: remove `isMainnet` parameter
- [ ] Update method calls: `parseTransaction()` → `synthesize()`
- [ ] Update return type handling: access `result.instance.a_pub` instead of `permutation.a_pub`
- [ ] Remove manual address/calldata validation (now automatic)
- [ ] Update metadata access: new structure with more info

## Dependencies

### New Dependencies Required:
```json
{
  "ethers": "^6.13.4",
  "@noble/curves": "^1.x",
  "@ethereumjs/util": "^9.x"
}
```

### Imports Updated:
```typescript
// Now uses:
import { createSynthesizerOptsForSimulationFromRPC } from '../rpc/rpc.ts';
import { createSynthesizer } from '../../synthesizer/index.ts';
import { createCircuitGenerator } from '../../circuitGenerator/circuitGenerator.ts';
```

## Compatibility

### Backward Compatibility
- `parseTransactionByHash()` still available (redirects to `synthesize()`)
- File output still works if `outputPath` provided
- In-memory access is default (no files if path not provided)

### Forward Compatibility
- Matches the pattern used in examples (`main.ts`)
- Uses the official core API (`createSynthesizer`, etc.)
- Ready for future Synthesizer updates

## Testing

```typescript
// Test basic synthesis
const adapter = new SynthesizerAdapter({ rpcUrl: RPC_URL });
const result = await adapter.synthesize(TX_HASH);
assert(result.instance.a_pub.length > 0);
assert(result.metadata.txHash === TX_HASH);

// Test with file output
await adapter.synthesize(TX_HASH, './test-outputs');
assert(fs.existsSync('./test-outputs/instance.json'));

// Test browser compatibility
const browserAdapter = new BrowserSynthesizerAdapter({ rpcUrl: RPC_URL });
const browserResult = await browserAdapter.synthesize(TX_HASH);
assert.deepEqual(browserResult.instance, result.instance);
```

## Questions?

Check:
- `examples/L2TONTransfer/main.ts` - Reference implementation
- `src/interface/rpc/rpc.ts` - RPC option creation
- `src/cli/index.ts` - CLI usage example
- `BROWSER_IMPLEMENTATION.md` - Browser-specific details

---

**Migration completed**: The adapter now fully matches the new Synthesizer architecture! 🎉

