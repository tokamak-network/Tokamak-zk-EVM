# Commit Message for Tokamak-zk-EVM

```
feat(synthesizer): Add automatic state snapshot normalization in SynthesizerAdapter

- Add normalizeStateSnapshot() private method to handle state snapshot format conversion
  - Converts userL2Addresses from bytes objects to hex strings
  - Converts userStorageSlots and userNonces from strings to bigints
- Automatically normalize previousState in synthesizeFromCalldata() and synthesize()
- Add test-state-snapshot-restore.ts to verify state snapshot restoration functionality

This change allows external applications to use state_snapshot.json files directly
without manual format conversion. The SynthesizerAdapter now handles all format
normalization internally, making it easier to chain multiple state channel transactions.

Related changes:
- State snapshots with bytes objects in userL2Addresses are now automatically converted
- String arrays for userStorageSlots and userNonces are converted to bigint arrays
- Both formats (normalized and raw) are supported for backward compatibility
```

