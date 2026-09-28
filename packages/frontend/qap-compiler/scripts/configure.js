module.exports.S_MAX = 256

const BASE_SUBCIRCUIT_NAMES = Object.freeze([
  'bufferLogOut', 'bufferStorageStore', 'bufferStorageLoad', 'bufferTxIn',
  'bufferBlockIn', 'bufferEVMIn', 'bufferPrvIn', 'ALU3', 'ALU4A', 'ALU4B',
  'SHL', 'ADDMODPrepare', 'ADDMODVerify', 'MULMODPrepare', 'MULMODCandidate',
  'MULMODVerify', 'AssertZeroWord', 'SubExp', 'CheckBus256', 'MemoryViewStep',
  'Poseidon', 'FrToLimbsPair', 'TransactionSignaturePoseidonBatch4',
  'TransactionSignaturePointPolicy', 'TransactionSignatureFixedPrefix70',
  'TransactionSignatureChallengeChunks', 'TransactionSignatureVariableFirstBatch32',
  'TransactionSignatureVariableBatch32', 'TransactionSignatureFinal', 'StorageAccess',
  'EQ', 'ISZERO', 'ADD', 'MUL', 'SUB', 'NOT', 'LT', 'GT', 'SLT', 'SGT',
  'AND', 'OR', 'XOR', 'SHR',
])

const CONDITIONAL_SUBCIRCUIT_NAMES = Object.freeze([
  'TransactionSignaturePointPolicy',
  'TransactionSignaturePoseidonTail1',
  'TransactionSignaturePoseidonTail2',
  'TransactionSignaturePointPolicyWithHash',
])

function getTransactionSignaturePoseidonTailLength(numberOfPrivateMessageInputs) {
  if (!Number.isSafeInteger(numberOfPrivateMessageInputs) || numberOfPrivateMessageInputs < 0) {
    throw new Error('nPrivateMessageInputs must be a non-negative safe integer.')
  }
  const remainder = (numberOfPrivateMessageInputs + 2) % 4
  return remainder === 0 ? 4 : remainder
}

function getSubcircuitNames(numberOfPrivateMessageInputs) {
  const names = [...BASE_SUBCIRCUIT_NAMES]
  const tailLength = getTransactionSignaturePoseidonTailLength(numberOfPrivateMessageInputs)
  if (tailLength === 1) {
    names.splice(names.indexOf('TransactionSignaturePointPolicy') + 1, 0, 'TransactionSignaturePoseidonTail1')
  } else if (tailLength === 2) {
    names.splice(names.indexOf('TransactionSignaturePointPolicy') + 1, 0, 'TransactionSignaturePoseidonTail2')
  } else if (tailLength === 4) {
    names[names.indexOf('TransactionSignaturePointPolicy')] = 'TransactionSignaturePointPolicyWithHash'
  }
  return Object.freeze(names)
}

const bufferDeclarations = [
  {
    name: 'bufferLogOut',
    direction: 'out',
    publicPhase: 'user-output',
    capacityConstant: 'nLogOut',
  },
  {
    name: 'bufferStorageStore',
    direction: 'out',
    publicPhase: 'user-output',
    capacityConstant: 'nStorageStore',
  },
  {
    name: 'bufferStorageLoad',
    direction: 'out',
    publicPhase: 'user-output',
    capacityConstant: 'nStorageLoad',
  },
  {
    name: 'bufferTxIn',
    direction: 'in',
    publicPhase: 'user-input',
    capacityConstant: 'nTxIn',
  },
  {
    name: 'bufferBlockIn',
    direction: 'in',
    publicPhase: 'block-input',
    capacityConstant: 'nBlockIn',
  },
  {
    name: 'bufferEVMIn',
    direction: 'in',
    publicPhase: 'function-input',
    capacityConstant: 'nEVMIn',
  },
  {
    name: 'bufferPrvIn',
    direction: 'in',
    capacityConstant: 'nPrvIn',
  },
]

const publicWirePhases = [
  {
    name: 'user-output',
    region: 'free',
  },
  {
    name: 'user-input',
    region: 'free',
  },
  {
    name: 'block-input',
    region: 'free',
  },
  {
    name: 'function-input',
    region: 'fixed',
  },
]

const publicWireSegments = bufferDeclarations
  .filter(({ publicPhase }) => publicPhase !== undefined)
  .map(({ name, direction, publicPhase }) => ({
    name,
    direction,
    phase: publicPhase,
  }))

const libraryLayout = Object.freeze({
  bufferDeclarations: Object.freeze(bufferDeclarations.map(Object.freeze)),
  publicWirePhases: Object.freeze(publicWirePhases.map(Object.freeze)),
  publicWireSegments: Object.freeze(publicWireSegments.map(Object.freeze)),
})

module.exports.LIBRARY_LAYOUT = libraryLayout
module.exports.getSubcircuitNames = getSubcircuitNames
module.exports.CONDITIONAL_SUBCIRCUIT_NAMES = CONDITIONAL_SUBCIRCUIT_NAMES
