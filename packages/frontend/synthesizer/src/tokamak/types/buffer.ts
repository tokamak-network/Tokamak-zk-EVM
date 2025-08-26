import { SubcircuitNames } from "./subcircuits.js";
import { DataPt } from "./synthesizer.js";

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
    | 'STORAGE_IN'

export type ReservedVariable =
    | 'RES_MERKLE_ROOT'
    | 'INI_MERKLE_ROOT'
    | 'EDDSA_PUBLIC_KEY_X'
    | 'EDDSA_PUBLIC_KEY_Y'
    | 'EDDSA_SIGNATURE'
    | 'EDDSA_RANDOMIZER_X'
    | 'EDDSA_RANDOMIZER_Y'
    | 'ZERO'
    | 'ONE'
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
