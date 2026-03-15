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

Config generation succeeds on anvil, and the Synthesizer now handles `PUSH0` while replaying the deployed private-state bytecode.

The remaining failure is later in execution, where the private-state mint replay still hits calldata/context consistency errors during nested call handling.

That means:

- `test:private-state:prep` is expected to pass.
- `test:private-state` now progresses past opcode handling, but still fails on downstream Synthesizer state-tracking issues unrelated to `PUSH0`.
