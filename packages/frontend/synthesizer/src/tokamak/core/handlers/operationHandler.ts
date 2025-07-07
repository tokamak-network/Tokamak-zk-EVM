import {
  DEFAULT_SOURCE_SIZE,
  SUBCIRCUIT_MAPPING,
  ACCUMULATOR_INPUT_LIMIT,
} from '../../constant/index.js';
import { OPERATION_MAPPING } from '../../operations/index.js';
import { DataPointFactory } from '../../pointers/index.js';
import {
  InvalidInputCountError,
  SynthesizerError,
} from '../../validation/index.js';
import { StateManager } from './stateManager.js';
import type { ISynthesizerProvider } from './synthesizerProvider.js';

import type { ArithmeticOperator } from '../../types/arithmetic.js';
import type {
  DataPt,
  SubcircuitNames,
  CreateDataPointParams,
} from '../../types/index.js';

export class OperationHandler {
  constructor(
    private provider: ISynthesizerProvider,
    private state: StateManager,
  ) {}

  /**
   * Executes an arithmetic operation on the given values.
   *
   * @param {ArithmeticOperator} name - The name of the arithmetic operation.
   * @param {bigint[]} values - An array of bigint values as input for the operation.
   * @returns {bigint | bigint[]} The result of the operation.
   */
  private executeOperation(
    name: ArithmeticOperator,
    values: bigint[],
  ): bigint | bigint[] {
    const operation = OPERATION_MAPPING[name];
    if (name === 'Accumulator') {
      return operation(values);
    } else {
      return operation(...values);
    }
  }

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
    const outValue = this.executeOperation(name, values);

    const source = this.state.placementIndex;
    const sourceSize = name === 'DecToBit' ? 1 : DEFAULT_SOURCE_SIZE;
    return Array.isArray(outValue)
      ? outValue.map((value, index) =>
          DataPointFactory.create({
            source,
            wireIndex: index,
            value,
            sourceSize,
          }),
        )
      : [
          DataPointFactory.create({
            source,
            wireIndex: 0,
            value: outValue,
            sourceSize,
          }),
        ];
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

    if (this.state.subcircuitInfoByName.get(subcircuitName) === undefined) {
      throw new Error(
        `Synthesizer: ${subcircuitName} subcircuit is not found for operation ${name}. Check qap-compiler.`,
      );
    }

    let finalInPts: DataPt[] = inPts;
    if (selector !== undefined) {
      const selectorPt = this.provider.loadAuxin(selector, 1);
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
      this.provider.place(subcircuitName, finalInPts, outPts, name);

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
}
