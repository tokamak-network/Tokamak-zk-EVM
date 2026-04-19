# Synthesizer Repository Structure

Current layout of `packages/frontend/synthesizer/`:

```text
synthesizer/
├── core/
│   └── src/
│       ├── app.ts               # Shared synthesis flow and output serialization entry
│       ├── circuit.ts           # Circuit generator entry
│       ├── subcircuit.ts        # Shared subcircuit metadata parsing/types entry
│       ├── synthesizer.ts       # Shared runtime entry
│       ├── app/                 # Shared orchestration helpers
│       ├── circuitGenerator/    # Variable/permutation generation
│       ├── subcircuit/
│       └── synthesizer/         # Core runtime and handlers
├── node-cli/
│   ├── src/
│   │   ├── cli/                 # Node CLI entry and CLI-only utilities
│   │   ├── io/                  # Filesystem output helpers and env helpers
│   │   ├── rpc/                 # RPC helpers and RPC-facing types
│   │   ├── subcircuit/          # Installed library loading and Node WASM loading
│   │   └── synthesizer/         # Node wrapper around the shared core runtime
│   ├── examples/                # Node example flows and launch configs
│   └── tests/                   # Node package tests
├── web-app/
│   └── src/
│       ├── input/               # Blob/URL input loading helpers
│       ├── output/              # Download and JSON POST output helpers
│       ├── subcircuit/          # Browser subcircuit library providers
│       ├── synthesize.ts        # Browser-facing synthesis entry
│       └── types.ts             # Browser app package types
└── docs/
    └── synthesizer/             # Architecture and packaging notes
```

Rules:
- `core/` contains shared logic only.
- `node-cli/` and `web-app/` may depend on `core/`.
- `node-cli/` and `web-app/` must not depend on each other.
- The repository root is a container, not a published package.
