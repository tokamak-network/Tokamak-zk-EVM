import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { createCurveRuntime } from "../../src/runtime/curve/curve.js";
import type { FieldElement } from "../../src/runtime/field/field-runtime.js";
import type { SetupParams } from "../../src/artifacts/setup/setup-params.js";
import { SUBCIRCUIT_LIBRARY_CONTRACT } from "../../src/generated/subcircuit-library-contract.generated.js";
import type {
  ProverSubcircuitInfo,
} from "../../src/prover/protocol/witness.js";
import { PublicWireLayout } from "../../src/prover/protocol/public-wire-layout.js";
import { validateProverSubcircuitLibrary } from "../../src/prover/protocol/subcircuit-library-validation.js";
import {
  isInternalPadding,
  isWiringPadding,
} from "../../src/prover/protocol/subcircuit-library-validation.js";
import {
  readSelectedInputOrigin,
  type SubcircuitLibraryOrigin,
} from "./input-origin.js";
import {
  parseProverSubcircuitInfos,
  parseSetupParams,
} from "./subcircuit-library-input.js";

const require = createRequire(import.meta.url);
const backendWasmRoot = path.resolve(import.meta.dirname, "../..");
const activeGeneratedRoot = path.join(backendWasmRoot, "src", "generated", "active");
const activeProverGeneratedRoot = path.join(
  backendWasmRoot,
  "src",
  "prover",
  "generated",
  "active",
);
const setupGeneratedPath = path.join(activeGeneratedRoot, "setup.generated.ts");
const proverGeneratedPath = path.join(
  activeProverGeneratedRoot,
  "subcircuit-library.generated.ts",
);
const nativeBackendCargoPath = path.resolve(backendWasmRoot, "..", "Cargo.toml");
const checkMode = process.argv.includes("--check");
const selectedOrigin = readSelectedInputOrigin(process.argv.slice(2));
const localQapCompilerRoot = path.resolve(backendWasmRoot, "..", "..", "frontend", "qap-compiler");
const { setupParams: setupContract, subcircuitInfo: subcircuitContract, r1cs: r1csContract } =
  SUBCIRCUIT_LIBRARY_CONTRACT.libraryArtifacts;

interface R1csTransport {
  readonly format: "circom-r1cs";
  readonly magic: string;
  readonly version: number;
  readonly endianness: "little";
  readonly headerSection: number;
  readonly constraintsSection: number;
}

interface SubcircuitLibraryPackage {
  readonly name: string;
  readonly version: string;
}

interface BuildMetadata {
  readonly packageName?: string;
  readonly packageVersion?: string;
}

interface ResolvedSubcircuitLibrary {
  readonly origin: SubcircuitLibraryOrigin;
  readonly packageVersion: string;
  readonly libraryRoot: string;
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
  const library = resolveSubcircuitLibrary(selectedOrigin);

  const setup = parseSetupParams(readJson(path.join(library.libraryRoot, setupContract.fileName)));
  const subcircuitInfos = parseProverSubcircuitInfos(
    readJson(path.join(library.libraryRoot, subcircuitContract.fileName)),
  );
  validateProverSubcircuitLibrary(setup, subcircuitInfos);
  const publicLayout = PublicWireLayout.derive(setup, subcircuitInfos);
  const nativeBackendVersion = readNativeBackendVersion(nativeBackendCargoPath);

  const r1csTransport = parseR1csTransport(r1csContract.transport);
  const runtime = await createCurveRuntime();
  try {
    const packedR1cs = subcircuitInfos.map((subcircuitInfo) => {
      const r1csPath = path.join(
        library.libraryRoot,
        r1csContract.directoryName,
        r1csContract.fileNamePattern.replace("{id}", String(subcircuitInfo.id)),
      );
      return packSubcircuitR1cs(runtime.Fr.fromBigInt, r1csPath, r1csTransport, setup, subcircuitInfo);
    });

    const setupContent = renderSetupGeneratedModule({
      nativeBackendVersion,
      subcircuitLibraryOrigin: library.origin,
      subcircuitLibraryPackageVersion: library.packageVersion,
      setup,
      publicInputLength: publicLayout.length(),
      freePublicLength: publicLayout.freePublicLen(),
    });
    const proverContent = renderProverGeneratedModule({
      subcircuitInfos,
      packedR1cs,
    });

    if (checkMode) {
      if (
        readGeneratedFile(setupGeneratedPath) !== setupContent
        || readGeneratedFile(proverGeneratedPath) !== proverContent
      ) {
        throw new Error("Generated subcircuit library data is stale. Run npm run subcircuit-library:generate.");
      }
      return;
    }

    fs.mkdirSync(path.dirname(setupGeneratedPath), { recursive: true });
    fs.mkdirSync(path.dirname(proverGeneratedPath), { recursive: true });
    fs.writeFileSync(setupGeneratedPath, setupContent);
    fs.writeFileSync(proverGeneratedPath, proverContent);
  } finally {
    await runtime.terminate();
  }
}

