const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const releaseVersion = require('../package.json').version;
const releaseCompatibility = releaseVersion.split('.').slice(0, 2).join('.');

const { installRuntime } = require('../dist/runtime.js');
const { assertInstalledRuntimeMatchesContext, parseInstalledRuntimeState } = require('../dist/runtime/context.js');
const { resolveRuntimeExecution, runBackendCommand } = require('../dist/runtime/docker.js');
const { configureMacosRuntime } = require('../dist/runtime/native.js');
const { commitPreparedRuntime, installStagedRuntime } = require('../dist/runtime/transaction.js');
const { streamDownloadToFile } = require('../dist/runtime/download.js');
const {
  assertLiveBackendRuntimeIdentity,
  validateSynthesizerBuildMetadataForContext,
} = require('../dist/runtime/identity.js');
const { acquireRuntimeOperationLock } = require('../dist/runtime/operation-lock.js');
const { promoteStagedRuntimePaths } = require('../dist/runtime/stage-transaction.js');

function runtimeContext(platform = 'linux') {
  return {
    cacheRoot: '/cache',
    packageRoot: '/package',
    platform,
    platformDir: `/cache/${platform}`,
    runtimeDir: `/cache/${platform}/runtime`,
    statePath: `/cache/${platform}/installation.json`,
    compatibleBackendVersion: '2.1',
    packageVersion: '2.1.5',
  };
}

function runtimeState(packageVersion = '2.1.5') {
  return {
    backendRuntimeIdentity: runtimeIdentity(packageVersion),
    installMode: 'native',
    packageVersion,
    platform: 'linux',
    installedAt: '2026-08-27T00:00:00.000Z',
  };
}

function dockerRuntimeState() {
  return {
    backendRuntimeIdentity: runtimeIdentity(),
    dockerEnvironment: 'ubuntu22',
    installMode: 'docker',
    packageVersion: '2.1.5',
    platform: 'linux',
    installedAt: '2026-08-27T00:00:00.000Z',
  };
}

function runtimeIdentity(packageVersion = '2.1.5', compatibleBackendVersion = '2.1') {
  return ['preprocess', 'prove', 'verify'].map(packageName => ({
    compatibleBackendVersion,
    dependencies: {
      subcircuitLibrary: {
        buildVersion: packageVersion,
        declaredRange: packageVersion,
        packageName: '@tokamak-zk-evm/subcircuit-library',
        runtimeMode: 'bundled',
        sourceDigest: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      },
    },
    packageName,
    packageVersion,
  }));
}

function synthesizerBuildMetadata(packageVersion = '2.1.5') {
  return {
    dependencies: {
      subcircuitLibrary: {
        buildVersion: packageVersion,
        declaredRange: packageVersion,
        packageName: '@tokamak-zk-evm/subcircuit-library',
      },
    },
    packageName: '@tokamak-zk-evm/synthesizer-node',
    packageVersion,
  };
}

function dockerBootstrap(context, overrides = {}) {
  return {
    version: 1,
    createdAt: '2026-08-27T00:00:00.000Z',
    dockerEnvironment: 'ubuntu22',
    imageName: `tokamak-zk-evm-cli:${context.packageVersion}-ubuntu22`,
    packageVersion: context.packageVersion,
    platform: 'linux',
    useGpus: false,
    ...overrides,
  };
}

async function captureProcessOutput(action) {
  const stdout = [];
  const stderr = [];
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const capture = output => (chunk, encoding, callback) => {
    output.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    const completion = typeof encoding === 'function' ? encoding : callback;
    completion?.();
    return true;
  };
  process.stdout.write = capture(stdout);
  process.stderr.write = capture(stderr);
  try {
    await action();
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
  return { stdout: stdout.join(''), stderr: stderr.join('') };
}

async function createRuntimeSelectionFixture() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-runtime-selection-'));
  const context = {
    ...runtimeContext(),
    cacheRoot: path.join(temporaryRoot, 'cache'),
  };
  context.platformDir = path.join(context.cacheRoot, context.platform);
  context.runtimeDir = path.join(context.platformDir, 'runtime');
  context.statePath = path.join(context.platformDir, 'installation.json');
  await fs.mkdir(context.runtimeDir, { recursive: true });
  return { context, temporaryRoot };
}

