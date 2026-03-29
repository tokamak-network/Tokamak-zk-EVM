# Private-State Redeem Example

This example uses static `tokamak-ch-tx` launch inputs for `PrivateStateController.redeemNotes1`, `redeemNotes2`, `redeemNotes3`, and `redeemNotes4` against the generated `private-state` DApp deployment selected by the integrating repository.

The flow prepares fixed-arity sender-owned input notes, then redeems them into the receiver's L2 accounting balance.

Use the generated static input folders and the stored transaction snapshots created by the integrating repository's `apps/private-state` deployment flow.

The current launch source of truth is `examples/privateState/redeemNotes/cli-launch-manifest.json`.
