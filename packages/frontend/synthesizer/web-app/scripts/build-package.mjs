import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBuildMetadataDefines,
  createBuildMetadataFileContents,
  createPackageBuildMetadata,
} from '../../scripts/build-metadata.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');
const distDir = path.join(rootDir, 'dist');
const buildMetadata = createPackageBuildMetadata(rootDir, {
  subcircuitLibrary: 'bundled',
  tokamakL2js: 'bundled',
});

const baseConfig = {
  absWorkingDir: rootDir,
  bundle: true,
  define: createBuildMetadataDefines(buildMetadata),
  entryPoints: {
    index: path.join(rootDir, 'src/index.ts'),
  },
  logLevel: 'info',
  platform: 'browser',
  target: 'es2020',
  tsconfig: path.join(rootDir, 'tsconfig.json'),
  loader: {
    '.wasm': 'binary',
  },
};

await fs.rm(path.join(distDir, 'cjs'), { force: true, recursive: true });
await fs.rm(path.join(distDir, 'esm'), { force: true, recursive: true });
await fs.writeFile(
  path.join(rootDir, 'build-metadata.json'),
  createBuildMetadataFileContents(buildMetadata),
);

await build({
  ...baseConfig,
  format: 'cjs',
  outdir: path.join(distDir, 'cjs'),
});

await build({
  ...baseConfig,
  format: 'esm',
  outdir: path.join(distDir, 'esm'),
});

await fs.writeFile(
  path.join(distDir, 'cjs', 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);

await fs.writeFile(
  path.join(distDir, 'esm', 'package.json'),
  JSON.stringify({ type: 'module' }, null, 2) + '\n',
);
