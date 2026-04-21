#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL="$SCRIPT_DIR/bin/trusted-setup"

export ICICLE_BACKEND_INSTALL_DIR="${SCRIPT_DIR}/backend-lib/icicle/lib/backend"
if "$LOCAL" --help 2>&1 | grep -q -- '--subcircuit-library'; then
  exec "$LOCAL" \
    --subcircuit-library "$SCRIPT_DIR/resource/qap-compiler/library" \
    --output "$SCRIPT_DIR/resource/setup/output" \
    --fixed-tau
fi

exec "$LOCAL" "$SCRIPT_DIR/resource/qap-compiler/library" "$SCRIPT_DIR/resource/setup/output" "--fixed-tau"
