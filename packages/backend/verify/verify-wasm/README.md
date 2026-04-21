# Tokamak zkEVM Verify-WASM

`verify-wasm` exposes the backend verifier in WebAssembly for browsers, bundlers, and Node.js.

It currently exports a single `Verifier` class with two entrypoints:

- `verify_keccak256()`
- `verify_snark()`

## Packages

The publish script emits three npm packages:

- `@tokamak-zk-evm/verify-wasm-web`
- `@tokamak-zk-evm/verify-wasm-nodejs`
- `@tokamak-zk-evm/verify-wasm-bundler`

## Build from Source

```bash
cd packages/backend/verify/verify-wasm
./build.sh
```

This creates:

- `pkg-web/`
- `pkg-node/`
- `pkg/`

## Constructor Contract

The WASM verifier constructor accepts JSON strings:

```ts
new Verifier(
  setupParamsJson: string,
  instanceJson: string,
  proofJson?: string,
  preprocessJson?: string,
  sigmaJson?: string,
)
```

Use the optional arguments as follows:

- Keccak-only verification
  - provide `setupParamsJson` and `instanceJson`
- full SNARK verification
  - provide all five JSON strings

## Browser Example

```html
<!DOCTYPE html>
<html>
  <body>
    <button id="verify">Verify proof</button>
    <pre id="result"></pre>

    <script type="module">
      import init, { Verifier } from '@tokamak-zk-evm/verify-wasm-web';

      async function run() {
        await init();

        const [
          setupParamsJson,
          instanceJson,
          proofJson,
          preprocessJson,
          sigmaJson,
        ] = await Promise.all([
          fetch('/data/setupParams.json').then((r) => r.text()),
          fetch('/data/instance.json').then((r) => r.text()),
          fetch('/data/proof.json').then((r) => r.text()),
          fetch('/data/preprocess.json').then((r) => r.text()),
          fetch('/data/sigma_verify.json').then((r) => r.text()),
        ]);

        const verifier = new Verifier(
          setupParamsJson,
          instanceJson,
          proofJson,
          preprocessJson,
          sigmaJson,
        );

        const ok = verifier.verify_snark();
        document.getElementById('result').textContent = String(ok);
        verifier.free();
      }

      document.getElementById('verify').onclick = run;
    </script>
  </body>
</html>
```

## Node.js Example

```javascript
import { readFileSync } from 'node:fs';
import init, { Verifier } from '@tokamak-zk-evm/verify-wasm-nodejs';

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

## Keccak-Only Example

```javascript
import init, { Verifier, KeccakVerificationResult } from '@tokamak-zk-evm/verify-wasm-bundler';

await init();

const verifier = new Verifier(setupParamsJson, instanceJson);
const result = verifier.verify_keccak256();

switch (result) {
  case KeccakVerificationResult.True:
    console.log('Keccak verification passed');
    break;
  case KeccakVerificationResult.False:
    console.log('Keccak verification failed');
    break;
  case KeccakVerificationResult.NoKeccakData:
    console.log('No Keccak data was present');
    break;
}

verifier.free();
```

## Notes

- The verifier expects JSON formatted like the native backend outputs.
- `verify_snark()` returns a `Result<bool, JsValue>` on the Rust side and a boolean in JavaScript
  when the inputs are valid.
- `verify_keccak256()` does not require proof, preprocess, or sigma JSON.
- Call `free()` when you are done with the verifier instance.

## Related Files

- [QUICK_START.md](./QUICK_START.md)
- [NPM_USAGE.md](./NPM_USAGE.md)
- [example-browser.html](./example-browser.html)
- [example-node.js](./example-node.js)
