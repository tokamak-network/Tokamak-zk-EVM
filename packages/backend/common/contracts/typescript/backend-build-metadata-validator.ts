import contract from './backend-build-metadata-contract.generated.js';
import { parseCompatibleBackendVersion, parsePackageVersion } from './version-policy.generated.js';

export type BackendPackageName = (typeof contract)['backendPackageNames'][number];

export interface BackendBuildMetadata {
  readonly dependencies: {
    readonly subcircuitLibrary: {
      readonly buildVersion: string;
      readonly declaredRange: string;
      readonly packageName: '@tokamak-zk-evm/subcircuit-library';
      readonly runtimeMode: 'bundled';
      readonly sourceDigest: string;
    };
  };
  readonly packageName: BackendPackageName;
  readonly packageVersion: string;
  readonly compatibleBackendVersion: string;
}

type JsonSchema = {
  readonly additionalProperties?: boolean;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly pattern?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly type?: string;
};

type BuildMetadataContract = {
  readonly backendPackageNames?: unknown;
  readonly fileNamePattern?: unknown;
  readonly schema?: JsonSchema;
};

const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  'additionalProperties',
  'const',
  'enum',
  'pattern',
  'properties',
  'required',
  'type',
]);

/** Ordered backend runtime package registry defined by the backend JSON contract. */
export const BACKEND_PACKAGE_NAMES = readBackendPackageNames();

/** Validates backend build metadata against the backend-owned JSON contract. */
export function parseBackendBuildMetadata(
  value: unknown,
  expectedPackageName: BackendPackageName,
  subject = 'Backend build metadata',
): BackendBuildMetadata {
  validateJsonSchema(buildMetadataSchema(), value, subject);
  const metadata = value as BackendBuildMetadata;
  if (metadata.packageName !== expectedPackageName) {
    throw new Error(`${subject}.packageName must equal ${JSON.stringify(expectedPackageName)}.`);
  }
  validateVersionPolicy(metadata, subject);
  return metadata;
}

/** Returns the metadata filename defined by the backend contract. */
export function backendBuildMetadataFileName(packageName: BackendPackageName): string {
  const pattern = (contract as BuildMetadataContract).fileNamePattern;
  const placeholder = '{backendPackageName}';
  if (typeof pattern !== 'string' || pattern.split(placeholder).length !== 2) {
    throw new Error('Backend build-metadata contract must define one {backendPackageName} filename placeholder.');
  }
  return pattern.replace(placeholder, packageName);
}

function readBackendPackageNames(): readonly BackendPackageName[] {
  const packageNames = (contract as BuildMetadataContract).backendPackageNames;
  if (!Array.isArray(packageNames) || packageNames.length === 0) {
    throw new Error('Backend build-metadata contract must define non-empty backendPackageNames.');
  }
  const seen = new Set<string>();
  for (const packageName of packageNames) {
    if (typeof packageName !== 'string' || packageName.length === 0) {
      throw new Error('Backend build-metadata contract backendPackageNames entries must be non-empty strings.');
    }
    if (seen.has(packageName)) {
      throw new Error(`Backend build-metadata contract repeats package ${JSON.stringify(packageName)}.`);
    }
    seen.add(packageName);
  }
  return Object.freeze([...packageNames]) as readonly BackendPackageName[];
}

function validateJsonSchema(schema: JsonSchema, value: unknown, subject: string): void {
  if (schema.type !== undefined && !hasJsonType(value, schema.type)) {
    throw new Error(`${subject} has an invalid type.`);
  }
  if (schema.const !== undefined && !sameJsonValue(value, schema.const)) {
    throw new Error(`${subject} must equal ${JSON.stringify(schema.const)}.`);
  }
  if (schema.enum !== undefined && !schema.enum.some(candidate => sameJsonValue(value, candidate))) {
    throw new Error(`${subject} has an unsupported value.`);
  }
  if (typeof value === 'string' && schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
    throw new Error(`${subject} does not match the contract pattern.`);
  }
  if (!isRecord(value)) {
    return;
  }

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

function buildMetadataSchema(): JsonSchema {
  const schema = (contract as BuildMetadataContract).schema;
  if (schema === undefined) {
    throw new Error('Backend build-metadata contract does not define a schema.');
  }
  assertSupportedBackendBuildMetadataSchema(schema);
  return schema;
}

/** Rejects schema evolution that this boundary validator does not implement. */
export function assertSupportedBackendBuildMetadataSchema(schema: unknown): void {
  assertSupportedSchemaKeywords(schema, 'build-metadata schema');
}

function assertSupportedSchemaKeywords(schema: unknown, path: string): void {
  if (!isRecord(schema)) {
    throw new Error(`Backend build-metadata contract ${path} must be an object.`);
  }
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(key)) {
      throw new Error(`Backend build-metadata contract ${path} uses unsupported schema keyword ${key}.`);
    }
  }
  if (schema.properties !== undefined) {
    if (!isRecord(schema.properties)) {
      throw new Error(`Backend build-metadata contract ${path}.properties must be an object.`);
    }
    for (const [field, child] of Object.entries(schema.properties)) {
      assertSupportedSchemaKeywords(child, `${path}.properties.${field}`);
    }
  }
}

function validateVersionPolicy(metadata: BackendBuildMetadata, subject: string): void {
  try {
    parseCompatibleBackendVersion(metadata.compatibleBackendVersion);
  } catch (error) {
    throw new Error(`${subject}.compatibleBackendVersion ${message(error)}`);
  }
  for (const [field, value] of [
    ['packageVersion', metadata.packageVersion],
    ['dependencies.subcircuitLibrary.buildVersion', metadata.dependencies.subcircuitLibrary.buildVersion],
    ['dependencies.subcircuitLibrary.declaredRange', metadata.dependencies.subcircuitLibrary.declaredRange],
  ] as const) {
    try {
      parsePackageVersion(value);
    } catch (error) {
      throw new Error(`${subject}.${field} ${message(error)}`);
    }
  }
  if (metadata.dependencies.subcircuitLibrary.declaredRange !== metadata.dependencies.subcircuitLibrary.buildVersion) {
    throw new Error(`${subject}.dependencies.subcircuitLibrary.declaredRange must equal buildVersion.`);
  }
}

function hasJsonType(value: unknown, type: string): boolean {
  return (type === 'object' && isRecord(value)) || (type === 'string' && typeof value === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
