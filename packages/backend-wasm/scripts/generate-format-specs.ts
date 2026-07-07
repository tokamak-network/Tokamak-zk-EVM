import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

interface SpecJob {
  readonly jsonPath: string;
  readonly generatedPath: string;
  readonly constName: string;
}

const SPEC_JOBS: readonly SpecJob[] = [
  {
    jsonPath: "src/libs/artifact-loaders/specs/sigma-verify.v1.json",
    generatedPath: "src/libs/artifact-loaders/specs/sigma-verify.v1.generated.ts",
    constName: "SIGMA_VERIFY_V1_SPEC",
  },
  {
    jsonPath: "src/libs/artifact-loaders/specs/verifier-preprocess.v1.json",
    generatedPath: "src/libs/artifact-loaders/specs/verifier-preprocess.v1.generated.ts",
    constName: "VERIFIER_PREPROCESS_V1_SPEC",
  },
  {
    jsonPath: "src/libs/artifact-loaders/specs/verifier-proof.v1.json",
    generatedPath: "src/libs/artifact-loaders/specs/verifier-proof.v1.generated.ts",
    constName: "VERIFIER_PROOF_V1_SPEC",
  },
  {
    jsonPath: "src/libs/artifact-loaders/specs/verifier-instance.v1.json",
    generatedPath: "src/libs/artifact-loaders/specs/verifier-instance.v1.generated.ts",
    constName: "VERIFIER_INSTANCE_V1_SPEC",
  },
  {
    jsonPath: "src/libs/artifact-loaders/specs/prover-crs.v1.json",
    generatedPath: "src/libs/artifact-loaders/specs/prover-crs.v1.generated.ts",
    constName: "PROVER_CRS_V1_SPEC",
  },
  {
    jsonPath: "src/libs/artifact-loaders/specs/prover-placement-variables.v1.json",
    generatedPath: "src/libs/artifact-loaders/specs/prover-placement-variables.v1.generated.ts",
    constName: "PROVER_PLACEMENT_VARIABLES_V1_SPEC",
  },
  {
    jsonPath: "src/libs/artifact-loaders/specs/prover-permutation.v1.json",
    generatedPath: "src/libs/artifact-loaders/specs/prover-permutation.v1.generated.ts",
    constName: "PROVER_PERMUTATION_V1_SPEC",
  },
  {
    jsonPath: "src/libs/artifact-loaders/specs/prover-instance.v1.json",
    generatedPath: "src/libs/artifact-loaders/specs/prover-instance.v1.generated.ts",
    constName: "PROVER_INSTANCE_V1_SPEC",
  },
  {
    jsonPath: "src/libs/artifact-loaders/specs/prover-setup-params.v1.json",
    generatedPath: "src/libs/artifact-loaders/specs/prover-setup-params.v1.generated.ts",
    constName: "PROVER_SETUP_PARAMS_V1_SPEC",
  },
  {
    jsonPath: "src/libs/artifact-loaders/specs/test-binary.v1.json",
    generatedPath: "src/libs/artifact-loaders/specs/test-binary.v1.generated.ts",
    constName: "TEST_BINARY_V1_SPEC",
  },
];

interface RawSpec {
  readonly schemaVersion: number;
  readonly name: string;
  readonly sections: readonly RawSectionSpec[];
}

interface RawSectionSpec {
  readonly label: string;
  readonly type: string;
  readonly encoding: string;
  readonly elementCount: number | null;
  readonly elementByteLength: number | null;
  readonly points: readonly RawPointSpec[];
}

interface RawPointSpec {
  readonly index: number;
  readonly name: string;
}

async function main(argv: readonly string[]): Promise<void> {
  const checkOnly = argv.includes("--check");

  for (const job of SPEC_JOBS) {
    const spec = parseRawSpec(JSON.parse(await readFile(job.jsonPath, "utf8")) as unknown, job.jsonPath);
    const generated = renderSpec(job.constName, spec);

    if (checkOnly) {
      const current = await readFile(job.generatedPath, "utf8");
      if (current !== generated) {
        throw new Error(`${job.generatedPath} is out of date. Run npm run specs:generate.`);
      }
    } else {
      await writeFile(job.generatedPath, generated);
      console.log(`Generated ${job.generatedPath}`);
    }
  }

  if (checkOnly) {
    console.log("Checked generated artifact-loader format specs");
  }
}

function parseRawSpec(raw: unknown, sourcePath: string): RawSpec {
  if (!isRecord(raw)) {
    throw new Error(`${sourcePath} spec must be a JSON object.`);
  }

  if (raw.schemaVersion !== 1) {
    throw new Error(`${sourcePath} spec schemaVersion must be 1.`);
  }

  if (
    raw.name !== "sigma_verify" &&
    raw.name !== "verifier_preprocess" &&
    raw.name !== "verifier_proof" &&
    raw.name !== "verifier_instance" &&
    raw.name !== "prover_crs" &&
    raw.name !== "prover_placement_variables" &&
    raw.name !== "prover_permutation" &&
    raw.name !== "prover_instance" &&
    raw.name !== "prover_setup_params" &&
    raw.name !== "test_binary"
  ) {
    throw new Error(`${sourcePath} has unsupported spec name: ${String(raw.name)}.`);
  }

  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    throw new Error(`${sourcePath} spec sections must be a non-empty array.`);
  }

  return {
    schemaVersion: 1,
    name: raw.name,
    sections: raw.sections.map((section, index) => parseRawSectionSpec(section, sourcePath, index)),
  };
}

