import { ACCUMULATOR_INPUT_LIMIT } from '../../../constant/index.ts';
import {
  DataPtFactory,
  MemoryPt,
  MemoryPtEntry,
  type DataAliasInfoEntry,
  type DataAliasInfos,
  type MemoryPts,
} from '../../../pointers/index.ts';
import type { DataPt, DataPtDescription, ArithmeticOperator } from '../../../types/index.ts';
import { ISynthesizerProvider } from './index.ts';

export class MemoryManager {
  public envCalldataMemoryPts: MemoryPts = []
  public envReturnMemoryPts: MemoryPts = []

  constructor(
    private parent: ISynthesizerProvider,
  ) {}

  public placeMSTORE(dataPt: DataPt, truncBitSize: number): DataPt {
    // MSTORE8 is used as truncSize=1, storing only the lowest 1 byte of data and discarding the rest.
    if (truncBitSize < dataPt.sourceBitSize) {
      // Since there is a modification in the original data, create a virtual operation to track this in Placements.
      // MSTORE8's modification is possible with AND operation (= AND(data, 0xff))
      const maskerString = '0x' + 'FF'.repeat(Math.ceil(truncBitSize / 8));

      const outValue = dataPt.value & BigInt(maskerString);
      if (dataPt.value !== outValue) {
        const subcircuitName = 'AND';
        const inPts: DataPt[] = [
          this.parent.loadArbitraryStatic(BigInt(maskerString), undefined, 'Masker for memory manipulation'),
          dataPt,
        ];
        const rawOutPt: DataPtDescription = {
          source: this.parent.placementIndex,
          wireIndex: 0,
          sourceBitSize: truncBitSize,
        };
        const outPts: DataPt[] = [DataPtFactory.create(rawOutPt, outValue)];
        this.parent.place(subcircuitName, inPts, outPts, subcircuitName);

        return outPts[0];
      }
    }
    const outPt = dataPt;
    outPt.sourceBitSize = truncBitSize;
    return outPt;
  }

  public placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt {
    if (dataAliasInfos.length === 0) {
      throw new Error(`Synthesizer: placeMemoryToStack: Noting tho load`);
    }
    return this.combineMemorySlices(dataAliasInfos);
  }

  public placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[] {
    if (dataAliasInfos.length === 0) {
      throw new Error(`Synthesizer: placeMemoryToMemory: Nothing to load`);
    }
    const copiedDataPts: DataPt[] = [];
    for (const info of dataAliasInfos) {
      // the lower index, the older data
      copiedDataPts.push(this.applyMask(info, true));
    }
    return copiedDataPts;
  }

  private calculateViewAdjustment(
    memoryPt: MemoryPts[number],
    srcOffset: number,
    dstOffset: number,
    viewLength: number,
  ) {
    const { memByteOffset: containerOffset, containerByteSize } = memoryPt;
    const containerEndPos = containerOffset + containerByteSize;

    const actualOffset = Math.max(srcOffset, containerOffset);
    const actualEndPos = Math.min(srcOffset + viewLength, containerEndPos);

    const adjustedOffset = actualOffset - srcOffset + dstOffset;
    const actualContainerSize = actualEndPos - actualOffset;
    const endingGap = containerEndPos - actualEndPos;

    return { adjustedOffset, actualContainerSize, endingGap };
  }

  private truncateDataPt(dataPt: DataPt, endingGap: number): DataPt {
    if (endingGap <= 0) {
      return dataPt;
    }
    // SHR data to truncate the ending part
    const [truncatedPt] = this.parent.placeArith('SHR', [
      this.parent.loadArbitraryStatic(BigInt(endingGap * 8), undefined, 'Shifter for memory manipulation'),
      dataPt,
    ]);
    return truncatedPt;
  }

  public adjustMemoryPts(
    dataPts: DataPt[],
    memoryPts: MemoryPts,
    srcOffset: number,
    dstOffset: number,
    viewLength: number,
  ): void {
    for (const [index, memoryPt] of memoryPts.entries()) {
      const { adjustedOffset, actualContainerSize, endingGap } =
        this.calculateViewAdjustment(
          memoryPt,
          srcOffset,
          dstOffset,
          viewLength,
        );

      memoryPt.memByteOffset = adjustedOffset;
      memoryPt.containerByteSize = actualContainerSize;
      memoryPt.dataPt = this.truncateDataPt(dataPts[index], endingGap);
    }
  }

