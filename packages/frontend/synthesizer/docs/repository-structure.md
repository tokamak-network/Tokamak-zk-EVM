> Internal reference note: This document is maintained as a secondary repository reference. Start with `docs/README.md`, `docs/architecture.md`, or `docs/maintainer-guide.md` for the canonical maintainer entrypoints.

# Synthesizer Repository Structure

This document summarizes the Git-tracked workspace layout. Generated outputs such as `dist/`, package changelog mirrors, runtime outputs, and `node_modules/` are intentionally excluded.

## Top-Level Layout

```text
synthesizer/
├── core/
├── docs/
├── examples/
├── node-cli/
├── scripts/
├── web-app/
├── README.md
├── llms.txt
└── package.json
```

## Directory Responsibilities

- `core/`
  - internal shared runtime
  - synthesis orchestration
  - circuit generation
  - subcircuit metadata parsing
- `docs/`
  - canonical maintainer docs
  - secondary reference documents
- `examples/`
  - debug-only example flows
  - reusable fixture inputs and example generation scripts
- `node-cli/`
  - published Node package
  - CLI entrypoint, filesystem adapters, installed-library loading
  - tests for file-based execution
- `scripts/`
  - workspace-level release helpers
  - changelog mirroring for package publishing
- `web-app/`
  - published browser package
  - input loaders, browser output helpers, bundled-library bridge

## Selected Package Layout

### `node-cli/`

```text
node-cli/
├── scripts/
├── src/
│   ├── cli/
│   ├── io/
│   ├── subcircuit/
│   └── index.ts
├── tests/
├── README.md
└── package.json
```

### `examples/`

```text
examples/
├── config-runner.ts
├── erc20Transfers/
├── L2StateChannel/
└── privateState/
```

### `web-app/`

```text
web-app/
├── scripts/
├── src/
│   ├── input/
│   ├── output/
│   ├── subcircuit/
│   ├── synthesize.ts
│   └── index.ts
├── README.md
└── package.json
```

## Notes

- `core/` is not published as an npm package.
- `node-cli/` and `web-app/` publish from their package roots and include `dist/` through `files`.
- The repository root `CHANGELOG.md` is canonical; package-local changelog files are generated publish assets.