function resolveSubcircuitLibrary(origin: SubcircuitLibraryOrigin): ResolvedSubcircuitLibrary {
  if (origin === "npmSnapshot") {
    const packageJsonPath = require.resolve("@tokamak-zk-evm/subcircuit-library/package.json");
    const packageRoot = path.dirname(packageJsonPath);
    const packageJson = readJson<SubcircuitLibraryPackage>(packageJsonPath);
    const buildMetadata = readJson<BuildMetadata>(path.join(packageRoot, "build-metadata.json"));
    assertPackageIdentity(packageJsonPath, packageJson, buildMetadata);
    return validateLibraryLayout({
      origin,
      packageVersion: packageJson.version,
      libraryRoot: path.join(packageRoot, "subcircuits", "library"),
    });
  }

  const packageJsonPath = path.join(localQapCompilerRoot, "package.json");
  const packageJson = readJson<SubcircuitLibraryPackage>(packageJsonPath);
  assertPackageIdentity(packageJsonPath, packageJson);
  return validateLibraryLayout({
    origin,
    packageVersion: packageJson.version,
    libraryRoot: path.join(localQapCompilerRoot, "subcircuits", "library"),
  });
}

function assertPackageIdentity(
  packageJsonPath: string,
  packageJson: SubcircuitLibraryPackage,
  buildMetadata?: BuildMetadata,
): void {
  if (packageJson.name !== "@tokamak-zk-evm/subcircuit-library" || packageJson.version.length === 0) {
    throw new Error(`Invalid subcircuit-library package identity at ${packageJsonPath}.`);
  }
  if (buildMetadata !== undefined && (
    buildMetadata.packageName !== packageJson.name
    || buildMetadata.packageVersion !== packageJson.version
  )) {
    throw new Error(
      `subcircuit-library build metadata does not match package identity at ${packageJsonPath}.`,
    );
  }
}

function validateLibraryLayout(library: ResolvedSubcircuitLibrary): ResolvedSubcircuitLibrary {
  for (const fileName of [setupContract.fileName, subcircuitContract.fileName]) {
    const filePath = path.join(library.libraryRoot, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`${library.origin} subcircuit-library is missing ${filePath}.`);
    }
  }
  return library;
}

