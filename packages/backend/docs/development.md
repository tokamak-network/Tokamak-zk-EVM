# Backend contributor tooling

This guide is for repository contributors who use the optional VS Code launch
configurations. It is not a production operator guide or release qualification
procedure.

## VS Code debugging

Install the [CodeLLDB extension](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb), then select a backend configuration from the `Run and
Debug` panel. The configurations are defined in
[`../../.vscode/launch.json`](../../../.vscode/launch.json).

`Debug prove` uses the default CPU engine and writes the common binary proof.
The local trusted-setup, preprocess, prove, and verify launchers together form
the repository development E2E path with local QAP inputs. They all use
Cargo's release optimization.

The preprocess, prove, and verify launchers use the local
`qap-compiler/subcircuits/library` output. They enable the development-only
`development-crs-bypass` feature and pass `--allow-unverified-crs`, which skips
only the CRS provenance compatibility-class check. This exception is limited to
the debugger configurations; normal CLI execution validates provenance
compatibility.

## MPC launchers

`MPC: initialize Filecoin phase 2 (local QAP)` uses `--step init-dev` and writes
a new `initial.mpc` transcript. Without `--filecoin-source`, it downloads and
authenticates the pinned Filecoin source. It never publishes a CRS.

`MPC: upload finalized CRS to Google Drive` accepts only the completed CRS
directory. It does not read the transcript or Filecoin source and does not
verify the ceremony or regenerate keys. Its path uses the shared
`setup/output/crs` active CRS path. Both trusted-setup and MPC create CRS generations under
`setup/output/generations`. Configure the operator environment
described in the [MPC operator guide](../rust/setup/mpc-setup/README.md) before
using it.

`Measure prove timing` uses Cargo's release profile and receives the local QAP
path through its test environment. The current phase-2 correctness baseline
uses arkworks CPU group operations; its qualification is described in the MPC
documentation.
