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
import { loadSynthesisInputFromFiles, saveSynthesisOutputToFiles, synthesize } from '@tokamak-zk-evm/synthesizer-web';

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

## Transaction Support

This package uses the shared Synthesizer transaction-support boundary. It is not limited to simple token or native transfers, but contract-call support depends on whether execution stays within the opcode set, call flows, storage/memory/log handling, and runtime model currently supported by Tokamak zk-EVM.

For the full consumer-facing answer, see the workspace [transaction support FAQ](../README.md#transaction-support-faq).

## Notes

- Build-time dependency metadata is exported as `buildMetadata`.
- The same metadata is also written to `build-metadata.json` in the published package root.
- `buildMetadata.dependencies.subcircuitLibrary.buildVersion` and `buildMetadata.dependencies.tokamakL2js.buildVersion` record the exact versions bundled into the published web package.
- This package targets browser-style runtimes and ESM consumption.
- Node CLI usage belongs to `@tokamak-zk-evm/synthesizer-node`.
- Workspace overview: [../README.md](../README.md)
- Repository changelog: [https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/CHANGELOG.md](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/CHANGELOG.md)
