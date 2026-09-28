import {
  BLS12_381_FR_DATA_PT_TYPE,
  BIT_DATA_PT_TYPE,
  type DataPtDescription,
  type DataPtType,
  JUBJUB_SCALAR_DATA_PT_TYPE,
  UINT160_DATA_PT_TYPE,
  UINT256_DATA_PT_TYPE,
  UINT32_DATA_PT_TYPE,
} from './dataStructure.ts'
import {
  BUFFER_LIST,
  ReservedBuffer,
  type TransactionInputVariable,
} from '../../subcircuit/configuredTypes.ts';

const LOG_OUT_VARIABLES_STATIC = [
  // Nothing
] as const
const LOG_OUT_VARIABLES_DYNAMIC = [
  'LOG_TOPIC',
  'LOG_VALUE',
] as const
const STORAGE_STORE_VARIABLES_STATIC = [
  // Nothing
] as const
const STORAGE_STORE_VARIABLES_DYNAMIC = [
  'SSTORE_ADDRESS',
  'SSTORE_KEY',
  'SSTORE_VALUE',
] as const
const TX_IN_VARIABLES_STATIC = [
  'EDDSA_SIGNATURE',  // For debugging. Can be moved to PRIVATE_IN buffer
  'CONTRACT_ADDRESS',    
  'FUNCTION_SELECTOR',   
  'CHANNEL_TX_INDEX',
] as const
const TX_IN_VARIABLES_DYNAMIC = [
  // Nothing
] as const
const STORAGE_LOAD_VARIABLES_STATIC = [
  // Nothing
] as const
const STORAGE_LOAD_VARIABLES_DYNAMIC = [
  'SLOAD_ADDRESS',
  'SLOAD_KEY',
  'SLOAD_VALUE',
] as const
const BLOCK_IN_VARIABLES_STATIC = [
  'COINBASE',
  'TIMESTAMP',
  'NUMBER',
  'PREVRANDAO',
  'GASLIMIT',
  'CHAINID',
  'SELFBALANCE',
  'BASEFEE',

  'BLOCKHASH_1',
  'BLOCKHASH_2',
  'BLOCKHASH_3',
  'BLOCKHASH_4',
  'BLOCKHASH_5',
  'BLOCKHASH_6',
  'BLOCKHASH_7',
  'BLOCKHASH_8',
  'BLOCKHASH_9',
  'BLOCKHASH_10',
  'BLOCKHASH_11',
  'BLOCKHASH_12',
  'BLOCKHASH_13',
  'BLOCKHASH_14',
  'BLOCKHASH_15',
  'BLOCKHASH_16',
  'BLOCKHASH_17',
  'BLOCKHASH_18',
  'BLOCKHASH_19',
  'BLOCKHASH_20',
  'BLOCKHASH_21',
  'BLOCKHASH_22',
  'BLOCKHASH_23',
  'BLOCKHASH_24',
  'BLOCKHASH_25',
  'BLOCKHASH_26',
  'BLOCKHASH_27',
  'BLOCKHASH_28',
  'BLOCKHASH_29',
  'BLOCKHASH_30',
  'BLOCKHASH_31',
  'BLOCKHASH_32',
  'BLOCKHASH_33',
  'BLOCKHASH_34',
  'BLOCKHASH_35',
  'BLOCKHASH_36',
  'BLOCKHASH_37',
  'BLOCKHASH_38',
  'BLOCKHASH_39',
  'BLOCKHASH_40',
  'BLOCKHASH_41',
  'BLOCKHASH_42',
  'BLOCKHASH_43',
  'BLOCKHASH_44',
  'BLOCKHASH_45',
  'BLOCKHASH_46',
  'BLOCKHASH_47',
  'BLOCKHASH_48',
  'BLOCKHASH_49',
  'BLOCKHASH_50',
  'BLOCKHASH_51',
  'BLOCKHASH_52',
  'BLOCKHASH_53',
  'BLOCKHASH_54',
  'BLOCKHASH_55',
  'BLOCKHASH_56',
  'BLOCKHASH_57',
  'BLOCKHASH_58',
  'BLOCKHASH_59',
  'BLOCKHASH_60',
  'BLOCKHASH_61',
  'BLOCKHASH_62',
  'BLOCKHASH_63',
  'BLOCKHASH_64',
  'BLOCKHASH_65',
  'BLOCKHASH_66',
  'BLOCKHASH_67',
  'BLOCKHASH_68',
  'BLOCKHASH_69',
  'BLOCKHASH_70',
  'BLOCKHASH_71',
  'BLOCKHASH_72',
  'BLOCKHASH_73',
  'BLOCKHASH_74',
  'BLOCKHASH_75',
  'BLOCKHASH_76',
  'BLOCKHASH_77',
  'BLOCKHASH_78',
  'BLOCKHASH_79',
  'BLOCKHASH_80',
  'BLOCKHASH_81',
  'BLOCKHASH_82',
  'BLOCKHASH_83',
  'BLOCKHASH_84',
  'BLOCKHASH_85',
  'BLOCKHASH_86',
  'BLOCKHASH_87',
  'BLOCKHASH_88',
  'BLOCKHASH_89',
  'BLOCKHASH_90',
  'BLOCKHASH_91',
  'BLOCKHASH_92',
  'BLOCKHASH_93',
  'BLOCKHASH_94',
  'BLOCKHASH_95',
  'BLOCKHASH_96',
  'BLOCKHASH_97',
  'BLOCKHASH_98',
  'BLOCKHASH_99',
  'BLOCKHASH_100',
  'BLOCKHASH_101',
  'BLOCKHASH_102',
  'BLOCKHASH_103',
  'BLOCKHASH_104',
  'BLOCKHASH_105',
  'BLOCKHASH_106',
  'BLOCKHASH_107',
  'BLOCKHASH_108',
  'BLOCKHASH_109',
  'BLOCKHASH_110',
  'BLOCKHASH_111',
  'BLOCKHASH_112',
  'BLOCKHASH_113',
  'BLOCKHASH_114',
  'BLOCKHASH_115',
  'BLOCKHASH_116',
  'BLOCKHASH_117',
  'BLOCKHASH_118',
  'BLOCKHASH_119',
  'BLOCKHASH_120',
  'BLOCKHASH_121',
  'BLOCKHASH_122',
  'BLOCKHASH_123',
  'BLOCKHASH_124',
  'BLOCKHASH_125',
  'BLOCKHASH_126',
  'BLOCKHASH_127',
  'BLOCKHASH_128',
  'BLOCKHASH_129',
  'BLOCKHASH_130',
  'BLOCKHASH_131',
  'BLOCKHASH_132',
  'BLOCKHASH_133',
  'BLOCKHASH_134',
  'BLOCKHASH_135',
  'BLOCKHASH_136',
  'BLOCKHASH_137',
  'BLOCKHASH_138',
  'BLOCKHASH_139',
  'BLOCKHASH_140',
  'BLOCKHASH_141',
  'BLOCKHASH_142',
  'BLOCKHASH_143',
  'BLOCKHASH_144',
  'BLOCKHASH_145',
  'BLOCKHASH_146',
  'BLOCKHASH_147',
  'BLOCKHASH_148',
  'BLOCKHASH_149',
  'BLOCKHASH_150',
  'BLOCKHASH_151',
  'BLOCKHASH_152',
  'BLOCKHASH_153',
  'BLOCKHASH_154',
  'BLOCKHASH_155',
  'BLOCKHASH_156',
  'BLOCKHASH_157',
  'BLOCKHASH_158',
  'BLOCKHASH_159',
  'BLOCKHASH_160',
  'BLOCKHASH_161',
  'BLOCKHASH_162',
  'BLOCKHASH_163',
  'BLOCKHASH_164',
  'BLOCKHASH_165',
  'BLOCKHASH_166',
  'BLOCKHASH_167',
  'BLOCKHASH_168',
  'BLOCKHASH_169',
  'BLOCKHASH_170',
  'BLOCKHASH_171',
  'BLOCKHASH_172',
  'BLOCKHASH_173',
  'BLOCKHASH_174',
  'BLOCKHASH_175',
  'BLOCKHASH_176',
  'BLOCKHASH_177',
  'BLOCKHASH_178',
  'BLOCKHASH_179',
  'BLOCKHASH_180',
  'BLOCKHASH_181',
  'BLOCKHASH_182',
  'BLOCKHASH_183',
  'BLOCKHASH_184',
  'BLOCKHASH_185',
  'BLOCKHASH_186',
  'BLOCKHASH_187',
  'BLOCKHASH_188',
  'BLOCKHASH_189',
  'BLOCKHASH_190',
  'BLOCKHASH_191',
  'BLOCKHASH_192',
  'BLOCKHASH_193',
  'BLOCKHASH_194',
  'BLOCKHASH_195',
  'BLOCKHASH_196',
  'BLOCKHASH_197',
  'BLOCKHASH_198',
  'BLOCKHASH_199',
  'BLOCKHASH_200',
  'BLOCKHASH_201',
  'BLOCKHASH_202',
  'BLOCKHASH_203',
  'BLOCKHASH_204',
  'BLOCKHASH_205',
  'BLOCKHASH_206',
  'BLOCKHASH_207',
  'BLOCKHASH_208',
  'BLOCKHASH_209',
  'BLOCKHASH_210',
  'BLOCKHASH_211',
  'BLOCKHASH_212',
  'BLOCKHASH_213',
  'BLOCKHASH_214',
  'BLOCKHASH_215',
  'BLOCKHASH_216',
  'BLOCKHASH_217',
  'BLOCKHASH_218',
  'BLOCKHASH_219',
  'BLOCKHASH_220',
  'BLOCKHASH_221',
  'BLOCKHASH_222',
  'BLOCKHASH_223',
  'BLOCKHASH_224',
  'BLOCKHASH_225',
  'BLOCKHASH_226',
  'BLOCKHASH_227',
  'BLOCKHASH_228',
  'BLOCKHASH_229',
  'BLOCKHASH_230',
  'BLOCKHASH_231',
  'BLOCKHASH_232',
  'BLOCKHASH_233',
  'BLOCKHASH_234',
  'BLOCKHASH_235',
  'BLOCKHASH_236',
  'BLOCKHASH_237',
  'BLOCKHASH_238',
  'BLOCKHASH_239',
  'BLOCKHASH_240',
  'BLOCKHASH_241',
  'BLOCKHASH_242',
  'BLOCKHASH_243',
  'BLOCKHASH_244',
  'BLOCKHASH_245',
  'BLOCKHASH_246',
  'BLOCKHASH_247',
  'BLOCKHASH_248',
  'BLOCKHASH_249',
  'BLOCKHASH_250',
  'BLOCKHASH_251',
  'BLOCKHASH_252',
  'BLOCKHASH_253',
  'BLOCKHASH_254',
  'BLOCKHASH_255',
  'BLOCKHASH_256',
] as const
const BLOCK_IN_VARIABLES_DYNAMIC = [
  // Nothing
] as const
const EVM_IN_VARIABLES_STATIC = [
  'CIRCOM_CONST_ONE',
  'CIRCOM_CONST_ZERO',
  'BIT_CONST_ONE',
  'BIT_CONST_ZERO',
  'UINT32_CONST_ZERO',
  'UINT32_POW2_0',
  'UINT32_POW2_1',
  'UINT32_POW2_2',
  'UINT32_POW2_3',
  'UINT32_POW2_4',
  'UINT32_POW2_5',
  'UINT32_POW2_6',
  'EVM_CONST_ONE',
  'EVM_CONST_ZERO',
  'JUBJUB_BASE_X',
  'JUBJUB_BASE_Y',
  'JUBJUB_POI_X',
  'JUBJUB_POI_Y',
] as const
const EVM_IN_VARIABLES_DYNAMIC = [
  // Nothing
] as const

