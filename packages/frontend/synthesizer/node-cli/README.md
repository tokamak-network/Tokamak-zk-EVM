# Tokamak zk-EVM Synthesizer Node CLI

`@tokamak-zk-evm/synthesizer-node` is the Node package for running the Tokamak zk-EVM synthesizer against JSON snapshot inputs.

## Install

```bash
npm install @tokamak-zk-evm/synthesizer-node ethers
```

## What this package does

- exposes the published `synthesizer` CLI
- loads the installed subcircuit library package at runtime
- reads JSON snapshot inputs from disk
- writes synthesis outputs back to disk

The shared synthesis logic lives in `../core` and is bundled into this package at build time.

## CLI usage

```bash
synthesizer tokamak-ch-tx \
  --previous-state ./previous_state_snapshot.json \
  --transaction ./transaction.json \
  --block-info ./block_info.json \
  --contract-code ./contract_codes.json
```

## Required input files

- `previous_state_snapshot.json`
- `transaction.json`
- `block_info.json`
- `contract_codes.json`

These files must describe a complete synthesis payload for one transaction replay.

## Output files

The CLI writes:

- `placementVariables.json`
- `instance.json`
- `instance_description.json`
- `permutation.json`
- `state_snapshot.json`
- `step_log.json`
- `message_code_addresses.json`

## Notes

- Debug-only config execution lives under `examples/config-runner.ts`.
- Browser usage belongs to `@tokamak-zk-evm/synthesizer-web`.
