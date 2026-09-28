import type { LogicalInterfaceType } from '../../subcircuit/libraryTypes.ts';

export const BIT_DATA_PT_TYPE = 'bit';
export const UINT32_DATA_PT_TYPE = 'uint32';
export const UINT128_DATA_PT_TYPE = 'uint128';
export const UINT160_DATA_PT_TYPE = 'uint160';
export const UINT256_DATA_PT_TYPE = 'uint256';
export const BLS12_381_FR_DATA_PT_TYPE = 'bls12-381-fr';
export const JUBJUB_SCALAR_DATA_PT_TYPE = 'jubjub-scalar';

export const DATA_PT_TYPE_LIST = [
  BIT_DATA_PT_TYPE,
  UINT32_DATA_PT_TYPE,
  UINT128_DATA_PT_TYPE,
  UINT160_DATA_PT_TYPE,
  UINT256_DATA_PT_TYPE,
  BLS12_381_FR_DATA_PT_TYPE,
  JUBJUB_SCALAR_DATA_PT_TYPE,
] as const;

export type DataPtType = (typeof DATA_PT_TYPE_LIST)[number];

export function isDataPtType(value: unknown): value is DataPtType {
  return (DATA_PT_TYPE_LIST as readonly unknown[]).includes(value);
}

export function getDataPtWireCount(dataPtType: DataPtType): 1 | 2 {
  switch (dataPtType) {
    case BIT_DATA_PT_TYPE:
    case UINT32_DATA_PT_TYPE:
    case UINT128_DATA_PT_TYPE:
    case UINT160_DATA_PT_TYPE:
    case BLS12_381_FR_DATA_PT_TYPE:
    case JUBJUB_SCALAR_DATA_PT_TYPE:
      return 1;
    case UINT256_DATA_PT_TYPE:
      return 2;
  }
}

export function getDataPtTypeFromLogicalInterfaceType(
  logicalType: LogicalInterfaceType,
): DataPtType {
  switch (logicalType.kind) {
    case 'uint':
      if (logicalType.bits === 1) return BIT_DATA_PT_TYPE;
      if (logicalType.bits <= 32) return UINT32_DATA_PT_TYPE;
      if (logicalType.bits <= 128) return UINT128_DATA_PT_TYPE;
      if (logicalType.bits <= 160) return UINT160_DATA_PT_TYPE;
      return UINT256_DATA_PT_TYPE;
    case 'bls12-381-fr':
      return BLS12_381_FR_DATA_PT_TYPE;
    case 'jubjub-scalar':
      return JUBJUB_SCALAR_DATA_PT_TYPE;
  }
}

export type DataPtDescription = {
  // if data comes from external
  extSource?: string;
  // if data is provided to external
  extDest?: string;

  // placement index at which the dataPt comes from
  source: number;
  // wire index at which the dataPt comes from
  wireIndex: number;

  readonly dataPtType: DataPtType;
};
export type DataPt = DataPtDescription & { value: bigint; valueHex: string };

/** Derived memory-view geometry reported by MemoryPt before symbolic inputs are created. */
export type DataAliasGeometryEntry = Readonly<{
  dataPt: DataPt;
  /** Absolute byte shift encoded for MemoryViewStep. */
  shiftMagnitude: number;
  /** Zero selects a left shift; one selects a right shift. */
  direction: 0 | 1;
  /** One bit per output byte, consumed by MemoryViewStep. */
  ownershipMask: bigint;
}>;
export type DataAliasGeometries = readonly DataAliasGeometryEntry[];

/**
 * Structure representing memory information.
 * @property {number} memOffset - Memory offset
 * @property {number} containerSize - Container size
 * @property {DataPt} dataPt - Data pointer
 */
export type MemoryPtEntry = { memByteOffset: number; containerByteSize: number; dataPt: DataPt };

/**
 * Array of memory information. Lower indices represent older memory information.
 */
export type MemoryPts = MemoryPtEntry[];

export type StorageCacheEntry = {
  canonicalAddressPt: DataPt;
  canonicalKeyPt: DataPt;
  latestValuePt: DataPt;
  dirty: boolean;
};

export type StorageCacheEntries = Map<bigint, Map<bigint, StorageCacheEntry>>;
