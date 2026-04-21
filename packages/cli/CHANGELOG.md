# Changelog

## 2.0.2 - 2026-04-22

- Avoided duplicate CLI publish attempts in the GitHub Actions release workflow while keeping `npm run publish` available for maintainers.
- Aligned CLI setup artifact handling with the current CRS package format by expecting `sigma_verify.json` during install and verification.

## 2.0.1 - 2026-04-22

- Added `--uninstall` so the CLI can remove its local workspace and cached runtime files for the current platform.
- Changed the default CLI workspace root from `~/.tokamak-zk-evm/cli` to `~/.tokamak-zk-evm`.
- Changed Linux runtime installation to download the ICICLE CUDA backend only when an NVIDIA GPU is detected.

## 2.0.0 - 2026-04-21

- Removed the dependency on the repository root `tokamak-cli` wrapper and root shell packaging scripts.
- Moved runtime installation into the CLI package itself.
- Added resumable CRS downloads with progress output.
- Flattened proof bundle export so `--extract-proof` output can be passed back into `--verify`.
- Clarified working-directory behavior and runtime output locations in the package documentation.
