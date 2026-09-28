'use strict'

const fs = require('node:fs')
const path = require('node:path')
const buildWitnessCalculator = require('./witness_calculator.js')
const { wrapWitnessCalculator } = require('./witness-input-diagnostics.js')

function loadTarget(wasmPath) {
  const match = /^subcircuit(\d+)\.wasm$/.exec(path.basename(wasmPath))
  if (match === null) {
    throw new Error(`WASM filename '${path.basename(wasmPath)}' does not identify a subcircuit.`)
  }
  const libraryDir = path.resolve(path.dirname(wasmPath), '..')
  const catalog = JSON.parse(fs.readFileSync(path.join(libraryDir, 'subcircuitInfo.json'), 'utf8'))
  const id = Number(match[1])
  const target = catalog.find((entry) => entry.id === id)
  if (target === undefined) {
    throw new Error(`subcircuitInfo.json does not define subcircuit id ${id}.`)
  }
  return target
}

async function main() {
  if (process.argv.length !== 5) {
    throw new Error('Usage: node generate_witness.js <file.wasm> <input.json> <output.wtns>')
  }

  const wasmPath = path.resolve(process.argv[2])
  const input = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
  const target = loadTarget(wasmPath)
  const calculator = wrapWitnessCalculator(
    target,
    await buildWitnessCalculator(fs.readFileSync(wasmPath)),
  )
  const witness = await calculator.calculateWTNSBin(input, 0)
  fs.writeFileSync(process.argv[4], witness)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
