const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PassThrough } = require('node:stream');
const test = require('node:test');

const {
  activateManagedPrerequisiteEnvironment,
  assertPrerequisiteInstallIsInteractive,
  assertPrerequisiteInstallMayRunAsCurrentUser,
  buildPrerequisiteInstallationPlan,
  confirmPrerequisiteInstallation,
  detectManagedPrerequisites,
  detectNativeInstallPrerequisites,
  detectSupportedNativeOs,
  isPrerequisiteConfirmationAccepted,
  parseOsRelease,
  parseSupportedUbuntuRelease,
  prependPathValue,
  prerequisiteVerificationFailures,
  renderPrerequisiteInstallationPlan,
  versionMeetsMinimum,
} = require('../dist/prerequisites.js');
const { parseArgs } = require('../dist/cli.js');

const linux = { platform: 'linux', ubuntuVersion: '22.04' };
const macos = { platform: 'macos' };

function createProbe(installed, versions = {}) {
  const defaults = {
    rustc: 'rustc 1.85.0',
    cargo: 'cargo 1.85.0',
    cmake: 'cmake version 3.18.0',
    cc: 'cc 9.0.0',
    clang: 'clang version 18.0.0',
    lldb: 'lldb version 18.0.0',
    'ld.lld': 'LLD 18.0.0',
    git: 'git version 2.25.1',
    ninja: '1.10.0',
    'pkg-config': '0.29.1',
    tar: 'tar 1.30',
    unzip: 'UnZip 6.00',
  };
  return {
    exists(command) {
      return installed.has(command);
    },
    version(command) {
      return versions[command] ?? defaults[command] ?? `${command} test-version`;
    },
  };
}

test('parses quoted os-release values and accepts only the supported Ubuntu releases', async () => {
  const contents = [
    'NAME="Ubuntu"',
    'ID=ubuntu',
    'VERSION_ID="20.04"',
    'PRETTY_NAME="Ubuntu 20.04.6 LTS"',
  ].join('\n');
  assert.deepEqual(parseOsRelease(contents), {
    NAME: 'Ubuntu',
    ID: 'ubuntu',
    VERSION_ID: '20.04',
    PRETTY_NAME: 'Ubuntu 20.04.6 LTS',
  });
  assert.equal(parseSupportedUbuntuRelease(contents), '20.04');
  assert.deepEqual(
    await detectSupportedNativeOs('linux', async () => contents),
    { platform: 'linux', ubuntuVersion: '20.04' },
  );
});

test('rejects unsupported and unidentified Linux environments', async () => {
  assert.equal(
    parseSupportedUbuntuRelease('ID=ubuntu\nVERSION_ID="22.04"\n'),
    '22.04',
  );
  for (const [contents, error] of [
    ['ID=ubuntu\nVERSION_ID="24.04"\n', /Unsupported Ubuntu version/u],
    ['ID=debian\nVERSION_ID="12"\n', /Unsupported Linux distribution/u],
    ['NAME=Ubuntu\n', /Unsupported Linux distribution/u],
  ]) {
    assert.throws(() => parseSupportedUbuntuRelease(contents), error);
  }
  for (const distribution of ['rhel', 'fedora', 'arch']) {
    assert.throws(
      () => parseSupportedUbuntuRelease(`ID=${distribution}\nVERSION_ID="1"\n`),
      /Unsupported Linux distribution/u,
    );
  }
  await assert.rejects(
    detectSupportedNativeOs('linux', async () => {
      throw new Error('missing');
    }),
    /Unable to identify the Linux distribution/u,
  );
});

test('detects supported macOS without reading Linux metadata', async () => {
  let readAttempted = false;
  const detected = await detectSupportedNativeOs('darwin', async () => {
    readAttempted = true;
    return '';
  });
  assert.deepEqual(detected, macos);
  assert.equal(readAttempted, false);
});

test('detects all managed prerequisites and their representative versions', () => {
  const installed = new Set([
    'rustc',
    'cargo',
    'cmake',
    'cc',
    'c++',
    'make',
    'clang',
    'lldb',
    'ld.lld',
    'git',
    'ninja',
    'pkg-config',
    'tar',
    'unzip',
  ]);
  const statuses = detectManagedPrerequisites(linux, createProbe(installed));
  assert.equal(statuses.length, 10);
  assert.ok(statuses.every((status) => status.installed));
  assert.ok(statuses.every((status) => status.version !== null));
  assert.ok(statuses.every((status) => status.compatible));
  assert.equal(
    statuses.find((status) => status.id === 'llvm-toolchain').version,
    'clang version 18.0.0; lldb version 18.0.0; LLD 18.0.0',
  );
});

