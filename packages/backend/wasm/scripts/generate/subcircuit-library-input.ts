import type { SetupParams } from "../../src/artifacts/setup/setup-params.js";
import { SUBCIRCUIT_LIBRARY_CONTRACT } from "../../src/generated/subcircuit-library-contract.generated.js";
import type { ProverSubcircuitInfo } from "../../src/prover/protocol/witness.js";

const { setupParams: setupContract, subcircuitInfo: subcircuitContract } =
  SUBCIRCUIT_LIBRARY_CONTRACT.libraryArtifacts;

export function parseSetupParams(raw: unknown): SetupParams {
  const source = requireRecord(raw, setupContract.fileName);
  requireOnlyKeys(source, setupContract.requiredFields, setupContract.fileName);
  const fields = setupContract.fields;
  return {
    n: requireNonNegativeInteger(source[fields.constraintCapacity], fieldLabel(setupContract.fileName, fields.constraintCapacity)),
    m: requireNonNegativeInteger(source[fields.localWireCapacity], fieldLabel(setupContract.fileName, fields.localWireCapacity)),
    m_b: requireNonNegativeInteger(source[fields.wiringCapacity], fieldLabel(setupContract.fileName, fields.wiringCapacity)),
    t: requireNonNegativeInteger(source[fields.subcircuitCapacity], fieldLabel(setupContract.fileName, fields.subcircuitCapacity)),
    s: requireNonNegativeInteger(source[fields.placementCapacity], fieldLabel(setupContract.fileName, fields.placementCapacity)),
    publicWirePhases: parsePublicWirePhases(
      source[fields.orderedPublicWirePhases],
      fieldLabel(setupContract.fileName, fields.orderedPublicWirePhases),
    ),
  };
}

export function parseProverSubcircuitInfos(raw: unknown): readonly ProverSubcircuitInfo[] {
  if (!Array.isArray(raw)) throw new Error(`${subcircuitContract.fileName} must be an array.`);
  return raw.map((entry, index) => {
    const entryLabel = `${subcircuitContract.fileName}[${index}]`;
    const source = requireRecord(entry, entryLabel);
    requireOnlyKeys(
      source,
      [...subcircuitContract.requiredFields, ...subcircuitContract.optionalFields],
      entryLabel,
    );
    const fields = subcircuitContract.fields;
    const id = requireNonNegativeInteger(source.id, `${entryLabel}.id`);
    if (id !== index) throw new Error(`${entryLabel}.id must equal its array index.`);
    const bufferDirection = parseBufferDirection(source.bufferDirection, `${entryLabel}.bufferDirection`);
    return {
      id,
      name: requireNonEmptyString(source.name, `${entryLabel}.name`),
      Nwires: requireNonNegativeInteger(source[fields.normalizedWireCount], fieldLabel(entryLabel, fields.normalizedWireCount)),
      NrealWires: requireNonNegativeInteger(source[fields.compiledRealWireCount], fieldLabel(entryLabel, fields.compiledRealWireCount)),
      Nconsts: requireNonNegativeInteger(source[fields.constraintCount], fieldLabel(entryLabel, fields.constraintCount)),
      Out_idx: parseRange(source[fields.normalizedOutputRange], fieldLabel(entryLabel, fields.normalizedOutputRange)),
      In_idx: parseRange(source[fields.normalizedInputRange], fieldLabel(entryLabel, fields.normalizedInputRange)),
      Wiring_idx: parseRange(source[fields.realWiringRange], fieldLabel(entryLabel, fields.realWiringRange)),
      Public_idx: parseRange(source[fields.publicWiringRange], fieldLabel(entryLabel, fields.publicWiringRange)),
      Internal_idx: parseRange(source[fields.realInternalRange], fieldLabel(entryLabel, fields.realInternalRange)),
      ...(bufferDirection === undefined ? {} : { bufferDirection }),
      ...(source.publicPhase === undefined
        ? {}
        : { publicPhase: requireNonEmptyString(source.publicPhase, `${entryLabel}.publicPhase`) }),
    } satisfies ProverSubcircuitInfo;
  });
}

function parsePublicWirePhases(value: unknown, label: string): SetupParams["publicWirePhases"] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((entry, index) => {
    const phase = requireRecord(entry, `${label}[${index}]`);
    requireOnlyKeys(phase, ["name", "region", "subcircuitIds"], `${label}[${index}]`);
    if (phase.region !== "free" && phase.region !== "fixed") {
      throw new Error(`${label}[${index}].region must be "free" or "fixed".`);
    }
    return {
      name: requireNonEmptyString(phase.name, `${label}[${index}].name`),
      region: phase.region,
      subcircuitIds: parseIntegerArray(phase.subcircuitIds, `${label}[${index}].subcircuitIds`),
    };
  });
}

function parseRange(value: unknown, label: string): readonly [number, number] {
  const values = parseIntegerArray(value, label);
  if (values.length !== 2) throw new Error(`${label} must contain [start, count].`);
  return [values[0]!, values[1]!];
}

function fieldLabel(objectLabel: string, fieldName: string): string {
  return `${objectLabel}.${fieldName}`;
}

function parseBufferDirection(value: unknown, label: string): "in" | "out" | undefined {
  if (value === undefined) return undefined;
  if (value === "in" || value === "out") return value;
  throw new Error(`${label} must be "in" or "out" when present.`);
}

function parseIntegerArray(value: unknown, label: string): readonly number[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((entry, index) => requireNonNegativeInteger(entry, `${label}[${index}]`));
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`${label} contains unsupported field ${key}.`);
    }
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
}
