import {
  DEFAULT_SOURCE_SIZE,
  ACCUMULATOR_INPUT_LIMIT,
} from '../../constant/index.ts';
import {
  InvalidInputCountError,
  SynthesizerError,
} from '../../validation/index.ts';
import { StateManager } from './stateManager.ts';
import type { ISynthesizerProvider } from './index.ts';

import type { ArithmeticOperator } from '../../types/index.ts';
import {
  SUBCIRCUIT_MAPPING,
  type DataPt,
  type SubcircuitNames,
} from '../../types/index.ts';
import { DataPtFactory } from 'src/tokamak/pointers/index.ts';
import { ARITHMETIC_MAPPING } from 'src/tokamak/operations/index.ts';
import { BIGINT_1 } from '@ethereumjs/util';

/**
 * Executes an arithmetic operation on the given values.
 *
 * @param {ArithmeticOperator} name - The name of the arithmetic operation.
 * @param {bigint[]} values - An array of bigint values as input for the operation.
 * @returns {bigint | bigint[]} The result of the operation.
 */
export function executeOperation(
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

export class ArithmeticHandler {
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
    let sourceSize: number = DEFAULT_SOURCE_SIZE
    if (name === 
      'DecToBit'||
      'PreparedEdDsaScalars'
    ) {
      sourceSize = 1
    }
    if (name === 
      'Poseidon4'||
      'JubjubEXP36'||
      'EdDsaVerify'
    ) {
      sourceSize = 255
    }

    return outValue.length > 0
      ? outValue.map((value, index) =>
          DataPtFactory.create({
            source,
            wireIndex: index,
            sourceSize,
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

    if (this.parent.state.subcircuitInfoByName.get(subcircuitName) === undefined) {
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
    try {
      const outPts = this._createArithmeticOutput(name, inPts);
      const { subcircuitName, finalInPts } = this._prepareSubcircuitInputs(
        name,
        inPts,
      );
      this.parent.place(subcircuitName, finalInPts, outPts, name);

      return outPts;
    } catch (error) {
      if (error instanceof InvalidInputCountError) {
        /*eslint-disable*/
        console.error(`Invalid input count for ${name}: ${error.message}`);
      }
      if (error instanceof SynthesizerError) {
        /*eslint-disable*/
        console.error(`Synthesizer error in ${name}: ${error.message}`);
      }
      throw error;
    }
  }

  public placeExp(inPts: DataPt[]): DataPt {
    const synthesizer = this.parent
    // a^b
    const aPt = inPts[0];
    const bPt = inPts[1];
    const bNum = Number(bPt.value);

    // Handle base cases for exponent
    if (bNum === 0) {
      return synthesizer.loadArbitraryStatic(BIGINT_1, 1);
    }
    if (bNum === 1) {
      return aPt;
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

    return chPts[chPts.length - 1];
  }

  public placeJubjubExp(inPts: DataPt[], PoI: DataPt[]): DataPt[] {
    // Split each into 7 chunks of length 36
    const CHUNK_SIZE = 36 as const
    const NUM_CHUNKS = 7 as const

    if (inPts.length !== 254) {
      throw new Error('Invalid input to placeJubjubExp')
    }
    const base: DataPt[] = inPts.slice(0, 2)
    const scalar_bits: DataPt[] = inPts.slice(2, -1)

    const scalar_bits_chunk: DataPt[][] = Array.from({ length: NUM_CHUNKS }, (_, i) =>
      scalar_bits.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    )

    if (PoI.length !== 2) {
      throw new Error('Invalid input to placeJubjubExp')
    }
    var P: DataPt[] = PoI
    var G: DataPt[] = base
    for (var i = 0; i < NUM_CHUNKS; i++) {
      const inPts: DataPt[] = [...P, ...G, ...scalar_bits_chunk[i]]
      const outPts: DataPt[] = this.parent.placeArith('JubjubExp36', inPts)
      if (outPts.length !== 4) {
        throw new Error('Something wrong with JubjubExp36')
      }
      P = outPts.slice(0, 2)
      G = outPts.slice(2, -1)
    }
    return P
  }
}
