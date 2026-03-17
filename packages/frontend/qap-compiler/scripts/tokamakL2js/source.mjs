import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const paramsSourcePath = path.resolve(__dirname, '../../vendor/TokamakL2JS/src/interface/params/index.ts');

const extractIntegerConstant = (source, constantName) => {
  const pattern = new RegExp(`export const ${constantName} = (\\d+);`);
  const match = source.match(pattern);
  if (match === null) {
    throw new Error(`Failed to resolve ${constantName} from ${paramsSourcePath}.`);
  }

  return Number.parseInt(match[1], 10);
};

export const loadTokamakL2JsConstants = () => {
  // Keep the TokamakL2JS reference isolated here.
  // When qap-compiler switches back to the published `tokamak-l2js` package,
  // update this loader instead of touching compile scripts.
  const source = fs.readFileSync(paramsSourcePath, 'utf8');

  return {
    POSEIDON_INPUTS: extractIntegerConstant(source, 'POSEIDON_INPUTS'),
    MT_DEPTH: extractIntegerConstant(source, 'MT_DEPTH'),
  };
};
