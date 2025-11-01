
import { BIGINT_1 } from '@ethereumjs/util';
import { DataPt, ISynthesizerProvider } from '../types/index.ts';
import { poseidon4 } from 'poseidon-bls12381';
import { DataPtFactory } from '../dataStructure/index.ts';
import { DEFAULT_SOURCE_BIT_SIZE } from 'src/synthesizer/params/index.ts';
import { ArithmeticOperator, SUBCIRCUIT_MAPPING, SubcircuitNames } from 'src/interface/qapCompiler/configuredTypes.ts';
import { jubjub } from '@noble/curves/misc';
import { ArithmeticOperations } from '../dataStructure/arithmeticOperations.ts';
import { POSEIDON_INPUTS } from 'src/interface/qapCompiler/importedConstants.ts';

export class ArithmeticManager {
  constructor(
    private parent: ISynthesizerProvider
  ) {}

  /**
   * Creates the output data points for an arithmetic operation.
   *
   * @param {ArithmeticOperator} name - The name of the arithmetic operation.
   * @param {DataPt[]} inPts - The input data points for the operation.
   * @returns {DataPt[]} An array of output data points.
   */
  private _createArithmeticOutput(
    name: ArithmeticOperator,
    inPts: DataPt[],
  ): DataPt[] {
    const values = inPts.map((pt) => pt.value);
    const outValue: bigint[] = executeOperation(name, values);

    const source = this.parent.placementIndex;
    let sourceBitSize: number
    switch (name) {
      case 'DecToBit':
      case 'PrepareEdDsaScalars': 
        sourceBitSize = 1
        break
      case 'Poseidon':
      case 'JubjubExp36':
      case 'EdDsaVerify':
      case 'VerifyMerkleProof':
        sourceBitSize = 255
        break
      default:
        sourceBitSize = DEFAULT_SOURCE_BIT_SIZE
    }

    return outValue.length > 0
      ? outValue.map((value, index) =>
          DataPtFactory.create({
            source,
            wireIndex: index,
            sourceBitSize,
          }, value),
        )
      : []
  }

  /**
   * Prepares the inputs for a subcircuit, including any required selectors.
   *
   * @param {ArithmeticOperator} name - The name of the arithmetic operation.
   * @param {DataPt[]} inPts - The input data points.
   * @returns {{ subcircuitName: SubcircuitNames; finalInPts: DataPt[] }} The name of the subcircuit and the final input data points.
   */
  private _prepareSubcircuitInputs(
    name: ArithmeticOperator,
    inPts: DataPt[],
  ): { subcircuitName: SubcircuitNames; finalInPts: DataPt[] } {
    const [subcircuitName, selector] = SUBCIRCUIT_MAPPING[name];

    const subcircuitInfo = this.parent.state.subcircuitInfoByName.get(subcircuitName)
    if (subcircuitInfo === undefined) {
      throw new Error(
        `Synthesizer: ${subcircuitName} subcircuit is not found for operation ${name}. Check qap-compiler.`,
      );
    }

    let finalInPts: DataPt[] = inPts;
    if (selector !== undefined) {
      const selectorPt = this.parent.loadArbitraryStatic(selector, 128, `ALU selector for ${name} of ${subcircuitName}`);
      finalInPts = [selectorPt, ...inPts];
    }

    if (subcircuitName === 'ALU3' || subcircuitName === 'ALU5') {
      const values = inPts.map((pt) => pt.value);
      if (values[0] > 255n) {
        throw new Error(
          `Synthesizer: Operation ${name} has a shift or size value greater than 255. Adjust ${subcircuitName} subcircuit in qap-compiler.`,
        );
      }
    }

    return { subcircuitName, finalInPts };
  }

