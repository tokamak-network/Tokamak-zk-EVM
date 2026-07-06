import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";

import { createCurveRuntime } from "../src/libs/runtime/curve.js";
import type { FieldElement } from "../src/libs/runtime/field.js";
import type {
  ProverSetupParams,
  ProverSparseSubcircuitR1cs,
  ProverSubcircuitInfo,
} from "../src/prover/witness.js";

const require = createRequire(import.meta.url);
const backendWasmRoot = path.resolve(import.meta.dirname, "..");
const generatedPath = path.join(backendWasmRoot, "src", "prover", "generated", "subcircuit-library.generated.ts");
const nativeBackendCargoPath = path.resolve(backendWasmRoot, "..", "backend", "Cargo.toml");
const checkMode = process.argv.includes("--check");

interface SubcircuitLibraryPackage {
  readonly version: string;
}

interface BuildMetadata {
  readonly packageName?: string;
  readonly packageVersion?: string;
}

interface PackedSparseMatrix {
  readonly activeWires: readonly number[];
  readonly rowOffsets: readonly number[];
  readonly columns: readonly number[];
  readonly coefficientsBase64: string;
}

interface PackedSparseSubcircuit {
  readonly subcircuitId: number;
  readonly A: PackedSparseMatrix;
  readonly B: PackedSparseMatrix;
  readonly C: PackedSparseMatrix;
}

async function main(): Promise<void> {
  const packageJsonPath = require.resolve("@tokamak-zk-evm/subcircuit-library/package.json");
  const packageRoot = path.dirname(packageJsonPath);
  const packageJson = readJson<SubcircuitLibraryPackage>(packageJsonPath);
  const buildMetadata = readJson<BuildMetadata>(path.join(packageRoot, "build-metadata.json"));
  if (buildMetadata.packageVersion !== packageJson.version) {
    throw new Error(
      `subcircuit-library build metadata version ${String(buildMetadata.packageVersion)} does not match package version ${packageJson.version}.`,
    );
  }

  const setup = readJson<ProverSetupParams>(
    path.join(packageRoot, "subcircuits", "library", "setupParams.json"),
  );
  const subcircuitInfos = readJson<ProverSubcircuitInfo[]>(
    path.join(packageRoot, "subcircuits", "library", "subcircuitInfo.json"),
  );
  const nativeBackendVersion = readNativeBackendVersion(nativeBackendCargoPath);

  const runtime = await createCurveRuntime();
  try {
    const packedR1cs = subcircuitInfos.map((subcircuitInfo) => {
      const r1csPath = path.join(
        packageRoot,
        "subcircuits",
        "library",
        "r1cs",
        `subcircuit${subcircuitInfo.id}.r1cs`,
      );
      return packSubcircuitR1cs(runtime.Fr.fromBigInt, r1csPath, setup, subcircuitInfo);
    });

    const content = renderGeneratedModule({
      nativeBackendVersion,
      subcircuitLibraryPackageVersion: packageJson.version,
      setup,
      subcircuitInfos,
      packedR1cs,
    });

    if (checkMode) {
      const current = fs.existsSync(generatedPath) ? fs.readFileSync(generatedPath, "utf8") : "";
      if (current !== content) {
        throw new Error("Generated subcircuit library data is stale. Run npm run subcircuit-library:generate.");
      }
      return;
    }

    fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
    fs.writeFileSync(generatedPath, content);
  } finally {
    await runtime.terminate();
  }
}

