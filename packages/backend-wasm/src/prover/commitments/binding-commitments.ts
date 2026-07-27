import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field-runtime.js";
import {
  proverCrsG1PointAt,
  type ProverCrsG1Section,
  type ProverCrsRuntime,
} from "../api/binary-input.js";
import type { ProverMixer } from "../protocol/state.js";
import {
  placementCount,
  placementSubcircuitId,
  placementVariableAt,
  type ProverPlacementVariables,
  type ProverSetupParams,
  type ProverSubcircuitInfo,
} from "../protocol/witness.js";
import { G1_AFFINE_BYTES } from "./commitment-layout.js";
import {
  type ProverCommitmentEncoder,
} from "./commitment-encoder.js";
import { createSigma1CommitmentEncoder } from "./sigma1-encoder.js";

export interface ProverBinding {
  readonly A_free: Uint8Array;
  readonly O_pub_free: Uint8Array;
  readonly O_mid: Uint8Array;
  readonly O_prv: Uint8Array;
}

export async function buildProverBinding(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
  placementVariables: ProverPlacementVariables,
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  aFreeX: BivariatePolynomialBuffer,
  mixer: ProverMixer,
  commitmentEncoder: ProverCommitmentEncoder = createSigma1CommitmentEncoder(runtime, crs, setup),
): Promise<ProverBinding> {
  const A_free = await commitmentEncoder(aFreeX);
  const O_pub_free = await encodeOPubFree(runtime, crs, placementVariables, subcircuitInfos);
  const O_mid_core = await encodeOMidNoZk(runtime, crs, setup, placementVariables, subcircuitInfos);
  const O_mid = runtime.G1.add(O_mid_core, runtime.G1.mulAffineScalar(crs.sigma1.delta, mixer.rO_mid));
  const O_prv_core = await encodeOPrvNoZk(runtime, crs, setup, placementVariables, subcircuitInfos);
  const O_prv = addG1Terms(runtime, [
    O_prv_core,
    runtime.G1.neg(runtime.G1.mulAffineScalar(crs.sigma1.eta, mixer.rO_mid)),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakXhTx, 3, 0, 0), mixer.rU_X),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakXhTx, 3, 1, 0), mixer.rV_X),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakXhTx, 3, 2, 0), mixer.rW_X[0]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakXhTx, 3, 2, 1), mixer.rW_X[1]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakXhTx, 3, 2, 2), mixer.rW_X[2]),
    runtime.G1.mulAffineScalar(proverCrsG1PointAt(crs.sigma1.deltaInvAlpha4XjTx, 0), mixer.rB_X[0]),
    runtime.G1.mulAffineScalar(proverCrsG1PointAt(crs.sigma1.deltaInvAlpha4XjTx, 1), mixer.rB_X[1]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 0, 0), mixer.rU_Y),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 1, 0), mixer.rV_Y),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 2, 0), mixer.rW_Y[0]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 2, 1), mixer.rW_Y[1]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 2, 2), mixer.rW_Y[2]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 3, 0), mixer.rB_Y[0]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 3, 1), mixer.rB_Y[1]),
  ]);

  return {
    A_free,
    O_pub_free,
    O_mid,
    O_prv,
  };
}

export async function encodeOPubFree(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  placementVariables: ProverPlacementVariables,
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): Promise<Uint8Array> {
  const bases: Uint8Array[] = [];
  const scalars: FieldElement[] = [];

  for (let placementIndex = 0; placementIndex < placementCount(placementVariables); placementIndex += 1) {
    const subcircuitInfo = subcircuitInfos[placementSubcircuitId(placementVariables, placementIndex)];
    if (subcircuitInfo.name === "bufferEVMIn") {
      continue;
    }

    const range = publicFreeRange(subcircuitInfo);
    if (range === undefined) {
      continue;
    }

    for (let localIndex = range.start; localIndex < range.end; localIndex += 1) {
      const globalIndex = subcircuitInfo.flattenMap[localIndex];
      bases.push(proverCrsG1PointAt(crs.sigma1.gammaInvOInst, globalIndex));
      scalars.push(placementVariableAt(placementVariables, placementIndex, localIndex));
    }
  }

  return msmG1(runtime, bases, scalars);
}

export function countOMidVariables(
  placementVariables: ProverPlacementVariables,
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): number {
  let count = 0;
  for (let placementIndex = 0; placementIndex < placementCount(placementVariables); placementIndex += 1) {
    const subcircuitInfo = subcircuitInfos[placementSubcircuitId(placementVariables, placementIndex)];
    if (subcircuitInfo.name === "bufferPubOut") {
      count += subcircuitInfo.In_idx[1];
    } else if (
      subcircuitInfo.name === "bufferPubIn" ||
      subcircuitInfo.name === "bufferBlockIn" ||
      subcircuitInfo.name === "bufferEVMIn"
    ) {
      count += subcircuitInfo.Out_idx[1];
    } else {
      count += subcircuitInfo.Out_idx[1] + subcircuitInfo.In_idx[1];
    }
    count += 1;
  }

  return count;
}

