import { BUFFER_LIST } from './configuredTypes.ts';
import { installedSubcircuitLibrary, installedSubcircuitLibraryData } from './installedLibrary.ts';

export const globalWireList = installedSubcircuitLibraryData.globalWireList;
export const setupParams = installedSubcircuitLibraryData.setupParams;
export const subcircuitInfo = installedSubcircuitLibraryData.subcircuitInfo;
export const subcircuitInfoByName = installedSubcircuitLibrary.subcircuitInfoByName;

export const SUBCIRCUIT_BUFFER_MAPPING = installedSubcircuitLibrary.subcircuitBufferMapping;
export const ACCUMULATOR_INPUT_LIMIT = installedSubcircuitLibrary.accumulatorInputLimit;
export const NUMBER_OF_PREV_BLOCK_HASHES = installedSubcircuitLibrary.numberOfPrevBlockHashes;
export const JUBJUB_EXP_BATCH_SIZE = installedSubcircuitLibrary.jubjubExpBatchSize;
export const ARITH_EXP_BATCH_SIZE = installedSubcircuitLibrary.arithExpBatchSize;
export const FIRST_ARITHMETIC_PLACEMENT_INDEX = BUFFER_LIST.length;
