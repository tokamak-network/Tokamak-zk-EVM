# Changelog

## 2.0.0 - 2026-04-21

- Removed the dependency on the repository root `tokamak-cli` wrapper and root shell packaging scripts.
- Moved runtime installation into the CLI package itself.
- Added resumable CRS downloads with progress output.
- Flattened proof bundle export so `--extract-proof` output can be passed back into `--verify`.
- Clarified working-directory behavior and runtime output locations in the package documentation.
