import { LegacyTx } from '@ethereumjs/tx';
import type { ArithmeticOperator } from '../../types/arithmetic.js';
import type { DataPt, Placements, ReservedVariable, SubcircuitNames } from '../../types/index.js';
import { StateManager } from './stateManager.ts';

export interface ISynthesizerProvider {
  // from StateManager
  get state(): StateManager
  get placementIndex(): number
  get placements(): Placements
  get transactions(): LegacyTx[]
  place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: ArithmeticOperator,
  ): void;
  //from BufferManager
  addWireToInBuffer(inPt: DataPt, placementId: number): DataPt
  addWireToOutBuffer(inPt: DataPt, outPt: DataPt, placementId: number): void
  readReservedVariableFromInputBuffer(varName: ReservedVariable, txNonce?: number): DataPt
  //from DataLoader
  loadArbitraryStatic(value: bigint, size?: number, desc?: string): DataPt
  //from ArithmeticHandler
  placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[];

}
