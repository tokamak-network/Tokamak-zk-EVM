#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL="$SCRIPT_DIR/bin/synthesizer"
OUT_DIR="${SCRIPT_DIR}/resource/synthesizer/outputs"
rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

exec "$LOCAL" parse --output-dir "${OUT_DIR}"

# rm -f "${SCRIPT_DIR}"/bin/*.json
