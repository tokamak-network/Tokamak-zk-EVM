# Tokamak zk-EVM Synthesizer Web App

`@tokamak-zk-evm/synthesizer-web` is the browser-compatible app package for the Tokamak zk-EVM synthesizer.

It exposes `synthesize(input)` for browser callers.

- The published build bundles the subcircuit library JSON and WASM artifacts at build time.
- Callers only need to provide the transaction/state/block/code input payload.
- The package still provides helpers for loading that payload from uploaded files or fetched URLs.
- saving synthesis outputs as local JSON downloads
- posting synthesis outputs to a server as JSON