function packSubcircuitR1cs(
  toRuntimeFieldElement: (value: bigint) => FieldElement,
  r1csPath: string,
  setup: ProverSetupParams,
  subcircuitInfo: ProverSubcircuitInfo,
): PackedSparseSubcircuit {
  const binary = readR1csBinary(r1csPath);
  if (binary.nWires !== subcircuitInfo.Nwires) {
    throw new Error(
      `R1CS nWires mismatch for subcircuit ${subcircuitInfo.id}: binary=${binary.nWires}, info=${subcircuitInfo.Nwires}.`,
    );
  }
  if (binary.nConstraints !== subcircuitInfo.Nconsts) {
    throw new Error(
      `R1CS nConstraints mismatch for subcircuit ${subcircuitInfo.id}: binary=${binary.nConstraints}, info=${subcircuitInfo.Nconsts}.`,
    );
  }
  if (setup.n < subcircuitInfo.Nconsts) {
    throw new Error(`R1CS constraints exceed setup.n for subcircuit ${subcircuitInfo.id}.`);
  }

  const activeSets = [new Set<number>(), new Set<number>(), new Set<number>()];
  scanConstraints(binary, (matrixIndex, wireIndex) => {
    activeSets[matrixIndex].add(wireIndex);
  });

  const activeWires = activeSets.map((activeSet) => [...activeSet].sort(compareNumbers));
  const indexMaps = activeWires.map((wires) => {
    const indexMap = new Array<number>(subcircuitInfo.Nwires).fill(-1);
    wires.forEach((wireIndex, compactIndex) => {
      indexMap[wireIndex] = compactIndex;
    });
    return indexMap;
  });

  const rows = [
    Array.from({ length: setup.n }, () => [] as Array<[number, FieldElement]>),
    Array.from({ length: setup.n }, () => [] as Array<[number, FieldElement]>),
    Array.from({ length: setup.n }, () => [] as Array<[number, FieldElement]>),
  ];

  scanConstraints(binary, (matrixIndex, wireIndex, canonicalCoefficient, rowIndex) => {
    const compactIndex = indexMaps[matrixIndex][wireIndex];
    if (compactIndex < 0) {
      return;
    }

    rows[matrixIndex][rowIndex].push([compactIndex, toRuntimeFieldElement(canonicalCoefficient)]);
  });

  for (const matrixRows of rows) {
    for (const row of matrixRows) {
      row.sort(([left], [right]) => left - right);
    }
  }

  return {
    subcircuitId: subcircuitInfo.id,
    A: packSparseMatrix(activeWires[0], rows[0]),
    B: packSparseMatrix(activeWires[1], rows[1]),
    C: packSparseMatrix(activeWires[2], rows[2]),
  };
}

function packSparseMatrix(
  activeWires: readonly number[],
  rows: readonly (readonly [number, FieldElement][])[],
): PackedSparseMatrix {
  const rowOffsets: number[] = [0];
  const columns: number[] = [];
  const coefficients: Uint8Array[] = [];

  for (const row of rows) {
    for (const [column, coefficient] of row) {
      columns.push(column);
      coefficients.push(coefficient);
    }
    rowOffsets.push(columns.length);
  }

  return {
    activeWires,
    rowOffsets,
    columns,
    coefficientsBase64: Buffer.from(concatBytes(coefficients)).toString("base64"),
  };
}

interface R1csBinary {
  readonly data: Uint8Array;
  readonly constraintsOffset: number;
  readonly constraintsSize: number;
  readonly fieldSize: number;
  readonly nWires: number;
  readonly nConstraints: number;
}