function parseRawSectionSpec(raw: unknown, sourcePath: string, index: number): RawSectionSpec {
  if (!isRecord(raw)) {
    throw new Error(`${sourcePath} section spec at index ${index} must be an object.`);
  }

  if (typeof raw.label !== "string" || raw.label.trim() === "") {
    throw new Error(`${sourcePath} section at index ${index} label must be a non-empty string.`);
  }

  const type = parseSectionType(raw.type, sourcePath);
  const encoding = parseSectionEncoding(raw.encoding, sourcePath);
  const elementCount = parseElementCount(raw.elementCount, raw.label, sourcePath);
  const elementByteLength = parseElementByteLength(raw.elementByteLength, raw.label, sourcePath);

  if (!Array.isArray(raw.points)) {
    throw new Error(`${sourcePath} section '${raw.label}' points must be an array.`);
  }

  const points = raw.points.map((point, pointIndex) =>
    parseRawPointSpec(point, sourcePath, raw.label as string, pointIndex),
  );
  validatePointIndexes(points, elementCount, raw.label, sourcePath);

  return {
    label: raw.label,
    type,
    encoding,
    elementCount,
    elementByteLength,
    points,
  };
}

function parseElementCount(value: unknown, label: string, sourcePath: string): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${sourcePath} section '${label}' elementCount must be a non-negative integer or null.`);
  }

  return value;
}

function parseElementByteLength(value: unknown, label: string, sourcePath: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${sourcePath} section '${label}' elementByteLength must be a positive integer or null.`);
  }

  return value;
}

function parseRawPointSpec(raw: unknown, sourcePath: string, sectionLabel: string, index: number): RawPointSpec {
  if (!isRecord(raw)) {
    throw new Error(`${sourcePath} point spec at ${sectionLabel}[${index}] must be an object.`);
  }

  if (typeof raw.index !== "number" || !Number.isSafeInteger(raw.index) || raw.index < 0) {
    throw new Error(`${sourcePath} point index at ${sectionLabel}[${index}] must be a non-negative integer.`);
  }

  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    throw new Error(`${sourcePath} point name at ${sectionLabel}[${index}] must be a non-empty string.`);
  }

  return {
    index: raw.index,
    name: raw.name,
  };
}

function validatePointIndexes(
  points: readonly RawPointSpec[],
  elementCount: number | null,
  label: string,
  sourcePath: string,
): void {
  const indexes = new Set<number>();
  const names = new Set<string>();

  for (const point of points) {
    if (indexes.has(point.index)) {
      throw new Error(`${sourcePath} section '${label}' has duplicate point index ${point.index}.`);
    }

    if (names.has(point.name)) {
      throw new Error(`${sourcePath} section '${label}' has duplicate point name '${point.name}'.`);
    }

    if (elementCount !== null && point.index >= elementCount) {
      throw new Error(`${sourcePath} section '${label}' point '${point.name}' index exceeds elementCount.`);
    }

    indexes.add(point.index);
    names.add(point.name);
  }
}

function renderSpec(constName: string, spec: RawSpec): string {
  return `import { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const ${constName} = {
  schemaVersion: ${spec.schemaVersion},
  name: ${formatString(spec.name)},
  sections: [
${spec.sections.map(renderSection).join("")}  ],
} as const satisfies RuntimeArtifactFormatSpec;
`;
}

function renderSection(section: RawSectionSpec): string {
  return `    {
      label: ${formatString(section.label)},
      type: BinarySectionType.${section.type},
      encoding: BinarySectionEncoding.${section.encoding},
      elementCount: ${section.elementCount === null ? "null" : section.elementCount},
      elementByteLength: ${section.elementByteLength === null ? "null" : section.elementByteLength},
      points: [
${section.points.map(renderPoint).join("")}      ],
    },
`;
}

function renderPoint(point: RawPointSpec): string {
  return `        { index: ${point.index}, name: ${formatString(point.name)} },
`;
}

function parseSectionType(value: unknown, sourcePath: string): string {
  switch (value) {
    case "CrsG1":
    case "CrsG2":
    case "Preprocess":
    case "Proof":
    case "Instance":
    case "SetupParams":
    case "Placement":
    case "Permutation":
    case "MsmBases":
    case "MsmScalars":
    case "PairingG1Terms":
    case "PairingG2Terms":
    case "TestScalars":
      return value;
    default:
      throw new Error(`${sourcePath} has unsupported section type: ${String(value)}.`);
  }
}

function parseSectionEncoding(value: unknown, sourcePath: string): string {
  switch (value) {
    case "ffjs-fr-montgomery-le-32":
      return "FfjsFrMontgomeryLe32";
    case "ffjs-g1-affine-96":
      return "FfjsG1Affine96";
    case "ffjs-g2-affine-192":
      return "FfjsG2Affine192";
    case "scalar-raw-le-32":
      return "ScalarRawLe32";
    case "bytes":
      return "Bytes";
    default:
      throw new Error(`${sourcePath} has unsupported section encoding: ${String(value)}.`);
  }
}

function formatString(value: string): string {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Format spec generation failed: ${message}`);
    process.exitCode = 1;
  });
}
