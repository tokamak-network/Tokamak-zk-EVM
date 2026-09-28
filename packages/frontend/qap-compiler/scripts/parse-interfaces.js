const fs = require('node:fs')
const path = require('node:path')
const { CONDITIONAL_SUBCIRCUIT_NAMES, LIBRARY_LAYOUT } = require('./configure.js')
const {
  countPhysicalWires,
  parseCircomConstants,
} = require('./runtime/logical-interface.js')

const PORT_KEYS = new Set(['name', 'logicalType', 'length'])
const { bufferDeclarations: BUFFER_DECLARATIONS } = LIBRARY_LAYOUT
const BUFFER_NAMES = new Set(BUFFER_DECLARATIONS.map(({ name }) => name))

function assertObject(value, description) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${description} must be an object.`)
  }
}

function assertOnlyKeys(value, allowedKeys, description) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${description} has unsupported field '${key}'.`)
    }
  }
}

function validateLogicalType(value, description) {
  assertObject(value, description)
  if (value.kind === 'uint') {
    assertOnlyKeys(value, new Set(['kind', 'bits']), description)
    if (!Number.isInteger(value.bits) || value.bits < 1 || value.bits > 256) {
      throw new Error(`${description}.bits must be an integer between 1 and 256.`)
    }
  } else if (value.kind === 'bls12-381-fr' || value.kind === 'jubjub-scalar') {
    assertOnlyKeys(value, new Set(['kind']), description)
  } else {
    throw new Error(`${description}.kind is unsupported.`)
  }

  return { ...value }
}

function resolveLength(value, constants, description) {
  if (value === undefined) {
    return 1
  }
  if (Number.isInteger(value)) {
    if (value < 1) {
      throw new Error(`${description} must be positive.`)
    }
    return value
  }

  assertObject(value, description)
  assertOnlyKeys(value, new Set(['constant', 'offset']), description)
  if (typeof value.constant !== 'string' || value.constant.length === 0) {
    throw new Error(`${description}.constant must be a non-empty string.`)
  }
  const constant = constants.get(value.constant)
  if (constant === undefined) {
    throw new Error(`${description} references unknown Circom constant '${value.constant}'.`)
  }
  const offset = value.offset ?? 0
  if (!Number.isInteger(offset)) {
    throw new Error(`${description}.offset must be an integer.`)
  }
  const length = constant + offset
  if (!Number.isSafeInteger(length) || length < 1) {
    throw new Error(`${description} resolves to invalid length ${length}.`)
  }
  return length
}

function expandPorts(ports, constants, description) {
  if (!Array.isArray(ports)) {
    throw new Error(`${description} must be an array.`)
  }

  const expanded = []
  const names = new Set()
  for (const [index, port] of ports.entries()) {
    const portDescription = `${description}[${index}]`
    assertObject(port, portDescription)
    assertOnlyKeys(port, PORT_KEYS, portDescription)
    if (typeof port.name !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(port.name)) {
      throw new Error(`${portDescription}.name must be an alphanumeric identifier.`)
    }
    if (!Object.hasOwn(port, 'logicalType')) {
      throw new Error(`${portDescription} must define logicalType.`)
    }

    const logicalType = validateLogicalType(port.logicalType, `${portDescription}.logicalType`)
    const length = resolveLength(port.length, constants, `${portDescription}.length`)
    for (let repeatedIndex = 0; repeatedIndex < length; repeatedIndex++) {
      const name = length === 1 ? port.name : `${port.name}[${repeatedIndex}]`
      if (names.has(name)) {
        throw new Error(`${description} has duplicate expanded port name '${name}'.`)
      }
      names.add(name)
      expanded.push({ name, logicalType })
    }
  }
  return expanded
}

function validateBufferCapacities(subcircuits, constants) {
  const subcircuitByName = new Map(subcircuits.map((subcircuit) => [subcircuit.name, subcircuit]))

  for (const { name: bufferName, capacityConstant: constantName } of BUFFER_DECLARATIONS) {
    if (typeof constantName !== 'string' || constantName.length === 0) {
      throw new Error(`Buffer '${bufferName}' must declare a capacity constant.`)
    }
    const subcircuit = subcircuitByName.get(bufferName)
    if (subcircuit === undefined) {
      throw new Error(`Buffer capacity validation is missing compiled subcircuit '${bufferName}'.`)
    }
    const capacity = constants.get(constantName)
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error(`Buffer capacity constant '${constantName}' must be a positive safe integer.`)
    }
    if (subcircuit.In_idx[1] !== capacity) {
      throw new Error(
        `${bufferName} has ${subcircuit.In_idx[1]} compiled input wires, but ${constantName} is ${capacity}.`,
      )
    }
    if (subcircuit.Out_idx[1] !== capacity) {
      throw new Error(
        `${bufferName} has ${subcircuit.Out_idx[1]} compiled output wires, but ${constantName} is ${capacity}.`,
      )
    }
  }
}

