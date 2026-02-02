# Synthesizer Code Examples

## Run via CLI (state-channel simulation)

```
# Set RPC_URL in .env or pass --rpc
npm run synthesizer 0x<txHash>
```

What happens:
- CLI fetches the transaction and block data from the RPC endpoint.
- Generates deterministic L2 keys, builds `SynthesizerOpts` from RPC state, and runs `synthesizeTX()`.
- Writes outputs to `examples/outputs/` (`placementVariables.json`, `instance.json`, `instance_description.json`, `permutation.json`).

## Interactive CLI (RPC-backed parsing)

```
npm run cli parse -t 0x<txHash> --rpc-url https://...
npm run cli synthesize                 # prompt for hash
npm run cli demo                       # loop over hashes interactively
```

Flags: `--sepolia`, `--output-dir`, `--verbose`, `--contract`, `--calldata`, `--sender`.

## Programmatic usage

```ts
import { createSynthesizer } from './src/synthesizer/index.js';
import { createSynthesizerOptsForSimulationFromRPC } from './src/interface/rpc/rpc.js';
import { createCircuitGenerator } from './src/circuitGenerator/circuitGenerator.js';

async function run(txHash: `0x${string}`, rpcUrl: string) {
  // Build simulation options from L1 RPC state
  const opts = await createSynthesizerOptsForSimulationFromRPC({
    rpcUrl,
    blockNumber: 19_000_000,        // block before the tx for balances
    contractAddress: '0x...',       // tx.to
    senderL2PrvKey: new Uint8Array(32), // caller key (generate as needed)
    txNonce: 0n,
    callData: new Uint8Array(),     // tx.data
    initStorageKeys: [],            // registered storage slots
  });

  // Run synthesis
  const synthesizer = await createSynthesizer(opts);
  await synthesizer.synthesizeTX();

  // Emit circuit files
  const circuitGenerator = await createCircuitGenerator(synthesizer);
  circuitGenerator.writeOutputs('examples/outputs');
}
```

Adjust `initStorageKeys`, `callData`, and `senderL2PrvKey` to match your contract call. If you already have transaction data from an RPC provider, you can reuse the logic in `src/cli/index.ts` or `src/interface/cli/index.ts` to derive these values.
