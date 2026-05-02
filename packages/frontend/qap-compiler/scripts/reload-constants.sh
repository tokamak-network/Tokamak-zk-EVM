#!/usr/bin/env bash

set -euo pipefail

script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
package_root="${script_dir}/.."

latest_version="$(npm view tokamak-l2js version --registry=https://registry.npmjs.org/)"
if [[ ! "$latest_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Could not resolve latest tokamak-l2js version from npm registry: ${latest_version}" >&2
  exit 1
fi

local_manifest="${package_root}/node_modules/tokamak-l2js/package.json"
local_version=""
if [[ -f "$local_manifest" ]]; then
  local_version="$(node -e "console.log(require(process.argv[1]).version)" "$local_manifest")"
fi

if [[ "$local_version" != "$latest_version" ]]; then
  if [[ -n "$local_version" ]]; then
    echo "[qap-compiler] tokamak-l2js local version ${local_version} differs from npm latest ${latest_version}; reinstalling."
  else
    echo "[qap-compiler] tokamak-l2js is not installed locally; installing npm latest ${latest_version}."
  fi
  rm -rf "${package_root}/node_modules/tokamak-l2js" "${package_root}/node_modules/.package-lock.json"
  npm install --prefix "$package_root" --workspaces=false --ignore-scripts "tokamak-l2js@${latest_version}"
fi

verified_version="$(node -e "console.log(require(process.argv[1]).version)" "$local_manifest")"
if [[ "$verified_version" != "$latest_version" ]]; then
  echo "Error: tokamak-l2js local version ${verified_version} does not match npm latest ${latest_version} after install." >&2
  exit 1
fi

echo "[qap-compiler] Using tokamak-l2js ${verified_version} from npm latest."

cd "$script_dir"

constants_path="${script_dir}/../subcircuits/circom/constants.circom"
node ./tokamakL2js/updateCircomConstants.mjs "$constants_path"
