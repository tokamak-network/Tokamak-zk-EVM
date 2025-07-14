import type { ArithmeticOperator } from '../../types/arithmetic.js';
import type { DataPt, SubcircuitNames } from '../../types/index.js';

export interface ISynthesizerProvider {
  loadAuxin(value: bigint, size?: number): DataPt;
  place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: ArithmeticOperator,
  ): void;
}
