function ceilPowerOfTwo(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Wire capacities must be positive safe integers.')
  }

  let capacity = 1
  while (capacity < value) capacity *= 2
  return capacity
}

function _getPortRange(targetSubcircuit, direction) {
  if (direction === 'in') return targetSubcircuit.In_idx
  if (direction === 'out') return targetSubcircuit.Out_idx
  throw new Error(`buildNormalizedWireLayout: Unsupported port direction '${direction}'.`)
}

function _assertRange(range, label, wireCount) {
  if (!Array.isArray(range) || range.length !== 2
    || !Number.isSafeInteger(range[0]) || !Number.isSafeInteger(range[1])
    || range[0] < 0 || range[1] < 0 || range[0] + range[1] > wireCount) {
    throw new Error(`buildNormalizedWireLayout: Invalid ${label} range.`)
  }
}

function _validateCompiledLayout(subcircuits) {
  const names = new Set()
  for (const [expectedId, subcircuit] of subcircuits.entries()) {
    if (subcircuit.id !== expectedId) {
      throw new Error(
        `buildNormalizedWireLayout: Expected contiguous subcircuit id ${expectedId}, found ${subcircuit.id}.`,
      )
    }
    if (typeof subcircuit.name !== 'string' || subcircuit.name.length === 0
      || names.has(subcircuit.name)) {
      throw new Error('buildNormalizedWireLayout: Subcircuit names must be unique non-empty strings.')
    }
    if (!Number.isSafeInteger(subcircuit.Nwires) || subcircuit.Nwires < 1
      || !Number.isSafeInteger(subcircuit.Nconsts) || subcircuit.Nconsts < 0) {
      throw new Error(`buildNormalizedWireLayout: Invalid compiled dimensions for '${subcircuit.name}'.`)
    }
    _assertRange(subcircuit.Out_idx, `${subcircuit.name} output`, subcircuit.Nwires)
    _assertRange(subcircuit.In_idx, `${subcircuit.name} input`, subcircuit.Nwires)

    const [outputStart, outputCount] = subcircuit.Out_idx
    const [inputStart, inputCount] = subcircuit.In_idx
    if (outputStart !== 1 || inputStart !== 1 + outputCount) {
      throw new Error(
        `buildNormalizedWireLayout: '${subcircuit.name}' does not use constant/output/input wire order.`,
      )
    }
    const wiringCount = 1 + outputCount + inputCount
    if (wiringCount > subcircuit.Nwires) {
      throw new Error(`buildNormalizedWireLayout: '${subcircuit.name}' ports exceed its wire count.`)
    }
    names.add(subcircuit.name)
  }
}

function _validateLibraryLayout(subcircuitByName, libraryLayout) {
  const declarationByName = new Map()
  for (const declaration of libraryLayout.bufferDeclarations) {
    const { name, direction } = declaration
    if (typeof name !== 'string' || name.length === 0 || declarationByName.has(name)) {
      throw new Error('buildNormalizedWireLayout: Buffer names must be unique non-empty strings.')
    }
    if (direction !== 'in' && direction !== 'out') {
      throw new Error(`buildNormalizedWireLayout: Buffer '${name}' has an invalid direction.`)
    }
    const subcircuit = subcircuitByName.get(name)
    if (subcircuit === undefined) {
      throw new Error(`buildNormalizedWireLayout: Missing declared buffer '${name}'.`)
    }
    if (subcircuit.logicalInterface !== undefined) {
      throw new Error(`buildNormalizedWireLayout: Buffer '${name}' has a non-buffer logical interface.`)
    }
    declarationByName.set(name, declaration)
  }

  const phaseByName = new Map()
  let reachedFixed = false
  for (const phase of libraryLayout.publicWirePhases) {
    if (typeof phase.name !== 'string' || phase.name.length === 0 || phaseByName.has(phase.name)
      || (phase.region !== 'free' && phase.region !== 'fixed')) {
      throw new Error('buildNormalizedWireLayout: Invalid public wire phase.')
    }
    if (reachedFixed && phase.region === 'free') {
      throw new Error(`buildNormalizedWireLayout: Free phase '${phase.name}' follows a fixed phase.`)
    }
    reachedFixed ||= phase.region === 'fixed'
    phaseByName.set(phase.name, phase)
  }

  const publicSegmentByName = new Map()
  for (const segment of libraryLayout.publicWireSegments) {
    const declaration = declarationByName.get(segment.name)
    if (declaration === undefined || publicSegmentByName.has(segment.name)
      || segment.direction !== declaration.direction || !phaseByName.has(segment.phase)) {
      throw new Error(`buildNormalizedWireLayout: Invalid public segment for '${segment.name}'.`)
    }
    publicSegmentByName.set(segment.name, segment)
  }

  for (const declaration of declarationByName.values()) {
    const segment = publicSegmentByName.get(declaration.name)
    if (segment === undefined && declaration.publicPhase !== undefined) {
      throw new Error(`buildNormalizedWireLayout: Missing public segment for '${declaration.name}'.`)
    }
    if (segment !== undefined && declaration.publicPhase !== segment.phase) {
      throw new Error(`buildNormalizedWireLayout: Public phase mismatch for '${declaration.name}'.`)
    }
  }

  return { declarationByName, publicSegmentByName }
}

