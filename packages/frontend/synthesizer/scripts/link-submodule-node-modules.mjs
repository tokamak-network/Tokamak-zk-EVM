import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const packageNodeModules = path.join(packageRoot, 'node_modules');
const sharedNodeModulesLink = path.resolve(packageRoot, '../../../submodules/node_modules');

if (!fs.existsSync(packageNodeModules)) {
  process.exit(0);
}

fs.mkdirSync(path.dirname(sharedNodeModulesLink), { recursive: true });

if (fs.existsSync(sharedNodeModulesLink)) {
  try {
    const stat = fs.lstatSync(sharedNodeModulesLink);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      fs.rmSync(sharedNodeModulesLink, { recursive: true, force: true });
    } else {
      throw new Error(`Refusing to replace non-directory path at ${sharedNodeModulesLink}.`);
    }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

fs.symlinkSync(packageNodeModules, sharedNodeModulesLink, 'junction');
