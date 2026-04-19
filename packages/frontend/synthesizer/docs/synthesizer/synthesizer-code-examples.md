# Synthesizer Code Examples

## Node CLI package

Run the Node package against JSON snapshot inputs:

```bash
node src/cli/index.ts tokamak-ch-tx \
  --previous-state examples/privateState/mintNotes/mintNotes1/previous_state_snapshot.json \
  --transaction examples/privateState/mintNotes/mintNotes1/transaction.json \
  --block-info examples/privateState/mintNotes/mintNotes1/block_info.json \
  --contract-code examples/privateState/mintNotes/mintNotes1/contract_codes.json
```

The CLI:
- loads the installed subcircuit library
- loads WASM files from the installed package
- calls the shared synthesis flow
- writes JSON outputs through `node-cli/src/io/jsonWriter.ts`

## Browser package

Use the browser package with uploaded files:

```ts
import {
  createFileSubcircuitLibraryProvider,
  prepareSynthesisInput,
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

const provider = createFileSubcircuitLibraryProvider({
  setupParams,
  globalWireList,
  frontendCfg,
  subcircuitInfo,
  wasmFiles,
});

const input = await prepareSynthesisInput(payload, provider);
const output = await synthesize(input);
saveSynthesisOutputToFiles(output);
```

Use `postSynthesisOutput(url, output)` instead of downloads if the result should be sent to a server.
