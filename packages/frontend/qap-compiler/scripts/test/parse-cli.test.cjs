const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { parseCliArguments } = require('../parse.js')

test('requires the compiler output directory and report path', () => {
  assert.throws(
    () => parseCliArguments([]),
    /Usage: node scripts\/parse\.js <output-dir> <compiler-output-path>/,
  )
  assert.throws(
    () => parseCliArguments(['output', 'report', 'extra']),
    /Usage: node scripts\/parse\.js <output-dir> <compiler-output-path>/,
  )
})

test('resolves the two required parser paths', () => {
  assert.deepEqual(parseCliArguments(['output', 'report.txt']), {
    outputDir: path.resolve('output'),
    compilerOutputPath: path.resolve('report.txt'),
  })
})
