import type { FfGroup } from "./curve.js";
import { formatHex, parseCanonicalHex, type FieldElement, type FieldRuntime } from "./field.js";

export type G1Point = Uint8Array;

export type G2Point = Uint8Array;

export interface AffinePointJson {
  readonly x: string;
  readonly y: string;
}

export interface G1Runtime {
  readonly zero: G1Point;
  readonly generator: G1Point;
  parseAffine(value: unknown): G1Point;
  formatAffine(value: G1Point): AffinePointJson;
  toAffine(value: G1Point): G1Point;
  add(left: G1Point, right: G1Point): G1Point;
  sub(left: G1Point, right: G1Point): G1Point;
  neg(value: G1Point): G1Point;
  eq(left: G1Point, right: G1Point): boolean;
  isZero(value: G1Point): boolean;
  mulScalar(point: G1Point, scalar: FieldElement): G1Point;
  msmAffine(bases: readonly G1Point[], scalars: readonly FieldElement[]): Promise<G1Point>;
}

export interface G2Runtime {
  readonly zero: G2Point;
  readonly generator: G2Point;
  parseAffine(value: unknown): G2Point;
  formatAffine(value: G2Point): AffinePointJson;
  toAffine(value: G2Point): G2Point;
  add(left: G2Point, right: G2Point): G2Point;
  sub(left: G2Point, right: G2Point): G2Point;
  neg(value: G2Point): G2Point;
  eq(left: G2Point, right: G2Point): boolean;
  isZero(value: G2Point): boolean;
  mulScalar(point: G2Point, scalar: FieldElement): G2Point;
}

export function createG1Runtime(group: FfGroup, scalarField: FieldRuntime): G1Runtime {
  return {
    zero: group.zeroAffine,
    generator: group.oneAffine,
    parseAffine(value) {
      const point = parseAffineJson(value);
      const x = parseCanonicalHex(point.x);
      const y = parseCanonicalHex(point.y);

      if (x === 0n && y === 0n) {
        return group.zeroAffine;
      }

      return group.fromObject([x, y, 1n]);
    },
    formatAffine(value) {
      if (group.isZero(value)) {
        return {
          x: formatHex(0n, G1_COORDINATE_BYTES),
          y: formatHex(0n, G1_COORDINATE_BYTES),
        };
      }

      const [x, y] = group.toObject(group.toAffine(value)) as [bigint, bigint, bigint];
      return {
        x: formatHex(x, G1_COORDINATE_BYTES),
        y: formatHex(y, G1_COORDINATE_BYTES),
      };
    },
    toAffine(value) {
      return group.toAffine(value);
    },
    add(left, right) {
      return group.add(left, right);
    },
    sub(left, right) {
      return group.sub(left, right);
    },
    neg(value) {
      return group.neg(value);
    },
    eq(left, right) {
      return group.eq(left, right);
    },
    isZero(value) {
      return group.isZero(value);
    },
    mulScalar(point, scalar) {
      return group.timesFr(point, scalar);
    },
    async msmAffine(bases, scalars) {
      if (bases.length !== scalars.length) {
        throw new Error("MSM bases and scalars must have the same length.");
      }

      const affineBases = bases.map((base) => group.toAffine(base));
      const rawScalars = scalars.map((scalar) => scalarField.toRawLittleEndian(scalar));
      return group.multiExpAffine(concatBytes(affineBases), concatBytes(rawScalars));
    },
  };
}

export function createG2Runtime(group: FfGroup): G2Runtime {
  return {
    zero: group.zeroAffine,
    generator: group.oneAffine,
    parseAffine(value) {
      const point = parseAffineJson(value);
      const x = parseG2Coordinate(point.x);
      const y = parseG2Coordinate(point.y);

      if (x[0] === 0n && x[1] === 0n && y[0] === 0n && y[1] === 0n) {
        return group.zeroAffine;
      }

      return group.fromObject([x, y, [1n, 0n]]);
    },
    formatAffine(value) {
      if (group.isZero(value)) {
        return {
          x: formatHex(0n, G2_COORDINATE_BYTES),
          y: formatHex(0n, G2_COORDINATE_BYTES),
        };
      }

      const [x, y] = group.toObject(group.toAffine(value)) as [
        [bigint, bigint],
        [bigint, bigint],
        [bigint, bigint],
      ];

      return {
        x: formatG2Coordinate(x),
        y: formatG2Coordinate(y),
      };
    },
    toAffine(value) {
      return group.toAffine(value);
    },
    add(left, right) {
      return group.add(left, right);
    },
    sub(left, right) {
      return group.sub(left, right);
    },
    neg(value) {
      return group.neg(value);
    },
    eq(left, right) {
      return group.eq(left, right);
    },
    isZero(value) {
      return group.isZero(value);
    },
    mulScalar(point, scalar) {
      return group.timesFr(point, scalar);
    },
  };
}

const G1_COORDINATE_BYTES = 48;
const FQ_COORDINATE_BYTES = 48;
const G2_COORDINATE_BYTES = FQ_COORDINATE_BYTES * 2;

function parseAffineJson(value: unknown): AffinePointJson {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an affine point object.");
  }

  const record = value as Record<string, unknown>;

  if (typeof record.x !== "string" || typeof record.y !== "string") {
    throw new Error("Expected affine point x and y hexadecimal strings.");
  }

  return {
    x: record.x,
    y: record.y,
  };
}

function parseG2Coordinate(value: string): [bigint, bigint] {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error("Expected a 0x-prefixed G2 coordinate.");
  }

  const body = value.slice(2).padStart(G2_COORDINATE_BYTES * 2, "0");

  if (body.length > G2_COORDINATE_BYTES * 2) {
    throw new Error("G2 coordinate does not fit in 96 bytes.");
  }

  const first = BigInt(`0x${body.slice(0, FQ_COORDINATE_BYTES * 2)}`);
  const second = BigInt(`0x${body.slice(FQ_COORDINATE_BYTES * 2)}`);

  // Native G2serde prints the extension coordinate as c1 || c0, while
  // ffjavascript represents Fq2 as [c0, c1].
  return [second, first];
}

function formatG2Coordinate(value: [bigint, bigint]): string {
  const [c0, c1] = value;
  return `0x${formatHex(c1, FQ_COORDINATE_BYTES).slice(2)}${formatHex(c0, FQ_COORDINATE_BYTES).slice(2)}`;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}
