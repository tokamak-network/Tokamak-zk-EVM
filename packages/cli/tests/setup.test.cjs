const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  withDownloadedVerifierSetup,
  installDownloadedSetup,
  installValidatedCrsGeneration,
  validateDownloadedCrs,
  validateCrsProvenanceContract,
} = require('../dist/runtime/setup.js');
const {
  crsProvenanceFileName,
  crsArchiveRootFileNames,
  assertSupportedCrsProvenanceSchema,
} = require('../dist/generated/crs-provenance-validator.generated.js');
const {
  BACKEND_PACKAGE_NAMES,
  backendBuildMetadataFileName,
  assertSupportedBackendBuildMetadataSchema,
} = require('../dist/generated/backend-build-metadata-validator.generated.js');

const SUBCIRCUIT_LIBRARY_PACKAGE_NAME = '@tokamak-zk-evm/subcircuit-library';
const SUBCIRCUIT_LIBRARY_SOURCE_DIGEST =
  'sha256:2222222222222222222222222222222222222222222222222222222222222222';
const CRS_PROVENANCE_CONTRACT = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(__dirname, '..', '..', 'backend', 'common', 'contracts', 'crs-provenance-contract.json'),
    'utf8',
  ),
);
const FINAL_CRS_ARCHIVE_FILES = crsArchiveRootFileNames();
const BACKEND_BUILD_METADATA_CONTRACT = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(__dirname, '..', '..', 'backend', 'common', 'contracts', 'backend-build-metadata-contract.json'),
    'utf8',
  ),
);
function readBackendBuildMetadataFixture(filename) {
  return JSON.parse(
    require('node:fs').readFileSync(
      path.resolve(__dirname, '..', '..', 'backend', 'common', 'contracts', 'fixtures', filename),
      'utf8',
    ),
  );
}
const INVALID_BUILD_METADATA_FIXTURES = {
  missingRuntimeMode: readBackendBuildMetadataFixture('backend-build-metadata-invalid.json'),
  declaredRange: readBackendBuildMetadataFixture('backend-build-metadata-invalid-declared-range.json'),
  runtimeMode: readBackendBuildMetadataFixture('backend-build-metadata-invalid-runtime-mode.json'),
  libraryPackage: readBackendBuildMetadataFixture('backend-build-metadata-invalid-library-package.json'),
  unexpectedField: readBackendBuildMetadataFixture('backend-build-metadata-invalid-unexpected-field.json'),
  packageName: readBackendBuildMetadataFixture('backend-build-metadata-invalid-package-name.json'),
  leadingZeroPackageVersion: readBackendBuildMetadataFixture(
    'backend-build-metadata-invalid-leading-zero-package-version.json',
  ),
  leadingZeroCompatibleVersion: readBackendBuildMetadataFixture(
    'backend-build-metadata-invalid-leading-zero-compatible-version.json',
  ),
  leadingZeroLibraryVersion: readBackendBuildMetadataFixture(
    'backend-build-metadata-invalid-leading-zero-library-version.json',
  ),
  missingSourceDigest: readBackendBuildMetadataFixture('backend-build-metadata-missing-source-digest.json'),
  invalidSourceDigest: readBackendBuildMetadataFixture('backend-build-metadata-invalid-source-digest.json'),
};

