#!/bin/bash

# Build script for preprocess-wasm

set -e

echo "🔨 Building preprocess-wasm for web target..."

# Build for web browsers
wasm-pack build \
  --target web \
  --out-dir pkg-web \
  --release

echo "✅ Build complete!"
echo ""
echo "📦 Output directory: pkg-web/"
echo ""
echo "🚀 To test:"
echo "   python3 -m http.server 8000"
echo "   open http://localhost:8000/example-simple.html"


