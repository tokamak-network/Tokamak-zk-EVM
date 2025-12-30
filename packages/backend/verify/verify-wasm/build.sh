#!/usr/bin/env bash
# =========================
# WASM Verifier Build Script
# Compiles Rust code to WebAssembly
# =========================

set -e

echo "Building WASM Verifier..."

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "Error: wasm-pack is not installed"
    echo "Install it with: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
    exit 1
fi

# Build for web target
echo "Building for web target..."
wasm-pack build --target web --out-dir pkg-web --release

# Build for nodejs target
echo "Building for Node.js target..."
wasm-pack build --target nodejs --out-dir pkg-node --release

# Build for bundler target (webpack, rollup, etc.)
echo "Building for bundler target..."
wasm-pack build --target bundler --out-dir pkg --release

echo "Build complete!"
echo "Outputs:"
echo "  - pkg/         (for bundlers like webpack)"
echo "  - pkg-web/     (for direct web usage)"
echo "  - pkg-node/    (for Node.js)"

# Display bundle sizes
if command -v du &> /dev/null; then
    echo ""
    echo "Bundle sizes:"
    du -h pkg/verify_wasm_bg.wasm
    du -h pkg-web/verify_wasm_bg.wasm
    du -h pkg-node/verify_wasm_bg.wasm
fi

