import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');
const distDir = path.join(rootDir, 'dist');
const cjsDir = path.join(distDir, 'cjs');
const esmDir = path.join(distDir, 'esm');
const packageJson = JSON.parse(
  await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'),
);

await fs.rm(cjsDir, { force: true, recursive: true });
await fs.rm(esmDir, { force: true, recursive: true });
await fs.rm(path.join(distDir, 'types'), { force: true, recursive: true });

const baseConfig = {
  absWorkingDir: rootDir,
  bundle: true,
  external: Object.keys(packageJson.dependencies ?? {}),
  entryPoints: {
    index: path.join(rootDir, 'src/index.ts'),
  },
  logLevel: 'info',
  platform: 'node',
  target: 'node18',
  tsconfig: path.join(rootDir, 'tsconfig.json'),
};

const tscArgs = [
  path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'),
  'src/index.ts',
  '--declaration',
  '--emitDeclarationOnly',
  '--outDir',
  path.join('dist', 'types'),
  '--module',
  'nodenext',
  '--moduleResolution',
  'node16',
  '--target',
  'es2020',
  '--allowImportingTsExtensions',
  '--skipLibCheck',
  '--strict',
  '--esModuleInterop',
  'false',
  '--resolveJsonModule',
  '--lib',
  'ES2020,DOM',
  '--baseUrl',
  '.',
  '--pretty',
  'false',
];

const tscResult = spawnSync(process.execPath, tscArgs, {
  cwd: rootDir,
  stdio: 'inherit',
});

if (tscResult.status !== 0) {
  process.exit(tscResult.status ?? 1);
}

await build({
  ...baseConfig,
  format: 'cjs',
  outdir: cjsDir,
});

await build({
  ...baseConfig,
  format: 'esm',
  outdir: esmDir,
});

await fs.writeFile(
  path.join(cjsDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);

await fs.writeFile(
  path.join(esmDir, 'package.json'),
  JSON.stringify({ type: 'module' }, null, 2) + '\n',
);
