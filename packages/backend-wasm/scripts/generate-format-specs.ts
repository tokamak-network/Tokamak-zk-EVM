import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SIGMA_VERIFY_JSON_PATH = "src/libs/artifact-loaders/specs/sigma-verify.v1.json";
const SIGMA_VERIFY_GENERATED_PATH = "src/libs/artifact-loaders/specs/sigma-verify.v1.generated.ts";

interface RawSpec {
  readonly schemaVersion: number;
  readonly name: string;
  readonly sections: readonly RawSectionSpec[];
}

interface RawSectionSpec {
  readonly label: string;
  readonly type: string;
  readonly encoding: string;
  readonly elementCount: number;
  readonly points: readonly RawPointSpec[];
}

interface RawPointSpec {
  readonly index: number;
  readonly name: string;
}

async function main(argv: readonly string[]): Promise<void> {
  const checkOnly = argv.includes("--check");
  const spec = parseRawSpec(JSON.parse(await readFile(SIGMA_VERIFY_JSON_PATH, "utf8")) as unknown);
  const generated = renderSigmaVerifySpec(spec);

  if (checkOnly) {
    const current = await readFile(SIGMA_VERIFY_GENERATED_PATH, "utf8");
    if (current !== generated) {
      throw new Error(`${SIGMA_VERIFY_GENERATED_PATH} is out of date. Run npm run specs:generate.`);
    }
    console.log("Checked generated artifact-loader format specs");
    return;
  }

  await writeFile(SIGMA_VERIFY_GENERATED_PATH, generated);
  console.log(`Generated ${SIGMA_VERIFY_GENERATED_PATH}`);
}

function parseRawSpec(raw: unknown): RawSpec {
  if (!isRecord(raw)) {
    throw new Error("sigma_verify spec must be a JSON object.");
  }

  if (raw.schemaVersion !== 1) {
    throw new Error("sigma_verify spec schemaVersion must be 1.");
  }

  if (raw.name !== "sigma_verify") {
    throw new Error("sigma_verify spec name must be 'sigma_verify'.");
  }

  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    throw new Error("sigma_verify spec sections must be a non-empty array.");
  }

  return {
    schemaVersion: 1,
    name: "sigma_verify",
    sections: raw.sections.map(parseRawSectionSpec),
  };
}

function parseRawSectionSpec(raw: unknown): RawSectionSpec {
  if (!isRecord(raw)) {
    throw new Error("sigma_verify section spec must be an object.");
  }

  if (typeof raw.label !== "string" || raw.label.trim() === "") {
    throw new Error("sigma_verify section label must be a non-empty string.");
  }

  const type = parseSectionType(raw.type);
  const encoding = parseSectionEncoding(raw.encoding);

  if (typeof raw.elementCount !== "number" || !Number.isSafeInteger(raw.elementCount) || raw.elementCount < 0) {
    throw new Error(`sigma_verify section '${raw.label}' elementCount must be a non-negative integer.`);
  }

  if (!Array.isArray(raw.points)) {
    throw new Error(`sigma_verify section '${raw.label}' points must be an array.`);
  }

  return {
    label: raw.label,
    type,
    encoding,
    elementCount: raw.elementCount,
    points: raw.points.map(parseRawPointSpec),
  };
}

function parseRawPointSpec(raw: unknown): RawPointSpec {
  if (!isRecord(raw)) {
    throw new Error("sigma_verify point spec must be an object.");
  }

  if (typeof raw.index !== "number" || !Number.isSafeInteger(raw.index) || raw.index < 0) {
    throw new Error("sigma_verify point index must be a non-negative integer.");
  }

  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    throw new Error("sigma_verify point name must be a non-empty string.");
  }

  return {
    index: raw.index,
    name: raw.name,
  };
}

function renderSigmaVerifySpec(spec: RawSpec): string {
  return `import { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";
import type { SigmaVerifyFormatSpec } from "./types.js";

export const SIGMA_VERIFY_V1_SPEC = {
  schemaVersion: ${spec.schemaVersion},
  name: ${formatString(spec.name)},
  sections: [
${spec.sections.map(renderSection).join("")}  ],
} as const satisfies SigmaVerifyFormatSpec;
`;
}

function renderSection(section: RawSectionSpec): string {
  return `    {
      label: ${formatString(section.label)},
      type: BinarySectionType.${section.type},
      encoding: BinarySectionEncoding.${section.encoding},
      elementCount: ${section.elementCount},
      points: [
${section.points.map(renderPoint).join("")}      ],
    },
`;
}

function renderPoint(point: RawPointSpec): string {
  return `        { index: ${point.index}, name: ${formatString(point.name)} },
`;
}

function parseSectionType(value: unknown): string {
  switch (value) {
    case "CrsG1":
    case "CrsG2":
      return value;
    default:
      throw new Error(`Unsupported sigma_verify section type: ${String(value)}.`);
  }
}

function parseSectionEncoding(value: unknown): string {
  switch (value) {
    case "ffjs-g1-affine-96":
      return "FfjsG1Affine96";
    case "ffjs-g2-affine-192":
      return "FfjsG2Affine192";
    default:
      throw new Error(`Unsupported sigma_verify section encoding: ${String(value)}.`);
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