const PRIVATE_IN_VARIABLES_STATIC = [
  'EDDSA_PUBLIC_KEY_X',
  'EDDSA_PUBLIC_KEY_Y',
  'EDDSA_RANDOMIZER_X',
  'EDDSA_RANDOMIZER_Y',
] as const
const PRIVATE_IN_VARIABLES_DYNAMIC = [
  'STORAGE_READ',
] as const
type LogOutVariable =
  | (typeof LOG_OUT_VARIABLES_STATIC)[number]
  | (typeof LOG_OUT_VARIABLES_DYNAMIC)[number]
type StorageStoreVariable =
  | (typeof STORAGE_STORE_VARIABLES_STATIC)[number]
  | (typeof STORAGE_STORE_VARIABLES_DYNAMIC)[number]
type TxInVariable =
  | (typeof TX_IN_VARIABLES_STATIC)[number]
  | (typeof TX_IN_VARIABLES_DYNAMIC)[number]
type StorageLoadVariable =
  | (typeof STORAGE_LOAD_VARIABLES_STATIC)[number]
  | (typeof STORAGE_LOAD_VARIABLES_DYNAMIC)[number]
type BlockInVariable =
  | (typeof BLOCK_IN_VARIABLES_STATIC)[number]
  | (typeof BLOCK_IN_VARIABLES_DYNAMIC)[number]