test('uses one managed prerequisite policy for ordinary installs and guided installation', () => {
  const installed = new Set([
    'rustc', 'cargo', 'cmake', 'cc', 'c++', 'make', 'clang', 'lldb', 'ld.lld',
    'git', 'ninja', 'pkg-config', 'tar', 'unzip',
  ]);
  const statuses = detectNativeInstallPrerequisites(linux, createProbe(installed));
  assert.deepEqual(statuses.map((status) => status.id), detectManagedPrerequisites(linux, createProbe(installed)).filter((status) => status.id !== 'unzip').map((status) => status.id));
  assert.deepEqual(prerequisiteVerificationFailures(statuses), []);
});

test('README documents native prerequisites and individual-file CRS provisioning', () => {
  const readme = fs.readFileSync(path.resolve(__dirname, '..', 'README.md'), 'utf8');
  for (const label of ['Rust', 'Cargo', 'CMake', 'C/C++ toolchain', 'LLVM toolchain', 'Git', 'Ninja', 'pkg-config', 'tar', 'unzip']) {
    assert.ok(readme.includes(`| ${label} |`), `README must document ${label}`);
  }
  assert.match(readme, /Not required for CRS installation/u);
  assert.match(readme, /does not\ninstall either/u);
});

test('maps missing Ubuntu tools to apt packages and Rust to rustup', () => {
  const statuses = detectManagedPrerequisites(linux, createProbe(new Set()));
  const plan = buildPrerequisiteInstallationPlan(linux, statuses);
  assert.deepEqual(plan.actions, [
    {
      kind: 'apt',
      packages: [
        'build-essential',
        'cmake',
        'tar',
        'ninja-build',
        'software-properties-common',
        'wget',
        'gnupg',
        'git',
        'pkg-config',
        'unzip',
      ],
    },
    { kind: 'llvm-apt', ubuntuVersion: '22.04' },
    { kind: 'rustup' },
  ]);
  const rendered = renderPrerequisiteInstallationPlan(plan);
  assert.match(rendered, /sudo apt-get update/u);
  assert.match(rendered, /tokamak-cli --uninstall.*does not remove/u);
});

test('orders Xcode before Homebrew formulas and rustup on macOS', () => {
  const statuses = detectManagedPrerequisites(macos, createProbe(new Set()));
  const plan = buildPrerequisiteInstallationPlan(macos, statuses, false);
  assert.deepEqual(plan.actions, [
    { kind: 'xcode-command-line-tools' },
    { kind: 'homebrew' },
    { kind: 'brew', formulas: ['cmake', 'pkg-config', 'gnu-tar', 'unzip'] },
    { kind: 'rustup' },
  ]);
});

test('does not plan upgrades for already installed prerequisites', () => {
  const installed = new Set([
    'rustc',
    'cargo',
    'cmake',
    'cc',
    'c++',
    'install_name_tool',
    'pkg-config',
    'tar',
    'unzip',
  ]);
  const statuses = detectManagedPrerequisites(macos, createProbe(installed));
  assert.deepEqual(buildPrerequisiteInstallationPlan(macos, statuses, true).actions, []);
});

test('follows ICICLE Ubuntu 20.04 packages and CMake source policy', () => {
  const ubuntu20 = { platform: 'linux', ubuntuVersion: '20.04' };
  const statuses = detectManagedPrerequisites(ubuntu20, createProbe(new Set()));
  const plan = buildPrerequisiteInstallationPlan(ubuntu20, statuses);
  assert.deepEqual(plan.actions, [
    {
      kind: 'apt',
      packages: [
        'build-essential',
        'wget',
        'tar',
        'libssl-dev',
        'libcurl4-openssl-dev',
        'libarchive-dev',
        'zlib1g-dev',
        'ninja-build',
        'software-properties-common',
        'gnupg',
        'git',
        'pkg-config',
        'unzip',
      ],
    },
    { kind: 'llvm-apt', ubuntuVersion: '20.04' },
    { kind: 'kitware-cmake-source' },
    { kind: 'rustup' },
  ]);
  assert.match(renderPrerequisiteInstallationPlan(plan), /CMake 3\.27\.4 source/u);
});

test('uses APT for incompatible Ubuntu 22.04 CMake and retains compatible versions', () => {
  assert.equal(versionMeetsMinimum('3.18.0', '3.18.0'), true);
  assert.equal(versionMeetsMinimum('4.4.0', '3.18.0'), true);
  assert.equal(versionMeetsMinimum('3.16.3', '3.18.0'), false);

  const installed = new Set([
    'rustc',
    'cargo',
    'cmake',
    'cc',
    'c++',
    'make',
    'clang',
    'lldb',
    'ld.lld',
    'git',
    'ninja',
    'pkg-config',
    'tar',
    'unzip',
  ]);
  const statuses = detectManagedPrerequisites(
    linux,
    createProbe(installed, { cmake: 'cmake version 3.16.3' }),
  );
  assert.deepEqual(buildPrerequisiteInstallationPlan(linux, statuses).actions, [
    { kind: 'apt', packages: ['cmake'] },
  ]);
});

