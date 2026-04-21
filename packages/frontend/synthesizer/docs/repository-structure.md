> Internal reference note: This document is maintained as a secondary repository reference. Start with `docs/README.md`, `docs/architecture.md`, or `docs/maintainer-guide.md` for the canonical maintainer entrypoints.

# Synthesizer Repository Structure

This document summarizes the Git-tracked workspace layout. Generated outputs such as `dist/`, ignored changelog mirrors, runtime outputs, and `node_modules/` are intentionally excluded.

## Top-Level Layout

```text
synthesizer/
├── core/
├── docs/
├── node-cli/
├── scripts/
├── web-app/
├── CHANGELOG.md
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
- `node-cli/`
  - published Node package
  - CLI entrypoint, filesystem adapters, installed-library loading
  - examples and tests for file-based execution
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
├── examples/
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
- The root `CHANGELOG.md` is canonical; package-local changelog files are generated publish assets.
