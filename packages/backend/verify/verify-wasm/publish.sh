#!/bin/bash

# Tokamak zkEVM Verify-WASM NPM Publishing Script
# This script builds and publishes verify-wasm to NPM

set -e  # Exit on error

PACKAGE_NAME="@tokamak-zk-evm/verify-wasm"
echo "🚀 Publishing ${PACKAGE_NAME}"

# Check if logged in to NPM
if ! npm whoami &> /dev/null; then
    echo "❌ Not logged in to NPM. Please run: npm login"
    exit 1
fi

echo "✅ NPM login verified"

# Ask for version bump
echo ""
echo "Current version: $(node -p "require('./pkg-web/package.json').version" 2>/dev/null || echo "not built yet")"
echo ""
echo "Select version bump:"
echo "1) patch (0.1.0 -> 0.1.1)"
echo "2) minor (0.1.0 -> 0.2.0)"
echo "3) major (0.1.0 -> 1.0.0)"
echo "4) skip (use current version)"
read -p "Enter choice [1-4]: " version_choice

# Build packages
echo ""
echo "📦 Building WASM packages..."
echo ""

echo "Building for Web (browsers)..."
wasm-pack build --target web --out-dir pkg-web --release

echo "Building for Node.js..."
wasm-pack build --target nodejs --out-dir pkg-node --release

echo "Building for Bundlers..."
wasm-pack build --target bundler --out-dir pkg --release

echo ""
echo "✅ Build complete!"
echo ""

# Update package.json metadata
update_package_json() {
    local dir=$1
    local target=$2
    
    echo "Updating ${dir}/package.json..."
    
    # Create temporary package.json with metadata
    cat > "${dir}/package.json.tmp" <<EOF
{
  "name": "${PACKAGE_NAME}-${target}",
  "version": "$(node -p "require('./${dir}/package.json').version")",
  "description": "Tokamak zkEVM SNARK Verifier - WASM implementation for ${target}",
  "keywords": ["tokamak", "zkevm", "snark", "verifier", "wasm", "zero-knowledge", "bls12-381"],
  "author": "Tokamak Network",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/tokamak-network/Tokamak-zk-EVM",
    "directory": "packages/backend/verify/verify-wasm"
  },
  "homepage": "https://github.com/tokamak-network/Tokamak-zk-EVM#readme",
  "bugs": {
    "url": "https://github.com/tokamak-network/Tokamak-zk-EVM/issues"
  },
  "type": "module",
  "files": [
    "verify_wasm_bg.wasm",
    "verify_wasm.js",
    "verify_wasm.d.ts"
  ],
  "main": "verify_wasm.js",
  "types": "verify_wasm.d.ts",
  "sideEffects": [
    "./snippets/*"
  ]
}
EOF
    
    mv "${dir}/package.json.tmp" "${dir}/package.json"
}

update_package_json "pkg-web" "web"
update_package_json "pkg-node" "nodejs"
update_package_json "pkg" "bundler"

# Version bump
if [ "$version_choice" != "4" ]; then
    case $version_choice in
        1) bump_type="patch" ;;
        2) bump_type="minor" ;;
        3) bump_type="major" ;;
        *) echo "Invalid choice"; exit 1 ;;
    esac
    
    echo ""
    echo "Bumping version: ${bump_type}"
    
    cd pkg-web && npm version $bump_type --no-git-tag-version
    cd ../pkg-node && npm version $bump_type --no-git-tag-version
    cd ../pkg && npm version $bump_type --no-git-tag-version
    cd ..
fi

# Show final versions
echo ""
echo "📋 Package versions:"
echo "  Web:     $(node -p "require('./pkg-web/package.json').version")"
echo "  Node.js: $(node -p "require('./pkg-node/package.json').version")"
echo "  Bundler: $(node -p "require('./pkg/package.json').version")"
echo ""

# Confirm publish
read -p "Publish to NPM? [y/N]: " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "❌ Publish cancelled"
    exit 0
fi

# Publish
echo ""
echo "📤 Publishing to NPM..."
echo ""

echo "Publishing web version..."
cd pkg-web && npm publish --access public
cd ..

echo "Publishing Node.js version..."
cd pkg-node && npm publish --access public
cd ..

echo "Publishing bundler version..."
cd pkg && npm publish --access public
cd ..

echo ""
echo "✅ Successfully published ${PACKAGE_NAME}!"
echo ""
echo "📦 Packages:"
echo "  Web:     https://www.npmjs.com/package/${PACKAGE_NAME}-web"
echo "  Node.js: https://www.npmjs.com/package/${PACKAGE_NAME}-nodejs"
echo "  Bundler: https://www.npmjs.com/package/${PACKAGE_NAME}-bundler"
echo ""


