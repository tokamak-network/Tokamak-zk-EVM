import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CircomConstMap, CircomKey, GlobalWireList, isNumber, isTupleNumber2, REQUIRED_CIRCOM_KEYS, SETUP_PARAMS_KEYS, SetupParams, SUBCIRCUIT_INFO_VALIDATORS, SubcircuitInfo, ValidatorMap } from './types.ts';
import { SubcircuitInfoByName, SubcircuitInfoByNameEntry, SubcircuitNames } from './configuredTypes.ts';

// -----------------------------------------------------------------------------
// Runtime shape assertions (fail fast with readable messages)
// -----------------------------------------------------------------------------
export function structCheckForGlobalWireList(x: unknown): asserts x is GlobalWireList {
  if (!Array.isArray(x) || x.some((e) => !isTupleNumber2(e))) {
    throw new Error('Invalid shape for globalWireList.json: expected [number, number][]');
  }
}

// -----------------------------------------------------------------------------
// Helpers: URL-based JSON loader + tiny runtime validators
// -----------------------------------------------------------------------------
export async function readJson(u: URL): Promise<unknown> {
  // Convert URL → filesystem path and parse JSON
  return JSON.parse(await readFile(fileURLToPath(u), 'utf8')) as unknown;
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
