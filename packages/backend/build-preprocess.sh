# build-trusted-setup.sh
#!/usr/bin/env bash
set -euo pipefail

cargo build -p preprocess --release
mkdir -p dist/bin
cp -vf target/release/preprocess dist/bin/
echo "✅ copied to dist/bin/"