const DIRECT_MAIN_SIGNAL_PATTERN = /^main\.[^.]+$/

function parseInteger(value, field, lineNumber, source) {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${source}:${lineNumber}: Invalid ${field} '${value}'.`)
  }

  return Number(value)
}

function parseSymbolTable(sourceText, source = 'symbol table') {
  const entries = []
  const symbolIndexes = new Set()

  for (const [lineIndex, rawLine] of sourceText.split(/\r?\n/).entries()) {
    const line = rawLine.trim()
    if (line.length === 0) {
      continue
    }

    const columns = line.split(',')
    const lineNumber = lineIndex + 1
    if (columns.length !== 4) {
      throw new Error(`${source}:${lineNumber}: Expected four comma-separated fields.`)
    }

    const symbolIndex = parseInteger(columns[0], 'symbol index', lineNumber, source)
    const wireIndex = parseInteger(columns[1], 'wire index', lineNumber, source)
    const componentIndex = parseInteger(columns[2], 'component index', lineNumber, source)
    const signalName = columns[3]

    if (symbolIndex < 1) {
      throw new Error(`${source}:${lineNumber}: Symbol index must be positive.`)
    }
    if (wireIndex < -1) {
      throw new Error(`${source}:${lineNumber}: Wire index must be -1 or non-negative.`)
    }
    if (componentIndex < 0) {
      throw new Error(`${source}:${lineNumber}: Component index must be non-negative.`)
    }
    if (signalName.length === 0) {
      throw new Error(`${source}:${lineNumber}: Signal name must not be empty.`)
    }
    if (symbolIndexes.has(symbolIndex)) {
      throw new Error(`${source}:${lineNumber}: Duplicate symbol index ${symbolIndex}.`)
    }

    symbolIndexes.add(symbolIndex)
    entries.push({ symbolIndex, wireIndex, componentIndex, signalName })
  }

  if (entries.length === 0) {
    throw new Error(`${source}: Symbol table is empty.`)
  }

  return entries
}

function collectInterfaceSignals(entries, subcircuit, source = 'symbol table') {
  const outputStart = subcircuit.Out_idx[0]
  const outputCount = subcircuit.Out_idx[1]
  const inputStart = subcircuit.In_idx[0]
  const inputCount = subcircuit.In_idx[1]
  const directSignalsByWire = new Map()
  const isInterfaceWire = (wireIndex) =>
    (wireIndex >= outputStart && wireIndex < outputStart + outputCount) ||
    (wireIndex >= inputStart && wireIndex < inputStart + inputCount)

  for (const entry of entries) {
    if (!DIRECT_MAIN_SIGNAL_PATTERN.test(entry.signalName) || !isInterfaceWire(entry.wireIndex)) {
      continue
    }

    const existing = directSignalsByWire.get(entry.wireIndex)
    if (existing !== undefined) {
      throw new Error(
        `${source}: Top-level signals '${existing}' and '${entry.signalName}' share wire ${entry.wireIndex}.`,
      )
    }
    directSignalsByWire.set(entry.wireIndex, entry.signalName)
  }

  const collectRange = (kind, start, count) => {
    const signals = []
    for (let offset = 0; offset < count; offset++) {
      const wireIndex = start + offset
      const signalName = directSignalsByWire.get(wireIndex)
      if (signalName === undefined) {
        throw new Error(
          `${source}: Missing top-level ${kind} signal for ${subcircuit.name} wire ${wireIndex}.`,
        )
      }
      signals.push({ wireIndex, signalName })
    }
    return signals
  }

  return {
    outputs: collectRange('output', outputStart, outputCount),
    inputs: collectRange('input', inputStart, inputCount),
  }
}

function validateCompiledSymbolInterfaces(subcircuits, symbolTables) {
  if (!(symbolTables instanceof Map)) {
    throw new Error('Compiled symbol tables must be provided as a Map.')
  }

  for (const subcircuit of subcircuits) {
    const symbolTable = symbolTables.get(subcircuit.name)
    if (symbolTable === undefined) {
      throw new Error(`Missing compiled symbol table for '${subcircuit.name}'.`)
    }
    collectInterfaceSignals(symbolTable.entries, subcircuit, symbolTable.source)
  }
}

module.exports = {
  collectInterfaceSignals,
  parseSymbolTable,
  validateCompiledSymbolInterfaces,
}
