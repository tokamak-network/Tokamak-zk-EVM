names=("bufferPubOut" "bufferPubIn" "bufferPrvOut" "bufferPrvIn" "ALU1" "ALU2" "ALU3" "ALU4" "ALU5" "OR" "XOR" "AND" "DecToBit" "Accumulator")
CURVE_NAME="bls12381"

# get the directory of the script
script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )" && \
cd "$script_dir"

circom_dir_path="../subcircuits/circom"
output_dir_path="../subcircuits/test/wasm"

# emtpy the output directory
rm -rf ${output_dir_path} && \

mkdir -p ${output_dir_path} && \
for (( i = 0 ; i < ${#names[@]} ; i++ )) ; do
  circom ${circom_dir_path}/${names[$i]}_circuit.circom --wasm -o ${output_dir_path} -p $CURVE_NAME && \
  mv    ${output_dir_path}/${names[$i]}_circuit_js/${names[$i]}_circuit.wasm      ${output_dir_path}/${names[$i]}_circuit.wasm &&\
  mv -n ${output_dir_path}/${names[$i]}_circuit_js/generate_witness.js            ${output_dir_path}/generate_witness.js      &&\
  mv -n ${output_dir_path}/${names[$i]}_circuit_js/witness_calculator.js          ${output_dir_path}/witness_calculator.js    &&\
  rm -rf ${output_dir_path}/${names[$i]}_circuit_js
  
done