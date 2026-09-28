const fs = require('node:fs')

function readU32(buffer, offset) {
  if (offset + 4 > buffer.length) throw new Error('Unexpected end of R1CS data.')
  return buffer.readUInt32LE(offset)
}

function readU64(buffer, offset) {
  if (offset + 8 > buffer.length) throw new Error('Unexpected end of R1CS data.')
  const value = buffer.readBigUInt64LE(offset)
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('R1CS section is too large.')
  return Number(value)
}

function writeU32(value) {
  const out = Buffer.allocUnsafe(4)
  out.writeUInt32LE(value)
  return out
}

function writeU64(value) {
  const out = Buffer.allocUnsafe(8)
  out.writeBigUInt64LE(BigInt(value))
  return out
}

function parseR1csSections(buffer) {
  if (buffer.subarray(0, 4).toString('ascii') !== 'r1cs') throw new Error('Invalid R1CS magic.')
  if (readU32(buffer, 4) !== 1) throw new Error('Unsupported R1CS version.')
  const sectionCount = readU32(buffer, 8)
  const sections = new Map()
  let offset = 12
  for (let i = 0; i < sectionCount; i++) {
    const kind = readU32(buffer, offset)
    const size = readU64(buffer, offset + 4)
    const start = offset + 12
    const end = start + size
    if (end > buffer.length || sections.has(kind)) throw new Error('Invalid R1CS section table.')
    sections.set(kind, buffer.subarray(start, end))
    offset = end
  }
  if (offset !== buffer.length || !sections.has(1) || !sections.has(2)) {
    throw new Error('R1CS must contain readable header and constraint sections.')
  }
  for (const kind of sections.keys()) {
    if (kind !== 1 && kind !== 2 && kind !== 3) {
      throw new Error(`Unsupported R1CS section ${kind}; refusing to discard it.`)
    }
  }
  return sections
}

function wireRemap(compiledWire, wiringCount, m_b, realWireCount, m) {
  if (!Number.isSafeInteger(compiledWire) || compiledWire < 0 || compiledWire >= realWireCount) {
    throw new Error(`R1CS wire ${compiledWire} is outside the compiled wire range.`)
  }
  const normalizedWire = compiledWire < wiringCount
    ? compiledWire
    : m_b + compiledWire - wiringCount
  if (normalizedWire >= m) throw new Error('Normalized R1CS wire exceeds m.')
  return normalizedWire
}

function normalizeHeader(header, { m, realWireCount }) {
  const out = Buffer.from(header)
  const fieldSize = readU32(out, 0)
  const primeOffset = 4
  const wireCountOffset = 4 + fieldSize
  const labelCountOffset = wireCountOffset + 16
  const constraintCountOffset = labelCountOffset + 8
  if (constraintCountOffset + 4 > out.length) throw new Error('Invalid R1CS header.')
  if (readU32(out, wireCountOffset) !== realWireCount) {
    throw new Error('R1CS wire count does not match producer metadata.')
  }
  out.writeUInt32LE(m, wireCountOffset)
  out.writeBigUInt64LE(BigInt(m), labelCountOffset)
  return {
    fieldSize,
    prime: readFieldElement(out.subarray(primeOffset, wireCountOffset), fieldSize, 'R1CS field prime'),
    header: out,
    nConstraints: readU32(out, constraintCountOffset),
  }
}

function readFieldElement(bytes, fieldSize, label) {
  if (bytes.length !== fieldSize) throw new Error(`${label} has an invalid field-element length.`)
  let value = 0n
  for (let index = fieldSize - 1; index >= 0; index--) value = (value << 8n) + BigInt(bytes[index])
  return value
}

