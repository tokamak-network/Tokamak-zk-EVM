# Tokamak zk-EVM Synthesizer Node CLI

`@tokamak-zk-evm/synthesizer-node` is the Node-specific package for the Tokamak zk-EVM synthesizer.

It owns:

- the published CLI entrypoint
- Node-specific RPC helpers
- installed subcircuit library loading
- filesystem output helpers

The shared synthesis logic lives in `../core` and is bundled into this package at build time.
