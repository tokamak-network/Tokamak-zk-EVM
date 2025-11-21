# The buffers must be placed in the following order: "bufferPubOut" "bufferPubIn" "bufferPrvOut" "bufferPrvIn"

# Library configuration for n=1024
# names=("bufferPubOut" "bufferPubIn" "bufferBlockIn" "bufferEVMIn" "bufferPrvIn" "ALU1" "ALU2" "ALU3" "ALU4" "ALU5" "OR" "XOR" "AND" "DecToBit" "Accumulator" "Poseidon" "PrepareEdDsaScalars" "JubjubExp36" "EdDsaVerify" "VerifyMerkleProof")
names=("bufferPubOut" "bufferPubIn" "bufferBlockIn" "bufferEVMIn" "bufferPrvIn" "ALU1" "ALU2" "ALU3" "ALU4" "ALU5" "OR" "XOR" "AND" "DecToBit" "SubExpBatch" "Accumulator" "Poseidon" "Poseidon2xCompress" "JubjubExpBatch" "EdDsaVerify" "VerifyMerkleProof" "VerifyMerkleProof2x" "VerifyMerkleProof3x")
# Library configuration for n=2048
# names=("bufferPubOut" "bufferPubIn" "bufferBlockIn" "bufferEVMIn" "bufferPrvIn" "ALU_basic" "ALU_based_on_div" "ALU_bitwise" "DecToBit" "Accumulator")
CURVE_NAME="bls12381"

# get the directory of the script
script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )" && \
cd "$script_dir"

circom_dir_path="../subcircuits/circom"
output_dir_path="../subcircuits/library"

# emtpy the output directory
rm -rf ${output_dir_path} && \
rm -f temp.txt && \

mkdir -p ${output_dir_path}/r1cs && \
mkdir -p ${output_dir_path}/wasm && \
mkdir -p ${output_dir_path}/info && \
mkdir -p ${output_dir_path}/json && \
for (( i = 0 ; i < ${#names[@]} ; i++ )) ; do
  echo "id[$i] = ${names[$i]}" >> temp.txt && \

  circom ${circom_dir_path}/${names[$i]}_circuit.circom --r1cs --wasm --json -o ${output_dir_path} -p $CURVE_NAME | tee ${output_dir_path}/info/subcircuit${i}_${names[$i]}_info.txt && \
  cat   ${output_dir_path}/info/subcircuit${i}_${names[$i]}_info.txt              >> temp.txt && \
  mv    ${output_dir_path}/${names[$i]}_circuit_constraints.json                  ${output_dir_path}/json/subcircuit${i}.json && \
  mv    ${output_dir_path}/${names[$i]}_circuit.r1cs                              ${output_dir_path}/r1cs/subcircuit${i}.r1cs &&\
  mv    ${output_dir_path}/${names[$i]}_circuit_js/${names[$i]}_circuit.wasm      ${output_dir_path}/wasm/subcircuit${i}.wasm &&\
  mv -n ${output_dir_path}/${names[$i]}_circuit_js/generate_witness.js            ${output_dir_path}/generate_witness.js      &&\
  mv -n ${output_dir_path}/${names[$i]}_circuit_js/witness_calculator.js          ${output_dir_path}/witness_calculator.js    &&\
  rm -rf ${output_dir_path}/${names[$i]}_circuit_js
  
done

node parse.js && rm temp.txt