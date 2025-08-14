#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Run ./bin/verify from the current package directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL="$SCRIPT_DIR/bin/verify"

exec "$LOCAL" "$SCRIPT_DIR/resource/qap_compiler/library" "$SCRIPT_DIR/resource/synthesizer/outputs" "$SCRIPT_DIR/resource/setup/output" "$SCRIPT_DIR/resource/preprocess/output" "$SCRIPT_DIR/resource/prove/output"
