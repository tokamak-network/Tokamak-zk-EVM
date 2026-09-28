import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

// Measurement-only runner. Every sample gets a fresh browser context and CRS reader.
const [fixtureArg, outputArg, ...modes] = process.argv.slice(2);
if (!fixtureArg || !outputArg || !modes.length || modes.some(x => !['off', 'on', 'profile-off', 'profile-on', 'baseline-off', 'baseline-on'].includes(x))) {
  throw Error('Usage: node test/profiling/run-current-univariate.mjs FIXTURE OUTPUT_DIRECTORY off|on|profile-off|profile-on ...');
}
const fixture = path.resolve(fixtureArg), output = path.resolve(outputArg);
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['test/profiling/current-univariate-server.mjs', fixture], { stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
const results = [];
try {
  const origin = await new Promise((resolve, reject) => {
    let text = '';
    server.stdout.on('data', bytes => {
      text += bytes;
      const match = text.match(/PROFILE_ORIGIN=(http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
    server.on('error', reject);
    server.on('exit', code => reject(Error(`Profile server exited: ${code}`)));
  });
  browser = await chromium.launch({ headless: true });
  for (const [index, mode] of modes.entries()) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const query = new URLSearchParams();
      if (mode.startsWith('baseline-')) query.set('baseline', '');
      if (mode.startsWith('profile-')) query.set('profile', '');
      if (mode.endsWith('on')) query.set('checkDigests', '');
      await page.goto(`${origin}/?${query}`);
      await page.evaluate(() => { window.run(); });
      console.log(`Started sample ${index + 1}: ${mode}`);
      await page.waitForFunction(() => window.result?.status !== 'running', undefined, { timeout: 1800000 });
      const result = await page.evaluate(() => window.result);
      assert.equal(result.status, 'ok', JSON.stringify(result));
      if (mode.startsWith('profile-')) {
        const tasks = result.msm.tasks.filter(task => task.phase.startsWith('prove.'));
        assert(tasks.length > 0 && tasks.every(task => Number.isFinite(task.kernelMs)),
          'Profile must instrument actual browser worker kernels');
      }
      const proofPath = path.join(output, `proof-${index}.bin`);
      await writeFile(proofPath, Uint8Array.from(await page.evaluate(() => window.proof)));
      const { stdout } = await promisify(execFile)(path.resolve('../target/release/verify'), [
        '--preprocess', path.join(fixture, 'preprocess/univariate_verifier_preprocess.bin'),
        '--proof', proofPath, '--instance', path.join(fixture, 'inputs/synthesizer/instance.json'),
      ]);
      assert.match(stdout, /\btrue\b/, 'Native verifier must accept the browser proof');
      results.push({ mode, browser: browser.version(), nativeVerified: true, ...result });
      await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
      console.log(JSON.stringify({ mode, timings: result.timings, nativeVerified: true }));
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
