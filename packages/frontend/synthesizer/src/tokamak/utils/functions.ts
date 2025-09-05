import { BIGINT_0 } from "@synthesizer-libs/util"
import { DataPt } from "../types/synthesizer.js"
import { copyMemoryRegion, MemoryPt } from "../pointers/memoryPt.js"
import { Synthesizer } from "../index.ts"
import { RunState } from "src/interpreter.js";
import { getDataSlice } from "src/opcodes/util.js";

export function chunkMemory(
    offset: bigint,
    length: bigint,
    memoryPt: MemoryPt,
    synthesizer: Synthesizer
  ): { chunkDataPts: DataPt[]; dataRecovered: bigint } {
    const offsetNum = Number(offset);
    const lengthNum = Number(length);
    let nChunks = lengthNum > 32 ? Math.ceil(lengthNum / 32) : 1;
  
    const chunkDataPts: DataPt[] = [];
    let dataRecovered = BIGINT_0;
    let lengthLeft = lengthNum;
  
    for (let i = 0; i < nChunks; i++) {
      const _offset = offsetNum + 32 * i;
      const _length = lengthLeft > 32 ? 32 : lengthLeft;
      lengthLeft -= _length;
  
      const dataAliasInfos = memoryPt.getDataAlias(_offset, _length);
      if (dataAliasInfos.length > 0) {
        chunkDataPts[i] = synthesizer.placeMemoryToStack(dataAliasInfos);
      } else {
        chunkDataPts[i] = synthesizer.loadAuxin(BIGINT_0);
      }
  
      dataRecovered += chunkDataPts[i].value << BigInt(lengthLeft * 8);
    }
  
    return { chunkDataPts, dataRecovered };
}

export function writeCallOutputPt(runState: RunState, outOffset: bigint, outLength: bigint): Uint8Array {
    const returnMemoryPts = runState.interpreter.getReturnMemoryPts()
    if (returnMemoryPts.length > 0) {
        const acceptMemoryPts = copyMemoryRegion(runState, BIGINT_0, outLength, returnMemoryPts)
        for (const entry of acceptMemoryPts) {
        // the lower index, the older data
        runState.memoryPt.write(
            Number(outOffset) + entry.memOffset,
            entry.containerSize,
            entry.dataPt,
        )
        }
    }
    return runState.memoryPt.viewMemory(Number(outOffset), Number(outLength))
}
