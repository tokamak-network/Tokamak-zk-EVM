/**
 * Public type surface for the repository-owned canonical version-policy API.
 * The implementation is version-contract.mjs; backend contract preparation
 * copies this declaration alongside that module for TypeScript consumers.
 */

export interface ParsedPackageVersion {
  readonly major: bigint;
  readonly minor: bigint;
  readonly patch: bigint;
  readonly compatibility: string;
}

export function parseCompatibleBackendVersion(value: unknown): string;
export function parsePackageVersion(value: unknown): ParsedPackageVersion;
export function compatibilityFromPackageVersion(value: unknown): string;