function readR1csBinary(r1csPath: string): R1csBinary {
  const data = fs.readFileSync(r1csPath);
  let offset = 0;
  if (!bytesEqual(readBytes(data, offset, 4), Buffer.from("r1cs"))) {
    throw new Error(`Invalid R1CS magic in ${r1csPath}.`);
  }
  offset += 4;

  const version = readU32Le(data, offset);
  offset += 4;
  if (version !== 1) {
    throw new Error(`Unsupported R1CS version ${version} in ${r1csPath}.`);
  }

  const sectionCount = readU32Le(data, offset);
  offset += 4;
  let headerOffset = -1;
  let headerSize = 0;
  let constraintsOffset = -1;
  let constraintsSize = 0;

  for (let index = 0; index < sectionCount; index += 1) {
    const sectionType = readU32Le(data, offset);
    offset += 4;
    const sectionSize = readU64Le(data, offset);
    offset += 8;
    if (sectionSize > Number.MAX_SAFE_INTEGER) {
      throw new Error(`R1CS section is too large in ${r1csPath}.`);
    }

    const sectionOffset = offset;
    const sectionEnd = sectionOffset + Number(sectionSize);
    if (sectionEnd > data.byteLength) {
      throw new Error(`R1CS section extends past the end of ${r1csPath}.`);
    }

    if (sectionType === 1) {
      headerOffset = sectionOffset;
      headerSize = Number(sectionSize);
    } else if (sectionType === 2) {
      constraintsOffset = sectionOffset;
      constraintsSize = Number(sectionSize);
    }

    offset = sectionEnd;
  }

  if (headerOffset < 0) {
    throw new Error(`Missing R1CS header section in ${r1csPath}.`);
  }
  if (constraintsOffset < 0) {
    throw new Error(`Missing R1CS constraints section in ${r1csPath}.`);
  }

  let headerCursor = headerOffset;
  const fieldSize = readU32Le(data, headerCursor);
  headerCursor += 4 + fieldSize;
  const nWires = readU32Le(data, headerCursor);
  headerCursor += 4 + 4 + 4 + 4 + 8;
  const nConstraints = readU32Le(data, headerCursor);

  if (headerCursor + 4 > headerOffset + headerSize) {
    throw new Error(`R1CS header extends past its section in ${r1csPath}.`);
  }
  if (fieldSize === 0 || fieldSize % 8 !== 0) {
    throw new Error(`Invalid R1CS field size ${fieldSize} in ${r1csPath}.`);
  }

  return {
    data,
    constraintsOffset,
    constraintsSize,
    fieldSize,
    nWires,
    nConstraints,
  };
}

function scanConstraints(
  binary: R1csBinary,
  visit: (matrixIndex: number, wireIndex: number, canonicalCoefficient: bigint, rowIndex: number) => void,
): void {
  let offset = binary.constraintsOffset;
  const constraintsEnd = binary.constraintsOffset + binary.constraintsSize;

  for (let rowIndex = 0; rowIndex < binary.nConstraints; rowIndex += 1) {
    for (let matrixIndex = 0; matrixIndex < 3; matrixIndex += 1) {
      const entryCount = readU32Le(binary.data, offset);
      offset += 4;
      for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
        const wireIndex = readU32Le(binary.data, offset);
        offset += 4;
        if (wireIndex >= binary.nWires) {
          throw new Error(`R1CS wire index ${wireIndex} exceeds nWires ${binary.nWires}.`);
        }

        const coefficientBytes = readBytes(binary.data, offset, binary.fieldSize);
        offset += binary.fieldSize;
        visit(matrixIndex, wireIndex, readBigIntLittleEndian(coefficientBytes), rowIndex);
      }
    }
  }

  if (offset !== constraintsEnd) {
    throw new Error(`R1CS constraints section has ${constraintsEnd - offset} trailing bytes.`);
  }
}

