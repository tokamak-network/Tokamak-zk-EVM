# Verify-WASM NPM Usage

This guide documents the published npm packages and the current JavaScript API.

## Install

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

## Exported API

All package variants expose the same `Verifier` class.

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

## Browser Example

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

## Node.js Example

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

## Bundler Example

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

## Keccak-Only Verification

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