  public copyMemoryPts(
    target: MemoryPts,
    srcOffset: bigint,
    length: bigint,
    dstOffset: bigint = 0n,
  ): MemoryPts {
    const srcOffsetNum = Number(srcOffset)
    const dstOffsetNum = Number(dstOffset)
    const lengthNum = Number(length)
    const simFromMemoryPt = MemoryPt.simulateMemoryPt(target)
    let toMemoryPts: MemoryPts = simFromMemoryPt.read(srcOffsetNum, lengthNum)
    const zeroMemoryPtEntry: MemoryPtEntry = {
      memByteOffset: dstOffsetNum,
      containerByteSize: lengthNum,
      dataPt: this.parent.loadArbitraryStatic(0n, 1),
    }
    if (toMemoryPts.length > 0) {
      const simToMemoryPt = MemoryPt.simulateMemoryPt(toMemoryPts)
      const dataAliasInfos = simToMemoryPt.getDataAlias(srcOffsetNum, lengthNum)
      if (dataAliasInfos.length > 0) {
        const resolvedDataPts = this.parent.placeMemoryToMemory(dataAliasInfos)
        this.adjustMemoryPts(
          resolvedDataPts,
          toMemoryPts,
          srcOffsetNum,
          dstOffsetNum,
          lengthNum,
        )
      } else {
        toMemoryPts.push(zeroMemoryPtEntry)
      }
    } else {
      toMemoryPts.push(zeroMemoryPtEntry)
    }
  
    return toMemoryPts
  }

  private combineMemorySlices(dataAliasInfos: DataAliasInfos): DataPt {
    const transformedSlices = dataAliasInfos.map((info) =>
      this.transformMemorySlice(info),
    );

    if (transformedSlices.length === 1) {
      return transformedSlices[0];
    }

    if (transformedSlices.length > ACCUMULATOR_INPUT_LIMIT) {
      throw new Error(
        `Synthesizer: Go to qap-compiler and unlimit the number of inputs for the Accumulator.`,
      );
    }

    // placeArith returns an array of outPts, but Accumulator returns one.
    const [accumulatedPt] = this.parent.placeArith(
      'Accumulator',
      transformedSlices,
    );
    return accumulatedPt;
  }

  private transformMemorySlice(info: DataAliasInfoEntry): DataPt {
    const shiftedPt = this.applyShift(info);
    const modInfo: DataAliasInfoEntry = {
      dataPt: shiftedPt,
      masker: info.masker,
      shift: info.shift,
    };
    return this.applyMask(modInfo);
  }

  private applyShift(info: DataAliasInfoEntry): DataPt {
    const { dataPt: dataPt, shift: shift } = info;
    let outPts = [dataPt];
    if (Math.abs(shift) > 0) {
      // The relationship between shift value and shift direction is defined in MemoryPt
      const subcircuitName: ArithmeticOperator = shift > 0 ? 'SHL' : 'SHR';
      const absShift = Math.abs(shift);
      const inPts: DataPt[] = [
        this.parent.loadArbitraryStatic(BigInt(absShift), undefined, 'Shifter for memory manipulation'),
        dataPt,
      ];
      outPts = this.parent.placeArith(subcircuitName, inPts);
    }
    return outPts[0];
  }

  private applyMask(info: DataAliasInfoEntry, unshift?: boolean): DataPt {
    let masker = info.masker;
    const { shift, dataPt } = info;
    if (unshift === true) {
      const maskerBigint = BigInt(masker);
      const unshiftMaskerBigint =
        shift > 0
          ? maskerBigint >> BigInt(Math.abs(shift))
          : maskerBigint << BigInt(Math.abs(shift));
      masker = '0x' + unshiftMaskerBigint.toString(16);
    }
    const maskOutValue = dataPt.value & BigInt(masker);
    let outPts = [dataPt];
    if (maskOutValue !== dataPt.value) {
      const inPts: DataPt[] = [this.parent.loadArbitraryStatic(BigInt(masker), undefined, 'Masker for memory manipulation'), dataPt];
      outPts = this.parent.placeArith('AND', inPts);
    }
    return outPts[0];
  }
}
