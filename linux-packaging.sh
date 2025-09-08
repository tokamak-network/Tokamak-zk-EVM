#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse arguments
#   --no-bun  → skip bun-based synthesizer binary build
DO_BUN=true
DO_COMPRESS=true
for a in "$@"; do
  case "$a" in
    --no-bun) DO_BUN=false ;;
    --no-compress) DO_COMPRESS=false ;;
  esac
done


# =========================
# Detect Ubuntu version (20 or 22) and set targets
# =========================
UB_MAJOR="22"
if [ -r /etc/os-release ]; then . /etc/os-release; fi
if [ -n "${VERSION_ID:-}" ]; then UB_MAJOR="${VERSION_ID%%.*}"; fi
if [ "$UB_MAJOR" != "22" ] && [ "$UB_MAJOR" != "20" ]; then
  echo "[!] Unsupported Ubuntu VERSION_ID=${VERSION_ID:-unknown}; defaulting to 22"
  UB_MAJOR="22"
fi

TARGET="dist/linux${UB_MAJOR}"
BACKEND_PATH="backend-lib/icicle"
OUT_TGZ="tokamak-zk-evm-linux${UB_MAJOR}.tar.gz"

BASE_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0"
COMMON_TARBALL="icicle_3_8_0-ubuntu${UB_MAJOR}.tar.gz"
BACKEND_TARBALL="icicle_3_8_0-ubuntu${UB_MAJOR}-cuda122.tar.gz"
COMMON_URL="${BASE_URL}/${COMMON_TARBALL}"
BACKEND_URL="${BASE_URL}/${BACKEND_TARBALL}"

echo "[*] Copying scripts..."
rm -rf -- "${TARGET}"
mkdir -p "${TARGET}"
cp -r .run_scripts/linux/* "${TARGET}"
echo "✅ copied to ${TARGET}"

# =========================
# Copy resources
# =========================
echo "[*] Copying resource..."
# rm -rf -- "${TARGET}/resource"
mkdir -p "${TARGET}/resource/qap-compiler/library"
# mkdir -p "${TARGET}/resource/synthesizer/outputs"
# mkdir -p "${TARGET}/resource/setup/output"

cp -r packages/frontend/qap-compiler/subcircuits/library/* "${TARGET}/resource/qap-compiler/library"
# cp -r packages/frontend/synthesizer/examples/outputs/* "${TARGET}/resource/synthesizer/outputs"
echo "✅ copied to ${TARGET}/resource"

# =========================
# Build
# =========================
if [[ "$DO_BUN" == "true" ]]; then
  command -v bun >/dev/null 2>&1 || { echo "bun is required but not found"; exit 1; }
  cd packages/frontend/synthesizer
  BUN_SCRIPT="./build-binary.sh"
  dos2unix "$BUN_SCRIPT" || true
  chmod +x "$BUN_SCRIPT" 2>/dev/null || true
  "$BUN_SCRIPT" linux
  cd "$SCRIPT_DIR"
else
  echo "ℹ️ Skipping bun-based synthesizer build (--no-bun)"
fi

echo "[*] Building backend..."
cd packages/backend
cargo build -p trusted-setup --release
cargo build -p preprocess --release
cargo build -p prove --release
cargo build -p verify --release
cd "$SCRIPT_DIR"
echo "✅ built backend"

# echo "[*] Configuring @rpath of the binaries..."
# RPATH='$ORIGIN/../backend-lib/icicle/lib'
# for bin in trusted-setup preprocess prove verify; do
#   patchelf --set-rpath "$RPATH" "target/release/$bin"
# done
# echo "✅ @rpath set to ${RPATH}"

# =========================
# Copy executable binaries
# =========================
echo "[*] Copying executable binaries..."
mkdir -p "${TARGET}/bin"
if [[ "$DO_BUN" == "true" ]]; then
  cp -vf packages/frontend/synthesizer/bin/synthesizer-linux-x64 "${TARGET}/bin"
  mv "${TARGET}/bin/synthesizer-linux-x64" "${TARGET}/bin/synthesizer"
fi
cp -vf packages/backend/target/release/trusted-setup "${TARGET}/bin"
cp -vf packages/backend/target/release/preprocess     "${TARGET}/bin"
cp -vf packages/backend/target/release/prove          "${TARGET}/bin"
cp -vf packages/backend/target/release/verify         "${TARGET}/bin"
echo "✅ copied to ${TARGET}/bin"

# # =========================
# # Set RPATH for Linux ELF (patchelf)
# # =========================
# echo "[*] Configuring RPATH..."
# RPATH="\$ORIGIN/../${BACKEND_PATH}/lib:\$ORIGIN/../${BACKEND_PATH}/lib/backend/${CURVE}/${BACKEND_TYPE}"

# for bin in trusted-setup preprocess prove verify; do
#   f="${TARGET}/bin/${bin}"
#   if [[ -f "$f" ]]; then
#     patchelf --set-rpath "$RPATH" --force-rpath "$f"
#     echo "  - $(basename "$f") RPATH = $(patchelf --print-rpath "$f")"
#   fi
# done
# echo "✅ RPATH set to ${RPATH}"

# =========================
# Preflight
# =========================
command -v curl     >/dev/null 2>&1 || { echo "curl is required but not found"; exit 1; }
command -v tar      >/dev/null 2>&1 || { echo "tar is required but not found"; exit 1; }
# command -v patchelf >/dev/null 2>&1 || { echo "patchelf is required but not found (apt-get install patchelf)"; exit 1; }

# =========================
# Download / Extract Icicle
# =========================
echo "[*] Downloading backend package: ${BACKEND_TARBALL}"
curl -fL --retry 3 -o "$BACKEND_TARBALL" "$BACKEND_URL"

echo "[*] Downloading common runtime package: ${COMMON_TARBALL}"
curl -fL --retry 3 -o "$COMMON_TARBALL" "$COMMON_URL"

echo "[*] Extracting packages..."
tar -xzf "$BACKEND_TARBALL"
tar -xzf "$COMMON_TARBALL"

echo "[*] Installing to ${TARGET}/${BACKEND_PATH} ..."
mkdir -p "${TARGET}/${BACKEND_PATH}"
cp -r icicle/* "${TARGET}/${BACKEND_PATH}"

echo "[*] Cleaning up temporary files..."
rm -rf "$BACKEND_TARBALL" "$COMMON_TARBALL" icicle

echo "[*] Running trusted-setup..."
SETUP_SCRIPT="./${TARGET}/1_run-trusted-setup.sh"
dos2unix "$SETUP_SCRIPT"
chmod +x "$SETUP_SCRIPT"
"$SETUP_SCRIPT"
echo "✅ CRS has been generated"

# =========================
# Package (.tar.gz)
# =========================
if [[ "$DO_COMPRESS" == "true" ]]; then
  echo "[*] Packaging..."
  rm -f "$OUT_TGZ"
  tar -C "$TARGET" -czf "dist/$OUT_TGZ" .
  echo "✅ Packaging complete: ${OUT_TGZ}"
else
  echo "ℹ️ Skipping compression (--no-compress)"
fi