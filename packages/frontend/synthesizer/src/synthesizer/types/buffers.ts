import { SUBCIRCUIT_BUFFER_MAPPING, subcircuitInfoByName } from 'src/interface/qapCompiler/importedConstants.ts';
import type { DataPt, DataPtDescription, PlacementEntry, Placements, SynthesizerOpts, SynthesizerSupportedOpcodes } from './index.ts'
import { BUFFER_LIST, ReservedBuffer, SubcircuitNames } from 'src/interface/qapCompiler/configuredTypes.ts';

export type ReservedVariable =
    // PUBLIC_OUT (Dynamic)
    | 'RES_MERKLE_ROOT'
    | 'OTHER_CONTRACT_STORAGE_OUT'
    // PUBLIC_IN (Static + Dynmaic)
    | 'INI_MERKLE_ROOT'
    | 'EDDSA_PUBLIC_KEY_X'
    | 'EDDSA_PUBLIC_KEY_Y'
    | 'OTHER_CONTRACT_STORAGE_IN'
    // BLOCK_IN (Static)
    | 'COINBASE'
    | 'TIMESTAMP'
    | 'NUMBER'
    | 'PREVRANDAO'
    | 'GASLIMIT'
    | 'CHAINID'
    | 'SELFBALANCE'
    | 'BASEFEE'

    | 'BLOCKHASH_1'
    | 'BLOCKHASH_2'
    | 'BLOCKHASH_3'
    | 'BLOCKHASH_4'
    | 'BLOCKHASH_5'
    | 'BLOCKHASH_6'
    | 'BLOCKHASH_7'
    | 'BLOCKHASH_8'
    | 'BLOCKHASH_9'
    | 'BLOCKHASH_10'
    | 'BLOCKHASH_11'
    | 'BLOCKHASH_12'
    | 'BLOCKHASH_13'
    | 'BLOCKHASH_14'
    | 'BLOCKHASH_15'
    | 'BLOCKHASH_16'
    | 'BLOCKHASH_17'
    | 'BLOCKHASH_18'
    | 'BLOCKHASH_19'
    | 'BLOCKHASH_20'
    | 'BLOCKHASH_21'
    | 'BLOCKHASH_22'
    | 'BLOCKHASH_23'
    | 'BLOCKHASH_24'
    | 'BLOCKHASH_25'
    | 'BLOCKHASH_26'
    | 'BLOCKHASH_27'
    | 'BLOCKHASH_28'
    | 'BLOCKHASH_29'
    | 'BLOCKHASH_30'
    | 'BLOCKHASH_31'
    | 'BLOCKHASH_32'
    | 'BLOCKHASH_33'
    | 'BLOCKHASH_34'
    | 'BLOCKHASH_35'
    | 'BLOCKHASH_36'
    | 'BLOCKHASH_37'
    | 'BLOCKHASH_38'
    | 'BLOCKHASH_39'
    | 'BLOCKHASH_40'
    | 'BLOCKHASH_41'
    | 'BLOCKHASH_42'
    | 'BLOCKHASH_43'
    | 'BLOCKHASH_44'
    | 'BLOCKHASH_45'
    | 'BLOCKHASH_46'
    | 'BLOCKHASH_47'
    | 'BLOCKHASH_48'
    | 'BLOCKHASH_49'
    | 'BLOCKHASH_50'
    | 'BLOCKHASH_51'
    | 'BLOCKHASH_52'
    | 'BLOCKHASH_53'
    | 'BLOCKHASH_54'
    | 'BLOCKHASH_55'
    | 'BLOCKHASH_56'
    | 'BLOCKHASH_57'
    | 'BLOCKHASH_58'
    | 'BLOCKHASH_59'
    | 'BLOCKHASH_60'
    | 'BLOCKHASH_61'
    | 'BLOCKHASH_62'
    | 'BLOCKHASH_63'
    | 'BLOCKHASH_64'
    | 'BLOCKHASH_65'
    | 'BLOCKHASH_66'
    | 'BLOCKHASH_67'
    | 'BLOCKHASH_68'
    | 'BLOCKHASH_69'
    | 'BLOCKHASH_70'
    | 'BLOCKHASH_71'
    | 'BLOCKHASH_72'
    | 'BLOCKHASH_73'
    | 'BLOCKHASH_74'
    | 'BLOCKHASH_75'
    | 'BLOCKHASH_76'
    | 'BLOCKHASH_77'
    | 'BLOCKHASH_78'
    | 'BLOCKHASH_79'
    | 'BLOCKHASH_80'
    | 'BLOCKHASH_81'
    | 'BLOCKHASH_82'
    | 'BLOCKHASH_83'
    | 'BLOCKHASH_84'
    | 'BLOCKHASH_85'
    | 'BLOCKHASH_86'
    | 'BLOCKHASH_87'
    | 'BLOCKHASH_88'
    | 'BLOCKHASH_89'
    | 'BLOCKHASH_90'
    | 'BLOCKHASH_91'
    | 'BLOCKHASH_92'
    | 'BLOCKHASH_93'
    | 'BLOCKHASH_94'
    | 'BLOCKHASH_95'
    | 'BLOCKHASH_96'
    | 'BLOCKHASH_97'
    | 'BLOCKHASH_98'
    | 'BLOCKHASH_99'
    | 'BLOCKHASH_100'
    | 'BLOCKHASH_101'
    | 'BLOCKHASH_102'
    | 'BLOCKHASH_103'
    | 'BLOCKHASH_104'
    | 'BLOCKHASH_105'
    | 'BLOCKHASH_106'
    | 'BLOCKHASH_107'
    | 'BLOCKHASH_108'
    | 'BLOCKHASH_109'
    | 'BLOCKHASH_110'
    | 'BLOCKHASH_111'
    | 'BLOCKHASH_112'
    | 'BLOCKHASH_113'
    | 'BLOCKHASH_114'
    | 'BLOCKHASH_115'
    | 'BLOCKHASH_116'
    | 'BLOCKHASH_117'
    | 'BLOCKHASH_118'
    | 'BLOCKHASH_119'
    | 'BLOCKHASH_120'
    | 'BLOCKHASH_121'
    | 'BLOCKHASH_122'
    | 'BLOCKHASH_123'
    | 'BLOCKHASH_124'
    | 'BLOCKHASH_125'
    | 'BLOCKHASH_126'
    | 'BLOCKHASH_127'
    | 'BLOCKHASH_128'
    | 'BLOCKHASH_129'
    | 'BLOCKHASH_130'
    | 'BLOCKHASH_131'
    | 'BLOCKHASH_132'
    | 'BLOCKHASH_133'
    | 'BLOCKHASH_134'
    | 'BLOCKHASH_135'
    | 'BLOCKHASH_136'
    | 'BLOCKHASH_137'
    | 'BLOCKHASH_138'
    | 'BLOCKHASH_139'
    | 'BLOCKHASH_140'
    | 'BLOCKHASH_141'
    | 'BLOCKHASH_142'
    | 'BLOCKHASH_143'
    | 'BLOCKHASH_144'
    | 'BLOCKHASH_145'
    | 'BLOCKHASH_146'
    | 'BLOCKHASH_147'
    | 'BLOCKHASH_148'
    | 'BLOCKHASH_149'
    | 'BLOCKHASH_150'
    | 'BLOCKHASH_151'
    | 'BLOCKHASH_152'
    | 'BLOCKHASH_153'
    | 'BLOCKHASH_154'
    | 'BLOCKHASH_155'
    | 'BLOCKHASH_156'
    | 'BLOCKHASH_157'
    | 'BLOCKHASH_158'
    | 'BLOCKHASH_159'
    | 'BLOCKHASH_160'
    | 'BLOCKHASH_161'
    | 'BLOCKHASH_162'
    | 'BLOCKHASH_163'
    | 'BLOCKHASH_164'
    | 'BLOCKHASH_165'
    | 'BLOCKHASH_166'
    | 'BLOCKHASH_167'
    | 'BLOCKHASH_168'
    | 'BLOCKHASH_169'
    | 'BLOCKHASH_170'
    | 'BLOCKHASH_171'
    | 'BLOCKHASH_172'
    | 'BLOCKHASH_173'
    | 'BLOCKHASH_174'
    | 'BLOCKHASH_175'
    | 'BLOCKHASH_176'
    | 'BLOCKHASH_177'
    | 'BLOCKHASH_178'
    | 'BLOCKHASH_179'
    | 'BLOCKHASH_180'
    | 'BLOCKHASH_181'
    | 'BLOCKHASH_182'
    | 'BLOCKHASH_183'
    | 'BLOCKHASH_184'
    | 'BLOCKHASH_185'
    | 'BLOCKHASH_186'
    | 'BLOCKHASH_187'
    | 'BLOCKHASH_188'
    | 'BLOCKHASH_189'
    | 'BLOCKHASH_190'
    | 'BLOCKHASH_191'
    | 'BLOCKHASH_192'
    | 'BLOCKHASH_193'
    | 'BLOCKHASH_194'
    | 'BLOCKHASH_195'
    | 'BLOCKHASH_196'
    | 'BLOCKHASH_197'
    | 'BLOCKHASH_198'
    | 'BLOCKHASH_199'
    | 'BLOCKHASH_200'
    | 'BLOCKHASH_201'
    | 'BLOCKHASH_202'
    | 'BLOCKHASH_203'
    | 'BLOCKHASH_204'
    | 'BLOCKHASH_205'
    | 'BLOCKHASH_206'
    | 'BLOCKHASH_207'
    | 'BLOCKHASH_208'
    | 'BLOCKHASH_209'
    | 'BLOCKHASH_210'
    | 'BLOCKHASH_211'
    | 'BLOCKHASH_212'
    | 'BLOCKHASH_213'
    | 'BLOCKHASH_214'
    | 'BLOCKHASH_215'
    | 'BLOCKHASH_216'
    | 'BLOCKHASH_217'
    | 'BLOCKHASH_218'
    | 'BLOCKHASH_219'
    | 'BLOCKHASH_220'
    | 'BLOCKHASH_221'
    | 'BLOCKHASH_222'
    | 'BLOCKHASH_223'
    | 'BLOCKHASH_224'
    | 'BLOCKHASH_225'
    | 'BLOCKHASH_226'
    | 'BLOCKHASH_227'
    | 'BLOCKHASH_228'
    | 'BLOCKHASH_229'
    | 'BLOCKHASH_230'
    | 'BLOCKHASH_231'
    | 'BLOCKHASH_232'
    | 'BLOCKHASH_233'
    | 'BLOCKHASH_234'
    | 'BLOCKHASH_235'
    | 'BLOCKHASH_236'
    | 'BLOCKHASH_237'
    | 'BLOCKHASH_238'
    | 'BLOCKHASH_239'
    | 'BLOCKHASH_240'
    | 'BLOCKHASH_241'
    | 'BLOCKHASH_242'
    | 'BLOCKHASH_243'
    | 'BLOCKHASH_244'
    | 'BLOCKHASH_245'
    | 'BLOCKHASH_246'
    | 'BLOCKHASH_247'
    | 'BLOCKHASH_248'
    | 'BLOCKHASH_249'
    | 'BLOCKHASH_250'
    | 'BLOCKHASH_251'
    | 'BLOCKHASH_252'
    | 'BLOCKHASH_253'
    | 'BLOCKHASH_254'
    | 'BLOCKHASH_255'
    | 'BLOCKHASH_256'
    // PRIVATE_IN (Static + Dynamic)
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
    | 'EDDSA_SIGNATURE'
    | 'EDDSA_RANDOMIZER_X'
    | 'EDDSA_RANDOMIZER_Y'
    | 'IN_MT_INDEX'
    | 'IN_MPT_KEY'
    | 'IN_VALUE'
    | 'MERKLE_PROOF'
    // EVM_IN (Static + Dynamic)
    | 'ADDRESS_MASK'
    | 'JUBJUB_BASE_X'
    | 'JUBJUB_BASE_Y'
    | 'JUBJUB_POI_X'
    | 'JUBJUB_POI_Y'
    | 'NULL_POSEIDON_LEVEL0'
    | 'NULL_POSEIDON_LEVEL1'
    | 'NULL_POSEIDON_LEVEL2'
    | 'NULL_POSEIDON_LEVEL3'
    
