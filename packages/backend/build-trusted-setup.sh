# build-trusted-setup.sh
#!/usr/bin/env bash
set -euo pipefail

cargo build -p trusted-setup --release
mkdir -p dist/bin
cp -vf target/release/trusted-setup dist/bin/
echo "✅ copied to dist/bin/"