#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TARGET="dist/macOS"
BACKEND_PATH="backend-lib/icicle"

COMMON_TARBALL="icicle_3_8_0-macOS.tar.gz"
BACKEND_TARBALL="icicle_3_8_0-macOS-Metal.tar.gz"
COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$COMMON_TARBALL"
BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$BACKEND_TARBALL"

APP_SIGN_ID='3524416ED3903027378EA41BB258070785F977F9'
NOTARY_PROFILE='tokamak-zk-evm-backend'
OUT_ZIP='tokamak-zk-evm-macOS.zip'

# Parse arguments:
#   --sign   → enable code signing & notarization
#   --no-bun → skip bun-based synthesizer binary build
DO_SIGN=false
DO_BUN=true
DO_COMPRESS=true
for a in "$@"; do
    case "$a" in
      --sign) DO_SIGN=true ;;
      --no-bun) DO_BUN=false ;;
      --no-compress) DO_COMPRESS=false ;;
  esac
done

echo "[*] Copying scripts..."
rm -rf -- "${TARGET}"
mkdir -p "${TARGET}"
cp -r .run_scripts/macOS/* "${TARGET}"
echo "✅ copied to ${TARGET}"

echo "[*] Copying resource..."
# rm -rf -- "${TARGET}/resource"
mkdir -p "${TARGET}/resource/qap-compiler/library"
cp -r packages/frontend/qap-compiler/subcircuits/library/* "${TARGET}/resource/qap-compiler/library"
# mkdir -p "${TARGET}/resource/synthesizer/outputs"
# cp -r packages/frontend/synthesizer/examples/outputs/* "${TARGET}/resource/synthesizer/outputs"
echo "✅ copied to ${TARGET}/resource"

if [[ "$DO_BUN" == "true" ]]; then
  command -v bun >/dev/null 2>&1 || { echo "bun is required but not found"; exit 1; }
  cd packages/frontend/synthesizer
  BUN_SCRIPT="./build-binary.sh"
  dos2unix "$BUN_SCRIPT" || true
  chmod +x "$BUN_SCRIPT" 2>/dev/null || true
  "$BUN_SCRIPT" macos
  cd "$SCRIPT_DIR"
else
  echo "ℹ️ Skipping bun-based synthesizer build (--no-bun)"
fi

cd packages/backend
cargo build -p trusted-setup --release
cargo build -p preprocess --release
cargo build -p prove --release
cargo build -p verify --release
cd "$SCRIPT_DIR"

echo "[*] Copying executable binaries..."
mkdir -p "${TARGET}/bin"
cp -vf packages/frontend/synthesizer/bin/synthesizer-macos-arm64 "${TARGET}/bin"
mv "${TARGET}/bin/synthesizer-macos-arm64" "${TARGET}/bin/synthesizer"
cp -vf packages/backend/target/release/trusted-setup "${TARGET}/bin"
cp -vf packages/backend/target/release/preprocess "${TARGET}/bin"
cp -vf packages/backend/target/release/prove "${TARGET}/bin"
cp -vf packages/backend/target/release/verify "${TARGET}/bin"
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

echo "[*] Running trusted-setup..."
SETUP_SCRIPT="./${TARGET}/1_run-trusted-setup.sh"
dos2unix "$SETUP_SCRIPT"
chmod +x "$SETUP_SCRIPT"
"$SETUP_SCRIPT"
echo "✅ CRS has been generated"

if [[ "$DO_SIGN" == "true" ]]; then
  echo "[*] Signing on all distribution..."
  find "$TARGET" -type f \( -perm -111 -o -name "*.dylib" -o -name "*.so" \) -print0 | xargs -0 -I{} codesign --force --options runtime --entitlements entitlements.plist --timestamp -s "$APP_SIGN_ID" "{}"
  # find "$TARGET" -type f \( -perm -u+x -o -name '*.dylib' -o -name '*.so' \) -print0 | xargs -0 -I{} codesign --verify --strict --verbose=2 "{}"
  echo "✅ Signed"
else
  echo "ℹ️ Skipping code signing (run with --sign to enable)"
fi

echo "✅ Distribution for MacOS has been generated"

if [[ "$DO_COMPRESS" == "true" ]]; then
  echo "[*] Packaging..."
  rm -f "$OUT_ZIP"
  ( cd "$TARGET" && ditto -c -k --sequesterRsrc . "../$OUT_ZIP" )
  echo "✅ Packaged: $OUT_ZIP"

  if [[ "$DO_SIGN" == "true" ]]; then
    echo "[*] Notarizing..."
    xcrun notarytool submit "dist/$OUT_ZIP" --keychain-profile "$NOTARY_PROFILE" --wait
    ## Stapling is not allowed for ZIP packages.
    # xcrun stapler staple "$dist/OUT_ZIP"
    echo "✅ Notarization completed"
  else
    echo "ℹ️ Skipping notarization (run with --sign to enable)"
  fi

  echo "✅ Packaging for MacOS has been completed"
else
  echo "ℹ️ Skipping compression (--no-compress)"
fi
