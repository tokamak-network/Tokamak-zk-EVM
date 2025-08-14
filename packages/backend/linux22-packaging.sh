#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

TARGET="dist-linux22"
BACKEND_PATH="backend-lib/icicle"
OUT_TGZ="tokamak-zk-evm-linux22.tar.gz"

BASE_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0"
COMMON_TARBALL="icicle_3_8_0-ubuntu22.tar.gz"
BACKEND_TARBALL="icicle_3_8_0-ubuntu22-cuda122.tar.gz"
COMMON_URL="${BASE_URL}/${COMMON_TARBALL}"
BACKEND_URL="${BASE_URL}/${BACKEND_TARBALL}"

# (선택) 디버그
# [[ "${DEBUG_ICICLE:-}" == "1" ]] && set -x

# =========================
# Build (Rust)
# =========================
cargo build -p trusted-setup --release
cargo build -p preprocess     --release
cargo build -p prove          --release
cargo build -p verify         --release

# =========================
# Copy resources
# =========================
echo "[*] Copying resource..."
rm -rf -- "${TARGET}/resource"
mkdir -p "${TARGET}/resource/qap-compiler/library"
mkdir -p "${TARGET}/resource/synthesizer/outputs"
mkdir -p "${TARGET}/resource/setup/output"

cp -r ../frontend/qap-compiler/subcircuits/library/* "${TARGET}/resource/qap-compiler/library"
cp -r ../frontend/synthesizer/examples/outputs/* "${TARGET}/resource/synthesizer/outputs"
cp -r setup/trusted-setup/output/* "${TARGET}/resource/setup/output"
echo "✅ copied to ${TARGET}/resource"

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

# =========================
# Copy executable binaries
# =========================
echo "[*] Copying executable binaries..."
mkdir -p "${TARGET}/bin"
cp -vf target/release/trusted-setup "${TARGET}/bin"
cp -vf target/release/preprocess     "${TARGET}/bin"
cp -vf target/release/prove          "${TARGET}/bin"
cp -vf target/release/verify         "${TARGET}/bin"
echo "✅ copied to ${TARGET}/bin"

# # =========================
# # Set RPATH for Linux ELF (patchelf)
# #  - $ORIGIN 은 실행 파일의 위치
# #  - backend 공용 lib 경로 + 백엔드별 경로를 추가
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
# Package (.tar.gz)
# =========================
echo "[*] Packaging..."
rm -f "$OUT_TGZ"
tar -C "$TARGET" -czf "$OUT_TGZ" .
echo "✅ Packaging complete: ${OUT_TGZ}"
