#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse arguments
#   --no-bun  → skip bun-based synthesizer binary build
#   --build-only → skip setup execution, build binaries only
DO_BUN=true
DO_COMPRESS=true
BUILD_ONLY=false
for a in "$@"; do
  case "$a" in
    --no-bun) DO_BUN=false ;;
    --no-compress) DO_COMPRESS=false ;;
    --build-only) BUILD_ONLY=true ;;
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
# Build Synthesizer
# =========================
if [[ "$DO_BUN" == "true" ]]; then
  echo "[*] Checking Bun installation..."
  if ! command -v bun >/dev/null 2>&1; then
    echo "❌ Error: Bun is not installed or not in PATH"
    echo "Please install Bun from https://bun.sh"
    exit 1
  fi
  echo "✅ Bun found: $(which bun)"
  echo "✅ Bun version: $(bun --version)"
  echo "[*] Building Synthesizer..."
  cd packages/frontend/synthesizer
  
  echo "🔍 Installing synthesizer dependencies..."
  bun install
  
  echo "🔍 Creating bin directory..."
  mkdir -p bin
  
  BUN_SCRIPT="./build-binary.sh"
  dos2unix "$BUN_SCRIPT" || true
  chmod +x "$BUN_SCRIPT" 2>/dev/null || true
  
  echo "🔍 Building synthesizer binary for Linux..."
  "$BUN_SCRIPT" linux
  
  echo "🔍 Verifying synthesizer binary was created..."
  if [ -f "bin/synthesizer-linux-x64" ]; then
      echo "✅ SUCCESS: synthesizer-linux-x64 created!"
      ls -la bin/synthesizer-linux-x64
  else
      echo "❌ FAILED: synthesizer-linux-x64 not found"
      echo "🔍 Contents of bin directory:"
      ls -la bin/ || echo "No bin directory"
      exit 1
  fi
  
  cd "$SCRIPT_DIR"
  echo "✅ built synthesizer"
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

# Synthesizer already built above

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

# Check if synthesizer binary exists and copy it
SYNTHESIZER_PATH="packages/frontend/synthesizer/bin/synthesizer-linux-x64"
if [ -f "$SYNTHESIZER_PATH" ]; then
    echo "✅ Found synthesizer binary at $SYNTHESIZER_PATH"
    cp -vf "$SYNTHESIZER_PATH" "${TARGET}/bin"
    mv "${TARGET}/bin/synthesizer-linux-x64" "${TARGET}/bin/synthesizer"
else
    echo "❌ Error: synthesizer binary not found at $SYNTHESIZER_PATH"
    echo "🔍 Checking if binary exists in other locations..."
    find packages/frontend/synthesizer -name "*synthesizer*" -type f 2>/dev/null || echo "No synthesizer binaries found"
    exit 1
fi

# Copy Rust binaries with existence check
for binary in trusted-setup preprocess prove verify; do
    BINARY_PATH="packages/backend/target/release/$binary"
    if [ -f "$BINARY_PATH" ]; then
        echo "✅ Found $binary binary at $BINARY_PATH"
        cp -vf "$BINARY_PATH" "${TARGET}/bin"
    else
        echo "❌ Error: $binary binary not found at $BINARY_PATH"
        echo "🔍 Make sure Rust binaries are built properly"
        exit 1
    fi
done

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

if [[ "$BUILD_ONLY" == "true" ]]; then
  echo "ℹ️ Build-only mode: Skipping setup execution"
  # Check if prebuilt setup files are available
  if [ -d "./prebuilt-setup" ] && [ "$(ls -A ./prebuilt-setup 2>/dev/null)" ]; then
    echo "[*] Using prebuilt setup files from proof test..."
    mkdir -p "${TARGET}/resource/setup/output"
    cp -r ./prebuilt-setup/* "${TARGET}/resource/setup/output/"
    echo "✅ Prebuilt setup files copied for packaging"
  else
    echo "⚠️ No prebuilt setup files found, but build-only mode enabled"
    echo "   Setup files will need to be provided separately"
    mkdir -p "${TARGET}/resource/setup/output"
  fi
else
  # Check if prebuilt setup files are available
  if [ -d "./prebuilt-setup" ] && [ "$(ls -A ./prebuilt-setup 2>/dev/null)" ]; then
    echo "[*] Using prebuilt setup files from proof test..."
    mkdir -p "${TARGET}/resource/setup/output"
    cp -r ./prebuilt-setup/* "${TARGET}/resource/setup/output/"
    echo "✅ Prebuilt setup files copied"
    
    # Verify setup files
    if [ -f "${TARGET}/resource/setup/output/combined_sigma.json" ]; then
      echo "✅ Setup files verified: $(ls -lh ${TARGET}/resource/setup/output/)"
    else
      echo "❌ Setup files verification failed, falling back to trusted-setup"
      echo "[*] Running trusted-setup..."
      SETUP_SCRIPT="./${TARGET}/1_run-trusted-setup.sh"
      dos2unix "$SETUP_SCRIPT"
      chmod +x "$SETUP_SCRIPT"
      "$SETUP_SCRIPT"
      echo "✅ CRS has been generated"
    fi
  else
    echo "[*] No prebuilt setup files found, running trusted-setup..."
    SETUP_SCRIPT="./${TARGET}/1_run-trusted-setup.sh"
    dos2unix "$SETUP_SCRIPT"
    chmod +x "$SETUP_SCRIPT"
    "$SETUP_SCRIPT"
    echo "✅ CRS has been generated"
  fi
fi

# =========================
# Package (.tar.gz)
# =========================
if [[ "$DO_COMPRESS" == "true" ]]; then
  echo "[*] Packaging with high compression..."
  rm -f "$OUT_TGZ"
  mkdir -p dist
  
  # Use maximum compression with gzip
  tar -C "$TARGET" -c . | gzip -9 > "dist/$OUT_TGZ"
  
  # Show compression stats
  UNCOMPRESSED_SIZE=$(du -sb "$TARGET" | cut -f1)
  COMPRESSED_SIZE=$(stat -c%s "dist/$OUT_TGZ" 2>/dev/null || stat -f%z "dist/$OUT_TGZ")
  COMPRESSION_RATIO=$(echo "scale=1; $COMPRESSED_SIZE * 100 / $UNCOMPRESSED_SIZE" | bc -l 2>/dev/null || echo "N/A")
  
  echo "✅ Packaging complete: ${OUT_TGZ}"
  echo "📊 Uncompressed: $(numfmt --to=iec $UNCOMPRESSED_SIZE 2>/dev/null || echo "${UNCOMPRESSED_SIZE} bytes")"
  echo "📊 Compressed: $(numfmt --to=iec $COMPRESSED_SIZE 2>/dev/null || echo "${COMPRESSED_SIZE} bytes")"
  echo "📊 Compression ratio: ${COMPRESSION_RATIO}%"
  
  # Check if approaching GitHub limit
  if [ "$COMPRESSED_SIZE" -gt 1900000000 ]; then
    echo "⚠️  WARNING: File size approaching GitHub 2GB limit!"
  fi
else
  echo "ℹ️ Skipping compression (--no-compress)"
fi