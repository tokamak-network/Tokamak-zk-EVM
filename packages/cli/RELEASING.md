# Releasing `@tokamak-zk-evm/cli`

This package is published automatically from `main`.

## Before You Merge

1. Run the root version sync script with the next synchronized repository version.
2. Add a new top entry to the root `CHANGELOG.md`.
3. Make sure the top changelog entry version matches the synchronized repository version.
4. Make sure the top changelog entry includes a `### CLI` section with at least one user-facing bullet.
5. Run:

```bash
npm run version:sync -- 2.0.12
npm run version:check
npm run --workspace @tokamak-zk-evm/cli release:check
npm run --workspace @tokamak-zk-evm/cli build
```

## What Happens On `main`

When a commit reaches `main`, `.github/workflows/publish-cli.yml`:

1. Reads `packages/cli/package.json`
2. Compares the local version with the version already published on npm
3. Validates the root `CHANGELOG.md`
4. Copies the root changelog into the CLI package publish asset
5. Builds the CLI package
6. Runs `npm publish --dry-run`
7. Publishes to npm if the local version is newer

If the local version is equal to the npm version, the workflow does not publish.

## Changelog Format

Use this format:

```md
## [2.0.12] - 2026-04-29

### CLI

- Short user-facing change
- Another user-facing change
```

Keep changelog entries short and written for package consumers. Record only changes that affect npm-published package artifacts or their consumer-facing behavior. Package-local changelog files are generated from the root changelog for npm publish artifacts only.
