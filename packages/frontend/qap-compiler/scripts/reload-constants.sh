#!/usr/bin/env bash

set -euo pipefail

script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$script_dir"

constants_path="${script_dir}/../subcircuits/circom/constants.circom"
node ./tokamakL2js/updateCircomConstants.mjs "$constants_path"