function encodeFieldElement(value, fieldSize, prime, label) {
  if (typeof value !== 'bigint' || value < 0n || value >= prime) {
    throw new Error(`${label} is not a canonical field element.`)
  }
  const out = Buffer.alloc(fieldSize)
  let remaining = value
  for (let index = 0; index < fieldSize; index++) {
    out[index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
  return out
}

function readCanonicalRows(constraints, nConstraints, fieldSize, prime, layout) {
  const rows = []
  let offset = 0
  for (let row = 0; row < nConstraints; row++) {
    const matrices = []
    for (let matrix = 0; matrix < 3; matrix++) {
      const entryCount = readU32(constraints, offset)
      offset += 4
      const terms = []
      for (let entry = 0; entry < entryCount; entry++) {
        const wire = readU32(constraints, offset)
        const normalizedWire = wireRemap(
          wire,
          layout.wiringCount,
          layout.m_b,
          layout.realWireCount,
          layout.m,
        )
        offset += 4
        const coefficientEnd = offset + fieldSize
        if (coefficientEnd > constraints.length) throw new Error('Unexpected end of R1CS coefficient.')
        const coefficient = readFieldElement(
          constraints.subarray(offset, coefficientEnd),
          fieldSize,
          `R1CS coefficient at row ${row}, matrix ${matrix}, entry ${entry}`,
        )
        if (coefficient >= prime) {
          throw new Error(`R1CS coefficient at row ${row}, matrix ${matrix}, entry ${entry} is outside the field.`)
        }
        terms.push({ wire: normalizedWire, coefficient })
        offset = coefficientEnd
      }
      terms.sort((left, right) => left.wire - right.wire)
      for (let index = 1; index < terms.length; index++) {
        if (terms[index - 1].wire === terms[index].wire) {
          throw new Error(`R1CS row ${row}, matrix ${matrix} has duplicate wire ${terms[index].wire}.`)
        }
      }
      matrices.push(terms)
    }
    rows.push(matrices)
  }
  if (offset !== constraints.length) throw new Error('R1CS constraint section has trailing bytes.')
  return rows
}

function encodeCanonicalRow(row, fieldSize, prime) {
  if (!Array.isArray(row) || row.length !== 3) throw new Error('Invalid canonical R1CS row.')
  const chunks = []
  for (const terms of row) {
    chunks.push(writeU32(terms.length))
    for (const { wire, coefficient } of terms) {
      chunks.push(writeU32(wire), encodeFieldElement(coefficient, fieldSize, prime, `R1CS coefficient for wire ${wire}`))
    }
  }
  return Buffer.concat(chunks)
}

function sortCanonicalRows(rows, fieldSize, prime) {
  return rows
    .map(row => ({ row, encoding: encodeCanonicalRow(row, fieldSize, prime) }))
    .sort((left, right) => Buffer.compare(left.encoding, right.encoding))
}

function encodeCanonicalRows(rows, fieldSize, prime) {
  return Buffer.concat(rows.map(({ encoding }) => encoding))
}

function encodeR1cs(header, constraints) {
  return Buffer.concat([
    Buffer.from('r1cs'),
    writeU32(1),
    writeU32(2),
    writeU32(1),
    writeU64(header.length),
    header,
    writeU32(2),
    writeU64(constraints.length),
    constraints,
  ])
}

function normalizeR1csBuffer(buffer, layout) {
  const sections = parseR1csSections(buffer)
  const { fieldSize, prime, header, nConstraints } = normalizeHeader(sections.get(1), layout)
  const rows = sortCanonicalRows(
    readCanonicalRows(sections.get(2), nConstraints, fieldSize, prime, layout),
    fieldSize,
    prime,
  )
  return {
    buffer: encodeR1cs(header, encodeCanonicalRows(rows, fieldSize, prime)),
    fieldSize,
    prime,
    rows: rows.map(({ row }) => row),
  }
}

function normalizeR1csFile(filePath, layout) {
  const normalized = normalizeR1csBuffer(fs.readFileSync(filePath), layout)
  fs.writeFileSync(filePath, normalized.buffer)
  return normalized
}

function parseJsonFieldElement(value, prime, label) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} is not a canonical non-negative decimal field element.`)
  }
  const parsed = BigInt(value)
  if (parsed >= prime) throw new Error(`${label} is outside the field.`)
  return parsed
}

function parseJsonRows(document, layout, fieldSize, prime) {
  if (!Array.isArray(document.constraints)) throw new Error('Missing constraints array.')
  return document.constraints.map((constraint, rowIndex) => {
    if (!Array.isArray(constraint) || constraint.length !== 3) {
      throw new Error(`Invalid JSON R1CS constraint at row ${rowIndex}.`)
    }
    return constraint.map((matrix, matrixIndex) => {
      if (matrix === null || typeof matrix !== 'object' || Array.isArray(matrix)) {
        throw new Error(`Invalid JSON R1CS matrix at row ${rowIndex}, matrix ${matrixIndex}.`)
      }
      const terms = Object.entries(matrix).map(([wireText, coefficient]) => {
        if (!/^(0|[1-9][0-9]*)$/.test(wireText)) {
          throw new Error(`Invalid JSON R1CS wire at row ${rowIndex}, matrix ${matrixIndex}.`)
        }
        const wire = Number(wireText)
        return {
          wire: wireRemap(wire, layout.wiringCount, layout.m_b, layout.realWireCount, layout.m),
          coefficient: parseJsonFieldElement(
            coefficient,
            prime,
            `JSON R1CS coefficient at row ${rowIndex}, matrix ${matrixIndex}, wire ${wireText}`,
          ),
        }
      })
      terms.sort((left, right) => left.wire - right.wire)
      for (let index = 1; index < terms.length; index++) {
        if (terms[index - 1].wire === terms[index].wire) {
          throw new Error(`JSON R1CS row ${rowIndex}, matrix ${matrixIndex} has duplicate normalized wire ${terms[index].wire}.`)
        }
      }
      return terms
    })
  })
}

function assertSameCanonicalRows(left, right, fieldSize, prime, filePath) {
  if (left.length !== right.length) {
    throw new Error(`${filePath}: JSON and binary R1CS constraint counts differ.`)
  }
  for (let index = 0; index < left.length; index++) {
    if (!encodeCanonicalRow(left[index], fieldSize, prime).equals(encodeCanonicalRow(right[index], fieldSize, prime))) {
      throw new Error(`${filePath}: JSON and binary R1CS constraints differ after canonicalization.`)
    }
  }
}

function normalizeConstraintJsonFile(filePath, layout, canonicalR1cs) {
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (canonicalR1cs === undefined) throw new Error(`${filePath}: Missing canonical binary R1CS input.`)
  const jsonRows = sortCanonicalRows(
    parseJsonRows(document, layout, canonicalR1cs.fieldSize, canonicalR1cs.prime),
    canonicalR1cs.fieldSize,
    canonicalR1cs.prime,
  ).map(({ row }) => row)
  assertSameCanonicalRows(jsonRows, canonicalR1cs.rows, canonicalR1cs.fieldSize, canonicalR1cs.prime, filePath)
  const constraints = canonicalR1cs.rows.map(row => row.map(terms => {
    const matrix = {}
    for (const { wire, coefficient } of terms) matrix[wire] = coefficient.toString()
    return matrix
  }))
  const source = `{
"constraints": [
${constraints.map((constraint) => JSON.stringify(constraint)).join(',\n')}
]
}`
  fs.writeFileSync(filePath, source, 'utf8')
}

function normalizeR1csBufferOnly(buffer, layout) {
  return normalizeR1csBuffer(buffer, layout).buffer
}

module.exports = {
  normalizeConstraintJsonFile,
  normalizeR1csBuffer: normalizeR1csBufferOnly,
  normalizeR1csFile,
  wireRemap,
}
