# MPC qualification guide

This guide is for repository contributors validating native consumers and MPC
changes. It is not a ceremony operator command, a source-authentication
override, or evidence of a live publication.

## Development-only native E2E

With a current local QAP build and matching Synthesizer outputs, run from
`packages/backend`:

```sh
MPC_TEST_OUTPUT=/absolute/path/to/new-test-crs \
cargo test --locked --release -p mpc-setup --lib \
  native_fixture::prepare_native_e2e_keys -- --ignored --exact --nocapture
```

The fixture uses a generated development tau and deterministic test
contributions. Its output records `releaseEligible: false`, does not
authenticate a Filecoin original, and never invokes OAuth or publication. Do
not use it for a release.

Use its `verifier_keys.rkyv` with matching local preprocess, proof, and
Synthesizer instance outputs. The `verify` local-fixture test checks both an
accepting proof and tamper rejection. Full command details and the recorded
2026-09-13 run are in the
[MPC optimization report](../../../../docs/optimization/current-univariate-mpc.md#full-local-library-mpc-output-native-e2e).

## Release test scope

Run the local release test suite with:

```sh
cargo test --locked --release -p mpc-setup
```

The suite exercises archive generation, contribution and transcript checks,
publication staging, retry behavior, and conflict rejection. It is a
correctness test suite; it is not a security proof or a live
Filecoin/npm/Google Drive end-to-end qualification.

Development qualification uses a local QAP build and the live Filecoin source.
Publish qualification additionally requires a compatible published npm library,
a completed publish transcript, configured destination access, and authority to
upload. Record the execution mode and input identity with qualified timing.
