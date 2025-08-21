const chai = require("chai")
const path = require("path")
const F1Field = require("ffjavascript").F1Field
const Scalar = require("ffjavascript").Scalar
// const CURVE_NAME = "bn128"
// exports.p = Scalar.fromString("21888242871839275222246405745257275088548364400416034343698204186575808495617") // bn128
// const CURVE_NAME = "bls12381"
exports.p = Scalar.e("1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab", 16) // bls12-381
const Fr = new F1Field(exports.p)
// const wasm_tester = require("circom_tester").wasm
const builder = require("./wasm/witness_calculator.js")
const { readFileSync } = require("fs")
const assert = chai.assert
const { split256BitInteger, signExtend, signedDivide, signedMod} = require("./helper_functions.js")
const test_case = require("./test_cases.js")
const N = 115792089237316195423570985008687907853269984665640564039457584007913129639936n

const NTestSamples = test_case.NTestSamples;

describe("EVM arithmetic & logical opcode tests", function () {
  this.timeout(1000 * 1000);

  const tests = [
    { op: "add", selector: 1n<<1n, file: "ALU_basic_circuit.wasm" },
    { op: "mul", selector: 1n<<2n, file: "ALU_basic_circuit.wasm" },
    { op: "sub", selector: 1n<<3n, file: "ALU_basic_circuit.wasm" },
    { op: "div", selector: 1n<<4n, file: "ALU_based_on_div_circuit.wasm" },
    { op: "sdiv", selector: 1n<<5n, file: "ALU_based_on_div_circuit.wasm" },
    { op: "mod", selector: 1n<<6n, file: "ALU_based_on_div_circuit.wasm" },
    { op: "smod", selector: 1n<<7n, file: "ALU_based_on_div_circuit.wasm" },
    { op: "addmod", selector: 1n<<8n, file: "ALU_based_on_div_circuit.wasm" },
    { op: "mulmod", selector: 1n<<9n, file: "ALU_based_on_div_circuit.wasm" },
    { op: "sub_exp", selector: 1n<<10n, file: "ALU_basic_circuit.wasm" },
    { op: "signextend", selector: 1n<<11n, file: "ALU_based_on_div_circuit.wasm" },
    { op: "lt", selector: 1n<<16n, file: "ALU_basic_circuit.wasm" },
    { op: "gt", selector: 1n<<17n, file: "ALU_basic_circuit.wasm" },
    { op: "slt", selector: 1n<<18n, file: "ALU_basic_circuit.wasm" },
    { op: "sgt", selector: 1n<<19n, file: "ALU_basic_circuit.wasm" },
    { op: "eq", selector: 1n<<20n, file: "ALU_basic_circuit.wasm" },
    { op: "iszero", selector: 1n<<21n, file: "ALU_basic_circuit.wasm" },
    { op: "and", selector: 1n<<22n, file: "ALU_bitwise_circuit.wasm" },
    { op: "or", selector: 1n<<23n, file: "ALU_bitwise_circuit.wasm" },
    { op: "xor", selector: 1n<<24n, file: "ALU_bitwise_circuit.wasm" },
    { op: "not", selector: 1n<<25n, file: "ALU_basic_circuit.wasm" },
    { op: "byte", selector: 1n<<26n, file: "ALU_based_on_div_circuit.wasm" },
    { op: "shl", selector: 1n<<27n, file: "ALU_based_on_div_circuit.wasm" },
    { op: "shr", selector: 1n<<28n, file: "ALU_based_on_div_circuit.wasm" },
    { op: "sar", selector: 1n<<29n, file: "ALU_based_on_div_circuit.wasm" },
  ];

  for (const { op, selector, file } of tests) {
    describe(`${op.toUpperCase()} test`, function () {
      const targetWasmPath = path.join(__dirname, "wasm", file)
      let witnessCalculator
      before(async function() {
          const buffer = readFileSync(targetWasmPath);
          witnessCalculator = await builder(buffer)
      });

      for (let i = 0; i < NTestSamples; i++) {
        const input = test_case[op];
        let in1, in2, in3, out1, out2;
        in1 = input.in1 ? split256BitInteger(input.in1[i]) : selector === undefined ? undefined : [0n, 0n];
        in2 = input.in2 ? split256BitInteger(input.in2[i]) : selector === undefined ? undefined : [0n, 0n];
        in3 = input.in3 ? split256BitInteger(input.in3[i]) : selector === undefined ? undefined : [0n, 0n];
        out1 = input.out1 ? split256BitInteger(input.out1[i]) : undefined;
        out2 = input.out2 ? split256BitInteger(input.out2[i]) : undefined;
    
        it(`${op.toUpperCase()} test vector ${i} with in1: ${in1}, in2: ${in2}, in3: ${in3}`, async () => {
            const in_vec = [selector, in1, in2, in3].filter((x) => x !== undefined);
            const witness = await witnessCalculator.calculateWitness(
              {
                in: in_vec,
              },
              true
            );
            if ( out2 === undefined ) {
              for (let i = 0; i < out1.length; i++) {
                console.log(`Expected out: ${out1[i]}, Circuit out: ${witness[i+1]}`)
                assert(Fr.eq(Fr.e(witness[i+1]), Fr.e(out1[i])));
              }
            } else {
              for (let i = 0; i < out1.length; i++) {
                console.log(`Expected out1: ${out1[i]}, Circuit out: ${witness[i+1]}`)
                assert(Fr.eq(Fr.e(witness[i+1]), Fr.e(out1[i])));
              }
              for (let i = 0; i < out2.length; i++) {
                console.log(`Expected out2: ${out2[i]}, Circuit out: ${witness[i+1+out1.length]}`)
                assert(Fr.eq(Fr.e(witness[i+1+out1.length]), Fr.e(out2[i])));
              }
              
              // assert(out[0] === witness[1]);
              // assert(out[1] === witness[2]);
              
            }
        //   try {
        //     const in_vec = [in1, in2, in3].filter((x) => x !== undefined);
        //     const witness = await witnessCalculator.calculateWitness(
        //       {
        //         in: in_vec,
        //       },
        //       true
        //     );
        //     if (out.out1 && out.out2) {
        //       assert(Fr.eq(Fr.e(witness[1]), Fr.e(out.out1[0])));
        //       assert(Fr.eq(Fr.e(witness[2]), Fr.e(out.out1[1])));
        //       assert(Fr.eq(Fr.e(witness[3]), Fr.e(out.out2[0])));
        //       assert(Fr.eq(Fr.e(witness[4]), Fr.e(out.out2[1])));
        //       console.log(`Expected out: ${out}, Circuit out: ${[witness[1], witness[2], witness[3], witness[4]]}`)
        //     } else {
        //       assert(Fr.eq(Fr.e(witness[1]), Fr.e(out[0])));
        //       assert(Fr.eq(Fr.e(witness[2]), Fr.e(out[1])));
        //       console.log(`Expected out: ${out}, Circuit out: ${[witness[1], witness[2]]}`)
        //     }
        //   } catch (e) {
        //     console.error("Witness generation failed:", e);
        //     throw e;
        //   }
        });
      }
    });
  }
});