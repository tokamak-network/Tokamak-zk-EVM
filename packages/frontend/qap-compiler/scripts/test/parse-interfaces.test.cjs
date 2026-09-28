const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  loadLogicalInterfaces,
  parseLogicalInterface,
  validateBufferCapacities,
  validateCompiledSubcircuitInterfaces,
} = require('../parse-interfaces.js')
const {
  countPhysicalWires,
  parseCircomConstants,
} = require('../runtime/logical-interface.js')

const UINT256 = { kind: 'uint', bits: 256 }

const BIT = { kind: 'uint', bits: 1 }

const BUFFER_CAPACITIES = new Map([
  ['nLogOut', 5],
  ['nStorageStore', 6],
  ['nStorageLoad', 7],
  ['nTxIn', 8],
  ['nBlockIn', 9],
  ['nEVMIn', 10],
  ['nPrvIn', 11],
])

const BUFFER_SUBCIRCUITS = [
  ['bufferLogOut', 5],
  ['bufferStorageStore', 6],
  ['bufferStorageLoad', 7],
  ['bufferTxIn', 8],
  ['bufferBlockIn', 9],
  ['bufferEVMIn', 10],
  ['bufferPrvIn', 11],
].map(([name, capacity]) => ({
  name,
  In_idx: [capacity + 1, capacity],
  Out_idx: [1, capacity],
}))

test('expands fixed and Circom-constant logical port lengths', () => {
  const constants = parseCircomConstants([
    'function nBatch() {return 2;}',
    'function ignored() {return 7;}',
  ].join('\n'))
  const logicalInterface = parseLogicalInterface(JSON.stringify({
    inputs: [
      { name: 'word', logicalType: UINT256 },
      {
        name: 'bit',
        length: { constant: 'nBatch', offset: 1 },
        logicalType: BIT,
      },
    ],
    outputs: [],
  }), constants)

  assert.deepEqual(logicalInterface.inputs.map(({ name }) => name), [
    'word',
    'bit[0]',
    'bit[1]',
    'bit[2]',
  ])
  assert.equal(countPhysicalWires(logicalInterface.inputs), 5)
})

test('derives physical wire counts from closed logical types', () => {
  assert.equal(countPhysicalWires([
    { name: 'uint128', logicalType: { kind: 'uint', bits: 128 } },
    { name: 'uint129', logicalType: { kind: 'uint', bits: 129 } },
    { name: 'uint160', logicalType: { kind: 'uint', bits: 160 } },
    { name: 'uint161', logicalType: { kind: 'uint', bits: 161 } },
    { name: 'field', logicalType: { kind: 'bls12-381-fr' } },
    { name: 'scalar', logicalType: { kind: 'jubjub-scalar' } },
  ]), 7)
})

test('rejects fields outside the closed logical type definitions', () => {
  assert.throws(
    () => parseLogicalInterface(JSON.stringify({
      inputs: [{
        name: 'word',
        logicalType: {
          wireLayout: { kind: 'limbs-128', count: 1 },
          kind: 'uint',
          bits: 256,
        },
      }],
      outputs: [],
    }), new Map()),
    /unsupported field 'wireLayout'/,
  )

  assert.throws(
    () => parseLogicalInterface(JSON.stringify({
      inputs: [{ name: 'word', logicalType: { kind: 'uint', bits: 257 } }],
      outputs: [],
    }), new Map()),
    /bits must be an integer between 1 and 256/,
  )
})

test('requires exactly one JSON declaration for every non-buffer target', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qap-interface-test-'))
  context.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const interfaceDir = path.join(root, 'interface')
  fs.mkdirSync(interfaceDir)
  const constantsPath = path.join(root, 'constants.circom')
  fs.writeFileSync(constantsPath, '')
  fs.writeFileSync(path.join(interfaceDir, 'Example.json'), JSON.stringify({
    inputs: [{ name: 'word', logicalType: UINT256 }],
    outputs: [],
  }))

  const subcircuits = [
    { name: 'bufferTxIn', In_idx: [1, 6], Out_idx: [1, 0] },
    { name: 'Example', In_idx: [1, 2], Out_idx: [1, 0] },
  ]
  const constants = parseCircomConstants(fs.readFileSync(constantsPath, 'utf8'), constantsPath)
  assert.equal(loadLogicalInterfaces(subcircuits, interfaceDir, constants).size, 1)

  assert.throws(
    () => loadLogicalInterfaces([
      ...subcircuits,
      { name: 'bufferLikeOperation', In_idx: [1, 2], Out_idx: [1, 0] },
    ], interfaceDir, constants),
    /interface file is missing for subcircuit 'bufferLikeOperation'/,
  )

  fs.rmSync(path.join(interfaceDir, 'Example.json'))
  assert.throws(
    () => loadLogicalInterfaces(subcircuits, interfaceDir, constants),
    /interface file is missing for subcircuit 'Example'/,
  )

  fs.writeFileSync(path.join(interfaceDir, 'Example.json'), JSON.stringify({
    inputs: [{ name: 'word', logicalType: UINT256 }],
    outputs: [],
  }))
  fs.writeFileSync(path.join(interfaceDir, 'Extra.json'), JSON.stringify({ inputs: [], outputs: [] }))
  assert.throws(
    () => loadLogicalInterfaces(subcircuits, interfaceDir, constants),
    /Extra\.json.*no compiled non-buffer subcircuit/,
  )
})

