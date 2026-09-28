const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { backendProductionBuildArgs, validateProductionBuildMetadata } = require('../dist/runtime/native.js');
const {
  BACKEND_PACKAGE_NAMES,
  backendBuildMetadataFileName,
} = require('../dist/generated/backend-build-metadata-validator.generated.js');
const VALID_METADATA = require('../../backend/common/contracts/fixtures/backend-build-metadata-valid.json');
const BACKEND_BUILD_METADATA_CONTRACT =
  require('../dist/generated/backend-build-metadata-contract.generated.js').default;

test('runtime package registry is supplied by the backend build-metadata contract', () => {
  assert.deepEqual(BACKEND_PACKAGE_NAMES, BACKEND_BUILD_METADATA_CONTRACT.backendPackageNames);
});

test('production backend builds select the npm subcircuit-library feature explicitly', () => {
  for (const packageName of BACKEND_PACKAGE_NAMES) {
    assert.deepEqual(backendProductionBuildArgs(packageName), [
      'build',
      '--locked',
      '-p',
      packageName,
      '--release',
      '--no-default-features',
      '--features',
      'production-npm-subcircuit-library',
    ]);
  }
});

test('production backend builds require contract-valid metadata for every installed binary', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-production-metadata-'));
  try {
    for (const packageName of BACKEND_PACKAGE_NAMES) {
      await fs.writeFile(
        path.join(temporaryRoot, backendBuildMetadataFileName(packageName)),
        `${JSON.stringify({ ...VALID_METADATA, packageName })}\n`,
        'utf8',
      );
    }
    await validateProductionBuildMetadata(temporaryRoot);

    await fs.rm(path.join(temporaryRoot, backendBuildMetadataFileName('verify')));
    await assert.rejects(
      validateProductionBuildMetadata(temporaryRoot),
      /Missing or invalid verify production build metadata/u,
    );
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
