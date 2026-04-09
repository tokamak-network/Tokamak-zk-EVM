#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Run ./bin/prove from the current package directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_PROVE="$SCRIPT_DIR/bin/prove"

export ICICLE_BACKEND_INSTALL_DIR="${SCRIPT_DIR}/backend-lib/icicle/lib/backend"
if "$LOCAL_PROVE" --help 2>&1 | grep -q -- '--subcircuit-library'; then
  exec "$LOCAL_PROVE" \
    --subcircuit-library "$SCRIPT_DIR/resource/qap-compiler/library" \
    --crs "$SCRIPT_DIR/resource/setup/output" \
    --synthesizer-stat "$SCRIPT_DIR/resource/synthesizer/output" \
    --output "$SCRIPT_DIR/resource/prove/output"
fi

exec "$LOCAL_PROVE" "$SCRIPT_DIR/resource/qap-compiler/library" "$SCRIPT_DIR/resource/synthesizer/output" "$SCRIPT_DIR/resource/setup/output" "$SCRIPT_DIR/resource/prove/output"
