import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findPackageTarball } from '../release-registry.mjs';
import { startIsolatedFileServer } from '../../packages/backend/wasm/test/support/browser/static-file-server.js';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wasmRoot = path.join(repository, 'packages/backend/wasm');
const requireFromWasm = createRequire(path.join(wasmRoot, 'package.json'));
const { build } = requireFromWasm('esbuild') as typeof import('esbuild');
const { chromium } = requireFromWasm('playwright') as typeof import('playwright');
const tarballDirectory = process.argv[2];
const crsDirectory = process.argv[3];
if (!tarballDirectory || !crsDirectory) {
  throw new Error('Usage: tsx scripts/release-e2e/browser.mts <tarball-directory> <converted-crs-directory>');
}

const version = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8')).version as string;
const temporaryRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'tokamak-browser-e2e-')));
const fixture = path.join(repository, 'packages/frontend/synthesizer/examples/L2StateChannel');
const webName = '@tokamak-zk-evm/synthesizer-web';
const backendName = '@tokamak-zk-evm/snark-browser-compat';

try {
  const webTarball = findPackageTarball(tarballDirectory, webName);
  const backendTarball = findPackageTarball(tarballDirectory, backendName);
  await writeFile(path.join(temporaryRoot, 'package.json'), `${JSON.stringify({
    private: true,
    name: 'tokamak-release-browser-e2e',
    type: 'module',
    dependencies: {
      [webName]: `file:${webTarball}`,
      [backendName]: `file:${backendTarball}`,
      '@tokamak-zk-evm/subcircuit-library': version,
    },
  })}\n`);
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], temporaryRoot);
  for (const name of [webName, backendName]) {
    const packageRoot = path.join(temporaryRoot, 'node_modules', ...name.split('/'));
    const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as { version: string };
    assert.equal(manifest.version, version);
    assert.ok((await realpath(packageRoot)).startsWith(temporaryRoot));
  }

  const entry = path.join(temporaryRoot, 'browser-entry.ts');
  const bundle = path.join(temporaryRoot, 'browser-entry.js');
  await copyFile(path.join(repository, 'scripts/release-e2e/browser-entry.ts'), entry);
  const bundled = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: bundle, metafile: true });
  for (const name of [webName, backendName]) {
    const candidateDirectory = path.join(temporaryRoot, 'node_modules', ...name.split('/'));
    assert.ok(Object.keys(bundled.metafile.inputs).some(input => path.resolve(input).startsWith(`${candidateDirectory}${path.sep}`)),
      `Browser bundle did not use the candidate ${name} package.`);
  }

  const crsRoot = await realpath(crsDirectory);
  const server = await startIsolatedFileServer((pathname) => {
    if (pathname === '/browser/prover.html') return path.join(wasmRoot, 'test/browser/prover.html');
    if (pathname === '/browser/prover-entry.js') return bundle;
    if (pathname.startsWith('/inputs/')) {
      const name = pathname.slice('/inputs/'.length);
      if (['previous_state_snapshot.json', 'transaction.json', 'block_info.json', 'contract_codes.json'].includes(name)) {
        return path.join(fixture, name);
      }
    }
    if (pathname.startsWith('/crs/')) {
      const resolved = path.resolve(crsRoot, pathname.slice('/crs/'.length));
      if (resolved.startsWith(`${crsRoot}${path.sep}`)) return resolved;
    }
    return undefined;
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
    page.on('console', message => {
      if (message.type() === 'error' || message.text().startsWith('Error: Synthesizer:')) errors.push(message.text());
    });
    await page.goto(`${server.origin}/browser/prover.html`, { waitUntil: 'networkidle' });
    const handle = await page.waitForFunction(
      () => window.__tokamakReleaseE2eResult?.status !== 'pending' ? window.__tokamakReleaseE2eResult : undefined,
      undefined,
      { timeout: 1_800_000 },
    );
    const result = await handle.jsonValue();
    assert.equal(result?.status, 'ok', [result?.error, ...errors].filter(Boolean).join('\n'));
    assert.equal(result?.valid, true);
    assert.deepEqual(errors, []);
    console.log('Browser candidate-package synthesis, preprocess, prove, and verify passed.');
  } finally {
    await browser.close();
    await server.close();
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status ?? 'unknown'}.`);
  }
}
