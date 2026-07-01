import { getCurveFromName } from "ffjavascript";

import { createFieldRuntime, type FieldRuntime } from "./field.js";
import { createG1Runtime, createG2Runtime, type G1Runtime, type G2Runtime } from "./group.js";
import { createPairingRuntime, type PairingRuntime } from "./pairing.js";
import { createRandomScalarSource, type RandomScalarSource } from "./random.js";

export interface FfField {
  readonly n8: number;
  readonly zero: Uint8Array;
  readonly one: Uint8Array;
  readonly p: bigint;
  e(value: string | number | bigint | Uint8Array, radix?: number): Uint8Array;
  add(left: Uint8Array, right: Uint8Array): Uint8Array;
  sub(left: Uint8Array, right: Uint8Array): Uint8Array;
  neg(value: Uint8Array): Uint8Array;
  mul(left: Uint8Array, right: Uint8Array): Uint8Array;
  div(left: Uint8Array, right: Uint8Array): Uint8Array;
  inv(value: Uint8Array): Uint8Array;
  square(value: Uint8Array): Uint8Array;
  exp(value: Uint8Array, exponent: Uint8Array | string | number | bigint): Uint8Array;
  eq(left: Uint8Array, right: Uint8Array): boolean;
  isZero(value: Uint8Array): boolean;
  random(): Uint8Array;
  toObject(value: Uint8Array): bigint;
  fromObject(value: bigint): Uint8Array;
  toRprLE(output: Uint8Array, offset: number, value: Uint8Array): void;
  toRprBE(output: Uint8Array, offset: number, value: Uint8Array): void;
}

export interface FfGroup {
  readonly zero: Uint8Array;
  readonly zeroAffine: Uint8Array;
  readonly one: Uint8Array;
  readonly oneAffine: Uint8Array;
  readonly g: Uint8Array;
  readonly gAffine: Uint8Array;
  add(left: Uint8Array, right: Uint8Array): Uint8Array;
  sub(left: Uint8Array, right: Uint8Array): Uint8Array;
  neg(value: Uint8Array): Uint8Array;
  eq(left: Uint8Array, right: Uint8Array): boolean;
  isZero(value: Uint8Array): boolean;
  toAffine(value: Uint8Array): Uint8Array;
  toJacobian(value: Uint8Array): Uint8Array;
  timesFr(point: Uint8Array, scalar: Uint8Array): Uint8Array;
  toObject(value: Uint8Array): unknown[];
  fromObject(value: unknown[]): Uint8Array;
  multiExpAffine(bases: Uint8Array, scalars: Uint8Array): Promise<Uint8Array>;
}

export interface FfCurve {
  readonly name: "bls12381";
  readonly Fr: FfField;
  readonly G1: FfGroup;
  readonly G2: FfGroup;
  pairingEq(...terms: Uint8Array[]): Promise<boolean>;
  terminate?(): Promise<void>;
}

export interface CurveRuntimeOptions {
  readonly singleThread?: boolean;
}

export interface CurveRuntime {
  readonly name: "bls12-381";
  readonly singleThread: boolean;
  readonly Fr: FieldRuntime;
  readonly G1: G1Runtime;
  readonly G2: G2Runtime;
  readonly pairing: PairingRuntime;
  readonly randomScalar: RandomScalarSource;
  terminate(): Promise<void>;
}

export async function createCurveRuntime(options: CurveRuntimeOptions = {}): Promise<CurveRuntime> {
  const singleThread = options.singleThread ?? true;
  const raw = (await getCurveFromName("bls12381", singleThread)) as FfCurve;
  const Fr = createFieldRuntime(raw.Fr);
  const G1 = createG1Runtime(raw.G1, Fr);
  const G2 = createG2Runtime(raw.G2);

  return {
    name: "bls12-381",
    singleThread,
    Fr,
    G1,
    G2,
    pairing: createPairingRuntime(raw, G1),
    randomScalar: createRandomScalarSource(Fr),
    async terminate() {
      await raw.terminate?.();
    },
  };
}
