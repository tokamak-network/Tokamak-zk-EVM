#!/usr/bin/env bash

set -euo pipefail

BEFORE_COMMIT="${1:-22ef8aa9}"
AFTER_COMMIT="${2:-b52b1239}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${PACKAGE_DIR}/../../.." && pwd)"
OUTPUT_DIR="${PACKAGE_DIR}/docs/phase1-comparison/generated"
PACKAGE_PATH="packages/frontend/synthesizer"

mkdir -p "${OUTPUT_DIR}"

git -C "${REPO_ROOT}" diff "${BEFORE_COMMIT}..${AFTER_COMMIT}" --stat -- "${PACKAGE_PATH}" \
  > "${OUTPUT_DIR}/phase1.stat"
git -C "${REPO_ROOT}" diff "${BEFORE_COMMIT}..${AFTER_COMMIT}" --name-only -- "${PACKAGE_PATH}" \
  > "${OUTPUT_DIR}/phase1.files"
git -C "${REPO_ROOT}" diff "${BEFORE_COMMIT}..${AFTER_COMMIT}" -- "${PACKAGE_PATH}" \
  > "${OUTPUT_DIR}/phase1.diff"

cat > "${OUTPUT_DIR}/phase1.range" <<EOF
before=${BEFORE_COMMIT}
after=${AFTER_COMMIT}
package=${PACKAGE_PATH}
EOF

printf 'Wrote phase 1 comparison artifacts to %s\n' "${OUTPUT_DIR}"