function renderGeneratedModule(input: {
  readonly nativeBackendVersion: string;
  readonly subcircuitLibraryPackageVersion: string;
  readonly setup: ProverSetupParams;
  readonly subcircuitInfos: readonly ProverSubcircuitInfo[];
  readonly packedR1cs: readonly PackedSparseSubcircuit[];
}): string {
  return `// Generated by scripts/generate-subcircuit-library.ts. Do not edit by hand.
import type {
  ProverSetupParams,
  ProverSparseMatrix,
  ProverSparseSubcircuitR1cs,
  ProverSubcircuitInfo,
} from "../witness.js";

export const NATIVE_BACKEND_VERSION = ${JSON.stringify(input.nativeBackendVersion)};
export const SUBCIRCUIT_LIBRARY_PACKAGE_VERSION = ${JSON.stringify(input.subcircuitLibraryPackageVersion)};

export const GENERATED_PROVER_SETUP_PARAMS = ${JSON.stringify(input.setup, null, 2)} as const satisfies ProverSetupParams;
export const GENERATED_PROVER_SUBCIRCUIT_INFOS = ${JSON.stringify(input.subcircuitInfos, null, 2)} as const satisfies readonly ProverSubcircuitInfo[];

interface PackedSparseMatrix {
  readonly activeWires: readonly number[];
  readonly rowOffsets: readonly number[];
  readonly columns: readonly number[];
  readonly coefficientsBase64: string;
}

interface PackedSparseSubcircuit {
  readonly subcircuitId: number;
  readonly A: PackedSparseMatrix;
  readonly B: PackedSparseMatrix;
  readonly C: PackedSparseMatrix;
}

const PACKED_PROVER_SPARSE_R1CS = ${JSON.stringify(input.packedR1cs)} as const satisfies readonly PackedSparseSubcircuit[];

export const GENERATED_PROVER_SPARSE_R1CS: readonly ProverSparseSubcircuitR1cs[] = PACKED_PROVER_SPARSE_R1CS.map((entry) => ({
  subcircuitId: entry.subcircuitId,
  A: unpackSparseMatrix(entry.A),
  B: unpackSparseMatrix(entry.B),
  C: unpackSparseMatrix(entry.C),
}));

function unpackSparseMatrix(packed: PackedSparseMatrix): ProverSparseMatrix {
  if (packed.rowOffsets.length === 0 || packed.rowOffsets[0] !== 0) {
    throw new Error("Packed sparse matrix row offsets must start at zero.");
  }

  const coefficients = decodeBase64(packed.coefficientsBase64);
  if (coefficients.byteLength !== packed.columns.length * 32) {
    throw new Error("Packed sparse matrix coefficient byte length does not match its columns.");
  }

  return {
    activeWires: packed.activeWires,
    sparseRows: packed.rowOffsets.slice(0, -1).map((start, rowIndex) => {
      const end = packed.rowOffsets[rowIndex + 1];
      if (end < start || end > packed.columns.length) {
        throw new Error("Packed sparse matrix row offsets are invalid.");
      }

      const row = [];
      for (let entryIndex = start; entryIndex < end; entryIndex += 1) {
        row.push({
          column: packed.columns[entryIndex],
          coefficient: coefficients.subarray(entryIndex * 32, (entryIndex + 1) * 32),
        });
      }
      return row;
    }),
  };
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}
`;
}

function readNativeBackendVersion(cargoTomlPath: string): string {
  const content = fs.readFileSync(cargoTomlPath, "utf8");
  const workspacePackageMatch = content.match(/\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);
  if (workspacePackageMatch === null) {
    throw new Error("Cannot find native backend workspace package version.");
  }

  return workspacePackageMatch[1];
}

function readJson<T>(jsonPath: string): T {
  return JSON.parse(fs.readFileSync(jsonPath, "utf8")) as T;
}

function readBytes(data: Uint8Array, offset: number, length: number): Uint8Array {
  const end = offset + length;
  if (end > data.byteLength) {
    throw new Error("Unexpected end of R1CS data.");
  }

  return data.subarray(offset, end);
}

function readU32Le(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.byteLength) {
    throw new Error("Unexpected end of R1CS data while reading u32.");
  }

  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true);
}

function readU64Le(data: Uint8Array, offset: number): bigint {
  if (offset + 8 > data.byteLength) {
    throw new Error("Unexpected end of R1CS data while reading u64.");
  }

  return new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true);
}

function readBigIntLittleEndian(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let index = bytes.byteLength - 1; index >= 0; index -= 1) {
    value = (value << 8n) + BigInt(bytes[index]);
  }

  return value;
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

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
