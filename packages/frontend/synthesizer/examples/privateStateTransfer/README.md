# Private-State Transfer Example

This example uses static `tokamak-ch-tx` launch inputs for fixed-arity `PrivateStateController.transferNotes<N>To<M>` calls against the local `private-state` DApp deployment on anvil.

The currently wired launch targets cover `1 -> 1`, `1 -> 2`, `1 -> 3`, `2 -> 1`, `2 -> 2`, `3 -> 1`, `3 -> 2`, and `4 -> 1`.

The default flow prepares one existing input note commitment for the sender, then executes a transfer that:

- can split the single input note into two or three output notes
- can keep one or more change notes for the sender
- can create one or more output notes for other L2 participants
- consumes the single input note through its nullifier

Use the generated static input folders together with the stored RLP values in:

- `examples/privateStateTransfer/*/previous_state_snapshot.json`
- `examples/privateStateTransfer/*/block_info.json`
- `examples/privateStateTransfer/*/contract_codes.json`
- `examples/privateStateTransfer/cli-launch-manifest.json`

To regenerate them:

```bash
npx tsx --tsconfig tsconfig.dev.json scripts/generate-private-state-cli-launch-inputs.ts
```