function parseLogicalInterface(sourceText, constants, source = 'logical interface') {
  let value
  try {
    value = JSON.parse(sourceText)
  } catch (error) {
    throw new Error(`${source}: Invalid JSON: ${error.message}`)
  }

  assertObject(value, source)
  assertOnlyKeys(value, new Set(['inputs', 'outputs']), source)
  if (!Object.hasOwn(value, 'inputs') || !Object.hasOwn(value, 'outputs')) {
    throw new Error(`${source} must define inputs and outputs.`)
  }

  return {
    inputs: expandPorts(value.inputs, constants, `${source}.inputs`),
    outputs: expandPorts(value.outputs, constants, `${source}.outputs`),
  }
}

function loadLogicalInterfaces(subcircuits, interfaceDir, constants) {
  const expectedNames = new Set(
    subcircuits
      .map(({ name }) => name)
      .filter((name) => !BUFFER_NAMES.has(name)),
  )
  const entries = fs.readdirSync(interfaceDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === 'conditional') continue
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      throw new Error(`Logical interface directory has unsupported entry '${entry.name}'.`)
    }
  }
  const actualNames = new Set(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.slice(0, -'.json'.length)),
  )

  const conditionalInterfaceDir = path.join(interfaceDir, 'conditional')
  const conditionalEntries = fs.existsSync(conditionalInterfaceDir)
    ? fs.readdirSync(conditionalInterfaceDir, { withFileTypes: true })
    : []
  for (const entry of conditionalEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      throw new Error(`Conditional logical interface directory has unsupported entry '${entry.name}'.`)
    }
  }
  const conditionalNames = new Set(conditionalEntries.map((entry) => entry.name.slice(0, -'.json'.length)))
  const configuredConditionalNames = new Set(CONDITIONAL_SUBCIRCUIT_NAMES)
  if (conditionalEntries.length > 0) {
    for (const name of configuredConditionalNames) {
      if (!conditionalNames.has(name)) {
        throw new Error(`Conditional logical interface file '${name}.json' is missing.`)
      }
    }
  }
  for (const name of conditionalNames) {
    if (!configuredConditionalNames.has(name)) {
      throw new Error(`Conditional logical interface file '${name}.json' is not configured.`)
    }
  }

  for (const name of expectedNames) {
    if (!actualNames.has(name) && !conditionalNames.has(name)) {
      throw new Error(`Logical interface file is missing for subcircuit '${name}'.`)
    }
  }
  for (const name of actualNames) {
    if (!expectedNames.has(name)) {
      throw new Error(`Logical interface file '${name}.json' has no compiled non-buffer subcircuit.`)
    }
  }

  const interfaces = new Map()
  for (const subcircuit of subcircuits) {
    if (!expectedNames.has(subcircuit.name)) {
      continue
    }
    const source = actualNames.has(subcircuit.name)
      ? path.join(interfaceDir, `${subcircuit.name}.json`)
      : path.join(conditionalInterfaceDir, `${subcircuit.name}.json`)
    const logicalInterface = parseLogicalInterface(
      fs.readFileSync(source, 'utf8'),
      constants,
      source,
    )
    const inputWires = countPhysicalWires(logicalInterface.inputs)
    const outputWires = countPhysicalWires(logicalInterface.outputs)
    if (inputWires !== subcircuit.In_idx[1]) {
      throw new Error(
        `${source}: Logical inputs expand to ${inputWires} wires, but ${subcircuit.name} has ${subcircuit.In_idx[1]} compiled input wires.`,
      )
    }
    if (outputWires !== subcircuit.Out_idx[1]) {
      throw new Error(
        `${source}: Logical outputs expand to ${outputWires} wires, but ${subcircuit.name} has ${subcircuit.Out_idx[1]} compiled output wires.`,
      )
    }
    interfaces.set(subcircuit.name, logicalInterface)
  }

  return interfaces
}

function validateCompiledSubcircuitInterfaces(subcircuits, interfaceDir, constantsPath) {
  const constants = parseCircomConstants(
    fs.readFileSync(constantsPath, 'utf8'),
    constantsPath,
  )
  validateBufferCapacities(subcircuits, constants)
  const logicalInterfaces = loadLogicalInterfaces(subcircuits, interfaceDir, constants)

  return subcircuits.map((subcircuit) => {
    const logicalInterface = logicalInterfaces.get(subcircuit.name)
    return logicalInterface === undefined
      ? subcircuit
      : { ...subcircuit, logicalInterface }
  })
}

module.exports = {
  loadLogicalInterfaces,
  parseLogicalInterface,
  validateBufferCapacities,
  validateCompiledSubcircuitInterfaces,
}
