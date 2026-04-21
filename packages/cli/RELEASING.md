# Releasing `@tokamak-zk-evm/cli`

This package is published automatically from `main`.

## Before You Merge

1. Update `packages/cli/package.json` and set the next version.
2. Add a new top entry to `packages/cli/CHANGELOG.md`.
3. Make sure the top changelog entry version matches `package.json`.
4. Make sure the top changelog entry has at least one bullet that explains what changed for users.
5. Run:

```bash
npm run --workspace @tokamak-zk-evm/cli release:check
npm run --workspace @tokamak-zk-evm/cli build
```

## What Happens On `main`

When a commit reaches `main`, `.github/workflows/publish-cli.yml`:

1. Reads `packages/cli/package.json`
2. Compares the local version with the version already published on npm
3. Validates `packages/cli/CHANGELOG.md`
4. Builds the CLI package
5. Runs `npm publish --dry-run`
6. Publishes to npm if the local version is newer

If the local version is equal to the npm version, the workflow does not publish.

## Changelog Format

Use this format:

```md
## 2.0.1 - 2026-04-22

- Short user-facing change
- Another user-facing change
```

Keep changelog entries short and written for package consumers.
