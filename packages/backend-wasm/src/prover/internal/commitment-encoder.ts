import type { G1Point } from "../../core/group/group.js";
import type { BivariatePolynomialBuffer } from "../../core/polynomial/bivariate-polynomial-buffer.js";

export interface ProverCommitmentJob {
  readonly label: string;
  readonly polynomial: BivariatePolynomialBuffer;
}

export interface ProverCommitmentEncoder {
  readonly parallelSafe: boolean;
  encodeSigma1PolynomialBuffer(job: ProverCommitmentJob): Promise<G1Point>;
}

export async function encodeSigma1CommitmentBarrier(
  encoder: ProverCommitmentEncoder,
  jobs: readonly ProverCommitmentJob[],
): Promise<ReadonlyMap<string, G1Point>> {
  if (jobs.length === 0) {
    return new Map();
  }

  const entries = encoder.parallelSafe
    ? await Promise.all(jobs.map(async (job) => [job.label, await encoder.encodeSigma1PolynomialBuffer(job)] as const))
    : await encodeSequentially(encoder, jobs);

  const outputs = new Map<string, G1Point>();
  for (const [label, point] of entries) {
    if (outputs.has(label)) {
      throw new Error(`Duplicate prover commitment label '${label}'.`);
    }
    outputs.set(label, point);
  }

  for (const job of jobs) {
    if (!outputs.has(job.label)) {
      throw new Error(`Missing prover commitment output for '${job.label}'.`);
    }
  }

  return outputs;
}

export function requireCommitment(
  outputs: ReadonlyMap<string, G1Point>,
  label: string,
): G1Point {
  const point = outputs.get(label);
  if (point === undefined) {
    throw new Error(`Missing prover commitment output for '${label}'.`);
  }

  return point;
}

async function encodeSequentially(
  encoder: ProverCommitmentEncoder,
  jobs: readonly ProverCommitmentJob[],
): Promise<readonly (readonly [string, G1Point])[]> {
  const entries: Array<readonly [string, G1Point]> = [];
  for (const job of jobs) {
    entries.push([job.label, await encoder.encodeSigma1PolynomialBuffer(job)]);
  }

  return entries;
}