async function writeDockerBootstrap(context, bootstrap) {
  const bootstrapPath = path.join(context.platformDir, 'docker', 'bootstrap.json');
  await fs.mkdir(path.dirname(bootstrapPath), { recursive: true });
  await fs.writeFile(bootstrapPath, `${JSON.stringify(bootstrap, null, 2)}\n`, 'utf8');
}

async function createInstalledRuntimeFixture() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-runtime-transaction-'));
  const context = {
    ...runtimeContext(),
    cacheRoot: path.join(temporaryRoot, 'cache'),
  };
  context.platformDir = path.join(context.cacheRoot, context.platform);
  context.runtimeDir = path.join(context.platformDir, 'runtime');
  context.statePath = path.join(context.platformDir, 'installation.json');
  await fs.mkdir(context.runtimeDir, { recursive: true });
  await fs.writeFile(path.join(context.runtimeDir, 'marker.txt'), 'previous runtime\n', 'utf8');
  const previousState = runtimeState('2.1.4');
  await fs.writeFile(context.statePath, `${JSON.stringify(previousState, null, 2)}\n`, 'utf8');
  return { context, previousState, temporaryRoot };
}

test('accepts only a structurally valid state for the current CLI runtime', () => {
  const native = parseInstalledRuntimeState({
    backendRuntimeIdentity: runtimeIdentity(),
    installMode: 'native',
    packageVersion: '2.1.5',
    platform: 'linux',
    installedAt: '2026-08-27T00:00:00.000Z',
  });
  assert.doesNotThrow(() => {
    assertInstalledRuntimeMatchesContext(runtimeContext(), native, ['native', 'docker']);
  });

  const docker = parseInstalledRuntimeState({
    backendRuntimeIdentity: runtimeIdentity(),
    installMode: 'docker',
    dockerEnvironment: 'ubuntu22',
    packageVersion: '2.1.5',
    platform: 'linux',
    installedAt: '2026-08-27T00:00:00.000Z',
  });
  assert.doesNotThrow(() => {
    assertInstalledRuntimeMatchesContext(runtimeContext(), docker, ['docker']);
  });

  assert.throws(
    () => assertInstalledRuntimeMatchesContext(runtimeContext(), { ...native, packageVersion: '2.1.4' }, ['native']),
    /does not match current CLI package version/u,
  );
  assert.throws(
    () => assertInstalledRuntimeMatchesContext(runtimeContext(), { ...native, platform: 'macos' }, ['native']),
    /does not match current CLI platform/u,
  );
  assert.throws(
    () => assertInstalledRuntimeMatchesContext(runtimeContext('macos'), { ...docker, platform: 'macos' }, ['native']),
    /not supported for the current CLI execution path/u,
  );
  assert.throws(
    () => parseInstalledRuntimeState({ ...native, installMode: 'docker' }),
    /Docker runtime must include a supported dockerEnvironment/u,
  );
  assert.throws(
    () => parseInstalledRuntimeState({ ...native, installedAt: 'not-a-timestamp' }),
    /installedAt must be an ISO-8601 timestamp/u,
  );
  assert.throws(
    () => parseInstalledRuntimeState({ ...native, backendRuntimeIdentity: undefined }),
    /must contain exactly the backend packages/u,
  );
  assert.throws(
    () =>
      assertInstalledRuntimeMatchesContext(
        runtimeContext(),
        {
          ...native,
          backendRuntimeIdentity: runtimeIdentity('2.1.4'),
        },
        ['native'],
      ),
    /does not match current CLI package version/u,
  );
});