export function countOPrvVariables(
  placementVariables: ProverPlacementVariables,
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): number {
  let count = 0;
  for (let placementIndex = 0; placementIndex < placementCount(placementVariables); placementIndex += 1) {
    const subcircuitInfo = subcircuitInfos[placementSubcircuitId(placementVariables, placementIndex)];
    count += subcircuitInfo.Nwires - subcircuitInfo.In_idx[1] - subcircuitInfo.Out_idx[1] - 1;
  }

  return count;
}

export async function encodeOMidNoZk(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
  placementVariables: ProverPlacementVariables,
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): Promise<Uint8Array> {
  return encodeStatement(
    runtime,
    setup.l,
    setup.l_D,
    countOMidVariables(placementVariables, subcircuitInfos),
    placementVariables,
    subcircuitInfos,
    (globalIndex, placementIndex) =>
      matrixAt(crs.sigma1.etaInvLiOInterAlpha4Kj, setup.s_max, globalIndex, placementIndex),
  );
}

export async function encodeOPrvNoZk(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
  placementVariables: ProverPlacementVariables,
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): Promise<Uint8Array> {
  return encodeStatement(
    runtime,
    setup.l_D,
    setup.m_D,
    countOPrvVariables(placementVariables, subcircuitInfos),
    placementVariables,
    subcircuitInfos,
    (globalIndex, placementIndex) =>
      matrixAt(crs.sigma1.deltaInvLiOPrv, setup.s_max, globalIndex, placementIndex),
  );
}

async function encodeStatement(
  runtime: CurveRuntime,
  globalWireIndexOffset: number,
  globalWireIndexEnd: number,
  expectedVariableCount: number,
  placementVariables: ProverPlacementVariables,
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  baseAt: (globalIndex: number, placementIndex: number) => Uint8Array,
): Promise<Uint8Array> {
  const bases = new Uint8Array(expectedVariableCount * G1_AFFINE_BYTES);
  const scalars = new Uint8Array(expectedVariableCount * runtime.Fr.byteLength);
  let variableCount = 0;
  let nonzeroCount = 0;

  for (let placementIndex = 0; placementIndex < placementCount(placementVariables); placementIndex += 1) {
    const subcircuitInfo = subcircuitInfos[placementSubcircuitId(placementVariables, placementIndex)];
    for (let localIndex = 0; localIndex < subcircuitInfo.Nwires; localIndex += 1) {
      const flattened = subcircuitInfo.flattenMap[localIndex];
      if (flattened >= globalWireIndexOffset && flattened < globalWireIndexEnd) {
        const globalIndex = flattened - globalWireIndexOffset;
        const scalar = placementVariableAt(placementVariables, placementIndex, localIndex);
        variableCount += 1;
        if (runtime.Fr.isZero(scalar)) {
          continue;
        }
        bases.set(baseAt(globalIndex, placementIndex), nonzeroCount * G1_AFFINE_BYTES);
        scalars.set(scalar, nonzeroCount * runtime.Fr.byteLength);
        nonzeroCount += 1;
      }
    }
  }

  if (variableCount !== expectedVariableCount) {
    throw new Error(`Statement encoding variable count mismatch: expected ${expectedVariableCount}, got ${variableCount}.`);
  }

  if (nonzeroCount === 0) {
    return runtime.G1.zero;
  }

  const compactBases = bases.subarray(0, nonzeroCount * G1_AFFINE_BYTES);
  const compactScalars = scalars.subarray(0, nonzeroCount * runtime.Fr.byteLength);
  const rawScalars = await runtime.Fr.batchFromMontgomeryBuffer(compactScalars);
  return runtime.G1.msmAffineRaw(compactBases, rawScalars);
}

function publicFreeRange(
  subcircuitInfo: ProverSubcircuitInfo,
): { readonly start: number; readonly end: number } | undefined {
  if (subcircuitInfo.name === "bufferPubOut") {
    return { start: subcircuitInfo.Out_idx[0], end: subcircuitInfo.Out_idx[0] + subcircuitInfo.Out_idx[1] };
  }

  if (
    subcircuitInfo.name === "bufferPubIn" ||
    subcircuitInfo.name === "bufferBlockIn"
  ) {
    return { start: subcircuitInfo.In_idx[0], end: subcircuitInfo.In_idx[0] + subcircuitInfo.In_idx[1] };
  }

  return undefined;
}

function matrixAt(section: ProverCrsG1Section, width: number, row: number, column: number): Uint8Array {
  return proverCrsG1PointAt(section, row * width + column);
}

async function msmG1(
  runtime: CurveRuntime,
  bases: readonly Uint8Array[],
  scalars: readonly FieldElement[],
): Promise<Uint8Array> {
  if (bases.length !== scalars.length) {
    throw new Error("G1 MSM bases and scalars must have the same length.");
  }

  if (bases.length === 0) {
    return runtime.G1.zero;
  }

  const rawScalars = await runtime.Fr.batchFromMontgomeryBuffer(concatBytes(scalars));
  return runtime.G1.msmAffineRaw(concatBytes(bases), rawScalars);
}

function addG1Terms(runtime: CurveRuntime, terms: readonly Uint8Array[]): Uint8Array {
  let accumulator = runtime.G1.zero;
  for (const term of terms) {
    accumulator = runtime.G1.add(accumulator, term);
  }

  return accumulator;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}
