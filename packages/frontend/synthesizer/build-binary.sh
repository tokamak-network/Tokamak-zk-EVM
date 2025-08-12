#!/bin/bash

# Tokamak Synthesizer Binary Builder
# Creates bin directory and builds synthesizer-final binary using Bun

set -e  # Exit on any error

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

# Build the binary
echo "⚡ Building synthesizer-final binary with Bun..."
bun build --compile --minify src/cli/index.ts --outfile ./bin/synthesizer-final

# Check if binary was created successfully
if [ -f "bin/synthesizer-final" ]; then
    echo "✅ Binary built successfully!"
    echo "📊 Binary size: $(du -h bin/synthesizer-final | cut -f1)"
    echo "🚀 Run with: ./bin/synthesizer-final info"
else
    echo "❌ Error: Binary was not created"
    exit 1
fi 