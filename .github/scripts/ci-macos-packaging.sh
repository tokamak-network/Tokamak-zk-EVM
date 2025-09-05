#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# =========================
# CI-specific macOS packaging script
# This script is designed to run in GitHub Actions
# =========================

# Navigate to workspace root from .github/scripts/
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WORKSPACE_ROOT"

echo "🔍 CI macOS packaging script running from workspace root: $(pwd)"

TARGET="dist/macOS"
BACKEND_PATH="backend-lib/icicle"

COMMON_TARBALL="icicle_3_8_0-macOS.tar.gz"
BACKEND_TARBALL="icicle_3_8_0-macOS-Metal.tar.gz"
COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$COMMON_TARBALL"
BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$BACKEND_TARBALL"

APP_SIGN_ID='3524416ED3903027378EA41BB258070785F977F9'
NOTARY_PROFILE='tokamak-zk-evm-backend'
OUT_ZIP='tokamak-zk-evm-macOS.zip'

# CI-specific defaults (optimized for build-only mode)
DO_SIGN=false
DO_BUN=true
DO_COMPRESS=true
BUILD_ONLY=true  # Default to build-only for CI

# Parse arguments (allow overriding defaults)
for a in "$@"; do
    case "$a" in
      --sign) DO_SIGN=true ;;
      --no-bun) DO_BUN=false ;;
      --no-compress) DO_COMPRESS=false ;;
      --full-build) BUILD_ONLY=false ;;  # Allow full build if needed
  esac
done

echo "ℹ️ CI Mode: BUILD_ONLY=${BUILD_ONLY}, DO_BUN=${DO_BUN}, DO_COMPRESS=${DO_COMPRESS}, DO_SIGN=${DO_SIGN}"

echo "[*] Copying scripts..."
rm -rf -- "${TARGET}"
mkdir -p "${TARGET}"
cp -r .run_scripts/macOS/* "${TARGET}"
echo "✅ copied to ${TARGET}"

echo "[*] Copying resource..."
mkdir -p "${TARGET}/resource/qap-compiler/library"
cp -r packages/frontend/qap-compiler/subcircuits/library/* "${TARGET}/resource/qap-compiler/library"
echo "✅ copied to ${TARGET}/resource"

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
  
  echo "🔍 Building synthesizer binary for macOS..."
  "$BUN_SCRIPT" macos
  
  echo "🔍 Verifying synthesizer binary was created..."
  if [ -f "bin/synthesizer-macos-arm64" ]; then
      echo "✅ SUCCESS: synthesizer-macos-arm64 created!"
      ls -la bin/synthesizer-macos-arm64
  else
      echo "❌ FAILED: synthesizer-macos-arm64 not found"
      echo "🔍 Contents of bin directory:"
      ls -la bin/ || echo "No bin directory"
      exit 1
  fi
  
  cd "$WORKSPACE_ROOT"
  echo "✅ built synthesizer"
else
  echo "ℹ️ Skipping bun-based synthesizer build (--no-bun)"
fi

cd packages/backend
cargo build -p trusted-setup --release
cargo build -p preprocess --release
cargo build -p prove --release
cargo build -p verify --release
cd "$WORKSPACE_ROOT"

echo "[*] Copying executable binaries..."
mkdir -p "${TARGET}/bin"

# Check if synthesizer binary exists and copy it
SYNTHESIZER_PATH="packages/frontend/synthesizer/bin/synthesizer-macos-arm64"
if [ -f "$SYNTHESIZER_PATH" ]; then
    echo "✅ Found synthesizer binary at $SYNTHESIZER_PATH"
    cp -vf "$SYNTHESIZER_PATH" "${TARGET}/bin"
    mv "${TARGET}/bin/synthesizer-macos-arm64" "${TARGET}/bin/synthesizer"
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

command -v curl >/dev/null 2>&1 || { echo "curl is required but not found"; exit 1; }
command -v tar  >/dev/null 2>&1 || { echo "tar is required but not found"; exit 1; }

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

echo "[*] Configuring @rpath of the binaries..."
RPATH="@executable_path/../${BACKEND_PATH}/lib"

install_name_tool -add_rpath "$RPATH" "${TARGET}/bin/trusted-setup"
install_name_tool -add_rpath "$RPATH" "${TARGET}/bin/prove"
install_name_tool -add_rpath "$RPATH" "${TARGET}/bin/preprocess"
install_name_tool -add_rpath "$RPATH" "${TARGET}/bin/verify"
echo "✅ @rpath set to ${RPATH}"

if [[ "$BUILD_ONLY" == "true" ]]; then
  echo "ℹ️ Build-only mode: Skipping setup execution and setup files"
  echo "ℹ️ Setup files are distributed separately to reduce binary size"
  mkdir -p "${TARGET}/resource/setup/output"
  # Create placeholder file to maintain directory structure
  echo "Setup files not included in binary distribution. Download separately from GitHub Release." > "${TARGET}/resource/setup/output/README.txt"
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

if [[ "$DO_SIGN" == "true" ]]; then
  echo "[*] Signing on all distribution..."
  find "$TARGET" -type f \( -perm -111 -o -name "*.dylib" -o -name "*.so" \) -print0 | xargs -0 -I{} codesign --force --options runtime --entitlements entitlements.plist --timestamp -s "$APP_SIGN_ID" "{}"
  echo "✅ Signed"
else
  echo "ℹ️ Skipping code signing (run with --sign to enable)"
fi

echo "✅ Distribution for MacOS has been generated"

if [[ "$DO_COMPRESS" == "true" ]]; then
  echo "[*] Packaging..."
  rm -f "$OUT_ZIP"
  ( cd "$TARGET" && ditto -c -k --sequesterRsrc . "../../$OUT_ZIP" )
  echo "✅ Packaged: $OUT_ZIP (in workspace root)"

  if [[ "$DO_SIGN" == "true" ]]; then
    echo "[*] Notarizing..."
    xcrun notarytool submit "$OUT_ZIP" --keychain-profile "$NOTARY_PROFILE" --wait
    echo "✅ Notarization completed"
  else
    echo "ℹ️ Skipping notarization (run with --sign to enable)"
  fi

  echo "✅ Packaging for MacOS has been completed"
else
  echo "ℹ️ Skipping compression (--no-compress)"
fi

echo "🎉 CI macOS packaging completed successfully!"
