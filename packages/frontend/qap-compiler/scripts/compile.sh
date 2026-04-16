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

circom_bin="${script_dir}/../node_modules/.bin/circom2"
circom_dir_path="${package_root}/subcircuits/circom"
default_output_dir="${script_dir}/../subcircuits/library"

if [[ ! -x "$circom_bin" ]]; then
  echo "Error: circom2 executable not found at '$circom_bin'." >&2
  exit 1
fi

if [[ $# -gt 1 ]]; then
  echo "Usage: ./scripts/compile.sh [output-dir]" >&2
  exit 1
fi

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

rm -f temp.txt
mkdir -p "$output_dir_path/r1cs"
mkdir -p "$output_dir_path/wasm"
mkdir -p "$output_dir_path/info"
mkdir -p "$output_dir_path/json"

for (( i = 0 ; i < ${#names[@]} ; i++ )) ; do
  echo "id[$i] = ${names[$i]}" >> temp.txt

  (
    cd "$package_root"
    "$circom_bin" "./subcircuits/circom/${names[$i]}_circuit.circom" --r1cs --wasm --json -o "$output_dir_path" -p "$CURVE_NAME" -l "./subcircuits/circom"
  ) | tee "$output_dir_path/info/subcircuit${i}_${names[$i]}_info.txt"
  cat "$output_dir_path/info/subcircuit${i}_${names[$i]}_info.txt" >> temp.txt
  mv "$output_dir_path/${names[$i]}_circuit_constraints.json" "$output_dir_path/json/subcircuit${i}.json"
  mv "$output_dir_path/${names[$i]}_circuit.r1cs" "$output_dir_path/r1cs/subcircuit${i}.r1cs"
  mv "$output_dir_path/${names[$i]}_circuit_js/${names[$i]}_circuit.wasm" "$output_dir_path/wasm/subcircuit${i}.wasm"
  mv -n "$output_dir_path/${names[$i]}_circuit_js/generate_witness.js" "$output_dir_path/generate_witness.js"
  mv -n "$output_dir_path/${names[$i]}_circuit_js/witness_calculator.js" "$output_dir_path/witness_calculator.js"
  rm -rf "$output_dir_path/${names[$i]}_circuit_js"
done

node parse.js "$output_dir_path"
node --import tsx ./exporter/exporter.ts "$output_dir_path"
rm -f temp.txt