type EVMInVariable =
  | (typeof EVM_IN_VARIABLES_STATIC)[number]
  | (typeof EVM_IN_VARIABLES_DYNAMIC)[number]
type PrivateInVariable =
  | (typeof PRIVATE_IN_VARIABLES_STATIC)[number]
  | (typeof PRIVATE_IN_VARIABLES_DYNAMIC)[number]
  | TransactionInputVariable
export type ReservedVariable =
  | LogOutVariable
  | StorageStoreVariable
  | TxInVariable
  | StorageLoadVariable
  | BlockInVariable
  | EVMInVariable
  | PrivateInVariable

const _VARIABLES: string[] = [
  ...LOG_OUT_VARIABLES_STATIC,
  ...LOG_OUT_VARIABLES_DYNAMIC,
  ...STORAGE_STORE_VARIABLES_STATIC,
  ...STORAGE_STORE_VARIABLES_DYNAMIC,
  ...TX_IN_VARIABLES_STATIC,
  ...TX_IN_VARIABLES_DYNAMIC,
  ...STORAGE_LOAD_VARIABLES_STATIC,
  ...STORAGE_LOAD_VARIABLES_DYNAMIC,
  ...BLOCK_IN_VARIABLES_STATIC,
  ...BLOCK_IN_VARIABLES_DYNAMIC,
  ...EVM_IN_VARIABLES_STATIC,
  ...EVM_IN_VARIABLES_DYNAMIC,
  ...PRIVATE_IN_VARIABLES_STATIC,
  ...PRIVATE_IN_VARIABLES_DYNAMIC,
]
    