test('requires every live backend binary to report its exact persisted identity', () => {
  const persisted = runtimeIdentity();
  assert.doesNotThrow(() => {
    assertLiveBackendRuntimeIdentity(persisted, 'prove', persisted[1]);
  });
  assert.throws(
    () => assertLiveBackendRuntimeIdentity(persisted, 'prove', { ...persisted[1], packageVersion: '2.1.4' }),
    /does not match the installed runtime identity/u,
  );
});

test('rejects Node Synthesizer and subcircuit-library identities outside the CLI release', () => {
  assert.doesNotThrow(() => {
    validateSynthesizerBuildMetadataForContext(synthesizerBuildMetadata(), runtimeContext());
  });
  assert.throws(
    () => validateSynthesizerBuildMetadataForContext(synthesizerBuildMetadata('2.1.4'), runtimeContext()),
    /Node Synthesizer package version.*does not match current CLI package version/u,
  );
  const mismatchedLibrary = synthesizerBuildMetadata();
  mismatchedLibrary.dependencies.subcircuitLibrary.buildVersion = '2.1.4';
  assert.throws(
    () => validateSynthesizerBuildMetadataForContext(mismatchedLibrary, runtimeContext()),
    /must pin subcircuit-library buildVersion and declaredRange/u,
  );
});

