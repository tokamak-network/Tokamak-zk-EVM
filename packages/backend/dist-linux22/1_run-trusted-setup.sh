#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

check_backend_support() {
  local backend="${1:-}"
  echo "Checking GPU backend..."
  if [[ "$backend" == "cuda" ]]; then
    local flag
    flag="$(command -v nvidia-smi || true)"
    echo "nvidia-smi path: ${flag:-<not found>}"
    if [[ -z "$flag" ]]; then
      echo "CUDA not detected (nvidia-smi not found)."
      return 1
    fi
    return 0
  else
    echo "Unknown backend type: $backend"
    return 1
  fi
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

export ICICLE_BACKEND_INSTALL_DIR=""
export LD_LIBRARY_PATH="${SCRIPT_DIR}/backend-lib/icicle/lib"

if check_backend_support "cuda"; then
  export ICICLE_BACKEND_INSTALL_DIR="${SCRIPT_DIR}/backend-lib/icicle/lib/backend"
fi

LOCAL="$SCRIPT_DIR/bin/trusted-setup"
exec "$LOCAL" \
  "$SCRIPT_DIR/resource/qap-compiler/library" \
  "$SCRIPT_DIR/resource/synthesizer/outputs" \
  "$SCRIPT_DIR/resource/setup/output"
