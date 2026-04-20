# Verify-WASM Quick Start

This guide gets the verifier running locally with the current API.

## Prerequisites

- Rust
- `wasm-pack`
- a local HTTP server for browser testing

Install `wasm-pack` once:

```bash
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

## Build

```bash
cd packages/backend/verify/verify-wasm
./build.sh
```

The build creates:

- `pkg-web/`
- `pkg-node/`
- `pkg/`

## Browser Smoke Test

Start a local server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/example-simple.html
```

## Minimal Usage

```html
<!DOCTYPE html>
<html>
  <body>
    <script type="module">
      import init, { Verifier } from './pkg-web/verify_wasm.js';

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

## Input Contract

`Verifier` expects JSON strings:

1. `setupParamsJson`
2. `instanceJson`
3. optional `proofJson`
4. optional `preprocessJson`
5. optional `sigmaJson`

Use only the first two arguments when you want Keccak-only verification with
`verify_keccak256()`.

## Troubleshooting

If the browser reports CORS errors, use a local server instead of opening the HTML file directly.

If the build is slow, that is normal for the first `wasm-pack` build.

## More Detail

See:

- [README.md](./README.md)
- [NPM_USAGE.md](./NPM_USAGE.md)
