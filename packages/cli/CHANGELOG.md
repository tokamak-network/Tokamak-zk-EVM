# Changelog

## 2.0.8 - 2026-04-26

- Added `--doctor` output for the absolute runtime workspace path.

## 2.0.7 - 2026-04-24

- Simplified internal CLI stage and backend build orchestration with no intended user-facing behavior changes.

## 2.0.6 - 2026-04-24

- Switched CRS download length detection to use the published Google Drive folder listing metadata instead of issuing a direct-download HEAD request before resumable downloads.

## 2.0.5 - 2026-04-24

- Simplified CRS archive cache reuse so the CLI now compares the published archive version, timestamp, and file size instead of unpacking cached archives to verify provenance hashes.

## 2.0.4 - 2026-04-24

- Added Linux-only `--install --docker` support that installs through an Ubuntu 22 Docker image, records Docker bootstrap files under `~/.tokamak-zk-evm/linux/docker`, and runs backend preprocess, prove, and verify commands through that bootstrap when Docker is available.
- Moved Docker install image construction to a static Dockerfile that is shipped in the npm package.
- Documented the Docker install image contents and the rationale for its conservative dependency set.
- Reworked install caches so CRS reuse is validated with `crs_provenance.json` version and SHA-256 artifact hashes, and ICICLE tarball reuse is validated with packaged SHA-256 manifests.

## 2.0.3 - 2026-04-22

- Switched the default CLI workspace root to `~/.tokamak-zk-evm` so the runtime now uses the existing top-level Tokamak workspace directly.

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