const CANONICAL_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(__dirname, '..', '..', 'backend', 'common', 'contracts', 'fixtures', 'final-mpc-crs-provenance.json'),
    'utf8',
  ),
);
const MALFORMED_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(__dirname, '..', '..', 'backend', 'common', 'contracts', 'fixtures', 'final-mpc-crs-provenance-malformed.json'),
    'utf8',
  ),
);
const LEGACY_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(__dirname, '..', '..', 'backend', 'common', 'contracts', 'fixtures', 'final-mpc-crs-provenance-legacy.json'),
    'utf8',
  ),
);
const LEADING_ZERO_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(
      __dirname,
      '..',
      '..',
      'backend',
      'common',
      'contracts',
      'fixtures',
      'final-mpc-crs-provenance-leading-zero.json',
    ),
    'utf8',
  ),
);
const DATE_ONLY_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(__dirname, '..', '..', 'backend', 'common', 'contracts', 'fixtures', 'final-mpc-crs-provenance-date-only.json'),
    'utf8',
  ),
);
const INVALID_DIGEST_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(
      __dirname,
      '..',
      '..',
      'backend',
      'common',
      'contracts',
      'fixtures',
      'final-mpc-crs-provenance-invalid-digest.json',
    ),
    'utf8',
  ),
);
const EMPTY_STRING_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(
      __dirname,
      '..',
      '..',
      'backend',
      'common',
      'contracts',
      'fixtures',
      'final-mpc-crs-provenance-empty-string.json',
    ),
    'utf8',
  ),
);
const TRUSTED_SETUP_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(__dirname, '..', '..', 'backend', 'common', 'contracts', 'fixtures', 'trusted-setup-crs-provenance.json'),
    'utf8',
  ),
);
const NULL_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(__dirname, '..', '..', 'backend', 'common', 'contracts', 'fixtures', 'final-mpc-crs-provenance-null.json'),
    'utf8',
  ),
);
const INVALID_PHASE1_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(
      __dirname,
      '..',
      '..',
      'backend',
      'common',
      'contracts',
      'fixtures',
      'final-mpc-crs-provenance-invalid-phase1.json',
    ),
    'utf8',
  ),
);
const INVALID_ORIGIN_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(
      __dirname,
      '..',
      '..',
      'backend',
      'common',
      'contracts',
      'fixtures',
      'final-mpc-crs-provenance-invalid-origin.json',
    ),
    'utf8',
  ),
);
const MISSING_SOURCE_DIGEST_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(
      __dirname,
      '..',
      '..',
      'backend',
      'common',
      'contracts',
      'fixtures',
      'final-mpc-crs-provenance-missing-source-digest.json',
    ),
    'utf8',
  ),
);
const INVALID_SOURCE_DIGEST_FINAL_MPC_PROVENANCE = JSON.parse(
  require('node:fs').readFileSync(
    path.resolve(
      __dirname,
      '..',
      '..',
      'backend',
      'common',
      'contracts',
      'fixtures',
      'final-mpc-crs-provenance-invalid-source-digest.json',
    ),
    'utf8',
  ),
);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function driveHtml(entries) {
  const literal = JSON.stringify(JSON.stringify(entries)).slice(1, -1).replaceAll("'", "\\'");
  return `window['_DRIVE_ivd'] = '${literal}';`;
}
function driveEntry(id, name, contents) {
  const row = Array(14).fill(null);
  row[0] = id; row[2] = name;
  row[3] = contents === undefined ? 'application/vnd.google-apps.folder' : 'application/octet-stream';
  row[13] = contents === undefined ? null : contents.length;
  return row;
}

test('version-folder provisioning obtains verifier input first and selects shared tau only for full setup', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-drive-layout-'));
  const originalFetch = global.fetch;
  try {
    const fixture = path.join(temp, 'fixture');
    const backend = path.join(temp, 'release');
    await fs.mkdir(fixture); await fs.mkdir(backend);
    await writeCrsArchiveFixture(fixture); await writeBackendMetadata(backend);
    const files = Object.fromEntries(await Promise.all(FINAL_CRS_ARCHIVE_FILES.map(async name => [name, await fs.readFile(path.join(fixture, name))])));
    const tauName = `${sha256(files['tau_sequence.rkyv'])}.rkyv`;
    const fileById = new Map();
    const versionRows = FINAL_CRS_ARCHIVE_FILES.filter(name => name !== 'tau_sequence.rkyv').map((name, i) => {
      const id = `file-${i}`; fileById.set(id, { name, contents: files[name] });
      return driveEntry(id, name, files[name]);
    });
    fileById.set('shared-tau', { name: 'tau_sequence.rkyv', contents: files['tau_sequence.rkyv'] });
    const downloaded = [];
    let tauListings = 0;
    let corruptKey = false;
    global.fetch = async (url, options) => {
      const address = new URL(url);
      if (address.pathname.includes('/folders/')) {
        const id = address.pathname.split('/').at(-1);
        if (id === 'version') return new Response(driveHtml(versionRows));
        if (id === 'tau-folder') {
          tauListings++;
          return new Response(driveHtml([driveEntry('shared-tau', tauName, files['tau_sequence.rkyv'])]));
        }
        assert.equal(id, '14xqCbLoyoVmUVTTlopiXtKnoHPBGL-Sv');
        return new Response(driveHtml([driveEntry('version', '2.1'), driveEntry('tau-folder', 'tau_sequence')]));
      }
      const item = fileById.get(address.searchParams.get('id'));
      assert.ok(item);
      downloaded.push(item.name);
      let body = item.contents;
      if (corruptKey && item.name === 'verifier_keys.rkyv') body = Buffer.alloc(body.length, 1);
      assert.equal(options.headers.Range, `bytes=0-${body.length - 1}`);
      return new Response(body, { status: 206, headers: {
        'content-type': item.name === 'crs_provenance.json' ? 'application/json' : 'application/octet-stream',
        'content-range': `bytes 0-${body.length - 1}/${body.length}`,
      } });
    };
    const context = {
      cacheRoot: path.join(temp, 'cache'), platformDir: path.join(temp, 'cache', 'linux'),
      runtimeDir: path.join(temp, 'runtime'), packageRoot: temp, platform: 'linux',
      statePath: path.join(temp, 'state.json'), compatibleBackendVersion: '2.1', packageVersion: '2.1.5',
    };
    for (const noFullSetup of [true, false, false]) {
      downloaded.length = 0;
      let stagedDirectory;
      await withDownloadedVerifierSetup(context, false, async setup => {
        stagedDirectory = setup.directory;
        assert.deepEqual(downloaded, ['crs_provenance.json', 'verifier_keys.rkyv']);
        assert.deepEqual((await fs.readdir(setup.directory)).sort(), ['crs_provenance.json', 'verifier_keys.rkyv']);
        await installDownloadedSetup(context, backend, false, setup, noFullSetup);
      });
      await assert.rejects(fs.access(stagedDirectory), { code: 'ENOENT' });
      if (noFullSetup) {
        assert.equal(tauListings, 0);
        assert.deepEqual(downloaded, ['crs_provenance.json', 'verifier_keys.rkyv']);
      } else {
        assert.ok(downloaded.includes('prover_keys.rkyv'));
        assert.ok(downloaded.includes('preprocess_keys.rkyv'));
        assert.equal(downloaded.includes('tau_sequence.rkyv'), tauListings === 1);
      }
    }
    corruptKey = true;
    let enteredBuild = false;
    await assert.rejects(withDownloadedVerifierSetup(context, false, async () => { enteredBuild = true; }), /sha256 validation/u);
    assert.equal(enteredBuild, false);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(temp, { recursive: true, force: true });
  }
});