  /**
   * Places an arithmetic operation in the synthesizer.
   *
   * This involves creating output data points, preparing inputs, and adding the placement.
   *
   * @param {ArithmeticOperator} name - The name of the arithmetic operation.
   * @param {DataPt[]} inPts - The input data points.
   * @returns {DataPt[]} The output data points from the operation.
   */
  public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    const outPts = this._createArithmeticOutput(name, inPts);
    const { subcircuitName, finalInPts } = this._prepareSubcircuitInputs(
      name,
      inPts,
    );
    this.parent.place(subcircuitName, finalInPts, outPts, name);

    return DataPtFactory.deepCopy(outPts);
  }

  public placePoseidon(inPts: DataPt[]): DataPt {
    // Ensure arity matches the concrete Poseidon4 we call
      if (POSEIDON_INPUTS !== 4) {
          throw new Error(`POSEIDON_INPUTS=${POSEIDON_INPUTS} not supported: expected 4 for poseidon4()`);
      }
      // Fold in chunks of POSEIDON_INPUTS; zero-pad tail; **strict field check** (no modular reduction)
      const foldOnce = (arr: DataPt[]): DataPt[] => {
          const total = Math.ceil(arr.length / POSEIDON_INPUTS) * POSEIDON_INPUTS;
          const out: DataPt[] = [];
          for (let i = 0; i < total; i += POSEIDON_INPUTS) {
              const chunk = Array.from({ length: POSEIDON_INPUTS }, (_, k) => arr[i + k] ?? this.parent.loadArbitraryStatic(0n, 1));
              // Every word must be within the field [0, MOD)
              // chunk.map(checkBLS12Modulus)
              out.push(...this.placeArith('Poseidon', chunk));
          }
          return out;
      };
  
      // Repeatedly fold until a single word remains
      let acc = foldOnce(inPts);
      while (acc.length > 1) acc = foldOnce(acc);
  
      // Return big-endian bytes of the field element; caller decides fixed-length padding if needed
      return DataPtFactory.deepCopy(acc[0])
  }

  public placeExp(inPts: DataPt[]): DataPt {
    const synthesizer = this.parent
    // a^b
    const aPt = inPts[0];
    const bPt = inPts[1];
    const bNum = Number(bPt.value);

    // Handle base cases for exponent
    if (bNum === 0) {
      return DataPtFactory.deepCopy(synthesizer.loadArbitraryStatic(BIGINT_1, 1));
    }
    if (bNum === 1) {
      return DataPtFactory.deepCopy(aPt);
    }

    const k = Math.floor(Math.log2(bNum)) + 1; //bit length of b

    const bitifyOutPts = synthesizer.placeArith('DecToBit', [bPt]).reverse();
    // LSB at index 0

    const chPts: DataPt[] = [];
    const ahPts: DataPt[] = [];
    chPts.push(synthesizer.loadArbitraryStatic(BIGINT_1, 1));
    ahPts.push(aPt);

    for (let i = 1; i <= k; i++) {
      const _inPts = [chPts[i - 1], ahPts[i - 1], bitifyOutPts[i - 1]];
      const _outPts = synthesizer.placeArith('SubEXP', _inPts);
      chPts.push(_outPts[0]);
      ahPts.push(_outPts[1]);
    }

    return DataPtFactory.deepCopy(chPts[chPts.length - 1]);
  }

  public placeJubjubExp(inPts: DataPt[], PoI: DataPt[]): DataPt[] {
    // Split each into 7 chunks of length 36
    const CHUNK_SIZE = 36 as const
    const NUM_CHUNKS = 7 as const

    if (inPts.length !== 254) {
      throw new Error('Invalid input to placeJubjubExp')
    }
    const base: DataPt[] = inPts.slice(0, 2)
    // Make sure that the input scalar bits are in MSB first
    const scalar_bits_MSB: DataPt[] = inPts.slice(2, )

    const scalar_bits_chunk: DataPt[][] = Array.from({ length: NUM_CHUNKS }, (_, i) =>
      scalar_bits_MSB.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    )

    if (PoI.length !== 2) {
      throw new Error('Invalid input to placeJubjubExp')
    }
    var P: DataPt[] = PoI.slice()
    var G: DataPt[] = base.slice()
    for (var i = 0; i < NUM_CHUNKS; i++) {
      const prevP = P.slice()
      const prevG = G.slice()
      // LSB first
      const chunkedInPts: DataPt[] = [...prevP, ...prevG, ...scalar_bits_chunk[NUM_CHUNKS - i - 1]]
      const outPts: DataPt[] = this.parent.placeArith('JubjubExp36', chunkedInPts)
      if (outPts.length !== 4) {
        throw new Error('Something wrong with JubjubExp36')
      }
      P = [outPts[0], outPts[1]]
      G = outPts.slice(2, )

      //TESTED
      const base_edwards = jubjub.Point.fromAffine({x: base[0].value, y: base[1].value})
      const exponent = scalar_bits_chunk.slice(NUM_CHUNKS - i - 1, ).flat().map(pt => pt.value).reduce((acc, b) => (acc << 1n) | b, 0n)
      const P_plain = base_edwards.multiply(exponent)
      const P_edwards = jubjub.Point.fromAffine({x: P[0].value, y: P[1].value})
      if (!P_plain.equals(P_edwards)) {
        throw new Error('JubjubExp mismatch from the reference')
      }
    }

    return DataPtFactory.deepCopy(P)
  }
}

