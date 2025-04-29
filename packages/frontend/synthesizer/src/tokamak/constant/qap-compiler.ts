// For user interface
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';
import {
  subcircuits as subcircuitsFromNPM,
  globalWireList as globalWireListFromNPM,
  setupParams as setupParamsFromNPM,
} from '@tokamak-zk-evm/qap-compiler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to check if we are in a specific monorepo environment
// Check if we are in a specific monorepo environment
const isMonorepo = () => {
  const packageJsonPath = path.join(__dirname, '../../../../package.json');

  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.name === 'tokamak-zk-evm-monorepo'; // Replace with your actual monorepo name
  }

  return false;
};

// Export the appropriate variables based on the environment
let subcircuits, globalWireList, setupParams;

if (isMonorepo()) {
  // Import from local path in monorepo
  subcircuits = (
    await import(
      pathToFileURL(
        path.join(
          __dirname,
          '../../../../qap-compiler/subcircuits/library/subcircuitInfo.js',
        ),
      ).href
    )
  ).subcircuits;
  globalWireList = (
    await import(
      pathToFileURL(
        path.join(
          __dirname,
          '../../../../qap-compiler/subcircuits/library/globalWireList.js',
        ),
      ).href
    )
  ).globalWireList;
  setupParams = (
    await import(
      pathToFileURL(
        path.join(
          __dirname,
          '../../../../qap-compiler/subcircuits/library/setupParams.js',
        ),
      ).href
    )
  ).setupParams;
}
// Use the imported variables from npm package
subcircuits = subcircuitsFromNPM;
globalWireList = globalWireListFromNPM;
setupParams = setupParamsFromNPM;

// Export the selected variables
export { subcircuits, globalWireList, setupParams };

export const wasmDir = isMonorepo()
  ? path.join(__dirname, '../../../../qap-compiler/subcircuits/library/wasm') // Path for monorepo
  : path.join(
      __dirname,
      '../../../node_modules/@tokamak-zk-evm/qap-compiler/dist/wasm',
    ); // Path for non-monorepo
