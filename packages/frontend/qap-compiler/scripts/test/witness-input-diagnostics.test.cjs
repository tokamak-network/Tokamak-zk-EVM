const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  BLS12_381_FR_MODULUS,
  JUBJUB_SCALAR_ORDER,
  WARNING_CODE,
  buildPhysicalInputDescriptors,
  diagnoseWitnessInput,
  wrapWitnessCalculator,
} = require('../runtime/witness-input-diagnostics.js')
const {
  countPhysicalWires,
} = require('../runtime/logical-interface.js')

const packageRoot = path.resolve(__dirname, '..', '..')

function target(name, inputs) {
  const physicalInputCount = countPhysicalWires(inputs)
  return {
    name,
    In_idx: [1, physicalInputCount],
    logicalInterface: { inputs, outputs: [] },
  }
}

function warningsFor(targetInfo, values) {
  const warnings = []
  diagnoseWitnessInput(targetInfo, { in: values }, (warning) => warnings.push(warning))
  return warnings
}

test('checks every closed logical input boundary without exposing values', () => {
  const cases = [
    {
      accepted: [0n, 1n],
      firstRejected: 2n,
      logicalType: { kind: 'uint', bits: 1 },
      name: 'bit',
    },
    {
      accepted: [0n, (1n << 128n) - 1n],
      firstRejected: 1n << 128n,
      logicalType: { kind: 'uint', bits: 128 },
      name: 'limb',
    },
    {
      accepted: [0n, BLS12_381_FR_MODULUS - 1n],
      firstRejected: BLS12_381_FR_MODULUS,
      logicalType: { kind: 'bls12-381-fr' },
      name: 'field',
    },
    {
      accepted: [0n, JUBJUB_SCALAR_ORDER - 1n],
      firstRejected: JUBJUB_SCALAR_ORDER,
      logicalType: { kind: 'jubjub-scalar' },
      name: 'scalar',
    },
  ]

  for (const entry of cases) {
    const targetInfo = target(entry.name, [{ name: entry.name, logicalType: entry.logicalType }])
    for (const value of entry.accepted) {
      assert.deepEqual(warningsFor(targetInfo, [value]), [], `${entry.name}: ${value}`)
    }
    for (const value of [entry.firstRejected, -1n]) {
      const warnings = warningsFor(targetInfo, [value])
      assert.equal(warnings.length, 1)
      assert.equal(warnings[0].code, WARNING_CODE)
      assert.equal(warnings[0].target, entry.name)
      assert.equal(warnings[0].portName, entry.name)
      assert.equal(warnings[0].physicalInputIndex, 0)
      assert.ok(!Object.hasOwn(warnings[0], 'value'))
    }
  }

  const privateValue = BLS12_381_FR_MODULUS + 1234567890123456789n
  const privateWarning = warningsFor(
    target('private', [{ name: 'private', logicalType: { kind: 'bls12-381-fr' } }]),
    [privateValue],
  )[0]
  assert.ok(!JSON.stringify(privateWarning).includes(privateValue.toString()))
})

test('checks a uint160 native wire against its exact declared width', () => {
  const targetInfo = target('NarrowWord', [
    { name: 'address[3]', logicalType: { kind: 'uint', bits: 160 } },
  ])
  const limit = 1n << 160n

  assert.deepEqual(warningsFor(targetInfo, [0n]), [])
  assert.deepEqual(warningsFor(targetInfo, [limit - 1n]), [])

  const warning = warningsFor(targetInfo, [limit])
  assert.equal(warning.length, 1)
  assert.deepEqual(
    {
      physicalInputIndex: warning[0].physicalInputIndex,
      portName: warning[0].portName,
      repetitionIndex: warning[0].repetitionIndex,
    },
    { physicalInputIndex: 0, portName: 'address', repetitionIndex: 3 },
  )
})

