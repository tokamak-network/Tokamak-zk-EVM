import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');
const outputPath = path.join(rootDir, 'src', 'subcircuit', 'bundled.generated.ts');

const setupParamsPath = require.resolve(
  '@tokamak-zk-evm/subcircuit-library/subcircuits/library/setupParams.json',
);
const libraryDir = path.dirname(setupParamsPath);
const subcircuitInfoPath = path.join(libraryDir, 'subcircuitInfo.json');
const subcircuitInfo = JSON.parse(
  await fs.readFile(subcircuitInfoPath, 'utf8'),
);

const wasmImports = subcircuitInfo
  .map(({ id }) =>
    `import wasm${id} from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit${id}.wasm';`,
  )
  .join('\n');

const wasmEntries = subcircuitInfo
  .map(({ id }) => `  ${id}: wasm${id},`)
  .join('\n');

const output = `import setupParamsJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/setupParams.json' with { type: 'json' };
import globalWireListJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/globalWireList.json' with { type: 'json' };
import frontendCfgJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/frontendCfg.json' with { type: 'json' };
import subcircuitInfoJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/subcircuitInfo.json' with { type: 'json' };
${wasmImports}

export {
  setupParamsJson,
  globalWireListJson,
  frontendCfgJson,
  subcircuitInfoJson,
};

export const wasmFiles: Record<number, Uint8Array> = {
${wasmEntries}
};
`;

await fs.writeFile(outputPath, output);
