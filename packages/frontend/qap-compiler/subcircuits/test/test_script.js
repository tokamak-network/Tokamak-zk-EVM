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
const { split256BitInteger, signExtend, signedDivide, signedMod} = require("./helper_functions")
const test_case = require("./test_cases.js")
const N = 115792089237316195423570985008687907853269984665640564039457584007913129639936n

const NTestSamples = test_case.NTestSamples;

describe("EVM arithmetic & logical opcode tests", function () {
  this.timeout(1000 * 1000);

  const tests = [
    { opcode: "add", file: "add_circuit.wasm" },
    { opcode: "mul", file: "mul_circuit.wasm" },
    { opcode: "sub", file: "sub_circuit.wasm" },
    { opcode: "div", file: "div_circuit.wasm" },
    { opcode: "sdiv", file: "sdiv_circuit.wasm" },
    { opcode: "mod", file: "mod_circuit.wasm" },
    { opcode: "smod", file: "smod_circuit.wasm" },
    { opcode: "addmod", file: "addmod_circuit.wasm" },
    { opcode: "mulmod", file: "mulmod_circuit.wasm" },
    { opcode: "sub_exp", file: "SubEXP_circuit.wasm" },
    { opcode: "signextend", file: "signextend_circuit.wasm" },
    { opcode: "lt", file: "lt_circuit.wasm" },
    { opcode: "gt", file: "gt_circuit.wasm" },
    { opcode: "slt", file: "slt_circuit.wasm" },
    { opcode: "sgt", file: "sgt_circuit.wasm" },
    { opcode: "eq", file: "eq_circuit.wasm" },
    { opcode: "iszero", file: "iszero_circuit.wasm" },
    { opcode: "and_low", file: "and_low_circuit.wasm" },
    { opcode: "and_high", file: "and_high_circuit.wasm" },
    { opcode: "or_low", file: "or_low_circuit.wasm" },
    { opcode: "or_high", file: "or_high_circuit.wasm" },
    { opcode: "xor_low", file: "xor_low_circuit.wasm" },
    { opcode: "xor_high", file: "xor_high_circuit.wasm" },
    { opcode: "not", file: "not_circuit.wasm" },
    { opcode: "byte", file: "byte_circuit.wasm" },
    { opcode: "shl", file: "shl_circuit.wasm" },
    { opcode: "shr", file: "shr_circuit.wasm" },
    { opcode: "sar", file: "sar_circuit.wasm" },
  ];

  for (const { opcode, file } of tests) {
    describe(`${opcode.toUpperCase()} test`, function () {
        const targetWasmPath = path.join(__dirname, "wasm", file)
        let witnessCalculator
        before(async function() {
            const buffer = readFileSync(targetWasmPath);
            witnessCalculator = await builder(buffer)
        });

      for (let i = 0; i < NTestSamples; i++) {
        const input = test_case[opcode];
        let in1, in2, in3, out1, out2;
        if ( !opcode.includes("and_") && !opcode.includes("or_") && !opcode.includes("xor_") ) {
          in1 = input.in1 ? split256BitInteger(input.in1[i]) : undefined;
          in2 = input.in2 ? split256BitInteger(input.in2[i]) : undefined;
          out1 = input.out1 ? split256BitInteger(input.out1[i]) : undefined;
          out2 = input.out2 ? split256BitInteger(input.out2[i]) : undefined;
        } else {
          in1 = input.in1 ? input.in1[i] : undefined;
          in2 = input.in2 ? input.in2[i] : undefined;
          out1 = input.out1 ? input.out1[i] : undefined;
          out2 = input.out2 ? input.out2[i] : undefined;
        }
        if ( !opcode.includes("sub_exp") && !opcode.includes("and_") && !opcode.includes("or_") && !opcode.includes("xor_") ) {
          in3 = input.in3 ? split256BitInteger(input.in3[i]) : undefined;
        } else {
          in3 = input.in3 ? input.in3[i] : undefined;
        }

        it(`${opcode.toUpperCase()} test vector ${i} with in1: ${in1}, in2: ${in2}, in3: ${in3}`, async () => {
            const in_vec = [in1, in2, in3].filter((x) => x !== undefined);
            const witness = await witnessCalculator.calculateWitness(
              {
                in: in_vec,
              },
              true
            );
            if ( out2 === undefined ) {
              for (let i = 0; i < out1.length; i++) {
                // console.log(`Expected out: ${out1[i]}, Circuit out: ${witness[i+1]}`)
                assert(Fr.eq(Fr.e(witness[i+1]), Fr.e(out1[i])));
              }
            } else {
              for (let i = 0; i < out1.length; i++) {
                // console.log(`Expected out1: ${out1[i]}, Circuit out: ${witness[i+1]}`)
                assert(Fr.eq(Fr.e(witness[i+1]), Fr.e(out1[i])));
              }
              for (let i = 0; i < out2.length; i++) {
                // console.log(`Expected out2: ${out2[i]}, Circuit out: ${witness[i+1+out1.length]}`)
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