#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Run ./bin/prove from the current package directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_PROVE="$SCRIPT_DIR/bin/prove"

exec "$LOCAL_PROVE" "$SCRIPT_DIR/resource/qap_compiler/library" "$SCRIPT_DIR/resource/synthesizer/outputs" "$SCRIPT_DIR/resource/setup/output" "$SCRIPT_DIR/resource/prove/output"