const __buildIncompleteDescription = (
  STATIC_VARIABLES: readonly string[], 
  DYNAMIC_VARIABLES: readonly string[],
  bufferName: ReservedBuffer,
) => {
  const m: Record<string, DataPtDescription> = {};
  const FULL_VARIABLES = [
    ...STATIC_VARIABLES,
    ...DYNAMIC_VARIABLES,
  ]
  for (const varName of FULL_VARIABLES) {
    m[varName] = {
      source: BUFFER_LIST.findIndex(name => name === bufferName),
      wireIndex: STATIC_VARIABLES.findIndex(staticName => staticName === varName),
      dataPtType: UINT256_DATA_PT_TYPE,
    }
  }
  return m as unknown
}
const _LOG_OUT_DESCRIPTION_INCOMPLETE = __buildIncompleteDescription(
  LOG_OUT_VARIABLES_STATIC,
  LOG_OUT_VARIABLES_DYNAMIC,
  'LOG_OUT',
) as Record<LogOutVariable, DataPtDescription>;
const _STORAGE_STORE_DESCRIPTION_INCOMPLETE = __buildIncompleteDescription(
  STORAGE_STORE_VARIABLES_STATIC,
  STORAGE_STORE_VARIABLES_DYNAMIC,
  'STORAGE_STORE',
) as Record<StorageStoreVariable, DataPtDescription>;
const _TX_IN_DESCRIPTION_INCOMPLETE = __buildIncompleteDescription(
  TX_IN_VARIABLES_STATIC,
  TX_IN_VARIABLES_DYNAMIC,
  'TX_IN',
) as Record<TxInVariable, DataPtDescription>;
const _STORAGE_LOAD_DESCRIPTION_INCOMPLETE = __buildIncompleteDescription(
  STORAGE_LOAD_VARIABLES_STATIC,
  STORAGE_LOAD_VARIABLES_DYNAMIC,
  'STORAGE_LOAD',
) as Record<StorageLoadVariable, DataPtDescription>;
const _BLOCK_IN_DESCRIPTION_INCOMPLETE = __buildIncompleteDescription(
  BLOCK_IN_VARIABLES_STATIC,
  BLOCK_IN_VARIABLES_DYNAMIC,
  'BLOCK_IN',
) as Record<BlockInVariable, DataPtDescription>;
const _EVM_IN_DESCRIPTION_INCOMPLETE = __buildIncompleteDescription(
  EVM_IN_VARIABLES_STATIC,
  EVM_IN_VARIABLES_DYNAMIC,
  'EVM_IN',
) as Record<EVMInVariable, DataPtDescription>;
const _PRIVATE_IN_DESCRIPTION_INCOMPLETE = __buildIncompleteDescription(
  PRIVATE_IN_VARIABLES_STATIC,
  PRIVATE_IN_VARIABLES_DYNAMIC,
  'PRIVATE_IN',
) as Record<PrivateInVariable, DataPtDescription>;

