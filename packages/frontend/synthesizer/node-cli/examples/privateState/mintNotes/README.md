# Private-State Mint Example

This example now uses static `tokamak-ch-tx` launch inputs for the `apps/private-state` DApp across `mintNotes1`, `mintNotes2`, `mintNotes3`, `mintNotes4`, `mintNotes5`, and `mintNotes6`.

## Scope

- Target functions: `mintNotes1`, `mintNotes2`, `mintNotes3`, `mintNotes4`, `mintNotes5`, `mintNotes6`
- Launch entrypoint: `src/cli/index.ts tokamak-ch-tx`

## Usage

1. Regenerate the static launch inputs from the integrating repository's `apps/private-state` deployment flow.
2. Use the generated `previous_state_snapshot.json`, `transaction.json`, `block_info.json`, and `contract_codes.json` files under each `mintNotes*` folder.
3. Execute the stored transaction snapshot through `tokamak-ch-tx`, passing the four JSON file paths directly.

The static input folders are intended to stay aligned with the current TokamakL2JS snapshot format and the current `tokamak-ch-tx` CLI contract-code input format. This package no longer regenerates the private-state launch inputs on its own.
