import { readFile } from 'fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'url';

// Required Circom constants (qap-compiler/scripts/constants.circom)
const REQUIRED_CIRCOM_KEYS = [
  'nPubIn',
  'nPubOut',
  'nPrvIn',
  'nEVMIn',
  'nPoseidonInputs',
  'nMtDepth',
  'nAccumulation',
  'nPrevBlockHashes',
  'nJubjubExpBatch',
  'nSubExpBatch',
] as const;
type CircomKey = typeof REQUIRED_CIRCOM_KEYS[number];

type CircomConstMap = Record<CircomKey, number>;

// -----------------------------------------------------------------------------
// Circom constants: extract simple `function NAME(){ return <int>; }` pairs
// -----------------------------------------------------------------------------
const require = createRequire(import.meta.url);
const PACKAGE_BASE_PATH = require.resolve('@tokamak-zk-evm/qap-compiler/package.json'); // absolute path to package.json
const PACKAGE_BASE_URL = pathToFileURL(PACKAGE_BASE_PATH); // absolute URL of qap-compiler package root
const CIRCOM_URL = new URL('src/scripts/constants.circom', PACKAGE_BASE_URL);
const CIRCOM_PATH = fileURLToPath(CIRCOM_URL);

// Remove line and block comments (coarse but adequate for constants file)
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
   .replace(/\/\/[^\n\r]*/g, '');   // line comments


// Match: function <name>() { return <digits>; }
const RE_FUNCTION_RETURN_INT = /function\s+([A-Za-z_]\w*)\s*\(\)\s*{\s*return\s+(\d+)\s*;\s*}/g;

async function loadCircomConstants(): Promise<CircomConstMap> {
  const src = await readFile(CIRCOM_PATH, 'utf8');
  const text = stripComments(src);

  // Collect only the required keys; ignore other functions
  const found: Partial<Record<CircomKey, number>> = {};
  let m: RegExpExecArray | null;
  while ((m = RE_FUNCTION_RETURN_INT.exec(text)) !== null) {
    const [, name, valueStr] = m;
    if ((REQUIRED_CIRCOM_KEYS as readonly string[]).includes(name)) {
      const k = name as CircomKey;
      if (found[k] !== undefined) {
        throw new Error(`Duplicate circom constant: ${k}`);
      }
      const v = Number(valueStr);
      if (!Number.isFinite(v)) {
        throw new Error(`Non-finite value for circom constant ${k}: ${valueStr}`);
      }
      found[k] = v;
    }
  }

  // Ensure all required constants are present
  for (const k of REQUIRED_CIRCOM_KEYS) {
    if (found[k] === undefined) {
      throw new Error(`Missing circom constant: ${k}`);
    }
  }

  return found as CircomConstMap;
}

// Input parameters to the QAP-compiler
const qapCompilerParams = await loadCircomConstants() as CircomConstMap
export const ACCUMULATOR_INPUT_LIMIT = qapCompilerParams.nAccumulation
// export const MAX_TX_NUMBER = qapCompilerParams.nTx
export const MT_DEPTH = qapCompilerParams.nMtDepth
export const POSEIDON_INPUTS = qapCompilerParams.nPoseidonInputs
export const MAX_MT_LEAVES = POSEIDON_INPUTS ** MT_DEPTH
export const NUMBER_OF_PREV_BLOCK_HASHES = qapCompilerParams.nPrevBlockHashes
export const JUBJUB_EXP_BATCH_SIZE = qapCompilerParams.nJubjubExpBatch
export const ARITH_EXP_BATCH_SIZE = qapCompilerParams.nSubExpBatch
