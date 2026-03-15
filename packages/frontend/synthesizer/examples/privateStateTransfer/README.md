# Private-State Transfer Example

This example replays `PrivateStateController.transferNotes1` against the local `private-state` DApp deployment on anvil.

The flow prepares one existing input note commitment for the sender, then executes a `1 -> 3` transfer that:

- splits the single input note into three output notes
- keeps one change note for the sender
- creates two output notes for other L2 participants
- consumes the single input note through its nullifier

Use the generated configs under `tests/configs/private-state-transfer` together with:

```bash
npm run -s test:private-state-transfer:prep
npm run -s test:private-state-transfer
```
