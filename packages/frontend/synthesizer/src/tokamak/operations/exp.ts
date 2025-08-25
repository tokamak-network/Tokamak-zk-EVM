import { BIGINT_1 } from '@synthesizer-libs/util';

import type { Synthesizer } from '../core/synthesizer/index.js';
import type { DataPt } from '../types/index.js';

/**
 * Places the necessary subcircuits to perform exponentiation (a^b) by squaring.
 * @param synthesizer The synthesizer instance.
 * @param inPts An array containing the base (a) and exponent (b) as DataPts.
 * @returns The DataPt representing the result of the exponentiation.
 */
export function placeExp(synthesizer: Synthesizer, inPts: DataPt[]): DataPt {
  // a^b
  const aPt = inPts[0];
  const bPt = inPts[1];
  const bNum = Number(bPt.value);

  // Handle base cases for exponent
  if (bNum === 0) {
    return synthesizer.loadAuxin(BIGINT_1);
  }
  if (bNum === 1) {
    return aPt;
  }

  const k = Math.floor(Math.log2(bNum)) + 1; //bit length of b

  const bitifyOutPts = synthesizer.placeArith('DecToBit', [bPt]).reverse();
  // LSB at index 0

  const chPts: DataPt[] = [];
  const ahPts: DataPt[] = [];
  chPts.push(synthesizer.loadAuxin(BIGINT_1));
  ahPts.push(aPt);

  for (let i = 1; i <= k; i++) {
    const _inPts = [chPts[i - 1], ahPts[i - 1], bitifyOutPts[i - 1]];
    const _outPts = synthesizer.placeArith('SubEXP', _inPts);
    chPts.push(_outPts[0]);
    ahPts.push(_outPts[1]);
  }

  return chPts[chPts.length - 1];
}

export function placeJubjubExp(synthesizer:Synthesizer, inPts: DataPt[], PoI: DataPt[]): DataPt[] {
  // Split each into 7 chunks of length 36
  const CHUNK_SIZE = 36 as const
  const NUM_CHUNKS = 7 as const

  if (inPts.length !== 254) {
    throw new Error('Invalid input to placeJubjubExp')
  }
  const base: DataPt[] = inPts.slice(0, 2)
  const scalar_bits: DataPt[] = inPts.slice(2, -1)

  const scalar_bits_chunk: DataPt[][] = Array.from({ length: NUM_CHUNKS }, (_, i) =>
    scalar_bits.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
  )

  if (PoI.length !== 2) {
    throw new Error('Invalid input to placeJubjubExp')
  }
  var P: DataPt[] = PoI
  var G: DataPt[] = base
  for (var i = 0; i < NUM_CHUNKS; i++) {
    const inPts: DataPt[] = [...P, ...G, ...scalar_bits_chunk[i]]
    const outPts: DataPt[] = synthesizer.placeArith('JubjubExp36', inPts)
    if (outPts.length !== 4) {
      throw new Error('Something wrong with JubjubExp36')
    }
    P = outPts.slice(0, 2)
    G = outPts.slice(2, -1)
  }
  return P
}
