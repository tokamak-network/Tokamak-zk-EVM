const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  normalizeConstraintJsonFile,
  normalizeR1csBuffer,
  normalizeR1csFile,
  wireRemap,
} = require('../normalize-r1cs.js')

function u32(value) {
  const out = Buffer.alloc(4)
  out.writeUInt32LE(value)
  return out
}

function u64(value) {
  const out = Buffer.alloc(8)
  out.writeBigUInt64LE(BigInt(value))
  return out
}

function section(kind, data) {
  return Buffer.concat([u32(kind), u64(data.length), data])
}

function fixtureR1cs(rows = [[[[0, 1], [4, 2]], [[3, 3]], [[5, 4]]]]) {
  const fieldSize = 8
  const prime = Buffer.alloc(fieldSize)
  prime.writeBigUInt64LE(97n)
  const header = Buffer.concat([
    u32(fieldSize),
    prime,
    u32(6),
    u32(2),
    u32(1),
    u32(0),
    u64(6),
    u32(rows.length),
  ])
  const coefficient = value => {
    const out = Buffer.alloc(fieldSize)
    out.writeBigUInt64LE(BigInt(value))
    return out
  }
  const linearCombination = entries => Buffer.concat([
    u32(entries.length),
    ...entries.flatMap(([wire, value]) => [u32(wire), coefficient(value)]),
  ])
  const constraints = Buffer.concat(rows.flatMap(row => row.map(linearCombination)))
  return Buffer.concat([
    Buffer.from('r1cs'), u32(1), u32(2), section(1, header), section(2, constraints),
  ])
}

function readConstraintWires(buffer) {
  let offset = 12
  const sections = new Map()
  for (let i = 0; i < buffer.readUInt32LE(8); i++) {
    const kind = buffer.readUInt32LE(offset)
    const size = Number(buffer.readBigUInt64LE(offset + 4))
    sections.set(kind, buffer.subarray(offset + 12, offset + 12 + size))
    offset += 12 + size
  }
  const header = sections.get(1)
  const fieldSize = header.readUInt32LE(0)
  const constraints = sections.get(2)
  offset = 0
  const wires = []
  for (let matrix = 0; matrix < 3; matrix++) {
    const count = constraints.readUInt32LE(offset)
    offset += 4
    const matrixWires = []
    for (let entry = 0; entry < count; entry++) {
      matrixWires.push(constraints.readUInt32LE(offset))
      offset += 4 + fieldSize
    }
    wires.push(matrixWires)
  }
  return { header, wires }
}

test('moves only internal R1CS columns behind m_b', () => {
  const normalized = normalizeR1csBuffer(fixtureR1cs(), {
    m: 16,
    m_b: 8,
    realWireCount: 6,
    wiringCount: 4,
  })
  const { header, wires } = readConstraintWires(normalized)

  assert.equal(header.readUInt32LE(12), 16)
  assert.deepEqual(wires, [[0, 8], [3], [9]])
  assert.equal(normalized.readUInt32LE(8), 2)
})

test('rejects wire coordinates outside the compiled and normalized ranges', () => {
  assert.equal(wireRemap(3, 4, 8, 6, 16), 3)
  assert.equal(wireRemap(4, 4, 8, 6, 16), 8)
  assert.throws(() => wireRemap(6, 4, 8, 6, 16), /outside the compiled wire range/)
  assert.throws(() => wireRemap(5, 4, 8, 6, 9), /exceeds m/)
})

test('canonicalizes permuted constraints into identical R1CS bytes', () => {
  const firstRow = [[[0, 1], [4, 2]], [[3, 3]], [[5, 4]]]
  const secondRow = [[[1, 5]], [[2, 6]], [[4, 7]]]
  const layout = { m: 16, m_b: 8, realWireCount: 6, wiringCount: 4 }

  const first = normalizeR1csBuffer(fixtureR1cs([firstRow, secondRow]), layout)
  const second = normalizeR1csBuffer(fixtureR1cs([secondRow, firstRow]), layout)

  assert.deepEqual(first, second)
})

test('regenerates JSON from the canonical binary constraint sequence', () => {
  const firstRow = [[[0, 1], [4, 2]], [[3, 3]], [[5, 4]]]
  const secondRow = [[[1, 5]], [[2, 6]], [[4, 7]]]
  const layout = { m: 16, m_b: 8, realWireCount: 6, wiringCount: 4 }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokamak-normalize-r1cs-'))
  const firstR1cs = path.join(root, 'first.r1cs')
  const secondR1cs = path.join(root, 'second.r1cs')
  const firstJson = path.join(root, 'first.json')
  const secondJson = path.join(root, 'second.json')
  const toJsonRow = row => row.map(matrix => Object.fromEntries(matrix.map(([wire, coefficient]) => [wire, String(coefficient)])))

  try {
    fs.writeFileSync(firstR1cs, fixtureR1cs([firstRow, secondRow]))
    fs.writeFileSync(secondR1cs, fixtureR1cs([secondRow, firstRow]))
    fs.writeFileSync(firstJson, JSON.stringify({ constraints: [toJsonRow(firstRow), toJsonRow(secondRow)] }))
    fs.writeFileSync(secondJson, JSON.stringify({ constraints: [toJsonRow(secondRow), toJsonRow(firstRow)] }))

    normalizeConstraintJsonFile(firstJson, layout, normalizeR1csFile(firstR1cs, layout))
    normalizeConstraintJsonFile(secondJson, layout, normalizeR1csFile(secondR1cs, layout))

    assert.deepEqual(fs.readFileSync(firstR1cs), fs.readFileSync(secondR1cs))
    assert.deepEqual(fs.readFileSync(firstJson), fs.readFileSync(secondJson))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
