# Private-State Mint Example

This example mirrors the existing ERC-20 Synthesizer workflow, but targets the `apps/private-state` DApp across `mintNotes1`, `mintNotes2`, and `mintNotes3`.

## Scope

- Target functions: `mintNotes1`, `mintNotes2`, `mintNotes3`
- Target network for generated configs: `anvil`
- Config generator: `scripts/generate-private-state-mint-config.ts`
- Replay test entrypoint: `tests/scripts/run-private-state-mint-main-from-configs.ts`

## Usage

1. Bootstrap the private-state app on anvil.
2. Generate deterministic configs for each sender permutation.
3. Replay the generated mint transactions through the Synthesizer.

Available package scripts:

```bash
npm run -s test:private-state:prep
npm run -s test:private-state
```

## Current Limitation

Config generation succeeds on anvil, and the Synthesizer now handles `PUSH0` while replaying the deployed private-state bytecode. The example now also uses L2-derived participant addresses for note owners and seeds the sender's initial liquid balance directly into anvil storage using the same L2-derived address model. Tokamak L2 helpers are loaded from the local `TokamakL2JS` submodule through the shared Synthesizer wrapper.

The remaining failure is later in circuit generation, where the Synthesizer replay now completes the EVM execution path but runs into qap-compiler buffer sizing limits for this transaction shape.

That means:

- `test:private-state:prep` is expected to pass.
- `test:private-state` now progresses past opcode and chain configuration issues, but still fails because the current circuit buffer limits are too small for the generated trace.
