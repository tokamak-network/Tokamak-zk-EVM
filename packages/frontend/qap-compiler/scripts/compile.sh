#!/usr/bin/env bash

# The buffers must be placed in the following order: "bufferPubOut" "bufferPubIn" "bufferPrvOut" "bufferPrvIn"

set -euo pipefail

# Library configuration for merged arithmetic circuits
names=("bufferPubOut" "bufferPubIn" "bufferBlockIn" "bufferEVMIn" "bufferPrvIn" "ALU1" "ALU2" "DecToBit" "SubExpBatch" "Accumulator" "Poseidon" "JubjubExpBatch" "EdDsaVerify" "VerifyMerkleProof")
CURVE_NAME="bls12381"

original_cwd="$(pwd)"
script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
package_root="${script_dir}/.."
cd "$script_dir"

circom_dir_path="${package_root}/subcircuits/circom"
default_output_dir="${script_dir}/../subcircuits/library"

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: ./scripts/compile.sh <circom-bin> [output-dir]" >&2
  exit 1
fi

circom_bin="$1"
shift
circom_cmd=("${circom_bin}")
if [[ -n "${QAP_COMPILER_CIRCOM_SCRIPT:-}" ]]; then
  circom_cmd+=("${QAP_COMPILER_CIRCOM_SCRIPT}")
fi

dependency_include_roots="$(
  node - "$package_root" <<'NODE'
const path = require('node:path');
const { createRequire } = require('node:module');

const packageRoot = path.resolve(process.argv[2]);
const requireFromPackage = createRequire(path.join(packageRoot, 'package.json'));
const dependencyIncludes = [
  'circomlib/circuits/comparators.circom',
  'poseidon-bls12381-circom/circuits/poseidon255.circom',
];
const includeRoots = new Set();

for (const dependencyInclude of dependencyIncludes) {
  const resolved = requireFromPackage.resolve(dependencyInclude);
  let current = path.dirname(resolved);

  while (path.basename(current) !== 'node_modules') {
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not find node_modules root for ${dependencyInclude}`);
    }
    current = parent;
  }

  includeRoots.add(current);
}

for (const includeRoot of includeRoots) {
  console.log(includeRoot);
}
NODE
)"

first_dependency_include_root="$(printf '%s\n' "$dependency_include_roots" | sed -n '1p')"
circom_work_dir="$package_root"
if [[ -n "$first_dependency_include_root" ]]; then
  circom_work_dir="$(dirname "$first_dependency_include_root")"
fi

include_args=(-l "${package_root}/subcircuits/circom" -l "${package_root}/templates" -l "${package_root}/functions")
while IFS= read -r include_root; do
  [[ -n "$include_root" ]] && include_args+=(-l "$include_root")
done <<< "$dependency_include_roots"

output_dir_path="$default_output_dir"
if [[ $# -eq 1 ]]; then
  requested_output="$1"
  if [[ "$requested_output" = /* ]]; then
    output_dir_path="$requested_output"
  else
    output_dir_path="${original_cwd}/${requested_output}"
  fi

  if [[ -e "$output_dir_path" ]]; then
    echo "Error: Output directory '$output_dir_path' already exists." >&2
    exit 1
  fi

  mkdir -p "$(dirname "$output_dir_path")"
else
  echo "Warning: No output directory specified. Writing to the package internal path '$output_dir_path' for backward compatibility." >&2
  rm -rf "$output_dir_path"
fi

mkdir -p "$output_dir_path/r1cs"
mkdir -p "$output_dir_path/wasm"
mkdir -p "$output_dir_path/info"
mkdir -p "$output_dir_path/json"
compiler_output_file="$output_dir_path/info/compiler-output.txt"
rm -f "$compiler_output_file"

for (( i = 0 ; i < ${#names[@]} ; i++ )) ; do
  echo "id[$i] = ${names[$i]}" >> "$compiler_output_file"

  (
    cd "$circom_work_dir"
    "${circom_cmd[@]}" "${package_root}/subcircuits/circom/${names[$i]}_circuit.circom" --r1cs --wasm --json -o "$output_dir_path" -p "$CURVE_NAME" "${include_args[@]}"
  ) | tee "$output_dir_path/info/subcircuit${i}_${names[$i]}_info.txt"
  cat "$output_dir_path/info/subcircuit${i}_${names[$i]}_info.txt" >> "$compiler_output_file"
  mv "$output_dir_path/${names[$i]}_circuit_constraints.json" "$output_dir_path/json/subcircuit${i}.json"
  mv "$output_dir_path/${names[$i]}_circuit.r1cs" "$output_dir_path/r1cs/subcircuit${i}.r1cs"
  mv "$output_dir_path/${names[$i]}_circuit_js/${names[$i]}_circuit.wasm" "$output_dir_path/wasm/subcircuit${i}.wasm"
  mv -n "$output_dir_path/${names[$i]}_circuit_js/generate_witness.js" "$output_dir_path/generate_witness.js"
  mv -n "$output_dir_path/${names[$i]}_circuit_js/witness_calculator.js" "$output_dir_path/witness_calculator.js"
  rm -rf "$output_dir_path/${names[$i]}_circuit_js"
done

node parse.js "$output_dir_path" "$compiler_output_file"
node --import tsx ./exporter/exporter.ts "$output_dir_path"
rm -f "$compiler_output_file"
