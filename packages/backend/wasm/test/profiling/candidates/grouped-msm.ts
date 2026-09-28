import type { FfGroup, FfThreadManager, FfWorkerCommand } from "../../../src/runtime/curve/curve.js";

// Keep the installed ffjavascript unsigned kernel's window widths. Only task
// delivery changes: one worker receives each base/scalar range once per group.
const WINDOW_BITS = [1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 7, 8, 9, 10, 11, 12,
  13, 13, 14, 15, 16, 16, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17];

export async function groupedG1Msm(group: FfGroup, tm: FfThreadManager, bases: Uint8Array, scalars: Uint8Array): Promise<Uint8Array> {
  const count = bases.length / 96;
  if (!Number.isInteger(count) || scalars.length !== count * 32) throw new Error("Grouped G1 MSM length mismatch.");
  if (count === 0) return group.zero;
  const width = WINDOW_BITS[Math.floor(Math.log2(count))]!;
  const windowCount = Math.ceil(256 / width);
  const chunkSize = Math.max(1024, Math.min(1 << 22, Math.floor(count * windowCount / tm.concurrency)));
  let result = group.zero;
  for (let start = 0; start < count; start += chunkSize) {
    const end = Math.min(count, start + chunkSize), n = end - start;
    const bits = WINDOW_BITS[Math.floor(Math.log2(n))]!, windows = Math.ceil(256 / bits);
    const groups = Math.min(windows, tm.concurrency), pending: Promise<Uint8Array[]>[] = [];
    const points = bases.subarray(start * 96, end * 96), values = scalars.subarray(start * 32, end * 32);
    for (let g = 0; g < groups; g++) {
      const first = Math.floor(g * windows / groups), last = Math.floor((g + 1) * windows / groups);
      const task: FfWorkerCommand[] = [
        { cmd: "ALLOCSET", var: 0, buff: points },
        { cmd: "ALLOCSET", var: 1, buff: values },
        { cmd: "ALLOC", var: 2, len: 144 },
      ];
      for (let w = first; w < last; w++) task.push(
        { cmd: "CALL", fnName: "g1m_multiexpAffine_chunk", params: [
          { var: 0 }, { var: 1 }, { val: 32 }, { val: n },
          { val: w * bits }, { val: Math.min(bits, 256 - w * bits) }, { var: 2 },
        ] },
        { cmd: "GET", out: w - first, var: 2, len: 144 },
      );
      pending.push(tm.queueAction(task));
    }
    const terms = (await Promise.all(pending)).flat();
    let sum = group.zero;
    for (let w = terms.length - 1; w >= 0; w--) {
      if (!group.isZero(sum)) for (let bit = 0; bit < bits; bit++) sum = group.double(sum);
      if (!group.isZero(terms[w]!)) sum = group.isZero(sum) ? terms[w]! : group.add(sum, terms[w]!);
    }
    if (!group.isZero(sum)) result = group.isZero(result) ? sum : group.add(result, sum);
  }
  return result;
}
