// Handwritten boundary validator for the backend-owned CRS provenance JSON
// contract. Consumer preparation copies this source under a generated filename;
// the JSON contract remains the shape authority.

import contract from './crs-provenance-contract.generated.js';
import { parseCompatibleBackendVersion, parsePackageVersion } from './version-policy.generated.js';

export type SubcircuitLibraryOrigin = 'npmSnapshot' | 'localQapCompiler';

export interface FilecoinSourceProvenance {
  readonly sourceUrl: string;
  readonly sourceBlake2b512: string;
}

export interface CrsProvenance {
  readonly documentKind: 'crs';
  readonly protocolSchemaId: string;
  readonly generationMethod: 'trustedSetup' | 'mpc';
  readonly releaseEligible: boolean;
  readonly generatedAtUtc: string;
  readonly compatibleBackendVersion: string;
  readonly subcircuitLibrary: {
    readonly packageName: string;
    readonly packageVersion: string;
    readonly origin: SubcircuitLibraryOrigin;
    readonly sourceDigest: string;
  };
  readonly phase1SourceProvenance: null | { readonly filecoin: FilecoinSourceProvenance };
  readonly ceremonyProtocolVersion: 'tokamak-filecoin-phase2' | null;
  readonly ceremonyTranscriptSha256: string | null;
  readonly phase2ContributionCount: number | null;
  readonly artifacts: Readonly<Record<string, string>>;
}

type JsonSchema = {
  readonly additionalProperties?: boolean;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly format?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly oneOf?: readonly JsonSchema[];
  readonly pattern?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly type?: string | readonly string[];
};

type ProvenanceContract = {
  readonly fileName?: unknown;
  readonly rootFiles?: readonly string[];
  readonly schema?: JsonSchema;
};

const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  'additionalProperties',
  'const',
  'enum',
  'format',
  'minLength',
  'minimum',
  'oneOf',
  'pattern',
  'properties',
  'required',
  'type',
]);

/** Validates a CRS document from any supported generation method against the backend-owned JSON contract. */
export function parseCrsProvenance(value: unknown, subject = 'CRS provenance'): CrsProvenance {
  validateJsonSchema(crsProvenanceSchema(), value, subject);
  const provenance = value as CrsProvenance;
  validateVersionPolicy(provenance, subject);
  if (provenance.generationMethod === 'mpc' &&
      (!Number.isSafeInteger(provenance.phase2ContributionCount) || provenance.phase2ContributionCount! < 1)) {
    throw new Error(`${subject}.phase2ContributionCount must be a positive integer for MPC provenance.`);
  }
  if (provenance.generationMethod === 'trustedSetup' && provenance.phase2ContributionCount !== null) {
    throw new Error(`${subject}.phase2ContributionCount must be null for trusted-setup provenance.`);
  }
  const names = crsArchiveRootFileNames().filter(name => name !== crsProvenanceFileName());
  if (Object.keys(provenance.artifacts).length !== names.length ||
      names.some(name => !hasOwn(provenance.artifacts, name))) {
    throw new Error(`${subject}.artifacts must contain exactly the protocol's CRS payload files.`);
  }
  return provenance;
}

/** Returns the final CRS provenance filename defined by the backend contract. */
export function crsProvenanceFileName(): string {
  const fileName = (contract as ProvenanceContract).fileName;
  if (typeof fileName !== 'string' || fileName.length === 0) {
    throw new Error('Backend CRS provenance contract does not define a non-empty fileName.');
  }
  return fileName;
}

/** Returns the exact archive filenames for a protocol, independent of generation method. */
export function crsArchiveRootFileNames(): readonly string[] {
  const names = (contract as ProvenanceContract).rootFiles;
  if (!Array.isArray(names) || names.length === 0 || !names.includes(crsProvenanceFileName())) {
    throw new Error('Backend CRS contract must list payloads and provenance in rootFiles.');
  }
  if (names.some(name => typeof name !== 'string' || !isRootFileName(name)) ||
      new Set(names).size !== names.length) {
    throw new Error('Backend CRS contract contains invalid or duplicate artifact filenames.');
  }
  return names;
}

/** Parses an input origin using the enum in the backend-owned provenance contract. */
export function parseSubcircuitLibraryOrigin(
  value: unknown,
  subject = 'subcircuit-library origin',
): SubcircuitLibraryOrigin {
  validateJsonSchema(subcircuitLibraryOriginSchema(), value, subject);
  return value as SubcircuitLibraryOrigin;
}

