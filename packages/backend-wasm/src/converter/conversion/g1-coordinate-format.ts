import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { stripHex } from "./conversion-utils.js";

export function recoverG1Points(
  runtime: CurveRuntime,
  part1: readonly string[],
  part2: readonly string[],
  count: number,
): Uint8Array[] {
  if (part1.length !== count * 2 || part2.length < count * 2) {
    throw new Error("Formatted G1 point parts do not match the expected count.");
  }

  const points: Uint8Array[] = [];
  for (let index = 0; index < count * 2; index += 2) {
    points.push(
      runtime.G1.parseAffine({
        x: joinG1Coordinate(part1[index], part2[index]),
        y: joinG1Coordinate(part1[index + 1], part2[index + 1]),
      }),
    );
  }

  return points;
}

export function appendSplitG1Coordinate(part1: string[], part2: string[], coordinate: string): void {
  const padded = stripHex(coordinate).padStart(96, "0");
  part1.push(`0x${padded.slice(0, 32)}`);
  part2.push(`0x${padded.slice(32)}`);
}

function joinG1Coordinate(part1: string, part2: string): string {
  return `0x${stripHex(part1).padStart(32, "0")}${stripHex(part2).padStart(64, "0")}`;
}
