import { SubcircuitNames } from "./subcircuits.js";
import { DataPt, DataPtDescription } from "./synthesizer.js";

export type BufferPlacement = {
    name: SubcircuitNames;
    usage: string;
    inPts: DataPt[];
    outPts: DataPt[];
};

export type ReservedBuffer = 
    | 'PUB_OUT'
    | 'PUB_IN'
    | 'STATIC_IN'
    | 'TRANSACTION_IN'
    | 'STORAGE'

export type ReservedVariable =
    | 'RES_MERKLE_ROOT'
    | 'INI_MERKLE_ROOT'
    | 'EDDSA_PUBLIC_KEY_X'
    | 'EDDSA_PUBLIC_KEY_Y'
    | 'EDDSA_SIGNATURE'
    | 'EDDSA_RANDOMIZER_X'
    | 'EDDSA_RANDOMIZER_Y'
    | 'ADDRESS_MASK'
    | 'JUBJUB_BASE_X'
    | 'JUBJUB_BASE_Y'
    | 'JUBJUB_POI_X'
    | 'JUBJUB_POI_Y'
    | 'TRANSACTION_NONCE'
    | 'CONTRACT_ADDRESS'
    | 'FUNCTION_SELECTOR'
    | 'TRANSACTION_INPUT0'
    | 'TRANSACTION_INPUT1'
    | 'TRANSACTION_INPUT2'
    | 'TRANSACTION_INPUT3'
    | 'TRANSACTION_INPUT4'
    | 'TRANSACTION_INPUT5'
    | 'TRANSACTION_INPUT6'
    | 'TRANSACTION_INPUT7'
    | 'TRANSACTION_INPUT8'


export const BUFFER_PLACEMENT: Record<ReservedBuffer, {placementIndex: number, placement: BufferPlacement}> = {
  PUB_OUT: {
    placementIndex: 0,
    placement: {
      name: 'bufferPubOut' as SubcircuitNames,
      usage: 'Buffer to emit public output',
      inPts: [] as DataPt[],
      outPts: [] as DataPt[],
    }
  },
  PUB_IN: {
    placementIndex: 1,
    placement: {
      name: 'bufferPubIn' as SubcircuitNames,
      usage: 'Buffer to load public input',
      inPts: [] as DataPt[],
      outPts: [] as DataPt[],
    }
  },
  STATIC_IN: {
    placementIndex: 2, 
    placement: {
      name: 'bufferStaticIn' as SubcircuitNames,
      usage: 'Buffer to load public static input such as ROM, environmental data, or ALU selectors',
      inPts: [] as DataPt[],
      outPts: [] as DataPt[],
    }
  },
  TRANSACTION_IN: {
    placementIndex: 3,
    placement: {
      name: 'bufferTransactionIn' as SubcircuitNames,
      usage: 'Buffer to load transactions as private',
      inPts: [] as DataPt[],
      outPts: [] as DataPt[],
    }
  },
  STORAGE: {
    placementIndex: 4,
    placement: {
      name: 'bufferStorageIn' as SubcircuitNames,
      usage: 'Buffer to load initial storage data',
      inPts: [] as DataPt[],
      outPts: [] as DataPt[],
    }
  },
}

export const VARIABLE_DESCRIPTION: Record<ReservedVariable, DataPtDescription> = {
  RES_MERKLE_ROOT: {
    extDest: `Resulting Merkle tree root hash`,
    source: BUFFER_PLACEMENT.PUB_OUT.placementIndex,
    sourceSize: 255,
    wireIndex: 0,
  },

  INI_MERKLE_ROOT: {
    extSource: `Initial Merkle tree root hash`,
    source: BUFFER_PLACEMENT.PUB_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 0,
  },
  EDDSA_PUBLIC_KEY_X: {
    extSource: `EdDSA public key of caller (x coordinate)`,
    source: BUFFER_PLACEMENT.PUB_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 1,
  },
  EDDSA_PUBLIC_KEY_Y: {
    extSource: `EdDSA public key of caller (y coordinate)`,
    source: BUFFER_PLACEMENT.PUB_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 2,
  },
  EDDSA_SIGNATURE: {
    extSource: `EdDSA signature of transaction`,
    source: BUFFER_PLACEMENT.PUB_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 3,
  },
  EDDSA_RANDOMIZER_X: {
    extSource: `EdDSA randomizer (x coordinate)`,
    source: BUFFER_PLACEMENT.PUB_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 4,
  },
  EDDSA_RANDOMIZER_Y: {
    extSource: `EdDSA randomizer (y coordinate)`,
    source: BUFFER_PLACEMENT.PUB_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 5,
  },

  ADDRESS_MASK: {
    extSource: `Masker for Ethereum address (20 bytes)`,
    source: BUFFER_PLACEMENT.STATIC_IN.placementIndex,
    sourceSize: 160,
    wireIndex: 0,
  },
  JUBJUB_BASE_X: {
    extSource: `Base point of Jubjub curve (x coordinate)`,
    source: BUFFER_PLACEMENT.STATIC_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 1,
  },
  JUBJUB_BASE_Y: {
    extSource: `Base point of Jubjub curve (y coordinate)`,
    source: BUFFER_PLACEMENT.STATIC_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 2,
  },
  JUBJUB_POI_X: {
    extSource: `Point at infinity of Jubjub curve (x coordinate)`,
    source: BUFFER_PLACEMENT.STATIC_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 3,
  },
  JUBJUB_POI_Y: {
    extSource: `Point at infinity of Jubjub curve (y coordinate)`,
    source: BUFFER_PLACEMENT.STATIC_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 4,
  },

  TRANSACTION_NONCE: {
    extSource: `Transaction nonce`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 0,
  },
  CONTRACT_ADDRESS: {
    extSource: `Contract address to call`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 160,
    wireIndex: 1,
  },
  FUNCTION_SELECTOR: {
    extSource: `Selector for a function to call`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 32,
    wireIndex: 2,
  },
  TRANSACTION_INPUT0: {
    extSource: `Zeroth input to the selected function`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 3,
  },
  TRANSACTION_INPUT1: {
    extSource: `First input to the selected function`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 4,
  },
  TRANSACTION_INPUT2: {
    extSource: `Second input to the selected function`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 5,
  },
  TRANSACTION_INPUT3: {
    extSource: `Third input to the selected function`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 6,
  },
  TRANSACTION_INPUT4: {
    extSource: `Fourth input to the selected function`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 7,
  },
  TRANSACTION_INPUT5: {
    extSource: `Fifth input to the selected function`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 8,
  },
  TRANSACTION_INPUT6: {
    extSource: `Sixth input to the selected function`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 9,
  },
  TRANSACTION_INPUT7: {
    extSource: `Seventh input to the selected function`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 10,
  },
  TRANSACTION_INPUT8: {
    extSource: `Eighth input to the selected function`,
    source: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex,
    sourceSize: 255,
    wireIndex: 11,
  },
}
