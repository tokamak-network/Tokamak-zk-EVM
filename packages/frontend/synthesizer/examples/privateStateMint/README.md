# Private-State Mint Example

This example now uses static `tokamak-ch-tx` launch inputs for the `apps/private-state` DApp across `mintNotes1`, `mintNotes2`, `mintNotes3`, `mintNotes4`, `mintNotes5`, and `mintNotes6`.

## Scope

- Target functions: `mintNotes1`, `mintNotes2`, `mintNotes3`, `mintNotes4`, `mintNotes5`, `mintNotes6`
- Target network for generated inputs: `anvil`
- Static input generator: `scripts/generate-private-state-cli-launch-inputs.ts`
- Launch manifest: `examples/privateStateMint/cli-launch-manifest.json`
- Launch entrypoint: `src/interface/cli/index.ts tokamak-ch-tx`

## Usage

1. Bootstrap the private-state app on anvil and regenerate the static launch inputs.
2. Use the generated `previous_state_snapshot.json`, `transaction.json`, `block_info.json`, and `contract_codes.json` files under each `mintNotes*` folder.
3. Execute the stored transaction snapshot through `tokamak-ch-tx`.

To refresh the static launch inputs:

```bash
npx tsx --tsconfig tsconfig.dev.json scripts/generate-private-state-cli-launch-inputs.ts
```

The static input folders are intended to stay aligned with the current TokamakL2JS snapshot format and the current `tokamak-ch-tx` CLI contract-code input format.
