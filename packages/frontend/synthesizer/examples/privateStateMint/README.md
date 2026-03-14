# Private-State Mint Example

This example mirrors the existing ERC-20 Synthesizer workflow, but targets the `apps/private-state` DApp.

## Scope

- Target function: `mintNotes1`
- Target network for generated configs: `anvil`
- Config generator: `scripts/generate-private-state-mint-config.ts`
- Replay test entrypoint: `tests/scripts/run-private-state-mint-main-from-configs.ts`

## Usage

1. Bootstrap the private-state app on anvil.
2. Generate deterministic configs for each sender permutation.
3. Replay the generated `mintNotes1` transactions through the Synthesizer.

Available package scripts:

```bash
npm run -s test:private-state:prep
npm run -s test:private-state
```

## Current Limitation

Config generation succeeds on anvil, but full replay currently stops inside the Synthesizer because the deployed private-state bytecode uses the `PUSH0` opcode and the Synthesizer does not yet implement it.

That means:

- `test:private-state:prep` is expected to pass.
- `test:private-state` reaches actual transaction execution, then fails at opcode handling until `PUSH0` support is added in the Synthesizer.
