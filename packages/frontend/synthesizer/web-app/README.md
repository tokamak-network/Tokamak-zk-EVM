# Tokamak zk-EVM Synthesizer Web App

`@tokamak-zk-evm/synthesizer-web` is the browser-facing package for running the Tokamak zk-EVM synthesizer from uploaded files or application-provided payload objects.

## Install

```bash
npm install @tokamak-zk-evm/synthesizer-web
```

## Runtime Model

- The published build bundles the subcircuit library JSON and WASM artifacts at build time.
- Callers only provide the transaction/state/block/code payload.
- No extra subcircuit fetch or file upload step is required at runtime.

## Quick start

```ts
import {
  loadSynthesisInputFromFiles,
  saveSynthesisOutputToFiles,
  synthesize,
} from '@tokamak-zk-evm/synthesizer-web';

const payload = await loadSynthesisInputFromFiles({
  previousState,
  transaction,
  blockInfo,
  contractCodes,
});

const output = await synthesize(payload);
saveSynthesisOutputToFiles(output);
```

## Input Shape

`synthesize(input)` expects one transaction payload with:

- `previousState`
- `transaction`
- `blockInfo`
- `contractCodes`

The package also provides:

- `loadSynthesisInputFromFiles(...)`
- `loadSynthesisInputFromUrls(...)`
- `saveSynthesisOutputToFiles(...)`
- `postSynthesisOutput(...)`

## Notes

- Build-time dependency metadata is exported as `buildMetadata`.
- `buildMetadata.dependencies.subcircuitLibrary.buildVersion` and `buildMetadata.dependencies.tokamakL2js.buildVersion` record the exact versions bundled into the published web package.
- This package targets browser-style runtimes and ESM consumption.
- Node CLI usage belongs to `@tokamak-zk-evm/synthesizer-node`.
- Workspace overview: [../README.md](../README.md)
- Workspace changelog: [../CHANGELOG.md](../CHANGELOG.md)
