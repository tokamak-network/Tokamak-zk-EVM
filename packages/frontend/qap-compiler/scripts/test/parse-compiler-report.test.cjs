const assert = require('node:assert/strict')
const test = require('node:test')

const { parseCompilerReport } = require('../parse-compiler-report.js')

const REPORT = [
  '\u001b[32mid[0] = bufferTxIn\u001b[0m',
  'non-linear constraints: 3',
  'linear constraints: 5',
  'public inputs: 2',
  'private inputs: 1',
  'public outputs: 4',
  'wires: 11',
  'Everything went okay',
  'id[1] = MemoryViewStep',
  'non-linear constraints: 8',
  'linear constraints: 0',
  'public inputs: 3',
  'private inputs: 0',
  'public outputs: 2',
  'wires: 14',
].join('\n')

test('parses compiler report blocks into compiled subcircuit metadata', () => {
  assert.deepEqual(parseCompilerReport(REPORT, 'fixture.log'), [
    {
      id: 0,
      name: 'bufferTxIn',
      Nwires: 11,
      Nconsts: 8,
      Out_idx: [1, 4],
      In_idx: [5, 3],
    },
    {
      id: 1,
      name: 'MemoryViewStep',
      Nwires: 14,
      Nconsts: 8,
      Out_idx: [1, 2],
      In_idx: [3, 3],
    },
  ])
})

test('rejects compiler reports with incomplete subcircuit blocks', () => {
  assert.throws(
    () => parseCompilerReport('id[0] = ADD\nwires: 5', 'fixture.log'),
    /fixture\.log: Missing 'public outputs:'/,
  )
})

test('rejects compiler reports without declared subcircuits', () => {
  assert.throws(
    () => parseCompilerReport('Everything went okay', 'fixture.log'),
    /fixture\.log: No subcircuit blocks were found/,
  )
})
