import { execFile } from 'node:child_process';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import webpack, { type Configuration } from 'webpack';
const execFileAsync = promisify(execFile);

const SUBCIRCUIT_LIBRARY_TARBALL = process.env.BACKEND_WASM_SUBCIRCUIT_LIBRARY_TARBALL;
const APPLICATION_SOURCE = `
import { convertSelector } from "@tokamak-zk-evm/snark-browser-compat/converter";

try {
  await convertSelector({});
  window.__webpackResult = { status: "unexpected-success" };
} catch (error) {
  window.__webpackResult = {
    status: "ok",
    code: error && typeof error === "object" && "code" in error
      ? error.code
      : undefined,
    message: error instanceof Error ? error.message : String(error),
  };
}
`;
const TEST_PAGE = `<!doctype html>
<html lang="en">
  <body>
    <script type="module" src="/application.js"></script>
  </body>
</html>`;

interface WebpackResult {
  readonly status: 'ok' | 'unexpected-success';
  readonly code?: string;
  readonly message?: string;
}

interface NpmPackResult {
  readonly filename: string;
}

async function main(): Promise<void> {
  const temporaryRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'backend-wasm-converter-webpack-')));

  try {
    const applicationRoot = path.join(temporaryRoot, 'application');
    const packageArchiveRoot = path.join(temporaryRoot, 'package');
    const sourceRoot = path.join(applicationRoot, 'src');
    const outputRoot = path.join(applicationRoot, 'dist');
    await Promise.all([
      mkdir(sourceRoot, { recursive: true }),
      mkdir(packageArchiveRoot, { recursive: true }),
      mkdir(outputRoot, { recursive: true }),
    ]);

    const packageArchivePath = await packCurrentPackage(packageArchiveRoot);
    await Promise.all([
      writeFile(
        path.join(applicationRoot, 'package.json'),
        JSON.stringify({
          name: 'backend-wasm-converter-webpack-check',
          private: true,
          type: 'module',
        }),
      ),
      writeFile(path.join(sourceRoot, 'index.js'), APPLICATION_SOURCE),
      writeFile(path.join(outputRoot, 'index.html'), TEST_PAGE),
    ]);
    await execFileAsync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        ...(SUBCIRCUIT_LIBRARY_TARBALL === undefined ? [] : [path.resolve(SUBCIRCUIT_LIBRARY_TARBALL)]),
        packageArchivePath,
      ],
      { cwd: applicationRoot },
    );

    await buildApplication(applicationRoot, outputRoot);
    await checkBuiltApplication(outputRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  console.log('Checked packed current converter API in a production Webpack browser build');
}

async function packCurrentPackage(packageArchiveRoot: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', packageArchiveRoot],
    { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 },
  );
  const result = JSON.parse(stdout) as readonly NpmPackResult[];
  if (result.length !== 1) {
    throw new Error(`Expected one packed package, received ${result.length}.`);
  }
  return path.join(packageArchiveRoot, result[0].filename);
}

async function buildApplication(applicationRoot: string, outputRoot: string): Promise<void> {
  const configuration: Configuration = {
    context: applicationRoot,
    devtool: false,
    entry: './src/index.js',
    mode: 'production',
    output: {
      clean: false,
      filename: 'application.js',
      path: outputRoot,
    },
    target: ['web', 'es2022'],
  };

  await new Promise<void>((resolve, reject) => {
    const compiler = webpack(configuration);
    compiler.run((error, stats) => {
      compiler.close(closeError => {
        const failure = error ?? closeError;
        if (failure !== null && failure !== undefined) {
          reject(failure);
          return;
        }
        if (stats === undefined || stats.hasErrors()) {
          reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'Webpack returned no stats.'));
          return;
        }
        resolve();
      });
    });
  });
}

async function checkBuiltApplication(outputRoot: string): Promise<void> {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const relativePath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      await serveBuiltFile(response, outputRoot, relativePath);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Webpack consumer check failed to bind a local HTTP port.');
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const browserErrors: string[] = [];
    page.on('pageerror', error => browserErrors.push(error.stack ?? error.message));
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const result = await page.waitForFunction(
      () => (window as unknown as { __webpackResult?: WebpackResult }).__webpackResult,
    );
    const value = (await result.jsonValue()) as WebpackResult;

    if (browserErrors.length > 0) {
      throw new Error(`Webpack consumer raised browser errors:\n${browserErrors.join('\n')}`);
    }
    if (value.status !== 'ok') {
      throw new Error('Invalid rkyv input unexpectedly converted successfully.');
    }
    if (value.code !== 'INVALID_INPUT') {
      throw new Error(`Unexpected Webpack converter result: ${JSON.stringify(value)}.`);
    }
    if (value.message !== 'convertSelector could not process its input.') {
      throw new Error(`Unexpected Webpack converter failure: ${JSON.stringify(value)}.`);
    }
  } finally {
    await browser?.close();
    server.close();
  }
}

async function serveBuiltFile(response: ServerResponse, outputRoot: string, relativePath: string): Promise<void> {
  const filePath = path.resolve(outputRoot, relativePath);
  const relativeResolvedPath = path.relative(outputRoot, filePath);
  if (relativeResolvedPath.startsWith('..') || path.isAbsolute(relativeResolvedPath)) {
    response.writeHead(404);
    response.end();
    return;
  }

  try {
    const bytes = await readFile(filePath);
    response.writeHead(200, { 'content-type': contentTypeFor(filePath) });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.wasm')) {
    return 'application/wasm';
  }
  if (filePath.endsWith('.js')) {
    return 'text/javascript; charset=utf-8';
  }
  if (filePath.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }
  return 'application/octet-stream';
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