function buildNormalizedWireLayout(subcircuits, libraryLayout) {
  _validateCompiledLayout(subcircuits)
  const subcircuitByName = new Map(subcircuits.map((subcircuit) => [subcircuit.name, subcircuit]))
  const { declarationByName, publicSegmentByName } = _validateLibraryLayout(
    subcircuitByName,
    libraryLayout,
  )

  const dimensions = subcircuits.map((subcircuit) => {
    const wiringCount = 1 + subcircuit.Out_idx[1] + subcircuit.In_idx[1]
    return {
      internalCount: subcircuit.Nwires - wiringCount,
      wiringCount,
    }
  })
  const m_b = ceilPowerOfTwo(Math.max(...dimensions.map(({ wiringCount }) => wiringCount)))
  const m = ceilPowerOfTwo(
    m_b + Math.max(...dimensions.map(({ internalCount }) => internalCount)),
  )

  const normalizedSubcircuits = subcircuits.map((subcircuit, id) => {
    const { internalCount, wiringCount } = dimensions[id]
    const declaration = declarationByName.get(subcircuit.name)
    const publicSegment = publicSegmentByName.get(subcircuit.name)
    const publicRange = publicSegment === undefined
      ? [0, 0]
      : [..._getPortRange(subcircuit, publicSegment.direction)]
    const normalized = {
      ...subcircuit,
      Nwires: m,
      NrealWires: subcircuit.Nwires,
      Wiring_idx: [0, wiringCount],
      Public_idx: publicRange,
      Internal_idx: [m_b, internalCount],
    }
    if (declaration !== undefined) normalized.bufferDirection = declaration.direction
    if (publicSegment !== undefined) normalized.publicPhase = publicSegment.phase
    return normalized
  })

  const publicWirePhases = libraryLayout.publicWirePhases.map(({ name, region }) => ({
    name,
    region,
    subcircuitIds: libraryLayout.publicWireSegments
      .filter(({ phase }) => phase === name)
      .map(({ name: subcircuitName }) => subcircuitByName.get(subcircuitName).id),
  }))

  return {
    m,
    m_b,
    publicWirePhases,
    subcircuits: normalizedSubcircuits,
  }
}

function buildSetupParams(normalizedLayout, subcircuits, s) {
  const maximumConstraintCount = Math.max(...subcircuits.map(({ Nconsts }) => Nconsts))
  return {
    n: ceilPowerOfTwo(Math.max(1, maximumConstraintCount)),
    m: normalizedLayout.m,
    m_b: normalizedLayout.m_b,
    t: ceilPowerOfTwo(subcircuits.length + 1),
    s,
    publicWirePhases: normalizedLayout.publicWirePhases,
  }
}

module.exports = {
  buildNormalizedWireLayout,
  buildSetupParams,
  ceilPowerOfTwo,
}
