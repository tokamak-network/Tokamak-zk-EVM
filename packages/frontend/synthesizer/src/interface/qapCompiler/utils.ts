import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CircomConstMap, CircomKey, GlobalWireList, isNumber, isTupleNumber2, REQUIRED_CIRCOM_KEYS, SETUP_PARAMS_KEYS, SetupParams, SUBCIRCUIT_INFO_VALIDATORS, SubcircuitInfo, ValidatorMap } from './types.ts';
import { SUBCIRCUIT_LIST, SubcircuitInfoByName, SubcircuitInfoByNameEntry, SubcircuitNames } from './configuredTypes.ts';


// -----------------------------------------------------------------------------
// Base location (ESM-friendly): resolve everything relative to this module
// When running as a Bun binary, use the executable's directory
// -----------------------------------------------------------------------------
function getBaseURL(): URL {
  // Check if running as a Bun compiled binary
  if ((process as any).isBun && (process as any).execPath) {
    // Running as binary: use executable's parent directory
    // e.g., /path/to/dist/macOS/bin/synthesizer -> /path/to/dist/macOS/
    const execPath = (process as any).execPath as string;
    const execDir = fileURLToPath(new URL('.', `file://${execPath}`));
    // Go up one level from bin/ to get to the base directory
    return new URL('../resource/qap-compiler/', `file://${execDir}`);
  }

  // Development mode: use import.meta.url
  return new URL('../../../../qap-compiler/', import.meta.url);
}

export const BASE_URL = getBaseURL();

// -----------------------------------------------------------------------------
// Helpers: URL-based JSON loader + tiny runtime validators
// -----------------------------------------------------------------------------
export async function readJson(u: URL): Promise<unknown> {
  // Convert URL → filesystem path and parse JSON
  return JSON.parse(await readFile(fileURLToPath(u), 'utf8')) as unknown;
}

// -----------------------------------------------------------------------------
// Runtime shape assertions (fail fast with readable messages)
// -----------------------------------------------------------------------------
export function structCheckForGlobalWireList(x: unknown): asserts x is GlobalWireList {
  if (!Array.isArray(x) || x.some((e) => !isTupleNumber2(e))) {
    throw new Error('Invalid shape for globalWireList.json: expected [number, number][]');
  }
}

export function structCheckForSetupParams(x: unknown): asserts x is SetupParams {
  if (typeof x !== 'object' || x === null) throw new Error('Invalid shape for setupParams.json: expected object');
  const o = x as Record<string, unknown>;
  if (!SETUP_PARAMS_KEYS.every((k) => isNumber(o[k]))) {
    throw new Error('Invalid values in setupParams.json: all keys must be finite numbers');
  }
  // Optional strictness: reject unknown keys
  // for (const k of Object.keys(o)) {
  //   if (!SETUP_PARAMS_KEYS.includes(k as (typeof SETUP_PARAMS_KEYS)[number])) {
  //     throw new Error(`Unexpected key in setupParams.json: ${k}`);
  //   }
  // }
}

export function structCheckForSubcircuitInfo(x: unknown): asserts x is SubcircuitInfo {
  if (!Array.isArray(x)) throw new Error('Invalid shape for subcircuitInfo.json: expected array');
  for (const e of x) {
    if (typeof e !== 'object' || e === null) throw new Error('Invalid item in subcircuitInfo.json: expected object');
    const o = e as Record<string, unknown>;
    for (const k in SUBCIRCUIT_INFO_VALIDATORS) {
      const check = SUBCIRCUIT_INFO_VALIDATORS[k as keyof ValidatorMap] as (v: unknown) => boolean;
      if (!check(o[k])) throw new Error(`Invalid field in subcircuitInfo.json: ${k}`);
    }
    // Optional strictness: reject unknown keys
    // for (const key of Object.keys(o)) {
    //   if (!(key in SUBCIRCUIT_INFO_VALIDATORS)) {
    //     throw new Error(`Unexpected key in subcircuitInfo.json: ${key}`);
    //   }
    // }
  }
}

export function createInfoByName(subcircuitInfo: SubcircuitInfo): SubcircuitInfoByName {
  const subcircuitInfoByName = new Map<
    SubcircuitNames,
    SubcircuitInfoByNameEntry
  >();

  for (const subcircuit of subcircuitInfo) {
    const entryObject: SubcircuitInfoByNameEntry = {
      id: subcircuit.id,
      name: subcircuit.name,
      NWires: subcircuit.Nwires,
      NInWires: subcircuit.In_idx[1],
      NOutWires: subcircuit.Out_idx[1],
      inWireIndex: subcircuit.In_idx[0],
      outWireIndex: subcircuit.Out_idx[0],
      flattenMap: subcircuit.flattenMap,
    };

    subcircuitInfoByName.set(subcircuit.name as SubcircuitNames, entryObject);
  }

  return subcircuitInfoByName;
}

// -----------------------------------------------------------------------------
// Circom constants: extract simple `function NAME(){ return <int>; }` pairs
// -----------------------------------------------------------------------------
const CIRCOM_URL = new URL('scripts/constants.circom', BASE_URL);
const CIRCOM_PATH = fileURLToPath(CIRCOM_URL);

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
