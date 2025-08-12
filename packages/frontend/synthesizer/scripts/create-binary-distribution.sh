#!/bin/bash

# Create binary distribution directory
DIST_DIR="binary-distribution"
rm -rf $DIST_DIR
mkdir -p $DIST_DIR

echo "🔨 Creating Tokamak Synthesizer Binary Distribution..."

# Copy binaries
echo "📦 Copying binaries..."
cp bin/synthesizer-simple-linux-x64 $DIST_DIR/synthesizer-linux-x64
cp bin/synthesizer-simple-macos-x64 $DIST_DIR/synthesizer-macos-x64
cp bin/synthesizer-simple-macos-arm64 $DIST_DIR/synthesizer-macos-arm64
cp bin/synthesizer-simple-win-x64.exe $DIST_DIR/synthesizer-windows-x64.exe

# Make binaries executable
chmod +x $DIST_DIR/synthesizer-*

# Create README for binary distribution
cat > $DIST_DIR/README.md << 'EOF'
# Tokamak zk-EVM Synthesizer - Binary Distribution

Standalone binary executables for Tokamak zk-EVM Synthesizer CLI.

## What's Included

- `synthesizer-linux-x64` - Linux x64 binary
- `synthesizer-macos-x64` - macOS Intel binary  
- `synthesizer-macos-arm64` - macOS Apple Silicon binary
- `synthesizer-windows-x64.exe` - Windows x64 binary

## Features

✅ **No Node.js required** - Fully standalone binaries
✅ **No dependencies** - Everything bundled inside
✅ **Cross-platform** - Works on Linux, macOS, and Windows
✅ **Small size** - ~40-50MB per binary
✅ **Fast startup** - No runtime compilation

## Usage

### Linux/macOS
```bash
# Make executable (if needed)
chmod +x synthesizer-linux-x64

# Run commands
./synthesizer-linux-x64 info
./synthesizer-linux-x64 --help
./synthesizer-linux-x64 test-binary
```

### Windows
```cmd
synthesizer-windows-x64.exe info
synthesizer-windows-x64.exe --help
synthesizer-windows-x64.exe test-binary
```

## Available Commands

- `info` - Show synthesizer information
- `test-binary` - Test binary functionality
- `parse` - Parse transaction (placeholder)
- `--help` - Show all available commands

## Current Limitations

This binary distribution includes a simplified CLI interface. For full synthesis functionality:

1. The binary includes basic CLI structure and testing
2. Full transaction parsing requires the complete TypeScript environment
3. Advanced synthesis features are available in the npm package version

## Installation

1. Download the appropriate binary for your platform
2. Make it executable (Linux/macOS): `chmod +x synthesizer-*`
3. Run: `./synthesizer-* info`

## Technical Details

- Built with pkg
- Node.js v18.5.0 runtime embedded
- CommonJS bundle for maximum compatibility
- Self-contained executable

EOF

# Create platform-specific archives
echo "📦 Creating platform-specific archives..."

# Linux
tar -czf tokamak-synthesizer-linux-x64.tar.gz -C $DIST_DIR synthesizer-linux-x64 README.md

# macOS Intel
tar -czf tokamak-synthesizer-macos-x64.tar.gz -C $DIST_DIR synthesizer-macos-x64 README.md

# macOS Apple Silicon
tar -czf tokamak-synthesizer-macos-arm64.tar.gz -C $DIST_DIR synthesizer-macos-arm64 README.md

# Windows
cd $DIST_DIR && zip ../tokamak-synthesizer-windows-x64.zip synthesizer-windows-x64.exe README.md && cd ..

echo "✅ Binary distribution created:"
echo "   📁 Directory: $DIST_DIR/"
echo "   📦 Archives:"
echo "      - tokamak-synthesizer-linux-x64.tar.gz"
echo "      - tokamak-synthesizer-macos-x64.tar.gz" 
echo "      - tokamak-synthesizer-macos-arm64.tar.gz"
echo "      - tokamak-synthesizer-windows-x64.zip"
echo ""
echo "🚀 To test a binary:"
echo "   cd $DIST_DIR && ./synthesizer-macos-arm64 info"
echo ""
echo "📊 Binary sizes:"
ls -lh $DIST_DIR/synthesizer-* | awk '{print "   " $9 ": " $5}' 