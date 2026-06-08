# Verify-WASM NPM Usage

> Deprecated: The WASM verifier packages are no longer officially supported.
>
> This document is retained only as historical and reference material. Do not use the WASM verifier packages for new integrations. For local verification, use `@tokamak-zk-evm/cli` and the supported backend verification flow. For on-chain verification, use the Solidity verifier contracts in `tokamak-network/Tokamak-zk-EVM-contracts` and the published deployment artifacts.

This guide documents historical npm usage for the deprecated WASM verifier package family.

## Historical Install

### Browser

```bash
npm install @tokamak-zk-evm/verify-wasm-web
```

### Node.js

```bash
npm install @tokamak-zk-evm/verify-wasm-nodejs
```

### Bundlers

```bash
npm install @tokamak-zk-evm/verify-wasm-bundler
```

## Reference Exported API

The historical package variants exposed the same `Verifier` class.

Constructor:

```ts
new Verifier(
  setupParamsJson: string,
  instanceJson: string,
  proofJson?: string,
  preprocessJson?: string,
  sigmaJson?: string,
)
```

Methods:

- `verify_keccak256()`
- `verify_snark()`
- `free()`

## Reference Browser Example

Deprecated historical example. New integrations should use `@tokamak-zk-evm/cli` for local verification or the Solidity verifier contracts for on-chain verification.

```html
<!DOCTYPE html>
<html>
  <body>
    <script type="module">
      import init, { Verifier } from '@tokamak-zk-evm/verify-wasm-web';

      await init();

      const verifier = new Verifier(
        setupParamsJson,
        instanceJson,
        proofJson,
        preprocessJson,
        sigmaJson,
      );

      const ok = verifier.verify_snark();
      console.log(ok);
      verifier.free();
    </script>
  </body>
</html>
```

## Reference Node.js Example

Deprecated historical example. New integrations should use `@tokamak-zk-evm/cli` for local verification or the Solidity verifier contracts for on-chain verification.

```javascript
import init, { Verifier } from '@tokamak-zk-evm/verify-wasm-nodejs';
import { readFileSync } from 'node:fs';

await init();

const verifier = new Verifier(
  readFileSync('./data/setupParams.json', 'utf8'),
  readFileSync('./data/instance.json', 'utf8'),
  readFileSync('./data/proof.json', 'utf8'),
  readFileSync('./data/preprocess.json', 'utf8'),
  readFileSync('./data/sigma_verify.json', 'utf8'),
);

const ok = verifier.verify_snark();
console.log(ok);
verifier.free();
```

## Reference Bundler Example

Deprecated historical example. New integrations should use `@tokamak-zk-evm/cli` for local verification or the Solidity verifier contracts for on-chain verification.

```typescript
import init, { Verifier } from '@tokamak-zk-evm/verify-wasm-bundler';

await init();

const verifier = new Verifier(
  setupParamsJson,
  instanceJson,
  proofJson,
  preprocessJson,
  sigmaJson,
);

const ok = verifier.verify_snark();
console.log(ok);
verifier.free();
```

## Reference Keccak-Only Verification

Deprecated historical example. New integrations should use `@tokamak-zk-evm/cli` for local verification or the Solidity verifier contracts for on-chain verification.

For Keccak-only verification, omit the proof-related JSON strings:

```javascript
import init, { Verifier, KeccakVerificationResult } from '@tokamak-zk-evm/verify-wasm-web';

await init();

const verifier = new Verifier(setupParamsJson, instanceJson);
const result = verifier.verify_keccak256();
console.log(result === KeccakVerificationResult.True);
verifier.free();
```

## Notes

- `verify_snark()` requires `proofJson`, `preprocessJson`, and `sigmaJson`.
- `verify_keccak256()` only needs `setupParamsJson` and `instanceJson`.
- The JSON payloads must match the native backend output format.
