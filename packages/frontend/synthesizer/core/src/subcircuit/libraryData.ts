import {
  FrontendConfig,
  BufferDirection,
  LogicalInterface,
  LogicalInterfacePort,
  LogicalInterfaceType,
  SetupParams,
  SubcircuitInfo,
  SubcircuitLibraryData,
} from './libraryTypes.ts';
import {
  SubcircuitInfoByName,
  SubcircuitInfoByNameEntry,
  SubcircuitNames,
  COMPOSITION_SUBCIRCUIT_LIST,
} from './configuredTypes.ts';
import {
  isNumber,
  isNumberArray,
  isObjectRecord,
  isSubcircuitName,
  isTupleNumber2,
  REQUIRED_CIRCOM_KEYS,
  SETUP_PARAMS_KEYS,
} from './libraryTypes.ts';
const getRequiredNumber = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];
  if (!isNumber(value)) {
    throw new Error(`Invalid numeric value for ${key}`);
  }
  return value;
};

const SETUP_PARAMS_ALLOWED_KEYS = [...SETUP_PARAMS_KEYS, 'publicWirePhases'] as const;
const SUBCIRCUIT_INFO_ALLOWED_KEYS = [
  'id',
  'name',
  'Nwires',
  'NrealWires',
  'Nconsts',
  'Out_idx',
  'In_idx',
  'Wiring_idx',
  'Public_idx',
  'Internal_idx',
  'bufferDirection',
  'publicPhase',
  'logicalInterface',
] as const;
const PUBLIC_WIRE_PHASE_ALLOWED_KEYS = ['name', 'region', 'subcircuitIds'] as const;

function requireOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Unexpected key in ${label}: ${key}`);
    }
  }
}

export function parseSetupParams(value: unknown): SetupParams {
  if (!isObjectRecord(value)) {
    throw new Error('Invalid shape for setupParams.json: expected object');
  }

  if (!SETUP_PARAMS_KEYS.every((key) => isNumber(value[key]))
    || !Array.isArray(value.publicWirePhases)) {
    throw new Error('Invalid values in setupParams.json: all keys must be finite numbers');
  }
  requireOnlyKeys(value, SETUP_PARAMS_ALLOWED_KEYS, 'setupParams.json');

  const publicWirePhases = value.publicWirePhases.map((phase) => {
    if (!isObjectRecord(phase) || typeof phase.name !== 'string'
      || (phase.region !== 'free' && phase.region !== 'fixed')
      || !isNumberArray(phase.subcircuitIds)) {
      throw new Error('Invalid public wire phase in setupParams.json');
    }
    requireOnlyKeys(phase, PUBLIC_WIRE_PHASE_ALLOWED_KEYS, 'setupParams.json public wire phase');
    return {
      name: phase.name,
      region: phase.region,
      subcircuitIds: [...phase.subcircuitIds],
    } as const;
  });
  return {
    n: getRequiredNumber(value, 'n'),
    m: getRequiredNumber(value, 'm'),
    m_b: getRequiredNumber(value, 'm_b'),
    t: getRequiredNumber(value, 't'),
    s: getRequiredNumber(value, 's'),
    publicWirePhases,
  };
}

export function parseFrontendConfig(value: unknown): FrontendConfig {
  if (!isObjectRecord(value)) {
    throw new Error('Invalid shape for frontendCfg.json: expected object');
  }

  if (!REQUIRED_CIRCOM_KEYS.every((key) => isNumber(value[key]))) {
    throw new Error('Invalid values in frontendCfg.json: all keys must be finite numbers');
  }

  for (const key of Object.keys(value)) {
    if (!REQUIRED_CIRCOM_KEYS.some((requiredKey) => requiredKey === key)) {
      throw new Error(`Unexpected key in frontendCfg.json: ${key}`);
    }
  }

  return {
    nTxIn: getRequiredNumber(value, 'nTxIn'),
    nStorageLoad: getRequiredNumber(value, 'nStorageLoad'),
    nLogOut: getRequiredNumber(value, 'nLogOut'),
    nStorageStore: getRequiredNumber(value, 'nStorageStore'),
    nBlockIn: getRequiredNumber(value, 'nBlockIn'),
    nPrvIn: getRequiredNumber(value, 'nPrvIn'),
    nEVMIn: getRequiredNumber(value, 'nEVMIn'),
    nPrivateMessageInputs: getRequiredNumber(value, 'nPrivateMessageInputs'),
    nPoseidonInputs: getRequiredNumber(value, 'nPoseidonInputs'),
    nPoseidonBatch: getRequiredNumber(value, 'nPoseidonBatch'),
    nPrevBlockHashes: getRequiredNumber(value, 'nPrevBlockHashes'),
  };
}

export function parseSubcircuitInfo(value: unknown): SubcircuitInfo {
  if (!Array.isArray(value)) {
    throw new Error('Invalid shape for subcircuitInfo.json: expected array');
  }

  return value.map((entry) => {
    if (!isObjectRecord(entry)) {
      throw new Error('Invalid item in subcircuitInfo.json: expected object');
    }
    requireOnlyKeys(entry, SUBCIRCUIT_INFO_ALLOWED_KEYS, 'subcircuitInfo.json');

    const id = entry.id;
    const name = entry.name;
    const nWires = entry.Nwires;
    const nRealWires = entry.NrealWires;
    const nConsts = entry.Nconsts;
    const outIdx = entry.Out_idx;
    const inIdx = entry.In_idx;
    const wiringIdx = entry.Wiring_idx;
    const publicIdx = entry.Public_idx;
    const internalIdx = entry.Internal_idx;
    const logicalInterface = entry.logicalInterface;
    const bufferDirection = entry.bufferDirection;
    const publicPhase = entry.publicPhase;

    if (!isNumber(id)) throw new Error('Invalid field in subcircuitInfo.json: id');
    if (!isSubcircuitName(name)) throw new Error('Invalid field in subcircuitInfo.json: name');
    if (!isNumber(nWires)) throw new Error('Invalid field in subcircuitInfo.json: Nwires');
    if (!isNumber(nRealWires)) throw new Error('Invalid field in subcircuitInfo.json: NrealWires');
    if (!isNumber(nConsts)) throw new Error('Invalid field in subcircuitInfo.json: Nconsts');
    if (!isTupleNumber2(outIdx)) throw new Error('Invalid field in subcircuitInfo.json: Out_idx');
    if (!isTupleNumber2(inIdx)) throw new Error('Invalid field in subcircuitInfo.json: In_idx');
    if (!isTupleNumber2(wiringIdx)) throw new Error('Invalid field in subcircuitInfo.json: Wiring_idx');
    if (!isTupleNumber2(publicIdx)) throw new Error('Invalid field in subcircuitInfo.json: Public_idx');
    if (!isTupleNumber2(internalIdx)) throw new Error('Invalid field in subcircuitInfo.json: Internal_idx');
    if (publicPhase !== undefined && typeof publicPhase !== 'string') {
      throw new Error('Invalid field in subcircuitInfo.json: publicPhase');
    }

    const isCompositionSubcircuit = (COMPOSITION_SUBCIRCUIT_LIST as readonly string[])
      .includes(name);
    if (isCompositionSubcircuit && logicalInterface === undefined) {
      throw new Error(`Invalid field in subcircuitInfo.json: ${name} logicalInterface is required`);
    }
    if (isCompositionSubcircuit) {
      if (bufferDirection !== undefined) {
        throw new Error(`Invalid field in subcircuitInfo.json: ${name} subcircuit must not define bufferDirection`);
      }
    } else {
      if (logicalInterface !== undefined) {
        throw new Error(`Invalid field in subcircuitInfo.json: ${name} buffer must not define logicalInterface`);
      }
      if (bufferDirection !== 'in' && bufferDirection !== 'out') {
        throw new Error(`Invalid field in subcircuitInfo.json: ${name} buffer must define bufferDirection`);
      }
    }

    return {
      id,
      name,
      Nwires: nWires,
      NrealWires: nRealWires,
      Nconsts: nConsts,
      Out_idx: [outIdx[0], outIdx[1]],
      In_idx: [inIdx[0], inIdx[1]],
      Wiring_idx: [wiringIdx[0], wiringIdx[1]],
      Public_idx: [publicIdx[0], publicIdx[1]],
      Internal_idx: [internalIdx[0], internalIdx[1]],
      ...(logicalInterface === undefined
        ? {}
        : { logicalInterface: parseLogicalInterface(logicalInterface) }),
      ...(bufferDirection === undefined
        ? {}
        : { bufferDirection: bufferDirection as BufferDirection }),
      ...(publicPhase === undefined
        ? {}
        : { publicPhase }),
    };
  });
}

function parseLogicalInterfaceType(value: unknown): LogicalInterfaceType {
  if (!isObjectRecord(value) || typeof value.kind !== 'string') {
    throw new Error('Invalid logical interface type');
  }
  switch (value.kind) {
    case 'uint':
      if (!isNumber(value.bits) || !Number.isInteger(value.bits) || value.bits < 1 || value.bits > 256) {
        throw new Error('Invalid logical interface uint width');
      }
      return { kind: 'uint', bits: value.bits };
    case 'bls12-381-fr':
      return { kind: 'bls12-381-fr' };
    case 'jubjub-scalar':
      return { kind: 'jubjub-scalar' };
    default:
      throw new Error(`Unsupported logical interface type: ${value.kind}`);
  }
}

function parseLogicalInterfacePort(value: unknown): LogicalInterfacePort {
  if (!isObjectRecord(value) || typeof value.name !== 'string' || value.name.length === 0) {
    throw new Error('Invalid logical interface port');
  }
  return {
    name: value.name,
    logicalType: parseLogicalInterfaceType(value.logicalType),
  };
}

function parseLogicalInterface(value: unknown): LogicalInterface {
  if (!isObjectRecord(value) || !Array.isArray(value.inputs) || !Array.isArray(value.outputs)) {
    throw new Error('Invalid logical interface');
  }
  return {
    inputs: value.inputs.map(parseLogicalInterfacePort),
    outputs: value.outputs.map(parseLogicalInterfacePort),
  };
}

export function parseSubcircuitLibraryData(input: {
  setupParams: unknown;
  frontendCfg: unknown;
  subcircuitInfo: unknown;
}): SubcircuitLibraryData {
  const data = {
    setupParams: parseSetupParams(input.setupParams),
    frontendCfg: parseFrontendConfig(input.frontendCfg),
    subcircuitInfo: parseSubcircuitInfo(input.subcircuitInfo),
  };
  validateNormalizedLibraryLayout(data);
  return data;
}

function validateNormalizedLibraryLayout(data: SubcircuitLibraryData): void {
  const { setupParams, subcircuitInfo } = data;
  for (const [name, value] of Object.entries(setupParams).filter(([key]) => key !== 'publicWirePhases')) {
    if (!Number.isSafeInteger(value) || (value as number) < 1) {
      throw new Error(`Invalid setup capacity ${name}`);
    }
  }
  if (setupParams.m_b > setupParams.m || subcircuitInfo.length >= setupParams.t) {
    throw new Error('Subcircuit library exceeds its normalized capacities');
  }

  const publicOwnerById = new Map<number, string>();
  for (const phase of setupParams.publicWirePhases) {
    for (const subcircuitId of phase.subcircuitIds) {
      if (!Number.isSafeInteger(subcircuitId) || publicOwnerById.has(subcircuitId)) {
        throw new Error('Public subcircuit IDs must be unique safe integers');
      }
      publicOwnerById.set(subcircuitId, phase.name);
    }
  }

  for (const [expectedId, entry] of subcircuitInfo.entries()) {
    const [outputStart, outputCount] = entry.Out_idx;
    const [inputStart, inputCount] = entry.In_idx;
    const [wiringStart, wiringCount] = entry.Wiring_idx;
    const [publicStart, publicCount] = entry.Public_idx;
    const [internalStart, internalCount] = entry.Internal_idx;
    if (entry.id !== expectedId || entry.Nwires !== setupParams.m) {
      throw new Error(`Subcircuit ${entry.name} does not use the normalized catalog coordinates`);
    }
    if (
      outputStart !== 1
      || inputStart !== outputStart + outputCount
      || wiringStart !== 0
      || wiringCount !== 1 + outputCount + inputCount
      || wiringCount > setupParams.m_b
      || internalStart !== setupParams.m_b
      || internalStart + internalCount > setupParams.m
      || entry.NrealWires !== wiringCount + internalCount
    ) {
      throw new Error(`Subcircuit ${entry.name} has inconsistent normalized wire ranges`);
    }
    const publicIsInput = publicStart === inputStart && publicCount === inputCount && publicCount > 0;
    const publicIsOutput = publicStart === outputStart && publicCount === outputCount && publicCount > 0;
    if (publicCount > 0 && !publicIsInput && !publicIsOutput) {
      throw new Error(`Subcircuit ${entry.name} has an invalid public wire range`);
    }
    const declaredPhase = publicOwnerById.get(entry.id);
    if ((entry.publicPhase ?? undefined) !== declaredPhase || (publicCount > 0) !== (declaredPhase !== undefined)) {
      throw new Error(`Subcircuit ${entry.name} has inconsistent public phase metadata`);
    }
    if (publicIsInput && entry.bufferDirection !== 'in') {
      throw new Error(`Public input subcircuit ${entry.name} has the wrong buffer direction`);
    }
    if (publicIsOutput && entry.bufferDirection !== 'out') {
      throw new Error(`Public output subcircuit ${entry.name} has the wrong buffer direction`);
    }
  }
  for (const subcircuitId of publicOwnerById.keys()) {
    if (subcircuitId >= subcircuitInfo.length) {
      throw new Error(`Public phase references unavailable subcircuit ID ${subcircuitId}`);
    }
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
      NRealWires: subcircuit.NrealWires,
      NInWires: subcircuit.In_idx[1],
      NOutWires: subcircuit.Out_idx[1],
      inWireIndex: subcircuit.In_idx[0],
      outWireIndex: subcircuit.Out_idx[0],
      wiringRange: subcircuit.Wiring_idx,
      publicRange: subcircuit.Public_idx,
      internalRange: subcircuit.Internal_idx,
      logicalInterface: subcircuit.logicalInterface,
      bufferDirection: subcircuit.bufferDirection,
      publicPhase: subcircuit.publicPhase,
    };

    subcircuitInfoByName.set(subcircuit.name, entryObject);
  }

  return subcircuitInfoByName;
}
