import { ACCUMULATOR_INPUT_LIMIT } from '../../constant/index.js';
import type {
  DataAliasInfoEntry,
  DataAliasInfos,
  MemoryPts,
} from '../../pointers/index.js';
import type { CreateDataPointParams, DataPt } from '../../types/index.js';
import type { ArithmeticOperator } from '../../types/arithmetic.js';
import type { StateManager } from './stateManager.js';
import { DataPointFactory } from '../../pointers/index.js';
import type { IMemoryManagerProvider } from './memoryManagerProvider.js';
import { ISynthesizerProvider } from './synthesizerProvider.js';

export class MemoryManager {
  constructor(
    private provider: ISynthesizerProvider,
    private state: StateManager,
  ) {}

  public placeMSTORE(dataPt: DataPt, truncSize: number): DataPt {
    // MSTORE8 is used as truncSize=1, storing only the lowest 1 byte of data and discarding the rest.
    if (truncSize < dataPt.sourceSize) {
      // Since there is a modification in the original data, create a virtual operation to track this in Placements.
      // MSTORE8's modification is possible with AND operation (= AND(data, 0xff))
      const maskerString = '0x' + 'FF'.repeat(truncSize);

      const outValue = dataPt.value & BigInt(maskerString);
      if (dataPt.value !== outValue) {
        const subcircuitName = 'AND';
        const inPts: DataPt[] = [
          this.provider.loadAuxin(BigInt(maskerString)),
          dataPt,
        ];
        const rawOutPt: CreateDataPointParams = {
          source: this.state.placementIndex,
          wireIndex: 0,
          value: outValue,
          sourceSize: truncSize,
        };
        const outPts: DataPt[] = [DataPointFactory.create(rawOutPt)];
        this.provider.place(subcircuitName, inPts, outPts, subcircuitName);

        return outPts[0];
      }
    }
    const outPt = dataPt;
    outPt.sourceSize = truncSize;
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
    const { memOffset: containerOffset, containerSize } = memoryPt;
    const containerEndPos = containerOffset + containerSize;

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
    const [truncatedPt] = this.provider.placeArith('SHR', [
      this.provider.loadAuxin(BigInt(endingGap * 8)),
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

      memoryPt.memOffset = adjustedOffset;
      memoryPt.containerSize = actualContainerSize;
      memoryPt.dataPt = this.truncateDataPt(dataPts[index], endingGap);
    }
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
    const [accumulatedPt] = this.provider.placeArith(
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
        this.provider.loadAuxin(BigInt(absShift)),
        dataPt,
      ];
      outPts = this.provider.placeArith(subcircuitName, inPts);
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
      const inPts: DataPt[] = [this.provider.loadAuxin(BigInt(masker)), dataPt];
      outPts = this.provider.placeArith('AND', inPts);
    }
    return outPts[0];
  }
}
