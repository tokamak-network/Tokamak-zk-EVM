#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# =========================
# Unified packaging script for Linux and macOS
# This script works in both CI and local environments
# =========================

# Navigate to workspace root from scripts/
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WORKSPACE_ROOT"

# =========================
# Platform Detection and Configuration
# =========================

# Auto-detect platform
detect_platform() {
    case "$(uname -s)" in
        Darwin*) echo "macos" ;;
        Linux*)  echo "linux" ;;
        *)       echo "unknown" ;;
    esac
}

# Default settings
PLATFORM=""  # Will be set based on detection or user input
DO_SIGN=false
DO_BUN=false  # Default to no bun for local development
DO_COMPRESS=true
DO_SETUP=true  # Default to full build with setup

# Parse arguments
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Platform Selection:
  --platform PLATFORM    Target platform: linux, macos (auto-detected if not specified)
  --linux                 Build for Linux (shorthand for --platform linux)
  --macos                 Build for macOS (shorthand for --platform macos)

Build Options:
  --bun                   Use Bun to build synthesizer (default: false)
  --no-compress          Skip compression of final package
  --no-setup             Skip setup generation (build-only mode)

macOS-specific Options:
  --sign                  Sign and notarize macOS binaries (macOS only)

Other Options:
  --help                  Show this help message

Examples:
  $0 --linux --bun                    # Build for Linux with Bun
  $0 --macos --sign --no-setup        # Build for macOS with signing, no setup
  $0 --platform linux --no-compress   # Build for Linux without compression
  $0                                   # Auto-detect platform and build with defaults
EOF
}

# Parse command line arguments
for arg in "$@"; do
    case "$arg" in
        --platform)
            shift
            PLATFORM="$1"
            shift
            ;;
        --linux)
            PLATFORM="linux"
            ;;
        --macos)
            PLATFORM="macos"
            ;;
        --sign)
            DO_SIGN=true
            ;;
        --bun)
            DO_BUN=true
            ;;
        --no-compress)
            DO_COMPRESS=false
            ;;
        --no-setup)
            DO_SETUP=false
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            if [[ "$arg" =~ ^-- ]]; then
                echo "❌ Unknown option: $arg"
                echo "Use --help for usage information"
                exit 1
            fi
            ;;
    esac
done

# Auto-detect platform if not specified
if [ -z "$PLATFORM" ]; then
    PLATFORM=$(detect_platform)
    echo "🔍 Auto-detected platform: $PLATFORM"
fi

# Validate platform
case "$PLATFORM" in
    linux|macos)
        echo "✅ Building for platform: $PLATFORM"
        ;;
    *)
        echo "❌ Unsupported platform: $PLATFORM"
        echo "Supported platforms: linux, macos"
        exit 1
        ;;
esac

echo "🔍 Unified packaging script running from workspace root: $(pwd)"
echo "ℹ️ Configuration: PLATFORM=${PLATFORM}, DO_SETUP=${DO_SETUP}, DO_BUN=${DO_BUN}, DO_COMPRESS=${DO_COMPRESS}, DO_SIGN=${DO_SIGN}"

# =========================
# Platform-specific Configuration
# =========================

setup_platform_config() {
    case "$PLATFORM" in
        linux)
            setup_linux_config
            ;;
        macos)
            setup_macos_config
            ;;
    esac
}

setup_linux_config() {
    # Detect Ubuntu version (20 or 22) and set targets
    UB_MAJOR="22"
    if [ -r /etc/os-release ]; then . /etc/os-release; fi
    if [ -n "${VERSION_ID:-}" ]; then UB_MAJOR="${VERSION_ID%%.*}"; fi
    if [ "$UB_MAJOR" != "22" ] && [ "$UB_MAJOR" != "20" ]; then
        echo "[!] Unsupported Ubuntu VERSION_ID=${VERSION_ID:-unknown}; defaulting to 22"
        UB_MAJOR="22"
    fi

    TARGET="dist/linux${UB_MAJOR}"
    BACKEND_PATH="backend-lib/icicle"
    OUT_PACKAGE="tokamak-zk-evm-linux${UB_MAJOR}.tar.gz"

    BASE_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0"
    COMMON_TARBALL="icicle_3_8_0-ubuntu${UB_MAJOR}.tar.gz"
    BACKEND_TARBALL="icicle_3_8_0-ubuntu${UB_MAJOR}-cuda122.tar.gz"
    COMMON_URL="${BASE_URL}/${COMMON_TARBALL}"
    BACKEND_URL="${BASE_URL}/${BACKEND_TARBALL}"

    SYNTHESIZER_BINARY="synthesizer-linux-x64"
    SYNTHESIZER_BUILD_TARGET="linux"
    SCRIPTS_SOURCE=".run_scripts/linux"

    echo "ℹ️ Linux configuration: Ubuntu ${UB_MAJOR}, Target: ${TARGET}"
}

