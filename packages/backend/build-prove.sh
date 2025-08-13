# build-prove.sh
#!/usr/bin/env bash
set -euo pipefail

cargo build -p prove --release
mkdir -p dist/bin
cp -vf target/release/prove dist/bin/
echo "✅ copied to dist/bin/"