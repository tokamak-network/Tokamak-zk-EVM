import type { ArithmeticOperator } from '../../types/arithmetic.js';
import type { DataPt, SubcircuitNames } from '../../types/index.js';

export interface ISynthesizerProvider {
  // loadAuxin(value: bigint, size?: number): DataPt;
  loadStatic(value: bigint, subcircuit: SubcircuitNames, size?: number): DataPt;
  placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[];
  place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: ArithmeticOperator,
  ): void;
}