setup_macos_config() {
    TARGET="dist/macOS"
    BACKEND_PATH="backend-lib/icicle"
    OUT_PACKAGE="tokamak-zk-evm-macOS.zip"

    COMMON_TARBALL="icicle_3_8_0-macOS.tar.gz"
    BACKEND_TARBALL="icicle_3_8_0-macOS-Metal.tar.gz"
    COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$COMMON_TARBALL"
    BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$BACKEND_TARBALL"

    SYNTHESIZER_BINARY="synthesizer-macos-arm64"
    SYNTHESIZER_BUILD_TARGET="macos"
    SCRIPTS_SOURCE=".run_scripts/macOS"

    # macOS-specific signing configuration
    APP_SIGN_ID='3524416ED3903027378EA41BB258070785F977F9'
    NOTARY_PROFILE='tokamak-zk-evm-backend'

    echo "ℹ️ macOS configuration: Target: ${TARGET}"
}

# =========================
# Common Functions
# =========================

copy_scripts_and_resources() {
    echo "[*] Copying scripts..."
    rm -rf -- "${TARGET}"
    mkdir -p "${TARGET}"
    cp -r "${SCRIPTS_SOURCE}"/* "${TARGET}"
    echo "✅ copied to ${TARGET}"

    echo "[*] Copying resource..."
    mkdir -p "${TARGET}/resource/qap-compiler/library"
    cp -r packages/frontend/qap-compiler/subcircuits/library/* "${TARGET}/resource/qap-compiler/library"
    echo "✅ copied to ${TARGET}/resource"
}

build_synthesizer() {
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

        echo "🔍 Building synthesizer binary for ${PLATFORM}..."
        "$BUN_SCRIPT" "$SYNTHESIZER_BUILD_TARGET"

        echo "🔍 Verifying synthesizer binary was created..."
        if [ -f "bin/${SYNTHESIZER_BINARY}" ]; then
            echo "✅ SUCCESS: ${SYNTHESIZER_BINARY} created!"
            ls -la "bin/${SYNTHESIZER_BINARY}"
        else
            echo "❌ FAILED: ${SYNTHESIZER_BINARY} not found"
            echo "🔍 Contents of bin directory:"
            ls -la bin/ || echo "No bin directory"
            exit 1
        fi

        cd "$WORKSPACE_ROOT"
        echo "✅ built synthesizer"
    else
        echo "ℹ️ Skipping bun-based synthesizer build (using npm by default)"
    fi
}

build_backend() {
    echo "[*] Building backend..."
    cd packages/backend
    cargo build -p trusted-setup --release
    cargo build -p preprocess --release
    cargo build -p prove --release
    cargo build -p verify --release
    cd "$WORKSPACE_ROOT"
    echo "✅ built backend"
}

copy_binaries() {
    echo "[*] Copying executable binaries..."
    mkdir -p "${TARGET}/bin"

    # Check if synthesizer binary exists and copy it
    if [[ "$DO_BUN" == "true" ]]; then
        SYNTHESIZER_PATH="packages/frontend/synthesizer/bin/${SYNTHESIZER_BINARY}"
        if [ -f "$SYNTHESIZER_PATH" ]; then
            echo "✅ Found synthesizer binary at $SYNTHESIZER_PATH"
            cp -vf "$SYNTHESIZER_PATH" "${TARGET}/bin"
            mv "${TARGET}/bin/${SYNTHESIZER_BINARY}" "${TARGET}/bin/synthesizer"
        else
            echo "❌ Error: synthesizer binary not found at $SYNTHESIZER_PATH"
            echo "🔍 Checking if binary exists in other locations..."
            find packages/frontend/synthesizer -name "*synthesizer*" -type f 2>/dev/null || echo "No synthesizer binaries found"
            exit 1
        fi
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
}

download_and_extract_icicle() {
    # Preflight checks
    command -v curl >/dev/null 2>&1 || { echo "curl is required but not found"; exit 1; }
    command -v tar  >/dev/null 2>&1 || { echo "tar is required but not found"; exit 1; }

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
}

configure_macos_rpath() {
    if [ "$PLATFORM" = "macos" ]; then
        echo "[*] Configuring @rpath of the binaries..."
        RPATH="@executable_path/../${BACKEND_PATH}/lib"

        install_name_tool -add_rpath "$RPATH" "${TARGET}/bin/trusted-setup"
        install_name_tool -add_rpath "$RPATH" "${TARGET}/bin/prove"
        install_name_tool -add_rpath "$RPATH" "${TARGET}/bin/preprocess"
        install_name_tool -add_rpath "$RPATH" "${TARGET}/bin/verify"
        echo "✅ @rpath set to ${RPATH}"
    fi
}

handle_setup() {
    if [[ "$DO_SETUP" == "false" ]]; then
        echo "ℹ️ Build-only mode: Skipping setup execution and setup files"
        echo "ℹ️ Setup files are distributed separately to reduce binary size"
        mkdir -p "${TARGET}/resource/setup/output"
        # Create placeholder file to maintain directory structure
        echo "Setup files not included in binary distribution. Download separately from GitHub Release." > "${TARGET}/resource/setup/output/README.txt"
    else
        # Check if running in CI environment and prebuilt setup files are available
        IS_CI_ENV=false
        if [ -n "${GITHUB_ACTIONS:-}" ] || [ -n "${CI:-}" ] || [ -n "${CONTINUOUS_INTEGRATION:-}" ]; then
            IS_CI_ENV=true
        fi

        if [ "$IS_CI_ENV" = "true" ] && [ -d "./prebuilt-setup" ] && [ "$(ls -A ./prebuilt-setup 2>/dev/null)" ]; then
            echo "[*] CI environment detected - Using prebuilt setup files from proof test..."
            mkdir -p "${TARGET}/resource/setup/output"
            cp -r ./prebuilt-setup/* "${TARGET}/resource/setup/output/"
            echo "✅ Prebuilt setup files copied"

            # Verify setup files
            if [ -f "${TARGET}/resource/setup/output/combined_sigma.json" ]; then
                echo "✅ Setup files verified: $(ls -lh ${TARGET}/resource/setup/output/)"
            else
                echo "❌ Setup files verification failed, falling back to trusted-setup"
                run_trusted_setup
            fi
        else
            if [ "$IS_CI_ENV" = "false" ]; then
                echo "[*] Local environment detected - Running fresh trusted-setup for safety..."
            else
                echo "[*] No prebuilt setup files found - Running trusted-setup..."
            fi
            run_trusted_setup
        fi
    fi
}

run_trusted_setup() {
    echo "[*] Running trusted-setup..."
    SETUP_SCRIPT="./${TARGET}/1_run-trusted-setup.sh"
    dos2unix "$SETUP_SCRIPT"
    chmod +x "$SETUP_SCRIPT"
    "$SETUP_SCRIPT"
    echo "✅ CRS has been generated"
}

sign_macos_binaries() {
    if [[ "$PLATFORM" == "macos" && "$DO_SIGN" == "true" ]]; then
        echo "[*] Signing on all distribution..."
        find "$TARGET" -type f \( -perm -111 -o -name "*.dylib" -o -name "*.so" \) -print0 | xargs -0 -I{} codesign --force --options runtime --entitlements entitlements.plist --timestamp -s "$APP_SIGN_ID" "{}"
        echo "✅ Signed"
    elif [[ "$PLATFORM" == "macos" ]]; then
        echo "ℹ️ Skipping code signing (run with --sign to enable)"
    fi
}

package_distribution() {
    echo "✅ Distribution for ${PLATFORM} has been generated"

    if [[ "$DO_COMPRESS" == "true" ]]; then
        echo "[*] Packaging..."
        mkdir -p dist
        rm -f "dist/$OUT_PACKAGE"

        case "$PLATFORM" in
            macos)
                ( cd "$TARGET" && ditto -c -k --sequesterRsrc . "../../dist/$OUT_PACKAGE" )
                echo "✅ Packaged: dist/$OUT_PACKAGE"

                if [[ "$DO_SIGN" == "true" ]]; then
                    echo "[*] Notarizing..."
                    xcrun notarytool submit "dist/$OUT_PACKAGE" --keychain-profile "$NOTARY_PROFILE" --wait
                    echo "✅ Notarization completed"
                else
                    echo "ℹ️ Skipping notarization (run with --sign to enable)"
                fi
                ;;
            linux)
                # Use maximum compression with gzip - output to dist folder
                tar -C "$TARGET" -c . | gzip -9 > "dist/$OUT_PACKAGE"

                # Show compression stats
                UNCOMPRESSED_SIZE=$(du -sb "$TARGET" | cut -f1)
                COMPRESSED_SIZE=$(stat -c%s "dist/$OUT_PACKAGE" 2>/dev/null || stat -f%z "dist/$OUT_PACKAGE")
                COMPRESSION_RATIO=$(echo "scale=1; $COMPRESSED_SIZE * 100 / $UNCOMPRESSED_SIZE" | bc -l 2>/dev/null || echo "N/A")

                echo "✅ Packaging complete: dist/${OUT_PACKAGE}"
                echo "📊 Uncompressed: $(numfmt --to=iec $UNCOMPRESSED_SIZE 2>/dev/null || echo "${UNCOMPRESSED_SIZE} bytes")"
                echo "📊 Compressed: $(numfmt --to=iec $COMPRESSED_SIZE 2>/dev/null || echo "${COMPRESSED_SIZE} bytes")"
                echo "📊 Compression ratio: ${COMPRESSION_RATIO}%"

                # Check if approaching GitHub limit
                if [ "$COMPRESSED_SIZE" -gt 1900000000 ]; then
                    echo "⚠️  WARNING: File size approaching GitHub 2GB limit!"
                fi
                ;;
        esac

        echo "✅ Packaging for ${PLATFORM} has been completed"
    else
        echo "ℹ️ Skipping compression (--no-compress)"
    fi
}

# =========================
# Main Execution Flow
# =========================

main() {
    # Setup platform-specific configuration
    setup_platform_config

    # Execute build steps
    copy_scripts_and_resources
    build_synthesizer
    build_backend
    copy_binaries
    download_and_extract_icicle
    configure_macos_rpath
    handle_setup
    sign_macos_binaries
    package_distribution

    echo "🎉 Unified packaging completed successfully for ${PLATFORM}!"
}

# =========================
# Execute Main Function
# =========================

# Run the main function
main
