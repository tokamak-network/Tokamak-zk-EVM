# Tokamak zk-EVM Synthesizer Web App

`@tokamak-zk-evm/synthesizer-web` is the browser-compatible app package for the Tokamak zk-EVM synthesizer.

It exposes `synthesize(input)` for browser callers and provides adapters for:

- loading JSON inputs from uploaded files or fetched URLs
- loading subcircuit metadata and WASM from uploaded files or fetched URLs
- saving synthesis outputs as local JSON downloads
- posting synthesis outputs to a server as JSON
