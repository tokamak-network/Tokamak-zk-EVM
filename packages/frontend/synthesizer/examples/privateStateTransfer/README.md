# Private-State Transfer Example

This example replays `PrivateStateController.transferNotes1To2` against the local `private-state` DApp deployment on anvil.

The flow prepares one existing input note commitment for the sender, then executes a `1 -> 2` transfer that:

- splits the single input note into two output notes
- keeps one change note for the sender
- creates one output note for another L2 participant
- consumes the single input note through its nullifier

Use the generated configs under `tests/configs/private-state-transfer` together with:

```bash
npm run -s test:private-state-transfer:prep
npm run -s test:private-state-transfer
```
