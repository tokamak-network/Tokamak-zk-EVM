#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

TARGET="external-lib"
BASE_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0"

OS_NAME="$(uname -s)"
BACKEND_PATH=""
COMMON_TARBALL=""
BACKEND_TARBALL=""
OS_DESC=""

if [[ "$OS_NAME" == "Darwin" ]]; then
  OS_DESC="macOS"
  BACKEND_PATH="mac"
  COMMON_TARBALL="icicle_3_8_0-macOS.tar.gz"
  BACKEND_TARBALL="icicle_3_8_0-macOS-Metal.tar.gz"
elif [[ "$OS_NAME" == "Linux" ]]; then
  LINUX_ID=""
  LINUX_VERSION_ID=""

  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    LINUX_ID="${ID:-}"
    LINUX_VERSION_ID="${VERSION_ID:-}"
  fi

  if [[ -z "$LINUX_VERSION_ID" ]] && command -v lsb_release >/dev/null 2>&1; then
    LINUX_VERSION_ID="$(lsb_release -rs)"
    LINUX_ID="${LINUX_ID:-$(lsb_release -is 2>/dev/null | tr '[:upper:]' '[:lower:]')}"
  fi

  LINUX_MAJOR="${LINUX_VERSION_ID%%.*}"

  if [[ "$LINUX_ID" != "ubuntu" && ! "${ID_LIKE:-}" =~ ubuntu ]]; then
    echo "Unsupported Linux distribution: ${LINUX_ID:-unknown}. Supported: Ubuntu and its derivatives (20.x or 22.x)." >&2
    exit 1
  fi

  case "$LINUX_MAJOR" in
    22)
      OS_DESC="Ubuntu ${LINUX_VERSION_ID}"
      BACKEND_PATH="linux22"
      COMMON_TARBALL="icicle_3_8_0-ubuntu22.tar.gz"
      BACKEND_TARBALL="icicle_3_8_0-ubuntu22-cuda122.tar.gz"
      ;;
    20)
      OS_DESC="Ubuntu ${LINUX_VERSION_ID}"
      BACKEND_PATH="linux20"
      COMMON_TARBALL="icicle_3_8_0-ubuntu20.tar.gz"
      BACKEND_TARBALL="icicle_3_8_0-ubuntu20-cuda122.tar.gz"
      ;;
    *)
      echo "Unsupported Ubuntu version: ${LINUX_VERSION_ID:-unknown}. Supported: 20.x or 22.x." >&2
      exit 1
      ;;
  esac
else
  echo "Unsupported OS: ${OS_NAME}. Supported: macOS, Ubuntu 20.x, Ubuntu 22.x." >&2
  exit 1
fi

COMMON_URL="${BASE_URL}/${COMMON_TARBALL}"
BACKEND_URL="${BASE_URL}/${BACKEND_TARBALL}"

command -v curl >/dev/null 2>&1 || { echo "curl is required but not found"; exit 1; }
command -v tar  >/dev/null 2>&1 || { echo "tar is required but not found"; exit 1; }

echo "[*] Platform detected: ${OS_DESC}"
echo "[*] Downloading backend package..."
curl -fL --retry 3 -o "$BACKEND_TARBALL" "$BACKEND_URL"
echo "[*] Downloading common runtime package..."
curl -fL --retry 3 -o "$COMMON_TARBALL" "$COMMON_URL"

echo "[*] Extracting packages..."
tar -xzf "$BACKEND_TARBALL"
tar -xzf "$COMMON_TARBALL"

echo "[*] Installing to ${TARGET}/${BACKEND_PATH} ..."
mkdir -p "${TARGET}/${BACKEND_PATH}"
cp -r icicle/* "${TARGET}/${BACKEND_PATH}"

echo "[*] Cleaning up temporary files..."
rm -rf "$BACKEND_TARBALL" "$COMMON_TARBALL" icicle

echo "✅ ICICLE external library installed to ${TARGET}/${BACKEND_PATH}."
