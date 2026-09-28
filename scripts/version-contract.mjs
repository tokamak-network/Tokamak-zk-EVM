const COMPATIBLE_BACKEND_VERSION = 'MAJOR.MINOR';
const PACKAGE_VERSION = 'MAJOR.MINOR.PATCH';
const MAX_U64 = 18_446_744_073_709_551_615n;

/** @param {unknown} value */
export function parseCompatibleBackendVersion(value) {
  const [major, minor] = parseVersion(value, COMPATIBLE_BACKEND_VERSION, 2);
  return `${major}.${minor}`;
}

/** @param {unknown} value */
export function parsePackageVersion(value) {
  const [major, minor, patch] = parseVersion(value, PACKAGE_VERSION, 3);
  return { major, minor, patch, compatibility: `${major}.${minor}` };
}

/** @param {unknown} value */
export function compatibilityFromPackageVersion(value) {
  return parsePackageVersion(value).compatibility;
}

/**
 * @param {unknown} value
 * @param {string} expected
 * @param {number} componentCount
 */
function parseVersion(value, expected, componentCount) {
  if (typeof value !== 'string') {
    throw new Error(`must be canonical ${expected}; got ${JSON.stringify(value)} (value must be a string).`);
  }
  const components = value.split('.');
  if (components.length !== componentCount) {
    throw new Error(`must be canonical ${expected}; got ${JSON.stringify(value)} (wrong component count).`);
  }
  return components.map(component => parseComponent(component, expected, value));
}

/**
 * @param {string} component
 * @param {string} expected
 * @param {string} originalValue
 */
function parseComponent(component, expected, originalValue) {
  if (!/^[0-9]+$/u.test(component)) {
    throw new Error(
      `must be canonical ${expected}; got ${JSON.stringify(originalValue)} (components must contain ASCII digits).`,
    );
  }
  if (component.length > 1 && component.startsWith('0')) {
    throw new Error(
      `must be canonical ${expected}; got ${JSON.stringify(originalValue)} (leading zeroes are not canonical).`,
    );
  }
  const numeric = BigInt(component);
  if (numeric > MAX_U64) {
    throw new Error(
      `must be canonical ${expected}; got ${JSON.stringify(originalValue)} (numeric component is out of range).`,
    );
  }
  return numeric;
}
