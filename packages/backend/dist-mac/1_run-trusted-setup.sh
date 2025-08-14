#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL="$SCRIPT_DIR/bin/trusted-setup"

exec "$LOCAL" "$SCRIPT_DIR/resource/qap_compiler/library" "$SCRIPT_DIR/resource/synthesizer/outputs" "$SCRIPT_DIR/resource/setup/output"