async function writeBackendMetadata(backendReleaseDir, mutate = undefined) {
  for (const name of BACKEND_PACKAGE_NAMES) {
    const metadata = {
      compatibleBackendVersion: '2.1',
      dependencies: {
        subcircuitLibrary: {
          buildVersion: '2.1.5',
          declaredRange: '2.1.5',
          packageName: SUBCIRCUIT_LIBRARY_PACKAGE_NAME,
          runtimeMode: 'bundled',
          sourceDigest: SUBCIRCUIT_LIBRARY_SOURCE_DIGEST,
        },
      },
      packageName: name,
      packageVersion: '2.1.5',
    };
    await fs.writeFile(
      path.join(backendReleaseDir, `build-metadata-${name}.json`),
      `${JSON.stringify(mutate?.(structuredClone(metadata), name) ?? metadata)}\n`,
      'utf8',
    );
  }
}

async function writeCrsArchiveFixture(
  extractedDir,
  subcircuitLibraryVersion = '2.1.5',
  label = 'fixture',
  provenance = undefined,
) {
  const artifacts = {
    'tau_sequence.rkyv': 'Synthetic tau payload for provenance admission tests.\n',
    'prover_keys.rkyv': `${label} combined sigma`,
    'preprocess_keys.rkyv': `${label} preprocess sigma`,
    'verifier_keys.rkyv': `${label} verify sigma`,
  };
  for (const [filename, contents] of Object.entries(artifacts)) {
    await fs.writeFile(path.join(extractedDir, filename), contents, 'utf8');
  }
  await fs.writeFile(
    path.join(extractedDir, 'crs_provenance.json'),
    `${JSON.stringify(
      provenance ?? {
        documentKind: 'crs',
        protocolSchemaId: 'tokamak-zk-evm-univariate',
        generationMethod: 'mpc',
        releaseEligible: false,
        generatedAtUtc: '2026-08-24T00:00:00Z',
        compatibleBackendVersion: '2.1',
        subcircuitLibrary: {
          packageName: SUBCIRCUIT_LIBRARY_PACKAGE_NAME,
          packageVersion: subcircuitLibraryVersion,
          origin: 'npmSnapshot',
          sourceDigest: SUBCIRCUIT_LIBRARY_SOURCE_DIGEST,
        },
        phase1SourceProvenance: null,
        ceremonyProtocolVersion: 'tokamak-filecoin-phase2',
        ceremonyTranscriptSha256: '6'.repeat(64),
        phase2ContributionCount: 1,
        artifacts: Object.fromEntries(Object.entries(artifacts).map(([name, bytes]) => [name, sha256(bytes)])),
      },
    )}\n`,
    'utf8',
  );
}