/**
 * Executes an arithmetic operation on the given values.
 *
 * @param {ArithmeticOperator} name - The name of the arithmetic operation.
 * @param {bigint[]} values - An array of bigint values as input for the operation.
 * @returns {bigint | bigint[]} The result of the operation.
 */
function executeOperation(
  name: ArithmeticOperator,
  values: bigint[],
): bigint[] {
  const operation = ARITHMETIC_MAPPING[name];
  const out = operation(values)
  if (!Array.isArray(out)) {
    return [out]
  } else {
    return out
  }
}

// Operator and function mapping
const ARITHMETIC_MAPPING: Record<ArithmeticOperator, (...args: any) => any> = {
  ADD: ArithmeticOperations.add,
  MUL: ArithmeticOperations.mul,
  SUB: ArithmeticOperations.sub,
  DIV: ArithmeticOperations.div,
  SDIV: ArithmeticOperations.sdiv,
  MOD: ArithmeticOperations.mod,
  SMOD: ArithmeticOperations.smod,
  ADDMOD: ArithmeticOperations.addmod,
  MULMOD: ArithmeticOperations.mulmod,
  EXP: ArithmeticOperations.subEXP, //not directly used
  LT: ArithmeticOperations.lt,
  GT: ArithmeticOperations.gt,
  SLT: ArithmeticOperations.slt,
  SGT: ArithmeticOperations.sgt,
  EQ: ArithmeticOperations.eq,
  ISZERO: ArithmeticOperations.iszero,
  AND: ArithmeticOperations.and,
  OR: ArithmeticOperations.or,
  XOR: ArithmeticOperations.xor,
  NOT: ArithmeticOperations.not,
  SHL: ArithmeticOperations.shl,
  SHR: ArithmeticOperations.shr,
  SAR: ArithmeticOperations.sar,
  BYTE: ArithmeticOperations.byte,
  SIGNEXTEND: ArithmeticOperations.signextend,
  DecToBit: ArithmeticOperations.decToBit,
  SubEXP: ArithmeticOperations.subEXP,
  Accumulator: ArithmeticOperations.accumulator,
  Poseidon: ArithmeticOperations.poseidonN,
  PrepareEdDsaScalars: ArithmeticOperations.prepareEdDsaScalars,
  JubjubExp36: ArithmeticOperations.jubjubExp36,
  EdDsaVerify: ArithmeticOperations.edDsaVerify,
  VerifyMerkleProof: ArithmeticOperations.verifyMerkleProof,
} as const

