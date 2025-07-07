import type { DataPt } from '../../types/index.js';

export interface IDataLoaderProvider {
  addWireToInBuffer(inPt: DataPt, placementId: number): DataPt;
  addWireToOutBuffer(inPt: DataPt, outPt: DataPt, placementId: number): void;
}
