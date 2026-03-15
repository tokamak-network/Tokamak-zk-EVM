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

Config generation succeeds on anvil, and the Synthesizer now handles `PUSH0` while replaying the deployed private-state bytecode. The example now also uses L2-derived participant addresses for note owners and seeds the sender's initial liquid balance directly into anvil storage using the same L2-derived address model.

The remaining failure is later in execution, where the private-state mint replay still reaches a nested-call `REVERT` because the replayed vault balance does not yet line up with the prepared on-chain setup state.

That means:

- `test:private-state:prep` is expected to pass.
- `test:private-state` now progresses past opcode handling, but still fails on downstream Synthesizer state/preparation issues unrelated to `PUSH0`.
