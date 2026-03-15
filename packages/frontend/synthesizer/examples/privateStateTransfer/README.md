# Private-State Transfer Example

This example replays `PrivateStateController.transferNotes4` against the local `private-state` DApp deployment on anvil.

The flow prepares four existing input note commitments for the sender, then executes a `4 -> 3` transfer that:

- keeps one change note for the sender
- creates two output notes for other L2 participants
- consumes the four input notes through nullifiers

Use the generated configs under `tests/configs/private-state-transfer` together with:

```bash
npm run -s test:private-state-transfer:prep
npm run -s test:private-state-transfer
```
