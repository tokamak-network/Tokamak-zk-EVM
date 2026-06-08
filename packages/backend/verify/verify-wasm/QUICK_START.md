# Verify-WASM Quick Start

> Deprecated: The WASM verifier packages are no longer officially supported.
>
> This document is retained only as historical and reference material. Do not use the WASM verifier packages for new integrations. For local verification, use `@tokamak-zk-evm/cli` and the supported backend verification flow. For on-chain verification, use the Solidity verifier contracts in `tokamak-network/Tokamak-zk-EVM-contracts` and the published deployment artifacts.

This guide is a historical quick-start reference for the deprecated WASM verifier package family.

## Reference Prerequisites

- Rust
- `wasm-pack`
- a local HTTP server for browser testing

Install `wasm-pack` once:

```bash
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

## Reference Build

```bash
cd packages/backend/verify/verify-wasm
./build.sh
```

The build creates:

- `pkg-web/`
- `pkg-node/`
- `pkg/`

## Reference Browser Smoke Test

Start a local server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/example-simple.html
```

## Reference Minimal Usage

Deprecated historical example. New integrations should use `@tokamak-zk-evm/cli` for local verification or the Solidity verifier contracts for on-chain verification.

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

## Reference Input Contract

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
