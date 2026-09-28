import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BACKEND_PACKAGE_NAMES,
  backendBuildMetadataFileName,
  parseBackendBuildMetadata,
  type BackendBuildMetadata,
  type BackendPackageName,
} from '../generated/backend-build-metadata-validator.generated.js';
import type { BackendRuntimeIdentity, RuntimeContext } from './model.js';

type SynthesizerBuildMetadata = {
  dependencies?: {
    subcircuitLibrary?: {
      buildVersion?: unknown;
      declaredRange?: unknown;
      packageName?: unknown;
    };
  };
  packageName?: unknown;
  packageVersion?: unknown;
};

/** Reads the complete production build identity emitted beside backend binaries. */
export async function readProductionBackendRuntimeIdentity(backendReleaseDir: string): Promise<BackendRuntimeIdentity> {
  const metadata = await Promise.all(
    BACKEND_PACKAGE_NAMES.map(async packageName => {
      const metadataPath = path.join(backendReleaseDir, backendBuildMetadataFileName(packageName));
      let value: unknown;
      try {
        value = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as unknown;
      } catch (error) {
        throw new Error(
          `Missing or invalid ${packageName} production build metadata at ${metadataPath}: ${errorMessage(error)}`,
        );
      }
      return parseBackendBuildMetadata(value, packageName, `${packageName} production build metadata`);
    }),
  );
  return Object.freeze(metadata);
}

/** Validates an exact runtime identity against the current CLI release context. */
export function validateBackendRuntimeIdentityForContext(
  value: unknown,
  context: RuntimeContext,
  subject = 'Backend runtime identity',
): BackendRuntimeIdentity {
  const metadata = parseBackendRuntimeIdentity(value, subject);
  for (const entry of metadata) {
    if (entry.packageVersion !== context.packageVersion) {
      throw new Error(
        `${subject} package ${entry.packageName} version ${entry.packageVersion} does not match current CLI package version ${context.packageVersion}.`,
      );
    }
    if (entry.compatibleBackendVersion !== context.compatibleBackendVersion) {
      throw new Error(
        `${subject} package ${entry.packageName} compatibleBackendVersion ${entry.compatibleBackendVersion} does not match current CLI release line ${context.compatibleBackendVersion}.`,
      );
    }
    const library = entry.dependencies.subcircuitLibrary;
    if (library.buildVersion !== context.packageVersion || library.declaredRange !== context.packageVersion) {
      throw new Error(
        `${subject} package ${entry.packageName} must pin subcircuit-library buildVersion and declaredRange to current CLI package version ${context.packageVersion}.`,
      );
    }
  }
  return metadata;
}

/** Validates the packaged Node Synthesizer identity used by the CLI. */
export function validateSynthesizerBuildMetadataForContext(value: unknown, context: RuntimeContext): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Node Synthesizer build metadata must be an object.');
  }
  const metadata = value as SynthesizerBuildMetadata;
  if (metadata.packageName !== '@tokamak-zk-evm/synthesizer-node') {
    throw new Error(
      `Node Synthesizer build metadata has package name ${JSON.stringify(metadata.packageName)}, expected @tokamak-zk-evm/synthesizer-node.`,
    );
  }
  if (metadata.packageVersion !== context.packageVersion) {
    throw new Error(
      `Node Synthesizer package version ${JSON.stringify(metadata.packageVersion)} does not match current CLI package version ${context.packageVersion}.`,
    );
  }
  const library = metadata.dependencies?.subcircuitLibrary;
  if (
    library?.packageName !== '@tokamak-zk-evm/subcircuit-library' ||
    library.buildVersion !== context.packageVersion ||
    library.declaredRange !== context.packageVersion
  ) {
    throw new Error(
      `Node Synthesizer must pin subcircuit-library buildVersion and declaredRange to current CLI package version ${context.packageVersion}.`,
    );
  }
}

/** Ensures an installed binary reports the exact identity persisted for it. */
export function assertLiveBackendRuntimeIdentity(
  persistedIdentity: BackendRuntimeIdentity,
  packageName: BackendPackageName,
  value: unknown,
): BackendBuildMetadata {
  const live = parseBackendBuildMetadata(value, packageName, `${packageName} live backend identity`);
  const persisted = persistedIdentity.find(entry => entry.packageName === packageName);
  if (persisted === undefined) {
    throw new Error(`Persisted backend runtime identity is missing ${packageName}.`);
  }
  if (JSON.stringify(live) !== JSON.stringify(persisted)) {
    throw new Error(`${packageName} live backend identity does not match the installed runtime identity.`);
  }
  return live;
}

/** Parses the persisted identity shape against the backend package registry. */
export function parseBackendRuntimeIdentity(value: unknown, subject: string): BackendRuntimeIdentity {
  if (!Array.isArray(value) || value.length !== BACKEND_PACKAGE_NAMES.length) {
    throw new Error(`${subject} must contain exactly the backend packages declared by the contract.`);
  }
  const metadata = value.map((entry, index) => {
    const packageName = BACKEND_PACKAGE_NAMES[index]!;
    return parseBackendBuildMetadata(entry, packageName, `${subject}[${index}]`);
  });
  return Object.freeze(metadata);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