function packSubcircuitR1cs(
  toRuntimeFieldElement: (value: bigint) => FieldElement,
  r1csPath: string,
  transport: R1csTransport,
  setup: SetupParams,
  subcircuitInfo: ProverSubcircuitInfo,
): PackedSparseSubcircuit {
  const binary = readR1csBinary(r1csPath, transport);
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
    if (isWiringPadding(subcircuitInfo, setup, wireIndex)
      || isInternalPadding(subcircuitInfo, setup, wireIndex)) {
      throw new Error(`R1CS for subcircuit ${subcircuitInfo.id} references producer-declared padding wire ${wireIndex}.`);
    }
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

function readR1csBinary(r1csPath: string, transport: R1csTransport): R1csBinary {
  const data = fs.readFileSync(r1csPath);
  let offset = 0;
  if (!bytesEqual(readBytes(data, offset, 4), Buffer.from(transport.magic))) {
    throw new Error(`Invalid R1CS magic in ${r1csPath}.`);
  }
  offset += 4;

  const version = readU32Le(data, offset);
  offset += 4;
  if (version !== transport.version) {
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

    if (sectionType === transport.headerSection) {
      headerOffset = sectionOffset;
      headerSize = Number(sectionSize);
    } else if (sectionType === transport.constraintsSection) {
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

export function parseR1csTransport(raw: unknown): R1csTransport {
  if (!isRecord(raw)) {
    throw new Error("qap-compiler R1CS transport must be an object.");
  }
  if (raw.format !== "circom-r1cs") {
    throw new Error("Unsupported qap-compiler R1CS transport format.");
  }
  if (raw.magic !== "r1cs") {
    throw new Error("qap-compiler R1CS transport magic must be 'r1cs'.");
  }
  if (raw.version !== 1) {
    throw new Error("Unsupported qap-compiler R1CS transport version.");
  }
  if (raw.endianness !== "little") {
    throw new Error("qap-compiler R1CS transport must use little-endian integers.");
  }
  const sections = raw.sections;
  if (!isRecord(sections) || sections.header !== 1 || sections.constraints !== 2) {
    throw new Error("Unsupported qap-compiler R1CS transport section identifiers.");
  }
  return {
    format: raw.format,
    magic: raw.magic,
    version: raw.version,
    endianness: raw.endianness,
    headerSection: sections.header,
    constraintsSection: sections.constraints,
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

function renderSetupGeneratedModule(input: {
  readonly nativeBackendVersion: string;
  readonly subcircuitLibraryOrigin: SubcircuitLibraryOrigin;
  readonly subcircuitLibraryPackageVersion: string;
  readonly setup: SetupParams;
  readonly publicInputLength: number;
  readonly freePublicLength: number;
}): string {
  return `// Generated by scripts/generate/generate-subcircuit-library.ts. Do not edit by hand.
import type { SetupParams } from "../../artifacts/setup/setup-params.js";

export const NATIVE_BACKEND_VERSION = ${JSON.stringify(input.nativeBackendVersion)};
export const SUBCIRCUIT_LIBRARY_ORIGIN = ${JSON.stringify(input.subcircuitLibraryOrigin)};
export const SUBCIRCUIT_LIBRARY_PACKAGE_VERSION = ${JSON.stringify(input.subcircuitLibraryPackageVersion)};
export const GENERATED_PUBLIC_INPUT_LENGTH = ${input.publicInputLength};
export const GENERATED_FREE_PUBLIC_LENGTH = ${input.freePublicLength};

export const GENERATED_SETUP_PARAMS = ${JSON.stringify(input.setup, null, 2)} as const satisfies SetupParams;
`;
}

function renderProverGeneratedModule(input: {
  readonly subcircuitInfos: readonly ProverSubcircuitInfo[];
  readonly packedR1cs: readonly PackedSparseSubcircuit[];
}): string {
  return `// Generated by scripts/generate/generate-subcircuit-library.ts. Do not edit by hand.
import type {
  ProverPackedSparseMatrix,
  ProverPackedSparseSubcircuitR1cs,
  ProverSubcircuitInfo,
} from "../../protocol/witness.js";

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

export const GENERATED_PROVER_PACKED_R1CS: readonly ProverPackedSparseSubcircuitR1cs[] =
  materializePackedSparseR1cs(
    ${JSON.stringify(input.packedR1cs)} as const satisfies readonly PackedSparseSubcircuit[],
  );

function materializePackedSparseR1cs(
  entries: readonly PackedSparseSubcircuit[],
): readonly ProverPackedSparseSubcircuitR1cs[] {
  return entries.map((entry) => ({
    subcircuitId: entry.subcircuitId,
    A: materializePackedSparseMatrix(entry.A),
    B: materializePackedSparseMatrix(entry.B),
    C: materializePackedSparseMatrix(entry.C),
  }));
}

function materializePackedSparseMatrix(packed: PackedSparseMatrix): ProverPackedSparseMatrix {
  if (packed.rowOffsets.length === 0 || packed.rowOffsets[0] !== 0) {
    throw new Error("Packed sparse matrix row offsets must start at zero.");
  }

  const coefficients = decodeBase64(packed.coefficientsBase64);
  if (coefficients.byteLength !== packed.columns.length * 32) {
    throw new Error("Packed sparse matrix coefficient byte length does not match its columns.");
  }

  for (let rowIndex = 0; rowIndex + 1 < packed.rowOffsets.length; rowIndex += 1) {
    const start = packed.rowOffsets[rowIndex];
    const end = packed.rowOffsets[rowIndex + 1];
    if (end < start || end > packed.columns.length) {
      throw new Error("Packed sparse matrix row offsets are invalid.");
    }
  }
  for (const column of packed.columns) {
    if (!Number.isSafeInteger(column) || column < 0 || column >= packed.activeWires.length) {
      throw new Error("Packed sparse matrix column is outside the active wire range.");
    }
  }

  return {
    activeWires: packed.activeWires,
    rowOffsets: uint32Bytes(packed.rowOffsets),
    columns: uint32Bytes(packed.columns),
    coefficients,
    rowCount: packed.rowOffsets.length - 1,
  };
}

function uint32Bytes(values: readonly number[]): Uint8Array {
  const output = new Uint8Array(values.length * 4);
  const view = new DataView(output.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setUint32(index * 4, values[index], true);
  }
  return output;
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

function readGeneratedFile(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function readNativeBackendVersion(cargoTomlPath: string): string {
  const content = fs.readFileSync(cargoTomlPath, "utf8");
  const workspacePackageMatch = content.match(/\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);
  if (workspacePackageMatch === null) {
    throw new Error("Cannot find native backend workspace package version.");
  }

  return workspacePackageMatch[1];
}

function readJson<T = unknown>(jsonPath: string): T {
  return JSON.parse(fs.readFileSync(jsonPath, "utf8")) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
