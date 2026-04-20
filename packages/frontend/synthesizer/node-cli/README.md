# Tokamak zk-EVM Synthesizer Node CLI

`@tokamak-zk-evm/synthesizer-node` is the Node package for running the Tokamak zk-EVM synthesizer against JSON snapshot inputs.

## Install

```bash
npm install @tokamak-zk-evm/synthesizer-node
```

## Package Role

- Exposes the published `synthesizer` CLI.
- Loads `@tokamak-zk-evm/subcircuit-library` from the installed dependency at runtime.
- Reads one JSON transaction replay payload from disk.
- Writes synthesized JSON artifacts back to disk.

The shared synthesis logic lives in `../core` and is bundled into this package at build time.

## CLI usage

```bash
synthesizer tokamak-ch-tx \
  --previous-state ./previous_state_snapshot.json \
  --transaction ./transaction.json \
  --block-info ./block_info.json \
  --contract-code ./contract_codes.json
```

## Required Input Files

- `previous_state_snapshot.json`
- `transaction.json`
- `block_info.json`
- `contract_codes.json`

These files must describe a complete synthesis payload for one transaction replay.

## Output Files

The CLI writes:

- `placementVariables.json`
- `instance.json`
- `instance_description.json`
- `permutation.json`
- `state_snapshot.json`
- `step_log.json`
- `message_code_addresses.json`

## Notes

- Build-time dependency metadata is exported as `buildMetadata`.
- The same metadata is also written to `build-metadata.json` in the published package root.
- `buildMetadata.dependencies.subcircuitLibrary.buildVersion` records the version present when this package was built, while the Node runtime still resolves the installed `@tokamak-zk-evm/subcircuit-library` package.
- `buildMetadata.dependencies.tokamakL2js.buildVersion` records the exact `tokamak-l2js` version bundled into the published package.
- Debug-only config execution lives under `examples/config-runner.ts`.
- Browser usage belongs to `@tokamak-zk-evm/synthesizer-web`.
- Workspace overview: [../README.md](../README.md)
- Workspace changelog: [../CHANGELOG.md](../CHANGELOG.md)
