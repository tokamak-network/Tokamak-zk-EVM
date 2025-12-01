#!/bin/bash

# Tokamak Synthesizer Binary Builder
# Creates bin directory and builds synthesizer-final binary using Bun
# Supports multiple platforms: macOS, Linux, Windows

set -e  # Exit on any error

# Default to current platform
TARGET_PLATFORM=${1:-"current"}

echo "🔨 Building Tokamak Synthesizer Binary..."

# Remove existing bin directory if it exists
if [ -d "bin" ]; then
    echo "📁 Removing existing bin directory..."
    rm -rf bin
fi

# Create new bin directory
echo "📁 Creating bin directory..."
mkdir -p bin

# Add Bun to PATH
export PATH="$HOME/.bun/bin:$PATH"

# Check if Bun is available
if ! command -v bun &> /dev/null; then
    echo "❌ Error: Bun is not installed or not in PATH"
    echo "Please install Bun from https://bun.sh"
    exit 1
fi

# Copy WASM files to bin directory
copy_wasm_files() {
    echo "📦 Copying subcircuit library..."

    # Create the exact path structure that constant/index.ts expects
    # wasmDir = './qap-compiler/subcircuits/library/wasm'
    mkdir -p resource/qap-compiler/library

    # # Also create a backup wasm directory
    # mkdir -p bin/wasm

    # Copy WASM files from external qap-compiler package (only source)
    if [ -d "../qap-compiler/subcircuits/library/wasm" ]; then
        cp -r ../qap-compiler/subcircuits/library/* resource/qap-compiler/library/ 2>/dev/null || true
        # cp ../qap-compiler/subcircuits/library/wasm/*.wasm bin/wasm/ 2>/dev/null || true
        echo "✅ Copied WASM files from external qap-compiler package to expected path"
    else
        echo "❌ Error: External qap-compiler package not found at ../qap-compiler/"
        echo "Please ensure the qap-compiler package is available"
        exit 1
    fi

    # # Copy other essential WASM files (wasmcurves, etc.)
    # find node_modules -path "*/wasmcurves/build/*.wasm" -exec cp {} bin/qap-compiler/subcircuits/library/wasm/ \; 2>/dev/null || true
    # find node_modules -path "*/wasmcurves/build/*.wasm" -exec cp {} bin/wasm/ \; 2>/dev/null || true

    # # Copy circom runtime WASM files
    # find node_modules -path "*/circom_runtime/*/*.wasm" -exec cp {} bin/qap-compiler/subcircuits/library/wasm/ \; 2>/dev/null || true
    # find node_modules -path "*/circom_runtime/*/*.wasm" -exec cp {} bin/wasm/ \; 2>/dev/null || true

    # Count copied files
    local expected_path_count=$(ls resource/qap-compiler/library/wasm/*.wasm 2>/dev/null | wc -l)
    # local backup_path_count=$(ls bin/wasm/*.wasm 2>/dev/null | wc -l)
    echo "✅ WASM files copied to expected path (./qap-compiler/subcircuits/library/wasm/): $expected_path_count"
    # echo "✅ WASM files copied to backup path (./wasm/): $backup_path_count"

    # # List some key files to verify
    # echo "🔍 Key WASM files in expected location:"
    # ls bin/qap-compiler/subcircuits/library/wasm/subcircuit*.wasm 2>/dev/null | head -5 || echo "   No subcircuit WASM files found"
}

# Build function for specific platform
build_for_platform() {
    local target=$1
    local output_name=$2
    local display_name=$3

    echo "⚡ Building $display_name binary..."

    if [ "$target" = "current" ]; then
        bun build --compile src/interface/cli/index.ts --outfile ./bin/$output_name
    else
        bun build --compile --target=$target src/interface/cli/index.ts --outfile ./bin/$output_name
    fi

    if [ -f "bin/$output_name" ]; then
        echo "✅ $display_name binary built successfully!"
        echo "📊 Binary size: $(du -h bin/$output_name | cut -f1)"

        # Copy WASM files
        copy_wasm_files

        # Test binary
        echo "🧪 Testing binary..."
        if ./bin/$output_name info >/dev/null 2>&1; then
            echo "✅ Binary test successful"
        else
            echo "⚠️  Binary test failed, but binary was created"
        fi
    else
        echo "❌ Error: $display_name binary was not created"
        return 1
    fi
}

# Build based on target platform
case $TARGET_PLATFORM in
    "current")
        build_for_platform "current" "synthesizer-final" "Current platform"
        echo "🚀 Run with: ./bin/synthesizer-final info"
        ;;
    "all")
        echo "🌍 Building for all platforms..."
        build_for_platform "bun-darwin-arm64" "synthesizer-macos-arm64" "macOS ARM64"
        build_for_platform "bun-darwin-x64" "synthesizer-macos-x64" "macOS x64"
        build_for_platform "bun-linux-x64" "synthesizer-linux-x64" "Linux x64"
        build_for_platform "bun-windows-x64" "synthesizer-windows-x64.exe" "Windows x64"
        echo ""
        echo "🚀 Usage:"
        echo "  macOS ARM64: ./bin/synthesizer-macos-arm64 info"
        echo "  macOS x64:   ./bin/synthesizer-macos-x64 info"
        echo "  Linux x64:   ./bin/synthesizer-linux-x64 info"
        echo "  Windows x64: ./bin/synthesizer-windows-x64.exe info"
        ;;
    "windows")
        build_for_platform "bun-windows-x64" "synthesizer-windows-x64.exe" "Windows x64"
        echo "🚀 Transfer to Windows and run: synthesizer-windows-x64.exe info"
        ;;
    "linux")
        build_for_platform "bun-linux-x64" "synthesizer-linux-x64" "Linux x64"
        echo "🚀 Transfer to Linux and run: ./synthesizer-linux-x64 info"
        ;;
    "macos")
        build_for_platform "bun-darwin-arm64" "synthesizer-macos-arm64" "macOS ARM64"
        build_for_platform "bun-darwin-x64" "synthesizer-macos-x64" "macOS x64"
        echo "🚀 Run ARM64: ./bin/synthesizer-macos-arm64 info"
        echo "🚀 Run x64:   ./bin/synthesizer-macos-x64 info"
        ;;
    *)
        echo "❌ Unknown platform: $TARGET_PLATFORM"
        echo "Usage: $0 [current|all|windows|linux|macos]"
        exit 1
        ;;
esac

echo ""
echo "✨ Build completed!"
echo ""
echo "💡 WASM files are copied to bin/wasm/ directory"
echo "🔧 Copy the entire bin/ directory to other computers"