test('rejects logical wire counts that disagree with compiled interfaces', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qap-interface-test-'))
  context.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const interfaceDir = path.join(root, 'interface')
  fs.mkdirSync(interfaceDir)
  const constantsPath = path.join(root, 'constants.circom')
  fs.writeFileSync(constantsPath, '')
  fs.writeFileSync(path.join(interfaceDir, 'Example.json'), JSON.stringify({
    inputs: [{ name: 'word', logicalType: UINT256 }],
    outputs: [],
  }))

  assert.throws(
    () => loadLogicalInterfaces(
      [{ name: 'Example', In_idx: [1, 3], Out_idx: [1, 0] }],
      interfaceDir,
      parseCircomConstants(fs.readFileSync(constantsPath, 'utf8'), constantsPath),
    ),
    /Logical inputs expand to 2 wires, but Example has 3 compiled input wires/,
  )
})

test('validates compiled buffers and attaches verified logical interfaces', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qap-interface-stage-test-'))
  context.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const interfaceDir = path.join(root, 'interface')
  fs.mkdirSync(interfaceDir)
  const constantsPath = path.join(root, 'constants.circom')
  fs.writeFileSync(constantsPath, [
    'function nLogOut(){ return 5; }',
    'function nStorageStore(){ return 6; }',
    'function nStorageLoad(){ return 7; }',
    'function nTxIn(){ return 8; }',
    'function nBlockIn(){ return 9; }',
    'function nEVMIn(){ return 10; }',
    'function nPrvIn(){ return 11; }',
  ].join('\n'))
  fs.writeFileSync(path.join(interfaceDir, 'Example.json'), JSON.stringify({
    inputs: [{ name: 'word', logicalType: UINT256 }],
    outputs: [],
  }))

  const validated = validateCompiledSubcircuitInterfaces([
    ...BUFFER_SUBCIRCUITS,
    { name: 'Example', In_idx: [1, 2], Out_idx: [1, 0] },
  ], interfaceDir, constantsPath)

  assert.deepEqual(validated.at(-1).logicalInterface, {
    inputs: [{ name: 'word', logicalType: UINT256 }],
    outputs: [],
  })
})

test('validates buffer input and output wire counts independently', () => {
  assert.doesNotThrow(() => validateBufferCapacities(BUFFER_SUBCIRCUITS, BUFFER_CAPACITIES))

  const wrongInput = BUFFER_SUBCIRCUITS.map((subcircuit) => ({
    ...subcircuit,
    In_idx: [...subcircuit.In_idx],
    Out_idx: [...subcircuit.Out_idx],
  }))
  wrongInput[3].In_idx[1] += 1
  assert.throws(
    () => validateBufferCapacities(wrongInput, BUFFER_CAPACITIES),
    /bufferTxIn has 9 compiled input wires, but nTxIn is 8/,
  )

  const wrongOutput = BUFFER_SUBCIRCUITS.map((subcircuit) => ({
    ...subcircuit,
    In_idx: [...subcircuit.In_idx],
    Out_idx: [...subcircuit.Out_idx],
  }))
  wrongOutput[3].Out_idx[1] += 1
  assert.throws(
    () => validateBufferCapacities(wrongOutput, BUFFER_CAPACITIES),
    /bufferTxIn has 9 compiled output wires, but nTxIn is 8/,
  )
})

test('requires every buffer capacity constant and compiled buffer', () => {
  const missingConstant = new Map(BUFFER_CAPACITIES)
  missingConstant.delete('nBlockIn')
  assert.throws(
    () => validateBufferCapacities(BUFFER_SUBCIRCUITS, missingConstant),
    /nBlockIn.*positive safe integer/,
  )

  assert.throws(
    () => validateBufferCapacities(
      BUFFER_SUBCIRCUITS.filter(({ name }) => name !== 'bufferBlockIn'),
      BUFFER_CAPACITIES,
    ),
    /missing compiled subcircuit 'bufferBlockIn'/,
  )
})