test('packages the backend CRS provenance contract unchanged for runtime validation', () => {
  const packagedContract = require('../dist/generated/crs-provenance-contract.generated.js').default;
  assert.deepEqual(packagedContract, CRS_PROVENANCE_CONTRACT);
  assert.equal(crsProvenanceFileName(), 'crs_provenance.json');
  assert.deepEqual(FINAL_CRS_ARCHIVE_FILES, CRS_PROVENANCE_CONTRACT.rootFiles);
});

test('rejects unimplemented CRS provenance schema keywords before validation', () => {
  assert.throws(
    () => assertSupportedCrsProvenanceSchema({ type: 'string', unsupportedKeyword: true }),
    /uses unsupported schema keyword unsupportedKeyword/u,
  );
});

test('rejects unimplemented build-metadata schema keywords before validation', () => {
  assert.throws(
    () => assertSupportedBackendBuildMetadataSchema({ type: 'string', unsupportedKeyword: true }),
    /uses unsupported schema keyword unsupportedKeyword/u,
  );
});

test('packages the backend build-metadata contract unchanged for runtime validation', () => {
  const packagedContract = require('../dist/generated/backend-build-metadata-contract.generated.js').default;
  assert.deepEqual(packagedContract, BACKEND_BUILD_METADATA_CONTRACT);
  assert.deepEqual(BACKEND_PACKAGE_NAMES, BACKEND_BUILD_METADATA_CONTRACT.backendPackageNames);
  assert.equal(backendBuildMetadataFileName('prove'), 'build-metadata-prove.json');
});

test('accepts common provenance and rejects the retired algorithm-specific format', async () => {
  const archiveName = '2.1';
  const validated = await validateCrsProvenanceContract(CANONICAL_FINAL_MPC_PROVENANCE, archiveName);
  assert.deepEqual(validated, CANONICAL_FINAL_MPC_PROVENANCE);

  for (const field of Object.keys(CANONICAL_FINAL_MPC_PROVENANCE)) {
    const missing = structuredClone(CANONICAL_FINAL_MPC_PROVENANCE);
    delete missing[field];
    await assert.rejects(validateCrsProvenanceContract(missing, archiveName), /is missing/u);
  }

  await assert.rejects(
    validateCrsProvenanceContract(LEGACY_FINAL_MPC_PROVENANCE, archiveName),
    /is missing protocolSchemaId/u,
  );
});

async function generationTarget(setupOutputDir) {
  const target = await fs.readlink(setupOutputDir);
  return path.resolve(path.dirname(setupOutputDir), target);
}