test('covers every generated production physical input exactly once', () => {
  const catalog = JSON.parse(fs.readFileSync(
    path.join(packageRoot, 'subcircuits', 'library', 'subcircuitInfo.json'),
    'utf8',
  ))

  for (const targetInfo of catalog) {
    const descriptors = buildPhysicalInputDescriptors(targetInfo)
    assert.deepEqual(
      descriptors.map(({ physicalInputIndex }) => physicalInputIndex),
      Array.from({ length: targetInfo.In_idx[1] }, (_, index) => index),
      targetInfo.name,
    )
    assert.deepEqual(
      warningsFor(targetInfo, Array(targetInfo.In_idx[1]).fill(0n)),
      [],
      targetInfo.name,
    )
  }
})

test('keeps malformed input as hard errors', () => {
  const targetInfo = target('Example', [{ name: 'value', logicalType: { kind: 'uint', bits: 64 } }])
  for (const input of [
    null,
    [],
    {},
    { in: 1n },
    { in: [1n], extra: [] },
    { in: [] },
    { in: [1.5] },
    { in: [Number.MAX_SAFE_INTEGER + 1] },
    { in: [''] },
    { in: [' 1'] },
    { in: [{}] },
  ]) {
    assert.throws(() => diagnoseWitnessInput(targetInfo, input, () => {}))
  }
})

test('warns before invoking the unchanged witness calculator', async () => {
  const calls = []
  const returnedWitness = Object.freeze([1n, 2n])
  const calculator = {
    async calculateWitness(input, sanityCheck) {
      calls.push({ input, sanityCheck })
      return returnedWitness
    },
  }
  const targetInfo = target('FieldConsumer', [
    { name: 'privateField', logicalType: { kind: 'bls12-381-fr' } },
  ])
  const input = { in: [BLS12_381_FR_MODULUS] }
  const warnings = []
  const wrapped = wrapWitnessCalculator(targetInfo, calculator, (warning) => warnings.push(warning))

  assert.equal(await wrapped.calculateWitness(input, true), returnedWitness)
  assert.equal(warnings.length, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].input, input)
  assert.equal(calls[0].sanityCheck, true)

  const failure = new Error('calculator failure')
  calculator.calculateWitness = async () => { throw failure }
  await assert.rejects(wrapped.calculateWitness(input, false), (error) => error === failure)
})

test('the qap witness CLI uses the common diagnostic wrapper', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qap-diagnostic-cli-'))
  context.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const libraryDir = path.join(root, 'library')
  const wasmDir = path.join(libraryDir, 'wasm')
  fs.mkdirSync(wasmDir, { recursive: true })

  const checkedInLibrary = path.join(packageRoot, 'subcircuits', 'library')
  for (const file of ['subcircuitInfo.json', 'witness_calculator.js']) {
    fs.copyFileSync(path.join(checkedInLibrary, file), path.join(libraryDir, file))
  }
  for (const file of ['generate_witness.js', 'logical-interface.js', 'witness-input-diagnostics.js']) {
    fs.copyFileSync(path.join(packageRoot, 'scripts', 'runtime', file), path.join(libraryDir, file))
  }
  const wasmPath = path.join(wasmDir, 'subcircuit3.wasm')
  fs.copyFileSync(path.join(checkedInLibrary, 'wasm', 'subcircuit3.wasm'), wasmPath)

  const privateValue = BLS12_381_FR_MODULUS + 1234567890123456789n
  const inputPath = path.join(root, 'input.json')
  const witnessPath = path.join(root, 'output.wtns')
  fs.writeFileSync(inputPath, JSON.stringify({
    in: [privateValue.toString(), '0', '0', '0'],
  }))
  const result = spawnSync(
    process.execPath,
    [path.join(libraryDir, 'generate_witness.js'), wasmPath, inputPath, witnessPath],
    { encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.ok(fs.statSync(witnessPath).size > 0)
  assert.match(result.stderr, new RegExp(WARNING_CODE))
  assert.ok(!result.stderr.includes(privateValue.toString()))
})
