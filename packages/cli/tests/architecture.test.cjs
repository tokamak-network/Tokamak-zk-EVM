const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const sourceRoot = path.resolve(__dirname, '..', 'src');
const requiredRuntimeModules = new Set([
  'context.ts',
  'docker.ts',
  'download.ts',
  'drive-listing.ts',
  'identity.ts',
  'icicle.ts',
  'model.ts',
  'native.ts',
  'operation-lock.ts',
  'stage-transaction.ts',
  'setup.ts',
  'transaction.ts',
  'verification-result.ts',
]);
const runtimeDomains = new Set(['docker.ts', 'icicle.ts', 'native.ts', 'setup.ts']);
const runtimeFoundations = new Set([
  'context.ts',
  'drive-listing.ts',
  'identity.ts',
  'model.ts',
  'operation-lock.ts',
  'stage-transaction.ts',
  'transaction.ts',
]);
const allowedDownloadConsumers = new Set(['icicle.ts', 'setup.ts']);
const reviewedTopLevelDependencies = new Map([
  ['system.ts', new Set()],
  ['prerequisites.ts', new Set(['system.ts'])],
  ['runtime.ts', new Set([
    'prerequisites.ts',
    'runtime/context.ts',
    'runtime/docker.ts',
    'runtime/icicle.ts',
    'runtime/model.ts',
    'runtime/native.ts',
    'runtime/setup.ts',
    'runtime/transaction.ts',
    'system.ts',
  ])],
  ['prepare-runtime.ts', new Set(['prerequisites.ts', 'runtime.ts', 'runtime/model.ts'])],
  ['cli.ts', new Set([
    'runtime.ts',
    'system.ts',
    'generated/backend-build-metadata-validator.generated.ts',
    'runtime/identity.ts',
    'runtime/operation-lock.ts',
    'runtime/stage-transaction.ts',
    'runtime/verification-result.ts',
  ])],
]);

function sourceFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(entryPath) : entryPath.endsWith('.ts') ? [entryPath] : [];
  });
}

function resolveRelativeImport(sourcePath, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const withoutJs = specifier.endsWith('.js') ? specifier.slice(0, -3) : specifier;
  return path.resolve(path.dirname(sourcePath), `${withoutJs}.ts`);
}

function relativeName(filePath) {
  return path.relative(sourceRoot, filePath).split(path.sep).join('/');
}

test('runtime modules preserve the reviewed acyclic dependency boundaries', () => {
  const files = sourceFiles(sourceRoot);
  const graph = new Map();

  for (const sourcePath of files) {
    const preprocessed = ts.preProcessFile(fs.readFileSync(sourcePath, 'utf8'), true, true);
    const dependencies = preprocessed.importedFiles
      .map(({ fileName }) => resolveRelativeImport(sourcePath, fileName))
      .filter((target) => target !== null && fs.existsSync(target));
    graph.set(sourcePath, dependencies);
  }

  const actualRuntimeModules = new Set(
    files
      .filter((filePath) => path.dirname(filePath) === path.join(sourceRoot, 'runtime'))
      .map((filePath) => path.basename(filePath)),
  );
  assert.deepEqual(actualRuntimeModules, requiredRuntimeModules);

  const modelPath = path.join(sourceRoot, 'runtime', 'model.ts');
  assert.deepEqual(
    (graph.get(modelPath) ?? []).filter((dependency) => path.dirname(dependency) === path.join(sourceRoot, 'runtime')),
    [],
    'runtime/model.ts must not depend on runtime behavior modules',
  );

  for (const [sourceName, allowedDependencies] of reviewedTopLevelDependencies) {
    const sourcePath = path.join(sourceRoot, sourceName);
    const actualDependencies = new Set((graph.get(sourcePath) ?? []).map(relativeName));
    assert.deepEqual(
      actualDependencies,
      allowedDependencies,
      `${sourceName} must use only its documented direct dependency direction`,
    );
  }

  const systemPath = path.join(sourceRoot, 'system.ts');
  assert.deepEqual(
    graph.get(systemPath) ?? [],
    [],
    'system.ts must not depend on runtime domains',
  );

  for (const domainName of runtimeDomains) {
    const domainPath = path.join(sourceRoot, 'runtime', domainName);
    for (const dependency of graph.get(domainPath) ?? []) {
      const dependencyName = relativeName(dependency);
      assert.notEqual(dependencyName, 'runtime.ts', `${domainName} must not import the runtime facade`);
      assert.notEqual(dependencyName, 'cli.ts', `${domainName} must not import the CLI`);
      if (path.dirname(dependency) !== path.join(sourceRoot, 'runtime')) {
        continue;
      }

      const targetName = path.basename(dependency);
      const allowed =
        runtimeFoundations.has(targetName) ||
        (targetName === 'download.ts' && allowedDownloadConsumers.has(domainName));
      assert.ok(allowed, `${domainName} must not import sibling runtime module ${targetName}`);
    }
  }

  const visited = new Set();
  const active = new Set();
  function visit(sourcePath, chain) {
    if (active.has(sourcePath)) {
      assert.fail(`Relative import cycle: ${[...chain, relativeName(sourcePath)].join(' -> ')}`);
    }
    if (visited.has(sourcePath)) {
      return;
    }
    active.add(sourcePath);
    for (const dependency of graph.get(sourcePath) ?? []) {
      visit(dependency, [...chain, relativeName(sourcePath)]);
    }
    active.delete(sourcePath);
    visited.add(sourcePath);
  }
  for (const sourcePath of files) {
    visit(sourcePath, []);
  }
});
