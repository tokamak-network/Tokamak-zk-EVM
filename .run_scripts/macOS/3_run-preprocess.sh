#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Run ./bin/prove from the current package directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL="$SCRIPT_DIR/bin/preprocess"

export ICICLE_BACKEND_INSTALL_DIR="${SCRIPT_DIR}/backend-lib/icicle/lib/backend"
if "$LOCAL" --help 2>&1 | grep -q -- '--subcircuit-library'; then
  exec "$LOCAL" \
    --subcircuit-library "$SCRIPT_DIR/resource/qap-compiler/library" \
    --crs "$SCRIPT_DIR/resource/setup/output" \
    --synthesizer-stat "$SCRIPT_DIR/resource/synthesizer/output" \
    --output "$SCRIPT_DIR/resource/preprocess/output"
fi

exec "$LOCAL" "$SCRIPT_DIR/resource/qap-compiler/library" "$SCRIPT_DIR/resource/synthesizer/output" "$SCRIPT_DIR/resource/setup/output" "$SCRIPT_DIR/resource/preprocess/output"
