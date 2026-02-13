#!/bin/sh
REMOTE=$(git rev-parse --symbolic-full-name --abbrev-ref @{u})

if [ -z "$REMOTE" ]; then
    # test/tokamak을 제외하고 모든 .js, .jsx, .ts, .tsx 파일을 검사
    FILESCHANGED=$(find . -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \) -not -path "*/test/tokamak/*")
else
    # git diff에서도 test/tokamak 디렉토리 제외
    FILESCHANGED=$(git diff --diff-filter=d --name-only --relative $REMOTE | grep -E '\.(js|jsx|ts|tsx)$' | grep -v "test/tokamak")
fi

echo $FILESCHANGED
BLUE="\033[0;34m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NOCOLOR="\033[0m"
DIM="\033[2m"

blue() {
    echo "${BLUE}$1${NOCOLOR}"
}
green() {
    echo "${GREEN}$1${NOCOLOR}"
}
dim() {
    echo "${DIM}$1${NOCOLOR}"
}

dim "> eslint --format codeframe --config ./.eslintrc.cjs . \\ "
dim "\t --ext .js,.jsx,.ts,.tsx \\ "

blue "[Lint]${NOCOLOR} checking..."

if [ -z "$FILESCHANGED" ]; then
    blue "[Lint]${GREEN} DONE."
    exit
fi

eslint --format codeframe --config ./.eslintrc.cjs $FILESCHANGED

RETURN_CODE=$?

if [ $RETURN_CODE -eq 0 ]; then
    blue "[Lint]${GREEN} DONE."
else
    exit $RETURN_CODE
fi