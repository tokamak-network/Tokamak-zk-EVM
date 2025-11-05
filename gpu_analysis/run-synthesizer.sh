#!/usr/bin/env bash
# Run synthesizer to generate circuit outputs from a transaction
# Usage: ./run-synthesizer.sh <TX_HASH>

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FE_SYN="$REPO_ROOT/packages/frontend/synthesizer"
TX_HASH="${1:-}"

if [[ -z "$TX_HASH" ]]; then
    echo "Usage: ./run-synthesizer.sh <TX_HASH>"
    echo "Example: ./run-synthesizer.sh 0xad6795bca9cf6b70f6ed2d728eae677d66510b3b25f2542f7f57920f858d9fd0"
    exit 1
fi

echo "Running synthesizer for transaction: $TX_HASH"
cd "$FE_SYN"
npm run synthesizer "$TX_HASH"

echo ""
echo "✓ Synthesizer complete!"
echo "Output location: $FE_SYN/examples/outputs"
