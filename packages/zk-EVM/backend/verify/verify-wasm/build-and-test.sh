#!/bin/bash
# Quick build and test script for WASM verifier
# Usage: ./build-and-test.sh

set -e  # Exit on error

echo "🔨 Building WASM module for Node.js..."
wasm-pack build --target nodejs --out-dir pkg

echo ""
echo "✅ Build complete!"
echo ""
echo "🧪 Running Node.js test..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

node test-node.cjs