function validateJsonSchema(schema: JsonSchema, value: unknown, subject: string): void {
  if (schema.oneOf !== undefined) {
    const results = schema.oneOf.map(candidate => tryValidate(candidate, value, subject));
    const matches = results.filter(result => result.valid);
    if (matches.length !== 1) {
      const reasons = results.flatMap(result => (result.valid ? [] : [result.reason]));
      throw new Error(`${subject} does not match exactly one allowed contract shape: ${reasons.join(' ')}`);
    }
    return;
  }

  if (schema.const !== undefined && !sameJsonValue(value, schema.const)) {
    throw new Error(`${subject} must equal ${JSON.stringify(schema.const)}.`);
  }
  if (schema.enum !== undefined && !schema.enum.some(candidate => sameJsonValue(value, candidate))) {
    throw new Error(`${subject} has an unsupported value.`);
  }

  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length > 0 && !types.some(type => hasJsonType(value, type))) {
    throw new Error(`${subject} has an invalid type.`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      throw new Error(`${subject} is shorter than the contract allows.`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
      throw new Error(`${subject} does not match the contract pattern.`);
    }
    if (schema.format === 'date-time' && !isRfc3339DateTime(value)) {
      throw new Error(`${subject} must be an RFC 3339 date-time.`);
    }
  }

  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    throw new Error(`${subject} is below the contract minimum.`);
  }

  if (isRecord(value)) {
    const properties = schema.properties ?? {};
    for (const field of schema.required ?? []) {
      if (!hasOwn(value, field)) {
        throw new Error(`${subject} is missing ${field}.`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const field of Object.keys(value)) {
        if (!hasOwn(properties, field)) {
          throw new Error(`${subject} has unsupported field ${field}.`);
        }
      }
    }
    for (const [field, fieldSchema] of Object.entries(properties)) {
      if (hasOwn(value, field)) {
        validateJsonSchema(fieldSchema, value[field], `${subject}.${field}`);
      }
    }
  }
}

function isRfc3339DateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function tryValidate(
  schema: JsonSchema,
  value: unknown,
  subject: string,
): { readonly valid: true } | { readonly valid: false; readonly reason: string } {
  try {
    validateJsonSchema(schema, value, subject);
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: message(error) };
  }
}

function hasJsonType(value: unknown, type: string): boolean {
  switch (type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'null':
      return value === null;
    case 'object':
      return isRecord(value);
    case 'string':
      return typeof value === 'string';
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRootFileName(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\0')
  );
}

function crsProvenanceSchema(): JsonSchema {
  const schema = (contract as ProvenanceContract).schema;
  if (schema === undefined) {
    throw new Error('Backend CRS provenance contract does not define its shared schema.');
  }
  assertSupportedCrsProvenanceSchema(schema);
  return schema;
}

function subcircuitLibraryOriginSchema(): JsonSchema {
  const finalMpcSchema = crsProvenanceSchema();
  const subcircuitLibrarySchema = finalMpcSchema.properties?.subcircuitLibrary;
  const originSchema = subcircuitLibrarySchema?.properties?.origin;
  if (originSchema === undefined) {
    throw new Error('Backend CRS provenance contract does not define subcircuitLibrary.origin.');
  }
  return originSchema;
}

/** Rejects schema evolution that this boundary validator does not implement. */
export function assertSupportedCrsProvenanceSchema(schema: unknown): void {
  assertSupportedSchemaKeywords(schema, 'CRS provenance schema');
}

function assertSupportedSchemaKeywords(schema: unknown, path: string): void {
  if (!isRecord(schema)) {
    throw new Error(`Backend CRS provenance contract ${path} must be an object.`);
  }
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(key)) {
      throw new Error(`Backend CRS provenance contract ${path} uses unsupported schema keyword ${key}.`);
    }
  }
  if (schema.oneOf !== undefined) {
    if (!Array.isArray(schema.oneOf)) {
      throw new Error(`Backend CRS provenance contract ${path}.oneOf must be an array.`);
    }
    for (const [index, candidate] of schema.oneOf.entries()) {
      assertSupportedSchemaKeywords(candidate, `${path}.oneOf[${index}]`);
    }
  }
  if (schema.properties !== undefined) {
    if (!isRecord(schema.properties)) {
      throw new Error(`Backend CRS provenance contract ${path}.properties must be an object.`);
    }
    for (const [field, child] of Object.entries(schema.properties)) {
      assertSupportedSchemaKeywords(child, `${path}.properties.${field}`);
    }
  }
}

function validateVersionPolicy(provenance: CrsProvenance, subject: string): void {
  try {
    parseCompatibleBackendVersion(provenance.compatibleBackendVersion);
  } catch (error) {
    throw new Error(`${subject}.compatibleBackendVersion ${message(error)}`);
  }
  try {
    parsePackageVersion(provenance.subcircuitLibrary.packageVersion);
  } catch (error) {
    throw new Error(`${subject}.subcircuitLibrary.packageVersion ${message(error)}`);
  }
}

function hasOwn(value: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