test('permits one live runtime operation and immediately rejects a contending process', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-operation-lock-'));
  const context = { platformDir: path.join(temporaryRoot, 'linux') };
  const modulePath = path.resolve(__dirname, '..', 'dist', 'runtime', 'operation-lock.js');
  const worker = spawn(
    process.execPath,
    [
      '-e',
      `
      const { acquireRuntimeOperationLock } = require(process.argv[1]);
      const context = JSON.parse(process.argv[2]);
      acquireRuntimeOperationLock(context, 'child-stage').then((lock) => {
        process.stdout.write('ready\\n');
        process.stdin.once('data', async () => { await lock.release(); process.exit(0); });
      }).catch((error) => { console.error(error); process.exit(1); });
    `,
      modulePath,
      JSON.stringify(context),
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let workerError = '';
  worker.stderr.on('data', chunk => {
    workerError += chunk.toString();
  });
  try {
    await new Promise((resolve, reject) => {
      const onData = chunk => {
        if (chunk.toString() === 'ready\n') {
          worker.stdout.off('data', onData);
          resolve();
        }
      };
      worker.stdout.on('data', onData);
      worker.once('error', reject);
      worker.once('exit', code => reject(new Error(`lock worker exited before ready: ${code}: ${workerError}`)));
    });
    await assert.rejects(acquireRuntimeOperationLock(context, 'parent-stage'), /busy with child-stage/u);
    worker.stdin.write('release\n');
    await new Promise((resolve, reject) => {
      worker.once('exit', code => (code === 0 ? resolve() : reject(new Error(`lock worker exited with ${code}`))));
    });
    const lock = await acquireRuntimeOperationLock(context, 'parent-stage');
    await lock.release();
  } finally {
    worker.kill();
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('restores every active stage path when a multi-path promotion fails', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-stage-transaction-'));
  const firstActive = path.join(temporaryRoot, 'first-active');
  const secondActive = path.join(temporaryRoot, 'second-active');
  const firstStaging = path.join(temporaryRoot, 'first-staging');
  try {
    await fs.mkdir(firstActive);
    await fs.mkdir(secondActive);
    await fs.mkdir(firstStaging);
    await fs.writeFile(path.join(firstActive, 'marker.txt'), 'first old\n', 'utf8');
    await fs.writeFile(path.join(secondActive, 'marker.txt'), 'second old\n', 'utf8');
    await fs.writeFile(path.join(firstStaging, 'marker.txt'), 'first new\n', 'utf8');

    await assert.rejects(
      promoteStagedRuntimePaths([
        { activePath: firstActive, stagingPath: firstStaging },
        { activePath: secondActive, stagingPath: path.join(temporaryRoot, 'missing-staging') },
      ]),
      /ENOENT/u,
    );
    assert.equal(await fs.readFile(path.join(firstActive, 'marker.txt'), 'utf8'), 'first old\n');
    assert.equal(await fs.readFile(path.join(secondActive, 'marker.txt'), 'utf8'), 'second old\n');
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('promotes staged output when its active parent does not yet exist', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-fresh-stage-'));
  const activePath = path.join(temporaryRoot, 'synthesizer', 'output');
  const stagingPath = path.join(temporaryRoot, 'staging');
  try {
    await fs.mkdir(stagingPath);
    await fs.writeFile(path.join(stagingPath, 'selector.json'), '{}\n', 'utf8');
    await promoteStagedRuntimePaths([{ activePath, stagingPath }]);
    assert.equal(await fs.readFile(path.join(activePath, 'selector.json'), 'utf8'), '{}\n');
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('uses installation state as the sole native-versus-Docker selector', async () => {
  const { context, temporaryRoot } = await createRuntimeSelectionFixture();
  try {
    await writeDockerBootstrap(context, dockerBootstrap(context, { imageName: 'stale-bootstrap' }));
    const execution = await resolveRuntimeExecution({ context, state: runtimeState() });
    assert.deepEqual(execution, { mode: 'native', context, state: runtimeState() });
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('requires a Docker bootstrap bound to the selected installed runtime', async () => {
  const { context, temporaryRoot } = await createRuntimeSelectionFixture();
  const installed = { context, state: dockerRuntimeState() };
  try {
    await assert.rejects(resolveRuntimeExecution(installed), /bootstrap is unavailable/u);

    await writeDockerBootstrap(context, dockerBootstrap(context));
    const execution = await resolveRuntimeExecution(installed);
    assert.equal(execution.mode, 'docker');
    if (execution.mode === 'docker') {
      assert.equal(execution.bootstrap.imageName, 'tokamak-zk-evm-cli:2.1.5-ubuntu22');
    }

    await writeDockerBootstrap(context, dockerBootstrap(context, { packageVersion: '2.1.4' }));
    await assert.rejects(resolveRuntimeExecution(installed), /does not match current CLI package version/u);

    await writeDockerBootstrap(
      context,
      dockerBootstrap(context, {
        dockerEnvironment: 'ubuntu22-cuda122',
        imageName: 'tokamak-zk-evm-cli:2.1.5-ubuntu22-cuda122',
        useGpus: true,
      }),
    );
    await assert.rejects(resolveRuntimeExecution(installed), /does not match selected runtime environment/u);

    await writeDockerBootstrap(context, dockerBootstrap(context, { imageName: 'unexpected-image' }));
    await assert.rejects(resolveRuntimeExecution(installed), /does not match expected image/u);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('falls back to native execution only after a valid Docker selection loses its daemon', async () => {
  const { context, temporaryRoot } = await createRuntimeSelectionFixture();
  const fakeBin = path.join(temporaryRoot, 'bin');
  const originalPath = process.env.PATH;
  try {
    await fs.mkdir(fakeBin);
    const dockerPath = path.join(fakeBin, 'docker');
    const backendPath = path.join(fakeBin, 'backend');
    await fs.writeFile(dockerPath, '#!/usr/bin/env node\nprocess.exit(1);\n', 'utf8');
    await fs.writeFile(backendPath, '#!/usr/bin/env node\nprocess.stdout.write("native fallback\\n");\n', 'utf8');
    await fs.chmod(dockerPath, 0o755);
    await fs.chmod(backendPath, 0o755);
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ''}`;

    const result = await runBackendCommand(
      { mode: 'docker', context, state: dockerRuntimeState(), bootstrap: dockerBootstrap(context) },
      backendPath,
      [],
      false,
      { quiet: true },
    );
    assert.equal(result.stdout, 'native fallback\n');
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('hides machine stdout but forwards native backend diagnostics', async () => {
  const { context, temporaryRoot } = await createRuntimeSelectionFixture();
  const backendPath = path.join(temporaryRoot, 'backend');
  try {
    await fs.writeFile(
      backendPath,
      '#!/usr/bin/env node\nprocess.stdout.write("{\\"contractVersion\\":1,\\"verified\\":false}\\n");\nprocess.stderr.write("native backend diagnostic\\n");\nprocess.exit(7);\n',
      'utf8',
    );
    await fs.chmod(backendPath, 0o755);
    const output = await captureProcessOutput(async () => {
      await assert.rejects(
        runBackendCommand({ mode: 'native', context, state: runtimeState() }, backendPath, [], false, {
          suppressStdout: true,
        }),
        /backend exited with code 7/u,
      );
    });
    assert.equal(output.stdout, '');
    assert.equal(output.stderr, 'native backend diagnostic\n');
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('hides machine stdout but forwards Docker backend diagnostics', async () => {
  const { context, temporaryRoot } = await createRuntimeSelectionFixture();
  const fakeBin = path.join(temporaryRoot, 'bin');
  const originalPath = process.env.PATH;
  try {
    await fs.mkdir(fakeBin);
    const dockerPath = path.join(fakeBin, 'docker');
    await fs.writeFile(
      dockerPath,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'info' || (args[0] === 'image' && args[1] === 'inspect')) process.exit(0);
process.stdout.write('{"contractVersion":1,"verified":false}\\n');
process.stderr.write('Docker backend diagnostic\\n');
process.exit(9);
`,
      'utf8',
    );
    await fs.chmod(dockerPath, 0o755);
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ''}`;
    const output = await captureProcessOutput(async () => {
      await assert.rejects(
        runBackendCommand(
          { mode: 'docker', context, state: dockerRuntimeState(), bootstrap: dockerBootstrap(context) },
          path.join(context.runtimeDir, 'bin', 'verify'),
          [],
          false,
          { suppressStdout: true },
        ),
        /docker exited with code 9/u,
      );
    });
    assert.equal(output.stdout, '');
    assert.equal(output.stderr, 'Docker backend diagnostic\n');
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('requires Docker Desktop for a selected Docker runtime on Windows', async () => {
  const { context, temporaryRoot } = await createRuntimeSelectionFixture();
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalPath = process.env.PATH;
  try {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    process.env.PATH = '';
    await assert.rejects(
      runBackendCommand(
        { mode: 'docker', context, state: dockerRuntimeState(), bootstrap: dockerBootstrap(context) },
        path.join(context.runtimeDir, 'bin', 'prove'),
        [],
        false,
      ),
      /Docker Desktop is required/u,
    );
  } finally {
    Object.defineProperty(process, 'platform', platformDescriptor);
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('keeps the previous native runtime and state when staging fails before activation', async () => {
  for (const failingStep of ['backend copy', 'ICICLE installation', 'CRS installation']) {
    const { context, previousState, temporaryRoot } = await createInstalledRuntimeFixture();
    try {
      await assert.rejects(
        installStagedRuntime(context, runtimeState(), async stagingContext => {
          await fs.writeFile(path.join(stagingContext.runtimeDir, 'marker.txt'), 'new runtime\n', 'utf8');
          throw new Error(`injected ${failingStep} failure`);
        }),
        new RegExp(`injected ${failingStep} failure`, 'u'),
      );
      assert.equal(await fs.readFile(path.join(context.runtimeDir, 'marker.txt'), 'utf8'), 'previous runtime\n');
      assert.deepEqual(JSON.parse(await fs.readFile(context.statePath, 'utf8')), previousState);
      assert.deepEqual(await fs.readdir(context.platformDir), ['installation.json', 'runtime']);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test('keeps the previous runtime and state when macOS rpath configuration fails', async () => {
  const { context, previousState, temporaryRoot } = await createInstalledRuntimeFixture();
  const fakeBin = path.join(temporaryRoot, 'bin');
  const originalPath = process.env.PATH;
  try {
    await fs.mkdir(fakeBin);
    const installNameTool = path.join(fakeBin, 'install_name_tool');
    await fs.writeFile(installNameTool, '#!/usr/bin/env node\nprocess.exit(17);\n', 'utf8');
    await fs.chmod(installNameTool, 0o755);
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ''}`;

    const macosContext = { ...context, platform: 'macos' };
    await assert.rejects(
      installStagedRuntime(macosContext, runtimeState(), async stagingContext => {
        const binaryDir = path.join(stagingContext.runtimeDir, 'bin');
        await fs.mkdir(binaryDir, { recursive: true });
        for (const packageName of ['preprocess', 'prove', 'verify']) {
          await fs.writeFile(path.join(binaryDir, packageName), 'staged binary\n', 'utf8');
        }
        await configureMacosRuntime(stagingContext, false);
      }),
      /install_name_tool exited with code 17/u,
    );
    assert.equal(await fs.readFile(path.join(context.runtimeDir, 'marker.txt'), 'utf8'), 'previous runtime\n');
    assert.deepEqual(JSON.parse(await fs.readFile(context.statePath, 'utf8')), previousState);
    assert.deepEqual(await fs.readdir(context.platformDir), ['installation.json', 'runtime']);
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('restores the previous native runtime and state after activation or state-write failure', async () => {
  const promotionFixture = await createInstalledRuntimeFixture();
  try {
    await assert.rejects(
      installStagedRuntime(promotionFixture.context, runtimeState(), async stagingContext => {
        await fs.rm(stagingContext.runtimeDir, { recursive: true, force: true });
      }),
      /ENOENT/u,
    );
    assert.equal(
      await fs.readFile(path.join(promotionFixture.context.runtimeDir, 'marker.txt'), 'utf8'),
      'previous runtime\n',
    );
    assert.deepEqual(
      JSON.parse(await fs.readFile(promotionFixture.context.statePath, 'utf8')),
      promotionFixture.previousState,
    );
  } finally {
    await fs.rm(promotionFixture.temporaryRoot, { recursive: true, force: true });
  }

  const stateFixture = await createInstalledRuntimeFixture();
  try {
    await assert.rejects(
      installStagedRuntime(
        stateFixture.context,
        runtimeState(),
        async stagingContext => {
          await fs.writeFile(path.join(stagingContext.runtimeDir, 'marker.txt'), 'new runtime\n', 'utf8');
        },
        async () => {
          throw new Error('injected state write failure');
        },
      ),
      /injected state write failure/u,
    );
    assert.equal(
      await fs.readFile(path.join(stateFixture.context.runtimeDir, 'marker.txt'), 'utf8'),
      'previous runtime\n',
    );
    assert.deepEqual(JSON.parse(await fs.readFile(stateFixture.context.statePath, 'utf8')), stateFixture.previousState);
    assert.deepEqual(await fs.readdir(stateFixture.context.platformDir), ['installation.json', 'runtime']);
  } finally {
    await fs.rm(stateFixture.temporaryRoot, { recursive: true, force: true });
  }
});

test('restores runtime state and Docker bootstrap when prepared Docker promotion fails', async () => {
  const { context, previousState, temporaryRoot } = await createInstalledRuntimeFixture();
  const stagingRoot = await fs.mkdtemp(path.join(context.platformDir, '.docker-runtime-staging-'));
  const stagingContext = { ...context, runtimeDir: path.join(stagingRoot, 'runtime') };
  const bootstrapPath = path.join(context.platformDir, 'docker', 'bootstrap.json');
  try {
    await fs.mkdir(stagingContext.runtimeDir, { recursive: true });
    await fs.writeFile(path.join(stagingContext.runtimeDir, 'marker.txt'), 'new runtime\n', 'utf8');
    await fs.mkdir(path.dirname(bootstrapPath), { recursive: true });
    await fs.writeFile(bootstrapPath, 'previous bootstrap\n', 'utf8');

    await assert.rejects(
      commitPreparedRuntime(context, stagingContext, runtimeState(), [
        { activePath: bootstrapPath, stagingPath: path.join(stagingRoot, 'missing-bootstrap.json') },
      ]),
      /ENOENT/u,
    );
    assert.equal(await fs.readFile(path.join(context.runtimeDir, 'marker.txt'), 'utf8'), 'previous runtime\n');
    assert.deepEqual(JSON.parse(await fs.readFile(context.statePath, 'utf8')), previousState);
    assert.equal(await fs.readFile(bootstrapPath, 'utf8'), 'previous bootstrap\n');
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('keeps the committed runtime and Docker bootstrap when Docker preparation fails', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-docker-preparation-'));
  const cacheRoot = path.join(temporaryRoot, 'cache');
  const fakeBin = path.join(temporaryRoot, 'bin');
  const originalPath = process.env.PATH;
  const originalCacheRoot = process.env.TOKAMAK_ZKEVM_CLI_CACHE_DIR;
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  try {
    const platformDir = path.join(cacheRoot, 'linux');
    const runtimeDir = path.join(platformDir, 'runtime');
    const statePath = path.join(platformDir, 'installation.json');
    const bootstrapPath = path.join(platformDir, 'docker', 'bootstrap.json');
    const previousState = dockerRuntimeState();
    await fs.mkdir(runtimeDir, { recursive: true });
    await fs.writeFile(path.join(runtimeDir, 'marker.txt'), 'previous runtime\n', 'utf8');
    await fs.writeFile(statePath, `${JSON.stringify(previousState)}\n`, 'utf8');
    await fs.mkdir(path.dirname(bootstrapPath), { recursive: true });
    await fs.writeFile(bootstrapPath, 'previous bootstrap\n', 'utf8');
    await fs.mkdir(fakeBin);
    const dockerPath = path.join(fakeBin, 'docker');
    await fs.writeFile(
      dockerPath,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
process.exit(args.some((argument) => argument.endsWith('/prepare-runtime.js')) ? 1 : 0);
`,
      'utf8',
    );
    await fs.chmod(dockerPath, 0o755);
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ''}`;
    process.env.TOKAMAK_ZKEVM_CLI_CACHE_DIR = cacheRoot;
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });

    await assert.rejects(
      installRuntime({ docker: true, includePrerequisite: false, noFullSetup: true, verbose: false }),
      /docker exited with code 1/u,
    );
    assert.equal(await fs.readFile(path.join(runtimeDir, 'marker.txt'), 'utf8'), 'previous runtime\n');
    assert.deepEqual(JSON.parse(await fs.readFile(statePath, 'utf8')), previousState);
    assert.equal(await fs.readFile(bootstrapPath, 'utf8'), 'previous bootstrap\n');
    assert.deepEqual((await fs.readdir(platformDir)).sort(), ['docker', 'installation.json', 'runtime']);
  } finally {
    Object.defineProperty(process, 'platform', platformDescriptor);
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalCacheRoot === undefined) {
      delete process.env.TOKAMAK_ZKEVM_CLI_CACHE_DIR;
    } else {
      process.env.TOKAMAK_ZKEVM_CLI_CACHE_DIR = originalCacheRoot;
    }
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('streams downloads by overwriting and appending complete response bodies', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-download-'));
  const destinationPath = path.join(temporaryRoot, 'download.bin');
  try {
    await fs.writeFile(destinationPath, 'stale');
    await streamDownloadToFile(new Response(new Blob(['abc', 'def']).stream()), destinationPath, {
      label: 'download.bin',
      totalBytes: 6,
    });
    assert.equal(await fs.readFile(destinationPath, 'utf8'), 'abcdef');

    await streamDownloadToFile(new Response(new Blob(['gh']).stream()), destinationPath, {
      append: true,
      initialBytes: 6,
      label: 'download.bin',
      totalBytes: 8,
    });
    assert.equal(await fs.readFile(destinationPath, 'utf8'), 'abcdefgh');

    await assert.rejects(
      streamDownloadToFile(new Response(null), destinationPath, { label: 'empty.bin', totalBytes: null }),
      /did not contain a body/u,
    );
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('writes only Docker bootstrap state and removes the legacy launcher', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-cli-runtime-'));
  const cacheRoot = path.join(temporaryRoot, 'cache');
  const fakeBin = path.join(temporaryRoot, 'bin');
  const originalPath = process.env.PATH;
  const originalCacheRoot = process.env.TOKAMAK_ZKEVM_CLI_CACHE_DIR;
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

  try {
    await fs.mkdir(fakeBin);
    const dockerPath = path.join(fakeBin, 'docker');
    const nestedIdentity = JSON.stringify(runtimeIdentity(releaseVersion, releaseCompatibility));
    await fs.writeFile(
      dockerPath,
      `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.some((argument) => argument.endsWith('/prepare-runtime.js'))) {
  const mount = args[args.indexOf('-v') + 1];
  const cacheRoot = mount.slice(0, mount.indexOf(':'));
  const containerStagingRoot = args[args.indexOf('--staging-root') + 1];
  const stagingRoot = path.join(cacheRoot, containerStagingRoot.slice('/tokamak-cache/'.length));
  const runtimeRoot = path.join(stagingRoot, 'runtime');
  fs.mkdirSync(path.join(runtimeRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, 'backend-lib', 'icicle', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, 'resource', 'setup', 'output'), { recursive: true });
  for (const binary of ['preprocess', 'prove', 'verify']) {
    fs.writeFileSync(path.join(runtimeRoot, 'bin', binary), 'binary');
  }
  for (const name of ['verifier_keys.rkyv', 'crs_provenance.json']) {
    fs.writeFileSync(path.join(runtimeRoot, 'resource', 'setup', 'output', name), 'fixture');
  }
  fs.writeFileSync(path.join(stagingRoot, 'backend-runtime-identity.json'), JSON.stringify(${nestedIdentity}));
}
process.exit(0);
`,
      'utf8',
    );
    await fs.chmod(dockerPath, 0o755);
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ''}`;
    process.env.TOKAMAK_ZKEVM_CLI_CACHE_DIR = cacheRoot;
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });

    const dockerDir = path.join(cacheRoot, 'linux', 'docker');
    const legacyLauncher = path.join(dockerDir, 'run.sh');
    await fs.mkdir(dockerDir, { recursive: true });
    await fs.writeFile(legacyLauncher, 'legacy\n', 'utf8');

    await installRuntime({
      docker: true,
      includePrerequisite: false,
      noFullSetup: true,
      verbose: false,
    });

    const bootstrap = JSON.parse(await fs.readFile(path.join(dockerDir, 'bootstrap.json'), 'utf8'));
    assert.equal(bootstrap.dockerEnvironment, 'ubuntu22');
    assert.equal(bootstrap.platform, 'linux');
    assert.equal(bootstrap.useGpus, false);
    const state = JSON.parse(await fs.readFile(path.join(cacheRoot, 'linux', 'installation.json'), 'utf8'));
    assert.equal(state.installMode, 'docker');
    assert.equal(state.dockerEnvironment, bootstrap.dockerEnvironment);
    assert.equal(state.packageVersion, bootstrap.packageVersion);
    await assert.rejects(fs.access(legacyLauncher));
  } finally {
    Object.defineProperty(process, 'platform', platformDescriptor);
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalCacheRoot === undefined) {
      delete process.env.TOKAMAK_ZKEVM_CLI_CACHE_DIR;
    } else {
      process.env.TOKAMAK_ZKEVM_CLI_CACHE_DIR = originalCacheRoot;
    }
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