test('installer ingress accepts common provenance independently of the generation method', async () => {
  const trusted = {
    ...CANONICAL_FINAL_MPC_PROVENANCE,
    generationMethod: 'trustedSetup',
    releaseEligible: false,
    phase1SourceProvenance: null,
    ceremonyProtocolVersion: null,
    ceremonyTranscriptSha256: null,
    phase2ContributionCount: null,
  };
  for (const provenance of [trusted, CANONICAL_FINAL_MPC_PROVENANCE, TRUSTED_SETUP_PROVENANCE, NULL_FINAL_MPC_PROVENANCE]) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
    try {
      const extractedDir = path.join(tempDir, 'archive');
      const backendReleaseDir = path.join(tempDir, 'backend');
      await fs.mkdir(extractedDir);
      await fs.mkdir(backendReleaseDir);
      await writeCrsArchiveFixture(extractedDir, '2.1.5', 'canonical', provenance);
      await writeBackendMetadata(backendReleaseDir);

      const result = await validateDownloadedCrs(
        extractedDir,
        backendReleaseDir,
        '2.1',
        '2.1',
        '2.1.5',
      );

      assert.equal(result.provenancePath, path.join(extractedDir, 'crs_provenance.json'));
      await assert.rejects(fs.access(path.join(extractedDir, 'build-metadata-mpc-setup.json')));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
});

test('rejects a retired algorithm-specific documentKind before CRS installation', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
  try {
    const extractedDir = path.join(tempDir, 'archive');
    const backendReleaseDir = path.join(tempDir, 'backend');
    await fs.mkdir(extractedDir);
    await fs.mkdir(backendReleaseDir);
    await writeCrsArchiveFixture(extractedDir);
    const provenancePath = path.join(extractedDir, 'crs_provenance.json');
    const provenance = JSON.parse(await fs.readFile(provenancePath, 'utf8'));
    provenance.documentKind = 'developmentTrustedSetupSigma';
    await fs.writeFile(provenancePath, `${JSON.stringify(provenance)}\n`, 'utf8');

    await assert.rejects(
      validateDownloadedCrs(
        extractedDir,
        backendReleaseDir,
        '2.1',
        '2.1',
        '2.1.5',
      ),
      /documentKind must equal "crs"/u,
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('installer ingress rejects malformed and semantically invalid provenance fixtures', async () => {
  const cases = [
    {
      name: 'leading-zero compatibility version',
      provenance: LEADING_ZERO_FINAL_MPC_PROVENANCE,
      expected: /compatibleBackendVersion.*leading zeroes are not canonical/u,
    },
    {
      name: 'unknown provenance field',
      provenance: MALFORMED_FINAL_MPC_PROVENANCE,
      expected: /has unsupported field unexpected/u,
    },
    {
      name: 'retired algorithm-specific format',
      provenance: LEGACY_FINAL_MPC_PROVENANCE,
      expected: /is missing protocolSchemaId/u,
    },
    {
      name: 'date-only timestamp',
      provenance: DATE_ONLY_FINAL_MPC_PROVENANCE,
      expected: /generatedAtUtc must be an RFC 3339 date-time/u,
    },
    {
      name: 'invalid digest',
      provenance: INVALID_DIGEST_FINAL_MPC_PROVENANCE,
      expected: /artifacts.prover_keys.rkyv does not match the contract pattern/u,
    },
    {
      name: 'empty required string',
      provenance: EMPTY_STRING_FINAL_MPC_PROVENANCE,
      expected: /subcircuitLibrary\.packageName is shorter than the contract allows/u,
    },
    {
      name: 'unsupported phase-1 variant',
      provenance: INVALID_PHASE1_FINAL_MPC_PROVENANCE,
      expected: /does not match exactly one allowed contract shape/u,
    },
    {
      name: 'unsupported subcircuit-library origin',
      provenance: INVALID_ORIGIN_FINAL_MPC_PROVENANCE,
      expected: /subcircuitLibrary\.origin has an unsupported value/u,
    },
    {
      name: 'missing subcircuit source digest',
      provenance: MISSING_SOURCE_DIGEST_FINAL_MPC_PROVENANCE,
      expected: /subcircuitLibrary is missing sourceDigest/u,
    },
    {
      name: 'invalid subcircuit source digest',
      provenance: INVALID_SOURCE_DIGEST_FINAL_MPC_PROVENANCE,
      expected: /subcircuitLibrary\.sourceDigest does not match the contract pattern/u,
    },
  ];

  for (const testCase of cases) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
    try {
      const extractedDir = path.join(tempDir, 'archive');
      const backendReleaseDir = path.join(tempDir, 'backend');
      await fs.mkdir(extractedDir);
      await fs.mkdir(backendReleaseDir);
      await writeCrsArchiveFixture(extractedDir, '2.1.5', 'canonical', testCase.provenance);

      await assert.rejects(
        validateDownloadedCrs(
          extractedDir,
          backendReleaseDir,
          '2.1',
          '2.1',
          '2.1.5',
        ),
        testCase.expected,
        testCase.name,
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
});

test('rejects CRS provenance with an incompatible subcircuit-library package version', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
  try {
    const extractedDir = path.join(tempDir, 'archive');
    const backendReleaseDir = path.join(tempDir, 'backend');
    await fs.mkdir(extractedDir);
    await fs.mkdir(backendReleaseDir);
    await writeCrsArchiveFixture(extractedDir, '2.2.0');
    await writeBackendMetadata(backendReleaseDir);

    await assert.rejects(
      validateDownloadedCrs(
        extractedDir,
        backendReleaseDir,
        '2.1',
        '2.1',
        '2.1.5',
      ),
      /provenance subcircuit-library version 2\.2\.0 is not compatible with 2\.1/u,
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('keeps CRS provenance library version as a release-line check rather than an exact CLI pairing', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
  try {
    const extractedDir = path.join(tempDir, 'archive');
    const backendReleaseDir = path.join(tempDir, 'backend');
    await fs.mkdir(extractedDir);
    await fs.mkdir(backendReleaseDir);
    await writeCrsArchiveFixture(extractedDir, '2.1.4');
    await writeBackendMetadata(backendReleaseDir);

    await assert.doesNotReject(
      validateDownloadedCrs(
        extractedDir,
        backendReleaseDir,
        '2.1',
        '2.1',
        '2.1.5',
      ),
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('rejects a CRS whose source digest differs from any installed backend package', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
  try {
    const extractedDir = path.join(tempDir, 'archive');
    const backendReleaseDir = path.join(tempDir, 'backend');
    await fs.mkdir(extractedDir);
    await fs.mkdir(backendReleaseDir);
    await writeCrsArchiveFixture(extractedDir, '2.1.4');
    await writeBackendMetadata(backendReleaseDir, (metadata, backendName) =>
      backendName === 'prove'
        ? {
            ...metadata,
            dependencies: {
              subcircuitLibrary: {
                ...metadata.dependencies.subcircuitLibrary,
                sourceDigest:
                  'sha256:3333333333333333333333333333333333333333333333333333333333333333',
              },
            },
          }
        : metadata,
    );

    await assert.rejects(
      validateDownloadedCrs(
        extractedDir,
        backendReleaseDir,
        '2.1',
        '2.1',
        '2.1.5',
      ),
      /Backend package prove subcircuit-library sourceDigest .* does not match CRS sourceDigest/u,
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('requires every backend package metadata version to match the current CLI package', async () => {
  const cases = [
    {
      name: 'older backend patch version',
      mutate: (metadata) => ({ ...metadata, packageVersion: '2.1.4' }),
      expected: /has version 2\.1\.4, expected current CLI package version 2\.1\.5/u,
    },
    {
      name: 'newer backend patch version',
      mutate: (metadata) => ({ ...metadata, packageVersion: '2.1.6' }),
      expected: /has version 2\.1\.6, expected current CLI package version 2\.1\.5/u,
    },
    {
      name: 'inconsistent backend package version',
      mutate: (metadata, backendName) =>
        backendName === 'prove' ? { ...metadata, packageVersion: '2.1.6' } : metadata,
      expected: /Backend package prove has version 2\.1\.6, expected current CLI package version 2\.1\.5/u,
    },
  ];

  for (const testCase of cases) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
    try {
      const extractedDir = path.join(tempDir, 'archive');
      const backendReleaseDir = path.join(tempDir, 'backend');
      await fs.mkdir(extractedDir);
      await fs.mkdir(backendReleaseDir);
      await writeCrsArchiveFixture(extractedDir);
      await writeBackendMetadata(backendReleaseDir, testCase.mutate);

      await assert.rejects(
        validateDownloadedCrs(
          extractedDir,
          backendReleaseDir,
          '2.1',
          '2.1',
          '2.1.5',
        ),
        testCase.expected,
        testCase.name,
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
});

test('installer ingress rejects every build-metadata contract violation', async () => {
  const cases = [
    {
      name: 'missing runtime mode',
      metadata: INVALID_BUILD_METADATA_FIXTURES.missingRuntimeMode,
      expected: /subcircuitLibrary is missing runtimeMode/u,
    },
    {
      name: 'invalid declared range',
      metadata: INVALID_BUILD_METADATA_FIXTURES.declaredRange,
      expected: /declaredRange does not match the contract pattern/u,
    },
    {
      name: 'invalid runtime mode',
      metadata: INVALID_BUILD_METADATA_FIXTURES.runtimeMode,
      expected: /runtimeMode must equal "bundled"/u,
    },
    {
      name: 'invalid subcircuit-library package name',
      metadata: INVALID_BUILD_METADATA_FIXTURES.libraryPackage,
      expected: /subcircuitLibrary\.packageName must equal/u,
    },
    {
      name: 'unexpected metadata field',
      metadata: INVALID_BUILD_METADATA_FIXTURES.unexpectedField,
      expected: /has unsupported field unexpected/u,
    },
    {
      name: 'wrong backend package',
      metadata: INVALID_BUILD_METADATA_FIXTURES.packageName,
      expected: /Backend package prove build metadata\.packageName must equal "prove"/u,
    },
    {
      name: 'leading-zero backend package version',
      metadata: INVALID_BUILD_METADATA_FIXTURES.leadingZeroPackageVersion,
      expected: /packageVersion.*leading zeroes are not canonical/u,
    },
    {
      name: 'leading-zero backend compatibility version',
      metadata: INVALID_BUILD_METADATA_FIXTURES.leadingZeroCompatibleVersion,
      expected: /compatibleBackendVersion.*leading zeroes are not canonical/u,
    },
    {
      name: 'leading-zero subcircuit-library build version',
      metadata: INVALID_BUILD_METADATA_FIXTURES.leadingZeroLibraryVersion,
      expected: /subcircuitLibrary\.buildVersion.*leading zeroes are not canonical/u,
    },
    {
      name: 'missing subcircuit source digest',
      metadata: INVALID_BUILD_METADATA_FIXTURES.missingSourceDigest,
      expected: /subcircuitLibrary is missing sourceDigest/u,
    },
    {
      name: 'invalid subcircuit source digest',
      metadata: INVALID_BUILD_METADATA_FIXTURES.invalidSourceDigest,
      expected: /subcircuitLibrary\.sourceDigest does not match the contract pattern/u,
    },
  ];

  for (const testCase of cases) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
    try {
      const extractedDir = path.join(tempDir, 'archive');
      const backendReleaseDir = path.join(tempDir, 'backend');
      await fs.mkdir(extractedDir);
      await fs.mkdir(backendReleaseDir);
      await writeCrsArchiveFixture(extractedDir, '2.1.5', 'canonical', CANONICAL_FINAL_MPC_PROVENANCE);
      await writeBackendMetadata(backendReleaseDir, (metadata, backendName) =>
        backendName === 'prove' ? testCase.metadata : metadata,
      );

      await assert.rejects(
        validateDownloadedCrs(
          extractedDir,
          backendReleaseDir,
          '2.1',
          '2.1',
          '2.1.5',
        ),
        testCase.expected,
        testCase.name,
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
});

test('rejects a legacy setup output directory', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
  try {
    const extractedDir = path.join(tempDir, 'archive');
    const setupOutputDir = path.join(tempDir, 'resource', 'setup', 'output');
    await fs.mkdir(extractedDir, { recursive: true });
    await fs.mkdir(setupOutputDir, { recursive: true });
    await fs.writeFile(path.join(setupOutputDir, 'README.txt'), 'legacy setup output\n', 'utf8');
    await writeCrsArchiveFixture(extractedDir, '2.1.5', 'first');

    await assert.rejects(
      installValidatedCrsGeneration(
        extractedDir,
        path.join(extractedDir, 'crs_provenance.json'),
        setupOutputDir,
        '2.1',
      ),
      /retired directory layout/,
    );
    assert.equal((await fs.lstat(setupOutputDir)).isDirectory(), true);
    assert.equal(await fs.readFile(path.join(setupOutputDir, 'README.txt'), 'utf8'), 'legacy setup output\n');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('rejects an unmanaged active CRS symlink without replacing it', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
  try {
    const extractedDir = path.join(tempDir, 'archive');
    const setupOutputDir = path.join(tempDir, 'resource', 'setup', 'output');
    const unmanagedDirectory = path.join(tempDir, 'unmanaged');
    await fs.mkdir(extractedDir, { recursive: true });
    await fs.mkdir(unmanagedDirectory, { recursive: true });
    await fs.writeFile(path.join(unmanagedDirectory, 'complete'), 'unmanaged CRS\n', 'utf8');
    await fs.mkdir(path.dirname(setupOutputDir), { recursive: true });
    await fs.symlink(unmanagedDirectory, setupOutputDir, 'dir');
    await writeCrsArchiveFixture(extractedDir, '2.1.5', 'replacement');

    await assert.rejects(
      installValidatedCrsGeneration(
        extractedDir,
        path.join(extractedDir, 'crs_provenance.json'),
        setupOutputDir,
        '2.1',
      ),
      /not managed by this CLI installation/u,
    );

    assert.equal((await fs.lstat(setupOutputDir)).isSymbolicLink(), true);
    assert.equal(await fs.readFile(path.join(setupOutputDir, 'complete'), 'utf8'), 'unmanaged CRS\n');
    assert.deepEqual(await fs.readdir(path.join(tempDir, 'resource', 'setup', 'generations')), []);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('rejects every unowned CRS activation temporary path without modifying it', async () => {
  const cases = [
    {
      name: 'file',
      prepare: async (temporaryLink) => {
        await fs.writeFile(temporaryLink, 'do not remove\n', 'utf8');
      },
      assertUnchanged: async (temporaryLink) => {
        assert.equal(await fs.readFile(temporaryLink, 'utf8'), 'do not remove\n');
      },
    },
    {
      name: 'directory',
      prepare: async (temporaryLink) => {
        await fs.mkdir(temporaryLink);
        await fs.writeFile(path.join(temporaryLink, 'keep.txt'), 'do not remove\n', 'utf8');
      },
      assertUnchanged: async (temporaryLink) => {
        assert.equal((await fs.lstat(temporaryLink)).isDirectory(), true);
        assert.equal(await fs.readFile(path.join(temporaryLink, 'keep.txt'), 'utf8'), 'do not remove\n');
      },
    },
    {
      name: 'external symlink',
      prepare: async (temporaryLink, tempDir) => {
        const externalDirectory = path.join(tempDir, 'external');
        await fs.mkdir(externalDirectory);
        await fs.writeFile(path.join(externalDirectory, 'keep.txt'), 'do not remove\n', 'utf8');
        await fs.symlink(externalDirectory, temporaryLink, 'dir');
      },
      assertUnchanged: async (temporaryLink) => {
        assert.equal((await fs.lstat(temporaryLink)).isSymbolicLink(), true);
        assert.equal(await fs.readFile(path.join(temporaryLink, 'keep.txt'), 'utf8'), 'do not remove\n');
      },
    },
  ];

  for (const testCase of cases) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
    try {
      const extractedDir = path.join(tempDir, 'archive');
      const setupOutputDir = path.join(tempDir, 'resource', 'setup', 'output');
      const temporaryLink = `${setupOutputDir}.next`;
      await fs.mkdir(extractedDir, { recursive: true });
      await fs.mkdir(path.dirname(setupOutputDir), { recursive: true });
      await writeCrsArchiveFixture(extractedDir, '2.1.5', 'replacement');
      await testCase.prepare(temporaryLink, tempDir);

      await assert.rejects(
        installValidatedCrsGeneration(
          extractedDir,
          path.join(extractedDir, 'crs_provenance.json'),
          setupOutputDir,
          '2.1',
        ),
        /activation temporary.*not managed/u,
        testCase.name,
      );

      await testCase.assertUnchanged(temporaryLink);
      assert.deepEqual(await fs.readdir(path.join(tempDir, 'resource', 'setup', 'generations')), []);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
});

test('keeps the prior setup output intact when any staged CRS copy fails', async () => {
  for (let failingCopy = 1; failingCopy <= 4; failingCopy += 1) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
    try {
      const extractedDir = path.join(tempDir, 'archive');
      const setupOutputDir = path.join(tempDir, 'resource', 'setup', 'output');
      await fs.mkdir(extractedDir, { recursive: true });
      await fs.mkdir(setupOutputDir, { recursive: true });
      await fs.writeFile(path.join(setupOutputDir, 'legacy.txt'), 'keep this output\n', 'utf8');
      await writeCrsArchiveFixture(extractedDir);

      let copyCount = 0;
      await assert.rejects(
        installValidatedCrsGeneration(
          extractedDir,
          path.join(extractedDir, 'crs_provenance.json'),
          setupOutputDir,
          '2.1',
          async (source, destination) => {
            copyCount += 1;
            if (copyCount === failingCopy) {
              throw new Error(`injected copy failure ${failingCopy}`);
            }
            await fs.copyFile(source, destination);
          },
        ),
        new RegExp(`injected copy failure ${failingCopy}`, 'u'),
      );

      assert.equal((await fs.lstat(setupOutputDir)).isDirectory(), true);
      assert.equal(await fs.readFile(path.join(setupOutputDir, 'legacy.txt'), 'utf8'), 'keep this output\n');
      assert.deepEqual(await fs.readdir(path.join(tempDir, 'resource', 'setup', 'generations')), []);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
});

test('atomically replaces the active CRS generation and immediately deletes the prior generation', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-crs-'));
  try {
    const firstArchiveDir = path.join(tempDir, 'archive-first');
    const secondArchiveDir = path.join(tempDir, 'archive-second');
    const setupOutputDir = path.join(tempDir, 'resource', 'setup', 'output');
    await fs.mkdir(firstArchiveDir, { recursive: true });
    await fs.mkdir(secondArchiveDir, { recursive: true });
    await writeCrsArchiveFixture(firstArchiveDir, '2.1.5', 'first');
    await writeCrsArchiveFixture(secondArchiveDir, '2.1.5', 'second');

    await installValidatedCrsGeneration(
      firstArchiveDir,
      path.join(firstArchiveDir, 'crs_provenance.json'),
      setupOutputDir,
      '2.1',
    );
    const firstGeneration = await generationTarget(setupOutputDir);

    await installValidatedCrsGeneration(
      secondArchiveDir,
      path.join(secondArchiveDir, 'crs_provenance.json'),
      setupOutputDir,
      'tokamak-backend-crs-v2.1-20260825T000000Z.zip',
    );

    const secondGeneration = await generationTarget(setupOutputDir);
    assert.notEqual(secondGeneration, firstGeneration);
    assert.equal(await fs.readFile(path.join(setupOutputDir, 'prover_keys.rkyv'), 'utf8'), 'second combined sigma');
    await assert.rejects(fs.access(firstGeneration));
    assert.deepEqual(await fs.readdir(path.join(tempDir, 'resource', 'setup', 'generations')), [
      path.basename(secondGeneration),
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
