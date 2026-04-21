#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL="$SCRIPT_DIR/bin/dusk_backed_mpc_setup"
INTERMEDIATE_DIR="$SCRIPT_DIR/resource/setup/mpc-setup/output/dusk.intermediate"

export ICICLE_BACKEND_INSTALL_DIR="${SCRIPT_DIR}/backend-lib/icicle/lib/backend"
exec "$LOCAL" \
  --subcircuit-library "$SCRIPT_DIR/resource/qap-compiler/library" \
  --intermediate "$INTERMEDIATE_DIR" \
  --output "$SCRIPT_DIR/resource/setup/output"
