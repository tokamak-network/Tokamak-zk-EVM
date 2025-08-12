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

