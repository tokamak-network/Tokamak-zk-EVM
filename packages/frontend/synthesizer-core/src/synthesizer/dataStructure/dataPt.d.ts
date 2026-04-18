import { DataPt, DataPtDescription } from '../types/index.ts';
export declare class DataPtFactory {
    /**
     * Deep-copies a DataPt, a tuple [DataPt, DataPt], or an array of DataPt.
     * The return type is preserved based on the input type (via overloads).
     */
    static deepCopy(a: DataPt): DataPt;
    static deepCopy(a: [DataPt, DataPt]): [DataPt, DataPt];
    static deepCopy(a: readonly [DataPt, DataPt]): [DataPt, DataPt];
    static deepCopy<T extends ReadonlyArray<DataPt>>(a: T): T;
    static create(params: DataPtDescription, value: bigint): DataPt;
    static createBufferTwin(dataPt: DataPt): DataPt;
}
//# sourceMappingURL=dataPt.d.ts.map