type StaticReservedVariable = Exclude<ReservedVariable, TransactionInputVariable>

const VARIABLE_DESCRIPTION_INCOMPLETE: Record<StaticReservedVariable, DataPtDescription> = {
  ..._LOG_OUT_DESCRIPTION_INCOMPLETE,
  ..._STORAGE_STORE_DESCRIPTION_INCOMPLETE,
  ..._TX_IN_DESCRIPTION_INCOMPLETE,
  ..._STORAGE_LOAD_DESCRIPTION_INCOMPLETE,
  ..._BLOCK_IN_DESCRIPTION_INCOMPLETE,
  ..._EVM_IN_DESCRIPTION_INCOMPLETE,
  ..._PRIVATE_IN_DESCRIPTION_INCOMPLETE,
}

const __setDataPtType = (
  varName: StaticReservedVariable,
  dataPtType: DataPtType,
): void => {
  VARIABLE_DESCRIPTION_INCOMPLETE[varName] = {
    ...VARIABLE_DESCRIPTION_INCOMPLETE[varName],
    dataPtType,
  }
}

VARIABLE_DESCRIPTION_INCOMPLETE.LOG_TOPIC.extDest = `Log topic`;
VARIABLE_DESCRIPTION_INCOMPLETE.LOG_VALUE.extDest = `Log value`;
VARIABLE_DESCRIPTION_INCOMPLETE.SSTORE_ADDRESS.extDest = `Final storage write address`;
__setDataPtType('SSTORE_ADDRESS', UINT256_DATA_PT_TYPE)
VARIABLE_DESCRIPTION_INCOMPLETE.SSTORE_KEY.extDest = `Final storage write key`;
VARIABLE_DESCRIPTION_INCOMPLETE.SSTORE_VALUE.extDest = `Final storage write value`;

