#!/bin/bash

# Create distribution directory
DIST_DIR="dist-package"
rm -rf $DIST_DIR
mkdir -p $DIST_DIR

echo "🔨 Creating Tokamak Synthesizer CLI distribution package..."

# Copy essential files
echo "📂 Copying essential files..."
cp synthesizer.cjs $DIST_DIR/
cp package-distribution.json $DIST_DIR/package.json
cp README.md $DIST_DIR/ 2>/dev/null || echo "README.md not found, skipping..."
cp LICENSE $DIST_DIR/ 2>/dev/null || echo "LICENSE not found, skipping..."

# Copy built distribution
echo "📦 Copying built files..."
cp -r dist $DIST_DIR/
cp -r node_modules $DIST_DIR/
cp -r qap-compiler $DIST_DIR/

# Make the main script executable
chmod +x $DIST_DIR/synthesizer.cjs

# Create simple README for distribution
cat > $DIST_DIR/README.md << 'EOF'
# Tokamak zk-EVM Synthesizer CLI

A standalone CLI tool for Tokamak zk-EVM Synthesizer that interprets Ethereum transactions as combinations of library subcircuits.

## Installation

This package requires Node.js >= 18.

## Usage

```bash
# Show help
./synthesizer.cjs --help

# Show synthesizer information
./synthesizer.cjs info

# Parse a transaction
./synthesizer.cjs parse -t 0x123...

# Interactive demo mode
./synthesizer.cjs demo

# Quick synthesis
./synthesizer.cjs synthesize
```

## Commands

- `parse` - Parse and synthesize an Ethereum transaction
- `demo` - Interactive demo mode for multiple transactions
- `synthesize` - Quick synthesis mode
- `run <txHash>` - Direct synthesis with transaction hash
- `info` - Show synthesizer information

## Options

- `-s, --sepolia` - Use Sepolia testnet (default: mainnet)
- `-v, --verbose` - Verbose output
- `-r, --rpc-url <url>` - Custom RPC URL
- `-o, --output <file>` - Output file for results

## Examples

```bash
# Parse mainnet transaction
./synthesizer.cjs parse -t 0x123...

# Parse Sepolia transaction
./synthesizer.cjs parse -t 0x123... --sepolia

# Use custom RPC
./synthesizer.cjs parse -t 0x123... -r https://your-rpc-url.com
```

EOF

# Create archive
echo "📦 Creating distribution archive..."
tar -czf tokamak-synthesizer-cli-v0.0.10.tar.gz -C $DIST_DIR .

echo "✅ Distribution package created:"
echo "   📁 Directory: $DIST_DIR/"
echo "   📦 Archive: tokamak-synthesizer-cli-v0.0.10.tar.gz"
echo ""
echo "🚀 To test the distribution:"
echo "   cd $DIST_DIR && ./synthesizer.cjs info" 