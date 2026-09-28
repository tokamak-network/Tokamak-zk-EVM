const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageRoot = path.resolve(__dirname, '..');

test('Docker package context includes the backend-owned vendor product', () => {
  const dockerIgnore = fs.readFileSync(path.join(packageRoot, '.dockerignore'), 'utf8');
  assert.match(dockerIgnore, /^!vendor\/$/mu);
  assert.match(dockerIgnore, /^!vendor\/\*\*$/mu);
  assert.doesNotMatch(dockerIgnore, /^!versioning\/$/mu);

  const dockerfile = fs.readFileSync(path.join(packageRoot, 'docker', 'Dockerfile'), 'utf8');
  assert.doesNotMatch(dockerfile, /^COPY versioning \.\/versioning$/mu);
  assert.match(dockerfile, /test -f vendor\/backend\/cli-vendor-product\.json/u);
  assert.match(dockerfile, /test -f vendor\/backend\/versioning\/compatibility\.rs/u);
});

test('ICICLE CUDA selection uses the executing process probe rather than an ambient Docker variable', () => {
  const icicle = fs.readFileSync(path.join(packageRoot, 'src', 'runtime', 'icicle.ts'), 'utf8');
  const docker = fs.readFileSync(path.join(packageRoot, 'src', 'runtime', 'docker.ts'), 'utf8');

  assert.doesNotMatch(icicle, /TOKAMAK_ZKEVM_CLI_DOCKER_ENVIRONMENT/u);
  assert.doesNotMatch(docker, /TOKAMAK_ZKEVM_CLI_DOCKER_ENVIRONMENT/u);
  assert.match(icicle, /const installCudaBackend = await linuxCudaBackendAvailable\(verbose\);/u);
});
