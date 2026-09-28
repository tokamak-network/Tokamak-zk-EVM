const { S_MAX, LIBRARY_LAYOUT } = require('./configure.js')

const fs = require('fs')
const path = require('path')
const {
  validateCompiledSubcircuitInterfaces,
} = require('./parse-interfaces.js')
const {
  parseSymbolTable,
  validateCompiledSymbolInterfaces,
} = require('./parse-symbols.js')
const { parseCompilerReport } = require('./parse-compiler-report.js')
const {
  buildNormalizedWireLayout,
  buildSetupParams,
} = require('./build-wire-layout.js')
const {
  normalizeConstraintJsonFile,
  normalizeR1csFile,
} = require('./normalize-r1cs.js')
const { writeLibraryArtifacts } = require('./write-library-artifacts.js')

const interfaceDir = path.resolve(__dirname, '../subcircuits/interface')
const constantsPath = path.resolve(__dirname, '../subcircuits/circom/constants.circom')

function parseCliArguments(args) {
  if (!Array.isArray(args) || args.length !== 2) {
    throw new Error('Usage: node scripts/parse.js <output-dir> <compiler-output-path>')
  }

  return {
    outputDir: path.resolve(args[0]),
    compilerOutputPath: path.resolve(args[1]),
  }
}

function main({ outputDir, compilerOutputPath }) {
  const compilerReport = fs.readFileSync(compilerOutputPath, 'utf8')
  let subcircuits = parseCompilerReport(compilerReport, compilerOutputPath)
  const symbolTables = new Map()
  for (const subcircuit of subcircuits) {
    const symbolPath = path.join(outputDir, `${subcircuit.name}_circuit.sym`)
    const symbolSource = fs.readFileSync(symbolPath, 'utf8')
    symbolTables.set(subcircuit.name, {
      entries: parseSymbolTable(symbolSource, symbolPath),
      source: symbolPath,
    })
  }
  validateCompiledSymbolInterfaces(subcircuits, symbolTables)

  subcircuits = validateCompiledSubcircuitInterfaces(
    subcircuits,
    interfaceDir,
    constantsPath,
  )
  const normalizedLayout = buildNormalizedWireLayout(subcircuits, LIBRARY_LAYOUT)
  subcircuits = normalizedLayout.subcircuits
  const setupParams = buildSetupParams(
    normalizedLayout,
    subcircuits,
    S_MAX,
  )
  for (const subcircuit of subcircuits) {
    const layout = {
      m: normalizedLayout.m,
      m_b: normalizedLayout.m_b,
      realWireCount: subcircuit.NrealWires,
      wiringCount: subcircuit.Wiring_idx[1],
    }
    const canonicalR1cs = normalizeR1csFile(
      path.join(outputDir, `r1cs/subcircuit${subcircuit.id}.r1cs`),
      layout,
    )
    normalizeConstraintJsonFile(
      path.join(outputDir, `json/subcircuit${subcircuit.id}.json`),
      layout,
      canonicalR1cs,
    )
  }
  writeLibraryArtifacts(outputDir, {
    subcircuits,
    setupParams,
  })
}

if (require.main === module) {
  main(parseCliArguments(process.argv.slice(2)))
}

module.exports = {
  parseCliArguments,
}
