# build-trusted-setup.sh
#!/usr/bin/env bash
set -euo pipefail

cargo build -p verify --release
mkdir -p dist/bin
cp -vf target/release/verify dist/bin/
echo "✅ copied to dist/bin/"