test('installs Git and the official LLVM toolchain required by ICICLE', () => {
  const installed = new Set([
    'rustc',
    'cargo',
    'cmake',
    'cc',
    'c++',
    'make',
    'ninja',
    'pkg-config',
    'tar',
    'unzip',
  ]);
  const statuses = detectManagedPrerequisites(linux, createProbe(installed));
  assert.deepEqual(buildPrerequisiteInstallationPlan(linux, statuses).actions, [
    {
      kind: 'apt',
      packages: ['software-properties-common', 'wget', 'gnupg', 'git'],
    },
    { kind: 'llvm-apt', ubuntuVersion: '22.04' },
  ]);
});

test('accepts only explicit y or yes confirmation', () => {
  for (const accepted of ['y', 'Y', 'yes', ' YES ']) {
    assert.equal(isPrerequisiteConfirmationAccepted(accepted), true);
  }
  for (const declined of ['', 'n', 'no', 'true', '1', 'y please']) {
    assert.equal(isPrerequisiteConfirmationAccepted(declined), false);
  }
});

async function answerPrompt(plan, answer) {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = output.isTTY = true;
  output.resume();
  const result = confirmPrerequisiteInstallation(plan, input, output);
  setImmediate(() => input.end(answer));
  return await result;
}

test('confirms and declines through a real default-deny prompt', async () => {
  const plan = {
    actions: [{ kind: 'rustup' }],
    os: linux,
    statuses: [],
  };

  for (const [answer, expected] of [['yes\n', true], ['\n', false], [undefined, false]]) {
    assert.equal(await answerPrompt(plan, answer), expected);
  }
});

test('rejects root execution and non-TTY execution', () => {
  assert.throws(
    () => assertPrerequisiteInstallMayRunAsCurrentUser(() => 0),
    /must not be run as root/u,
  );
  assert.doesNotThrow(() => assertPrerequisiteInstallMayRunAsCurrentUser(() => 501));
  assert.throws(
    () => assertPrerequisiteInstallIsInteractive({ isTTY: false }, { isTTY: true }),
    /requires a terminal/u,
  );
});

test('reports missing commands and failed version probes during verification', () => {
  const status = (id, installed) => ({
    compatible: false,
    commands: [id],
    id,
    installed,
    label: id,
    requirement: 'a compatible test version',
    version: installed ? null : `${id} test-version`,
  });
  const failures = prerequisiteVerificationFailures([
    status('cargo', false),
    status('cmake', true),
  ]);
  assert.equal(failures.length, 2);
  assert.match(failures[0], /required command/u);
  assert.match(failures[1], /version verification failed/u);
});

test('prepends tool paths exactly once', () => {
  const original = ['/usr/bin', '/bin'].join(path.delimiter);
  const updated = prependPathValue(original, '/example/bin');
  assert.equal(
    updated,
    ['/example/bin', '/usr/bin', '/bin'].join(path.delimiter),
  );
  assert.equal(prependPathValue(updated, '/example/bin'), updated);
});

test('restores the Homebrew shell environment on later macOS runs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokamak-brew-test-'));
  const brew = path.join(tempDir, 'brew');
  const originalEnv = { ...process.env };
  fs.writeFileSync(
    brew,
    [
      '#!/bin/sh',
      'test "$1" = shellenv || exit 1',
      `echo 'export HOMEBREW_PREFIX="${tempDir}"'`,
      `echo 'export PATH="${tempDir}/bin:/usr/bin:/bin"'`,
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    process.env.PATH = '/usr/bin:/bin';
    delete process.env.HOMEBREW_PREFIX;
    activateManagedPrerequisiteEnvironment('darwin', '/example/home', brew);
    assert.equal(process.env.HOMEBREW_PREFIX, tempDir);
    assert.equal(
      process.env.PATH,
      `${tempDir}/bin:/usr/bin:/bin`,
    );
  } finally {
    for (const name of Object.keys(process.env)) {
      if (!(name in originalEnv)) delete process.env[name];
    }
    Object.assign(process.env, originalEnv);
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

function runCli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, '..', 'dist', 'cli.js'), ...args], {
    encoding: 'utf8',
  });
}

test('rejects invalid options at the executable boundary', () => {
  for (const [args, error] of [
    [['--install', '--include-prerequisite', '--docker'], /cannot be combined with --docker/u],
    [['--install', '--trusted-setup'], /Unknown option for --install/u],
    [['--install', '--no-setup'], /Unknown option for --install/u],
    [['--uninstall', '--include-prerequisite'], /Unknown option for --uninstall/u],
  ]) {
    const result = runCli(args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
  }
});

test('parses every supported include-prerequisite combination', () => {
  for (const [options, expected] of [
    [[], { verbose: false, noFullSetup: false }],
    [['--verbose'], { verbose: true, noFullSetup: false }],
    [['--no-full-setup'], { verbose: false, noFullSetup: true }],
  ]) {
    assert.deepEqual(parseArgs(['--install', '--include-prerequisite', ...options]), {
      command: 'install',
      verbose: expected.verbose,
      installOptions: {
        docker: false,
        includePrerequisite: true,
        noFullSetup: expected.noFullSetup,
      },
    });
  }
});
