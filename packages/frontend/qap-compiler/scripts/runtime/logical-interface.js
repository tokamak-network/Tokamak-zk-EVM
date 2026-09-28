const CIRCOM_CONSTANT_PATTERN = /function\s+([A-Za-z_]\w*)\s*\(\)\s*{\s*return\s+(\d+)\s*;\s*}/g

function parseCircomConstants(sourceText, source = 'constants.circom') {
  const constants = new Map()
  const text = sourceText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n\r]*/g, '')

  for (const match of text.matchAll(CIRCOM_CONSTANT_PATTERN)) {
    const [, name, valueText] = match
    if (constants.has(name)) {
      throw new Error(`${source}: Duplicate Circom constant '${name}'.`)
    }
    constants.set(name, Number(valueText))
  }

  return constants
}

function expandPhysicalPorts(ports, source = 'logical interface ports') {
  if (!Array.isArray(ports)) {
    throw new TypeError(`${source} must be an array.`)
  }

  const physicalPorts = []
  for (const port of ports) {
    if (typeof port?.name !== 'string' || port.name.length === 0) {
      throw new TypeError(`${source} has a port without a valid name.`)
    }

    const logicalType = port.logicalType
    if (logicalType?.kind === 'uint') {
      if (!Number.isInteger(logicalType.bits) || logicalType.bits < 1 || logicalType.bits > 256) {
        throw new TypeError(`${source} port '${port.name}' has an invalid uint width.`)
      }
      if (logicalType.bits <= 160) {
        physicalPorts.push({ name: port.name, logicalType })
      } else {
        physicalPorts.push({ name: port.name, logicalType, limb: 'low' })
        physicalPorts.push({ name: port.name, logicalType, limb: 'high' })
      }
      continue
    }

    if (logicalType?.kind === 'bls12-381-fr' || logicalType?.kind === 'jubjub-scalar') {
      physicalPorts.push({ name: port.name, logicalType })
      continue
    }

    throw new TypeError(`${source} port '${port.name}' has an unsupported logical type '${logicalType?.kind}'.`)
  }

  return physicalPorts
}

function countPhysicalWires(ports) {
  return expandPhysicalPorts(ports).length
}

module.exports = {
  countPhysicalWires,
  expandPhysicalPorts,
  parseCircomConstants,
}