VARIABLE_DESCRIPTION_INCOMPLETE.EDDSA_SIGNATURE.extSource = `EdDSA signature of transaction`;
__setDataPtType('EDDSA_SIGNATURE', JUBJUB_SCALAR_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.CONTRACT_ADDRESS.extSource = `Contract address to call`;
__setDataPtType('CONTRACT_ADDRESS', UINT160_DATA_PT_TYPE)
VARIABLE_DESCRIPTION_INCOMPLETE.FUNCTION_SELECTOR.extSource = `Selector for a function to call`;
__setDataPtType('FUNCTION_SELECTOR', UINT32_DATA_PT_TYPE)
VARIABLE_DESCRIPTION_INCOMPLETE.SLOAD_ADDRESS.extDest = `Initial storage read address`;
__setDataPtType('SLOAD_ADDRESS', UINT256_DATA_PT_TYPE)
VARIABLE_DESCRIPTION_INCOMPLETE.SLOAD_KEY.extDest = `Initial storage read key`;
VARIABLE_DESCRIPTION_INCOMPLETE.SLOAD_VALUE.extDest = `Initial storage read value`;
VARIABLE_DESCRIPTION_INCOMPLETE.STORAGE_READ.extSource = `Initial storage read value`;
VARIABLE_DESCRIPTION_INCOMPLETE.COINBASE.extSource = `COINBASE`;
VARIABLE_DESCRIPTION_INCOMPLETE.TIMESTAMP.extSource = `TIMESTAMP`;
VARIABLE_DESCRIPTION_INCOMPLETE.NUMBER.extSource = `NUMBER`;
VARIABLE_DESCRIPTION_INCOMPLETE.PREVRANDAO.extSource = `PREVRANDAO`;
VARIABLE_DESCRIPTION_INCOMPLETE.GASLIMIT.extSource = `GASLIMIT`;
VARIABLE_DESCRIPTION_INCOMPLETE.CHAINID.extSource = `CHAINID`;
VARIABLE_DESCRIPTION_INCOMPLETE.SELFBALANCE.extSource = `SELFBALANCE`;
VARIABLE_DESCRIPTION_INCOMPLETE.BASEFEE.extSource = `BASEFEE`;
for (let i = 1; i <= 256; i++) {
  const varName = `BLOCKHASH_${i}` as StaticReservedVariable
  if ( BLOCK_IN_VARIABLES_STATIC.findIndex(staticVarName => staticVarName === varName) < 0 ) {
    throw new Error(`${varName} is not a ReservedVariable`)
  }
  VARIABLE_DESCRIPTION_INCOMPLETE[varName].extSource = `Block hash ${i} ${i === 1 ? 'block' : 'blocks'} ago`;
}

VARIABLE_DESCRIPTION_INCOMPLETE.CIRCOM_CONST_ONE.extSource = 'Arbitrary constant',
__setDataPtType('CIRCOM_CONST_ONE', BLS12_381_FR_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.CIRCOM_CONST_ZERO.extSource = 'Arbitrary constant',
__setDataPtType('CIRCOM_CONST_ZERO', BLS12_381_FR_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.BIT_CONST_ONE.extSource = 'One-bit constant one',
__setDataPtType('BIT_CONST_ONE', BIT_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.BIT_CONST_ZERO.extSource = 'One-bit constant zero',
__setDataPtType('BIT_CONST_ZERO', BIT_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.UINT32_CONST_ZERO.extSource = 'Zero uint32 value',
__setDataPtType('UINT32_CONST_ZERO', UINT32_DATA_PT_TYPE)

for (let exponent = 0; exponent <= 6; exponent++) {
  const varName = `UINT32_POW2_${exponent}` as StaticReservedVariable
  VARIABLE_DESCRIPTION_INCOMPLETE[varName].extSource = `Uint32 power of two: 2^${exponent}`
  __setDataPtType(varName, UINT32_DATA_PT_TYPE)
}

VARIABLE_DESCRIPTION_INCOMPLETE.EVM_CONST_ONE.extSource = 'One EVM word',
__setDataPtType('EVM_CONST_ONE', UINT256_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.EVM_CONST_ZERO.extSource = 'Zero EVM word',
__setDataPtType('EVM_CONST_ZERO', UINT256_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.JUBJUB_BASE_X.extSource = `Base point of Jubjub curve (x coordinate)`;
__setDataPtType('JUBJUB_BASE_X', BLS12_381_FR_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.JUBJUB_BASE_Y.extSource = `Base point of Jubjub curve (y coordinate)`;
__setDataPtType('JUBJUB_BASE_Y', BLS12_381_FR_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.JUBJUB_POI_X.extSource = `Point at infinity of Jubjub curve (x coordinate)`;
__setDataPtType('JUBJUB_POI_X', BLS12_381_FR_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.JUBJUB_POI_Y.extSource = `Point at infinity of Jubjub curve (y coordinate)`;
__setDataPtType('JUBJUB_POI_Y', BLS12_381_FR_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.CHANNEL_TX_INDEX.extSource = `Signed channel transaction index`;
__setDataPtType('CHANNEL_TX_INDEX', BLS12_381_FR_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.EDDSA_PUBLIC_KEY_X.extSource = `EdDSA public key of caller (x coordinate)`;
__setDataPtType('EDDSA_PUBLIC_KEY_X', BLS12_381_FR_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.EDDSA_PUBLIC_KEY_Y.extSource = `EdDSA public key of caller (y coordinate)`;
__setDataPtType('EDDSA_PUBLIC_KEY_Y', BLS12_381_FR_DATA_PT_TYPE)
VARIABLE_DESCRIPTION_INCOMPLETE.EDDSA_RANDOMIZER_X.extSource = `EdDSA randomizer (x coordinate)`;
__setDataPtType('EDDSA_RANDOMIZER_X', BLS12_381_FR_DATA_PT_TYPE)

VARIABLE_DESCRIPTION_INCOMPLETE.EDDSA_RANDOMIZER_Y.extSource = `EdDSA randomizer (y coordinate)`;
__setDataPtType('EDDSA_RANDOMIZER_Y', BLS12_381_FR_DATA_PT_TYPE)

for (const _varName of _VARIABLES) {
  const varName = _varName as StaticReservedVariable
  if (
    VARIABLE_DESCRIPTION_INCOMPLETE[varName].extDest === undefined && 
    VARIABLE_DESCRIPTION_INCOMPLETE[varName].extSource === undefined
  ) {
    throw new Error(`VARIABLE_DESCRIPTION_INCOMPLETE of ${varName} is incomplete`)
  }
}

export const VARIABLE_DESCRIPTION = VARIABLE_DESCRIPTION_INCOMPLETE

export const getReservedVariableDescription = (
  variable: ReservedVariable,
  numberOfPrivateMessageInputs: number,
): DataPtDescription => {
  const transactionInputMatch = /^TRANSACTION_INPUT(\d+)$/.exec(variable)
  if (transactionInputMatch !== null) {
    const inputIndex = Number(transactionInputMatch[1])
    if (!Number.isSafeInteger(inputIndex) || inputIndex < 0 || inputIndex >= numberOfPrivateMessageInputs) {
      throw new Error(`Synthesizer: ${variable} is outside the configured private transaction-input range`)
    }
    return {
      source: BUFFER_LIST.indexOf('PRIVATE_IN'),
      wireIndex: 2 + inputIndex,
      dataPtType: BLS12_381_FR_DATA_PT_TYPE,
      extSource: `The ${inputIndex}-th input to the selected function`,
    }
  }
  if (variable === 'EDDSA_RANDOMIZER_X' || variable === 'EDDSA_RANDOMIZER_Y') {
    const description = VARIABLE_DESCRIPTION[variable]
    return {
      ...description,
      wireIndex: numberOfPrivateMessageInputs + (variable === 'EDDSA_RANDOMIZER_X' ? 2 : 3),
    }
  }
  const description = VARIABLE_DESCRIPTION[variable as StaticReservedVariable]
  if (description === undefined) {
    throw new Error(`Synthesizer: unknown reserved variable ${variable}`)
  }
  return description
}
