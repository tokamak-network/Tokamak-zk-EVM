import { BIGINT_0 } from "@synthesizer-libs/util"
import { DataPt } from "../types/synthesizer.js"
import { MemoryPt } from "../pointers/memoryPt.js"
import { Synthesizer } from "../core/synthesizer.js"

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
