# Private-State Redeem Example

This example replays `PrivateStateController.redeemNotes4`, `redeemNotes6`, and `redeemNotes8` against the local `private-state` DApp deployment on anvil.

The flow prepares fixed-arity sender-owned input notes, then redeems them into the receiver's L2 accounting balance.

Use the generated configs under `tests/configs/private-state-redeem` together with:

```bash
npm run -s test:private-state-redeem:prep
npm run -s test:private-state-redeem
```
