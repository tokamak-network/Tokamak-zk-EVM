#!/usr/bin/env node

import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const commonRoot = path.resolve(import.meta.dirname, '..');
const backendRoot = path.resolve(commonRoot, '..');
const repositoryRoot = path.resolve(backendRoot, '..', '..');
const cliVendorRoot = path.join(repositoryRoot, 'packages', 'cli', 'vendor', 'backend');
const productManifestName = 'cli-vendor-product.json';

const excludedDirectoryNames = new Set([
  '.vscode',
  'benches',
  'docs',
  'external-lib',
  'optimization',
  'output',
  'output-mpc',
  'output-mpc-general',
  'scripts',
  'setup',
  'target',
  'tmp',
  'wasm',
]);

const excludedFileNames = new Set([
  '.DS_Store',
  '.env',
  '.gitignore',
  'Dockerfile',
  'CONTRACT_CLOSURE.md',
  'README.md',
  'README_mpc.md',
  'download-ICICLE-lib.sh',
  'google-drive-oauth-token.json',
]);

function usage() {
  throw new Error('Usage: node packages/backend/common/scripts/prepare-cli-vendor.mjs --output <packages/cli/vendor/backend>');
}

function parseOutputPath(argv) {
  if (argv.length !== 2 || argv[0] !== '--output') {
    usage();
  }
  const output = path.resolve(argv[1]);
  if (output !== cliVendorRoot) {
    throw new Error(`CLI vendor output must be ${cliVendorRoot}.`);
  }
  return output;
}

function shouldCopy(relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts.some((part) => excludedDirectoryNames.has(part))) {
    return false;
  }
  const leaf = parts.at(-1) ?? '';
  return !excludedFileNames.has(leaf) &&
    !/^client_secret_.*\.json$/u.test(leaf) &&
    !/^Dockerfile\..*/u.test(leaf) &&
    !/^gen-lang-client-.*\.json$/u.test(leaf);
}

async function listRegularFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return await listRegularFiles(entryPath);
    }
    if (!entry.isFile()) {
      throw new Error(`CLI backend product contains unsupported filesystem entry: ${entryPath}`);
    }
    return [entryPath];
  }));
  return nested.flat();
}

async function rewriteFile(filePath, replacements) {
  let contents = await fs.readFile(filePath, 'utf8');
  for (const [from, to] of replacements) {
    if (!contents.includes(from)) {
      throw new Error(`Expected product source fragment is missing from ${filePath}: ${from}`);
    }
    contents = contents.replace(from, to);
  }
  await fs.writeFile(filePath, contents, 'utf8');
}

async function makeRuntimeOnlyWorkspace(output) {
  await rewriteFile(path.join(output, 'Cargo.toml'), [[
    'members = [\n    "common/interface",\n    "common/interface/univariate-crs",\n    "rust/libs",\n    "rust/setup/trusted-setup",\n    "rust/setup/mpc-setup",\n    "rust/prove",\n    "rust/verify",\n    "rust/preprocess",\n    "wasm/tools/univariate-crs-chunker",\n]',
    'members = [\n    "common/interface",\n    "common/interface/univariate-crs",\n    "rust/libs",\n    "rust/prove",\n    "rust/verify",\n    "rust/preprocess",\n]',
  ]]);
  await rewriteFile(path.join(output, 'rust', 'libs', 'Cargo.toml'), [
    ['\ncriterion = "0.3"\n', '\n'],
  ]);
  await rewriteFile(path.join(output, 'rust', 'prove', 'Cargo.toml'), [[
    '\n[[test]]\nname = "timing"\npath = "optimization/tests/timing.rs"\n',
    '\n',
  ]]);

  await fs.mkdir(path.join(output, 'versioning'), { recursive: true });
  await fs.copyFile(
    path.join(repositoryRoot, 'versioning', 'compatibility.rs'),
    path.join(output, 'versioning', 'compatibility.rs'),
  );
  await rewriteFile(path.join(output, 'rust', 'build-support', 'subcircuit_library.rs'), [
    ['#[path = "../../../../versioning/compatibility.rs"]', '#[path = "../../versioning/compatibility.rs"]'],
    [
      '        if let Some(repository_root) = backend_root.parent().and_then(Path::parent) {\n            println!(\n                "cargo:rerun-if-changed={}",\n                repository_root\n                    .join("versioning")\n                    .join("compatibility.rs")\n                    .display()\n            );\n        }',
      '        println!(\n            "cargo:rerun-if-changed={}",\n            backend_root.join("versioning").join("compatibility.rs").display()\n        );',
    ],
  ]);
  await rewriteFile(path.join(output, 'rust', 'libs', 'src', 'lib.rs'), [[
    '#[path = "../../../../../versioning/compatibility.rs"]',
    '#[path = "../../../versioning/compatibility.rs"]',
  ]]);
  await rewriteFile(path.join(output, 'common', 'contracts', 'rust', 'backend_build_metadata.rs'), [[
    '#[path = "../../../../../versioning/compatibility.rs"]',
    '#[path = "../../../versioning/compatibility.rs"]',
  ]]);
}

async function normalizeRuntimeCargoLock(output) {
  await execFileAsync('cargo', ['metadata', '--format-version', '1'], { cwd: output });
  await execFileAsync('cargo', ['metadata', '--locked', '--format-version', '1', '--no-deps'], { cwd: output });
}

async function writeAndValidateProductManifest(output) {
  const files = (await listRegularFiles(output))
    .map((filePath) => path.relative(output, filePath).split(path.sep).join('/'))
    .filter((relativePath) => relativePath !== productManifestName)
    .sort();
  const manifest = { contractVersion: 1, files };
  await fs.writeFile(path.join(output, productManifestName), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const expected = new Set([...files, productManifestName]);
  const actual = new Set(
    (await listRegularFiles(output))
      .map((filePath) => path.relative(output, filePath).split(path.sep).join('/')),
  );
  if (actual.size !== expected.size || [...expected].some((file) => !actual.has(file))) {
    throw new Error('CLI backend product manifest does not describe the emitted file closure.');
  }
  if (files.some((file) => file.split('/').some((part) => excludedDirectoryNames.has(part)))) {
    throw new Error('CLI backend product contains an excluded backend directory.');
  }
}

async function main() {
  const output = parseOutputPath(process.argv.slice(2));
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  await fs.cp(backendRoot, output, {
    recursive: true,
    filter: (source) => source === backendRoot || shouldCopy(path.relative(backendRoot, source)),
  });
  await makeRuntimeOnlyWorkspace(output);
  await normalizeRuntimeCargoLock(output);
  await writeAndValidateProductManifest(output);
}

await main();
