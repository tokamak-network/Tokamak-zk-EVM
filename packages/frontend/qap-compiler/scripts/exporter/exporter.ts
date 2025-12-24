
// import { CircomConstMap, GlobalWireList, SetupParams, SubcircuitInfo } from './types.ts';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import { CircomConstMap, CircomKey, REQUIRED_CIRCOM_KEYS } from './types.ts';
// -----------------------------------------------------------------------------
// Circom constants: extract simple `function NAME(){ return <int>; }` pairs
// -----------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CIRCOM_PATH = path.resolve(__dirname, '../../subcircuits/circom/constants.circom')

// Remove line and block comments (coarse but adequate for constants file)
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
   .replace(/\/\/[^\n\r]*/g, '');   // line comments


// Match: function <name>() { return <digits>; }
const RE_FUNCTION_RETURN_INT = /function\s+([A-Za-z_]\w*)\s*\(\)\s*{\s*return\s+(\d+)\s*;\s*}/g;

export async function loadCircomConstants(): Promise<CircomConstMap> {
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

const main = async () => {
  const circomConsts: CircomConstMap = await loadCircomConstants();
  const frontendConfig = JSON.stringify(circomConsts, null, 2);
  const cfgPath = path.resolve(__dirname, '../../subcircuits/library/frontendCfg.json');
  const dir = path.dirname(cfgPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  try {
    fs.writeFileSync(cfgPath, frontendConfig, 'utf-8');
    console.log(`Success in writing '${cfgPath}'.`);
  } catch (error) {
    throw new Error(`Failure in writing '${cfgPath}'.`);
  }

}

void main()