# Synthesizer Maintainer Guide

This guide defines the canonical maintenance rules for `packages/frontend/synthesizer/`.

## Canonical Documentation Surface

Consumer-facing entry points:

- `README.md`
- `node-cli/README.md`
- `web-app/README.md`
- `llms.txt`
- root `CHANGELOG.md`

Canonical maintainer entry points:

- `docs/README.md`
- `docs/architecture.md`
- `docs/maintainer-guide.md`

All other files under `docs/` are secondary references. Secondary references must start with an internal-reference note and must not replace the canonical entry points above.

## Package and Version Policy

The workspace publishes two packages:

1. `@tokamak-zk-evm/synthesizer-node`
2. `@tokamak-zk-evm/synthesizer-web`

Version rules:

- The root repository version is the source of truth.
- `node-cli/package.json` and `web-app/package.json` must be synchronized from the root version.
- Both published packages must always use the same synchronized version.
- The Node CLI version banner must resolve from the package version, not from a hardcoded string.

## Changelog Policy

The canonical changelog is the repository root `CHANGELOG.md`.

Rules:

- Keep an `Unreleased` section at the top.
- Each released version that changes synthesizer behavior must include a `### Synthesizer` section.
- If there is no user-visible synthesizer change in a synchronized release, write `No consumer-facing synthesizer changes.`
- The `### Synthesizer` section must be written from consumer impact, not from internal refactor detail.

For package publishing, the root changelog is mirrored into `node-cli/CHANGELOG.md` and `web-app/CHANGELOG.md` by package build/prepack scripts. Those mirrored files are publish assets, not canonical editing targets.

## Documentation Policy

Root documentation rules:

- `README.md` is the consumer landing page for the whole workspace.
- `README.md` includes a brief package chooser and consumer FAQ.
- `llms.txt` stays consumer-oriented and links only to canonical entry points.

Package documentation rules:

- `node-cli/README.md` is the canonical consumer document for `@tokamak-zk-evm/synthesizer-node`.
- `web-app/README.md` is the canonical consumer document for `@tokamak-zk-evm/synthesizer-web`.

Secondary-reference rules:

- Keep useful reference documents under `docs/`.
- Link only a curated subset from canonical entry points.
- Mark lower-priority retained documents with an internal-reference note at the top of the file.

## Package Boundaries

Boundary rules:

- `core/` is internal and environment-neutral.
- `node-cli/` may depend on `core/`, but not on `web-app/`.
- `web-app/` may depend on `core/`, but not on `node-cli/`.
- `node-cli/` and `web-app/` must not depend on each other.

## Build and Publish Model

Build model:

- Run workspace builds from the synthesizer root.
- Each package owns its own build and prepack behavior through its `package.json`.
- Each package publishes from the package root and includes `dist/` through its `files` list.

Release model:

- The workspace root provides the official `npm run publish` entry point.
- `npm run release` remains as an alias to the same workflow.
- The release script runs `npm install` before the workspace build and publish steps.
- The release script compares local package versions with npm.
- If remote version lookup fails for any package, the release stops.
- If neither package needs publishing, the release fails instead of silently succeeding.
- Build and publish order is `node-cli` first, then `web-app`.
- After any actual publish succeeds, create the Git tag `synthesizer-vX.Y.Z`.

Version-bump policy:

- Version updates are performed with `npm run version:sync -- X.Y.Z` from the repository root.
- Before release, update the repository root `CHANGELOG.md` and run `npm run version:check`.

## Validation Rules

The release workflow validates:

- synchronized package versions
- canonical file existence
- canonical markdown link targets
- secondary-reference note presence
- changelog structure for the target version
- publish eligibility against npm

## Removed Legacy Surface

The workspace no longer treats `node-cli/BINARY_USAGE.md` or `node-cli/build-binary.sh` as supported release or consumer surfaces.
