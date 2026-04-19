# Synthesizer Code Examples

## Node CLI package

Run the published Node CLI against JSON snapshot inputs:

```bash
synthesizer tokamak-ch-tx \
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

For workspace development, the same flow is also available through:

```bash
node --import tsx node-cli/src/cli/index.ts tokamak-ch-tx ...
```

## Web package

Use the browser package with file uploads:

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

The published web package already contains the subcircuit-library JSON and WASM assets.
Callers only provide the transaction payload.

Use `postSynthesisOutput(url, output)` instead of downloads if the result should be sent to a server.

## Debug-only config execution

The workspace still keeps one debug entrypoint for config-based execution:

```bash
node --import tsx node-cli/examples/config-runner.ts private-state-mint path/to/config.json
```

That path is intentionally separate from the published Node CLI.
