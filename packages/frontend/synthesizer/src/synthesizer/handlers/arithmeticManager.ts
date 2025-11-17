
import { BIGINT_1 } from '@ethereumjs/util';
import { DataPt, ISynthesizerProvider } from '../types/index.ts';
import { poseidon4 } from 'poseidon-bls12381';
import { DataPtFactory } from '../dataStructure/index.ts';
import { DEFAULT_SOURCE_BIT_SIZE } from 'src/synthesizer/params/index.ts';
import { ArithmeticOperator, poseidon_raw, SUBCIRCUIT_ALU_MAPPING, SubcircuitNames } from 'src/interface/qapCompiler/configuredTypes.ts';
import { jubjub } from '@noble/curves/misc';
import { ArithmeticOperations } from '../dataStructure/arithmeticOperations.ts';
import { ARITH_EXP_BATCH_SIZE, JUBJUB_EXP_BATCH_SIZE, MT_DEPTH, POSEIDON_INPUTS } from 'src/interface/qapCompiler/importedConstants.ts';

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
    let sourceBitSize: number
    switch (name) {
      case 'DecToBit':
      // case 'PrepareEdDsaScalars': 
        sourceBitSize = 1
        break
      case 'Poseidon':
        if (inPts.length !== POSEIDON_INPUTS) {
          throw new Error(`Use 'placePoseidon' function for variable input length, instead.`)
        }
      case 'JubjubExpBatch':
      case 'EdDsaVerify':
      case 'VerifyMerkleProof':
        sourceBitSize = 255
        break
      default:
        sourceBitSize = DEFAULT_SOURCE_BIT_SIZE
    }

    const values = inPts.map((pt) => pt.value);
    const outValue: bigint[] = executeOperation(name, values);

    return outValue.length > 0
      ? outValue.map((value, index) =>
          DataPtFactory.create({
            source: this.parent.placements.length,
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
    const [subcircuitName, selector] = SUBCIRCUIT_ALU_MAPPING[name];

    const subcircuitInfo = this.parent.state.subcircuitInfoByName.get(subcircuitName)
    if (subcircuitInfo === undefined) {
      throw new Error(
        `Synthesizer: ${subcircuitName} subcircuit is not found for operation ${name}. Check qap-compiler.`,
      );
    }

    let finalInPts: DataPt[] = inPts;
    if (selector !== undefined) {
      const selectorPt = this.parent.loadArbitraryStatic(selector, 32, `ALU selector for ${name} of ${subcircuitName}`);
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
      // Fold in chunks of POSEIDON_INPUTS; zero-pad tail; **strict field check** (no modular reduction)
      const foldOnce = (arr: DataPt[]): DataPt[] => {
          const total = Math.ceil(arr.length / POSEIDON_INPUTS) * POSEIDON_INPUTS;
          const out: DataPt[] = [];
          for (let i = 0; i < total; i += POSEIDON_INPUTS) {
              const chunk = Array.from({ length: POSEIDON_INPUTS }, (_, k) => arr[i + k] ?? this.parent.loadArbitraryStatic(0n));
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

  // public placeExp(inPts: DataPt[]): DataPt {
  //   const synthesizer = this.parent
  //   // a^b
  //   const aPt = inPts[0];
  //   const bPt = inPts[1];
  //   const bNum = Number(bPt.value);

  //   // Handle base cases for exponent
  //   if (bNum === 0) {
  //     return DataPtFactory.deepCopy(synthesizer.loadArbitraryStatic(BIGINT_1));
  //   }
  //   if (bNum === 1) {
  //     return DataPtFactory.deepCopy(aPt);
  //   }

  //   const k = Math.floor(Math.log2(bNum)) + 1; //bit length of b

  //   const bitifyOutPts = synthesizer.placeArith('DecToBit', [bPt]).reverse();
  //   // LSB at index 0

  //   const chPts: DataPt[] = [];
  //   const ahPts: DataPt[] = [];
  //   chPts.push(synthesizer.loadArbitraryStatic(BIGINT_1));
  //   ahPts.push(aPt);

  //   for (let i = 1; i <= k; i++) {
  //     const _inPts = [chPts[i - 1], ahPts[i - 1], bitifyOutPts[i - 1]];
  //     const _outPts = synthesizer.placeArith('SubEXP', _inPts);
  //     chPts.push(_outPts[0]);
  //     ahPts.push(_outPts[1]);
  //   }

  //   return DataPtFactory.deepCopy(chPts[chPts.length - 1]);
  // }

  public placeExp(inPts: DataPt[], reference?: bigint): DataPt {
    // a^b
    const CHUNK_SIZE = ARITH_EXP_BATCH_SIZE
    const NUM_CHUNKS = Math.ceil(DEFAULT_SOURCE_BIT_SIZE / CHUNK_SIZE)
    if (inPts.length !== DEFAULT_SOURCE_BIT_SIZE + 1) {
      throw new Error('Invalid input to SubExp')
    }
    const base: DataPt= inPts[0]
    // Make sure that the input scalar bits are in LSB-first
    const scalar_bits_LSB: DataPt[] = inPts.slice(1, )
    if (reference !== undefined) {
      const recoverValueFromLSBString = (string: DataPt[]): bigint => {
        return string.map(pt => pt.value).reduce((acc, b, i) => acc | (b << BigInt(i)), 0n);
      }
      if (reference !== recoverValueFromLSBString(scalar_bits_LSB)) {
        throw new Error('The reference value cannot be recovered from the bit string')
      }
    }

    // const scalar_bits_chunk: DataPt[][] = Array.from({ length: NUM_CHUNKS }, (_, i) =>
    //   scalar_bits_LSB.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    // )

    const scalar_bits_chunk: DataPt[][] = Array.from({ length: NUM_CHUNKS }, (_, i) => {
      const start = i * CHUNK_SIZE;
      const end = (i + 1) * CHUNK_SIZE;
      const chunk = scalar_bits_LSB.slice(start, end);
      return chunk.length === CHUNK_SIZE
        ? chunk
        : chunk.concat(
            Array.from({ length: CHUNK_SIZE - chunk.length },
              () => this.parent.getReservedVariableFromBuffer('CIRCOM_CONST_ZERO'),
            )
          );
    });

    var c: DataPt = this.parent.loadArbitraryStatic(1n)
    var a: DataPt = base
    for (var i = 0; i < NUM_CHUNKS; i++) {
      const prev_c = c
      const prev_a = a
      // LSB first
      const chunkedInPts: DataPt[] = [prev_c, prev_a, ...scalar_bits_chunk[i]]
      const outPts: DataPt[] = this.parent.placeArith('SubExpBatch', chunkedInPts)
      if (outPts.length !== 2) {
        throw new Error('Something wrong with SubExpBatch')
      }
      c = outPts[0]
      a = outPts[1]
    }

    if (reference !== undefined) {
      if ((base.value ** reference) % (1n<<256n) !== c.value) {
        throw new Error(`SubExpBatch calculation is incorrect`)
      }
    }
    
    return DataPtFactory.deepCopy(c)
  }

  public placeJubjubExp(inPts: DataPt[], PoI: DataPt[], reference?: bigint): DataPt[] {
    const CHUNK_SIZE = JUBJUB_EXP_BATCH_SIZE
    const NUM_CHUNKS = Math.ceil(DEFAULT_SOURCE_BIT_SIZE / CHUNK_SIZE)

    if (inPts.length !== DEFAULT_SOURCE_BIT_SIZE + 2) {
      throw new Error('Invalid input to placeJubjubExp')
    }
    const base: DataPt[] = inPts.slice(0, 2)
    // Make sure that the input scalar bits are in LSB-first
    const scalar_bits_LSB: DataPt[] = inPts.slice(2, )
    if (reference !== undefined) {
      const recoverValueFromLSBString = (string: DataPt[]): bigint => {
        return string.map(pt => pt.value).reduce((acc, b, i) => acc | (b << BigInt(i)), 0n);
      }
      if (reference !== recoverValueFromLSBString(scalar_bits_LSB)) {
        throw new Error('The reference value cannot be recovered from the bit string')
      }
    }

    // const scalar_bits_chunk: DataPt[][] = Array.from({ length: NUM_CHUNKS }, (_, i) =>
    //   scalar_bits_LSB.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    // )

    const scalar_bits_chunk: DataPt[][] = Array.from({ length: NUM_CHUNKS }, (_, i) => {
      const start = i * CHUNK_SIZE;
      const end = (i + 1) * CHUNK_SIZE;
      const chunk = scalar_bits_LSB.slice(start, end);
      return chunk.length === CHUNK_SIZE
        ? chunk
        : chunk.concat(
            Array.from({ length: CHUNK_SIZE - chunk.length },
              () => this.parent.getReservedVariableFromBuffer('CIRCOM_CONST_ZERO'),
            )
          );
    });

    if (PoI.length !== 2) {
      throw new Error('Invalid input to placeJubjubExp')
    }
    var P: DataPt[] = PoI.slice()
    var G: DataPt[] = base.slice()
    for (var i = 0; i < NUM_CHUNKS; i++) {
      const prevP = P.slice()
      const prevG = G.slice()
      // LSB first
      const chunkedInPts: DataPt[] = [...prevP, ...prevG, ...scalar_bits_chunk[i]]
      const outPts: DataPt[] = this.parent.placeArith('JubjubExpBatch', chunkedInPts)
      if (outPts.length !== 4) {
        throw new Error('Something wrong with JubjubExpBatch')
      }
      P = [outPts[0], outPts[1]]
      G = outPts.slice(2, )

      // //TESTED
      // const base_edwards = jubjub.Point.fromAffine({x: base[0].value, y: base[1].value})
      // const exponent = scalar_bits_chunk.slice(i, ).flat().map(pt => pt.value).reduce((acc, b, i) => acc | (b << BigInt(i)), 0n);
      // const P_plain = base_edwards.multiply(exponent % jubjub.Point.Fn.ORDER)
      // const P_edwards = jubjub.Point.fromAffine({x: P[0].value, y: P[1].value})
      // if (!P_plain.equals(P_edwards)) {
      //   throw new Error('JubjubExp mismatch from the reference')
      // }
    }

    return DataPtFactory.deepCopy(P)
  }

  public placeMerkleProofVerification (indexPt: DataPt, leafPt: DataPt, siblings: bigint[][], rootPt: DataPt): void {
    // const computeParentsNodePts = (childIndexPt: DataPt, childPt: DataPt, siblings: bigint[]): {parentIndexPt: DataPt, parentPt: DataPt} => {
    //   if (siblings.length !== POSEIDON_INPUTS - 1) {
    //     throw new Error(`Siblings of each level for a Merkle proof should be ${POSEIDON_INPUTS - 1}, but got ${siblings.length}.`)
    //   }
    //   const childIndex = Number(childIndexPt.value)
    //   const childHomeIndex = childIndex % POSEIDON_INPUTS
    //   const parentIndex = Math.floor( childIndex / POSEIDON_INPUTS)
      
    //   const children = [
    //     ...siblings.slice(0, childHomeIndex),
    //     childPt.value,
    //     ...siblings.slice(childHomeIndex, )
    //   ]

    //   return{
    //     parentIndexPt: this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', BigInt(parentIndex), true),
    //     parentPt: this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', poseidon_raw(children), true),  
    //   }
    // }

    const computeParentsNode = (childIndex: number, child: bigint, siblings: bigint[]): {parentIndex: number, parent: bigint} => {
      if (siblings.length !== POSEIDON_INPUTS - 1) {
        throw new Error(`Siblings of each level for a Merkle proof should be ${POSEIDON_INPUTS - 1}, but got ${siblings.length}.`)
      }
      const childHomeIndex = childIndex % POSEIDON_INPUTS
      const parentIndex = Math.floor( childIndex / POSEIDON_INPUTS)
      
      const children = [
        ...siblings.slice(0, childHomeIndex),
        child,
        ...siblings.slice(childHomeIndex, )
      ]

      return{
        parentIndex,
        parent: poseidon_raw(children),  
      }
    }
    let childPt: DataPt = leafPt
    let childIndexPt: DataPt = indexPt

    // for (var level = 0; level < MT_DEPTH; level++) {
    //   const thisSiblings = siblings[level]
    //   const siblingPts: DataPt[] = thisSiblings.map(value => this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', value, true))
    //   const {parentIndexPt, parentPt} = computeParentsNodePts(childIndexPt, childPt, thisSiblings)

    //   if (level < MT_DEPTH - 1) {
    //     this.placeArith('VerifyMerkleProof', [childIndexPt, childPt, ...siblingPts, parentIndexPt, parentPt])
    //   } else {
    //     this.placeArith('VerifyMerkleProof', [childIndexPt, childPt, ...siblingPts, parentIndexPt, rootPt])
    //   }

    //   childPt = parentPt
    //   childIndexPt = parentIndexPt
    // }

    let level = 0
    while (level < MT_DEPTH) {
      const remaining = MT_DEPTH - level

      if (remaining >= 3) {
        const sib0 = siblings[level]
        const sib1 = siblings[level + 1]
        const sib2 = siblings[level + 2]

        const sibPts0: DataPt[] = sib0.map(value => this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', value, true))
        const sibPts1: DataPt[] = sib1.map(value => this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', value, true))
        const sibPts2: DataPt[] = sib2.map(value => this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', value, true))

        const { parentIndex: pIdx1, parent: pPt1 } = computeParentsNode(Number(childIndexPt.value), childPt.value, sib0)
        const { parentIndex: pIdx2, parent: pPt2 } = computeParentsNode(pIdx1, pPt1, sib1)
        const { parentIndex, parent: parentVal } = computeParentsNode(pIdx2, pPt2, sib2)
        const parentIndexPt = this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', BigInt(parentIndex), true)
        const parentPt = this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', parentVal, true)

        const isLastGroup = level + 3 >= MT_DEPTH
        const finalParentPt = isLastGroup ? rootPt : parentPt

        this.placeArith('VerifyMerkleProof3x', [
          childIndexPt,
          childPt,
          ...sibPts0,
          ...sibPts1,
          ...sibPts2,
          parentIndexPt,
          finalParentPt,
        ])

        childPt = finalParentPt
        childIndexPt = parentIndexPt
        level += 3
      } else if (remaining >= 2) {
        const sib0 = siblings[level]
        const sib1 = siblings[level + 1]

        const sibPts0: DataPt[] = sib0.map(value => this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', value, true))
        const sibPts1: DataPt[] = sib1.map(value => this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', value, true))

        const { parentIndex: pIdx1, parent: pPt1 } = computeParentsNode(Number(childIndexPt.value), childPt.value, sib0)
        const { parentIndex, parent: parentVal } = computeParentsNode(pIdx1, pPt1, sib1)
        const parentIndexPt = this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', BigInt(parentIndex), true)
        const parentPt = this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', parentVal, true)

        const isLastGroup = level + 2 >= MT_DEPTH
        const finalParentPt = isLastGroup ? rootPt : parentPt

        this.placeArith('VerifyMerkleProof2x', [
          childIndexPt,
          childPt,
          ...sibPts0,
          ...sibPts1,
          parentIndexPt,
          finalParentPt,
        ])

        childPt = finalParentPt
        childIndexPt = parentIndexPt
        level += 2
      } else {
        const thisSiblings = siblings[level]
        const siblingPts: DataPt[] = thisSiblings.map(value => this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', value, true))
        const { parentIndex, parent: parentVal } = computeParentsNode(Number(childIndexPt.value), childPt.value, thisSiblings)
        const parentIndexPt = this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', BigInt(parentIndex), true)
        const parentPt = this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', parentVal, true)

        const isLastLevel = level === MT_DEPTH - 1
        const finalParentPt = isLastLevel ? rootPt : parentPt

        this.placeArith('VerifyMerkleProof', [
          childIndexPt,
          childPt,
          ...siblingPts,
          parentIndexPt,
          finalParentPt,
        ])

        childPt = parentPt
        childIndexPt = parentIndexPt
        level += 1
      }
    }
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
  EXP: ArithmeticOperations.subExpBatch, //not directly used
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
  // SubEXP: ArithmeticOperations.subEXP,
  SubExpBatch: ArithmeticOperations.subExpBatch,
  Accumulator: ArithmeticOperations.accumulator,
  Poseidon: ArithmeticOperations.poseidonN,
  // PrepareEdDsaScalars: ArithmeticOperations.prepareEdDsaScalars,
  JubjubExpBatch: ArithmeticOperations.jubjubExpBatch,
  EdDsaVerify: ArithmeticOperations.edDsaVerify,
  VerifyMerkleProof: ArithmeticOperations.verifyMerkleProof,
  VerifyMerkleProof2x: ArithmeticOperations.verifyMerkleProof2x,
  VerifyMerkleProof3x: ArithmeticOperations.verifyMerkleProof3x,
} as const