type BlockhashVars = Extract<ReservedVariable, `BLOCKHASH_${number}`>;

const __BLOCKHASH_DESCRIPTIONS: Record<BlockhashVars, DataPtDescription> = (() => {
  const m: Record<string, DataPtDescription> = {};
  for (let i = 1; i <= 256; i++) {
    m[`BLOCKHASH_${i}`] = {
      extSource: `Block hash ${i} ${i === 1 ? 'block' : 'blocks'} ago`,
      source: BUFFER_LIST.findIndex(name => name === 'BLOCK_IN'),
      sourceBitSize: 256,
      wireIndex: 8 + i - 1,
    };
  }
  return m as unknown as Record<BlockhashVars, DataPtDescription>;
})();

export const VARIABLE_DESCRIPTION: Record<ReservedVariable, DataPtDescription> = {
  RES_MERKLE_ROOT: {
    extDest: `Resulting Merkle tree root hash`,
    source: BUFFER_LIST.findIndex(name => name === 'PUBLIC_OUT'),
    sourceBitSize: 255,
    wireIndex: -1,
  },
  OTHER_CONTRACT_STORAGE_OUT: {
    extDest: `Writing general data on contract's storage other than users'`,
    source: BUFFER_LIST.findIndex(name => name === 'PUBLIC_OUT'),
    sourceBitSize: 256,
    wireIndex: -1, // Dynamic
  },

  INI_MERKLE_ROOT: {
    extSource: `Initial Merkle tree root hash`,
    source: BUFFER_LIST.findIndex(name => name === 'PUBLIC_IN'),
    sourceBitSize: 255,
    wireIndex: 0,
  },
  EDDSA_PUBLIC_KEY_X: {
    extSource: `EdDSA public key of caller (x coordinate)`,
    source: BUFFER_LIST.findIndex(name => name === 'PUBLIC_IN'),
    sourceBitSize: 255,
    wireIndex: 1,
  },
  EDDSA_PUBLIC_KEY_Y: {
    extSource: `EdDSA public key of caller (y coordinate)`,
    source: BUFFER_LIST.findIndex(name => name === 'PUBLIC_IN'),
    sourceBitSize: 255,
    wireIndex: 2,
  },
  OTHER_CONTRACT_STORAGE_IN: {
    extSource: `Access to general contract's storage data other than users'`,
    source: BUFFER_LIST.findIndex(name => name === 'PUBLIC_IN'),
    sourceBitSize: 256,
    wireIndex: -1, // Dynamic
  },

  COINBASE: {
    extSource: `COINBASE`,
    source: BUFFER_LIST.findIndex(name => name === 'BLOCK_IN'),
    sourceBitSize: 256,
    wireIndex: 0,
  },
  TIMESTAMP: {
    extSource: `TIMESTAMP`,
    source: BUFFER_LIST.findIndex(name => name === 'BLOCK_IN'),
    sourceBitSize: 256,
    wireIndex: 1,
  },
  NUMBER:  {
    extSource: `NUMBER`,
    source: BUFFER_LIST.findIndex(name => name === 'BLOCK_IN'),
    sourceBitSize: 256,
    wireIndex: 2,
  },
  PREVRANDAO: {
    extSource: `PREVRANDAO`,
    source: BUFFER_LIST.findIndex(name => name === 'BLOCK_IN'),
    sourceBitSize: 256,
    wireIndex: 3,
  },
  GASLIMIT: {
    extSource: `GASLIMIT`,
    source: BUFFER_LIST.findIndex(name => name === 'BLOCK_IN'),
    sourceBitSize: 256,
    wireIndex: 4,
  },
  CHAINID: {
    extSource: `CHAINID`,
    source: BUFFER_LIST.findIndex(name => name === 'BLOCK_IN'),
    sourceBitSize: 256,
    wireIndex: 5,
  },
  SELFBALANCE: {
    extSource: `SELFBALANCE`,
    source: BUFFER_LIST.findIndex(name => name === 'BLOCK_IN'),
    sourceBitSize: 256,
    wireIndex: 6,
  },
  BASEFEE: {
    extSource: `BASEFEE`,
    source: BUFFER_LIST.findIndex(name => name === 'BLOCK_IN'),
    sourceBitSize: 256,
    wireIndex: 7,
  },

  ...__BLOCKHASH_DESCRIPTIONS,

  ADDRESS_MASK: {
    extSource: `Masker for Ethereum address (20 bytes)`,
    source: BUFFER_LIST.findIndex(name => name === 'EVM_IN'),
    sourceBitSize: 160,
    wireIndex: 0,
  },
  JUBJUB_BASE_X: {
    extSource: `Base point of Jubjub curve (x coordinate)`,
    source: BUFFER_LIST.findIndex(name => name === 'EVM_IN'),
    sourceBitSize: 255,
    wireIndex: 1,
  },
  JUBJUB_BASE_Y: {
    extSource: `Base point of Jubjub curve (y coordinate)`,
    source: BUFFER_LIST.findIndex(name => name === 'EVM_IN'),
    sourceBitSize: 255,
    wireIndex: 2,
  },
  JUBJUB_POI_X: {
    extSource: `Point at infinity of Jubjub curve (x coordinate)`,
    source: BUFFER_LIST.findIndex(name => name === 'EVM_IN'),
    sourceBitSize: 255,
    wireIndex: 3,
  },
  JUBJUB_POI_Y: {
    extSource: `Point at infinity of Jubjub curve (y coordinate)`,
    source: BUFFER_LIST.findIndex(name => name === 'EVM_IN'),
    sourceBitSize: 255,
    wireIndex: 4,
  },
  NULL_POSEIDON_LEVEL0: {
    extSource: `Poseidon of zeros`,
    source: BUFFER_LIST.findIndex(name => name === 'EVM_IN'),
    sourceBitSize: 255,
    wireIndex: 5,
  },
  NULL_POSEIDON_LEVEL1: {
    extSource: `Poseidon of Poseidons of zeros`,
    source: BUFFER_LIST.findIndex(name => name === 'EVM_IN'),
    sourceBitSize: 255,
    wireIndex: 6,
  },
  NULL_POSEIDON_LEVEL2: {
    extSource: `Poseidon of Poseidons of Poseidons of zeros`,
    source: BUFFER_LIST.findIndex(name => name === 'EVM_IN'),
    sourceBitSize: 255,
    wireIndex: 7,
  },
  NULL_POSEIDON_LEVEL3: {
    extSource: `Poseidon of Poseidons of Poseidons of Poseidons of zeros`,
    source: BUFFER_LIST.findIndex(name => name === 'EVM_IN'),
    sourceBitSize: 255,
    wireIndex: 8,
  },

  CONTRACT_ADDRESS: {
    extSource: `Contract address to call`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 160,
    wireIndex: 0,
  },
  FUNCTION_SELECTOR: {
    extSource: `Selector for a function to call`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 1,
  },
  TRANSACTION_NONCE: {
    extSource: `Transaction nonce`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 2,
  },
  TRANSACTION_INPUT0: {
    extSource: `Zeroth input to the selected function`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 3,
  },
  TRANSACTION_INPUT1: {
    extSource: `First input to the selected function`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 4,
  },
  TRANSACTION_INPUT2: {
    extSource: `Second input to the selected function`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 5,
  },
  TRANSACTION_INPUT3: {
    extSource: `Third input to the selected function`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 6,
  },
  TRANSACTION_INPUT4: {
    extSource: `Fourth input to the selected function`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 7,
  },
  TRANSACTION_INPUT5: {
    extSource: `Fifth input to the selected function`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 8,
  },
  TRANSACTION_INPUT6: {
    extSource: `Sixth input to the selected function`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 9,
  },
  TRANSACTION_INPUT7: {
    extSource: `Seventh input to the selected function`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 10,
  },
  TRANSACTION_INPUT8: {
    extSource: `Eighth input to the selected function`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 11,
  },
  EDDSA_SIGNATURE: {
    extSource: `EdDSA signature of transaction`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 12,
  },
  EDDSA_RANDOMIZER_X: {
    extSource: `EdDSA randomizer (x coordinate)`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 13,
  },
  EDDSA_RANDOMIZER_Y: {
    extSource: `EdDSA randomizer (y coordinate)`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: 14,
  },

  IN_MT_INDEX: {
    extSource: `Index of the initial Merkle tree of users' storage values`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: -1, //Dynamic
  },
  IN_MPT_KEY: {
    extSource: `Merkle Patricia trie key (Poseidon) of a user's initial storage value`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: -1, //Dynamic
  },
  IN_VALUE: {
    extSource: `A user's inital storage value (restricted to 255-bit word)`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: -1, //Dynamic
  },
  MERKLE_PROOF: {
    extSource: `Merkle proof component`,
    source: BUFFER_LIST.findIndex(name => name === 'PRIVATE_IN'),
    sourceBitSize: 255,
    wireIndex: -1, //Dynamic
  },

}