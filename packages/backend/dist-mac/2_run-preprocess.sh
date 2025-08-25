#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Run ./bin/prove from the current package directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL="$SCRIPT_DIR/bin/preprocess"

export ICICLE_BACKEND_INSTALL_DIR="${SCRIPT_DIR}/backend-lib/icicle/lib/backend"
exec "$LOCAL" "$SCRIPT_DIR/resource/qap-compiler/library" "$SCRIPT_DIR/resource/synthesizer/outputs" "$SCRIPT_DIR/resource/setup/output" "$SCRIPT_DIR/resource/preprocess/output"
