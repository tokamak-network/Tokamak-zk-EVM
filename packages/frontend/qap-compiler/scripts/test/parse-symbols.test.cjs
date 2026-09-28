const assert = require('node:assert/strict')
const test = require('node:test')

const {
  collectInterfaceSignals,
  parseSymbolTable,
  validateCompiledSymbolInterfaces,
} = require('../parse-symbols.js')

const subcircuit = {
  name: 'Example',
  Out_idx: [1, 2],
  In_idx: [3, 2],
}

test('parses and orders top-level interface signals by physical wire index', () => {
  const entries = parseSymbolTable([
    '1,1,0,main.out[0]',
    '2,2,0,main.out[1]',
    '3,3,0,main.in[0]',
    '4,4,0,main.in[1]',
    '5,5,0,main.internal',
    '6,-1,1,main.component.out',
    '7,-1,0,main.aliasOne',
    '8,-1,0,main.aliasTwo',
  ].join('\n'))

  assert.deepEqual(collectInterfaceSignals(entries, subcircuit), {
    outputs: [
      { wireIndex: 1, signalName: 'main.out[0]' },
      { wireIndex: 2, signalName: 'main.out[1]' },
    ],
    inputs: [
      { wireIndex: 3, signalName: 'main.in[0]' },
      { wireIndex: 4, signalName: 'main.in[1]' },
    ],
  })
})

test('rejects a missing physical interface signal', () => {
  const entries = parseSymbolTable([
    '1,1,0,main.out[0]',
    '2,2,0,main.out[1]',
    '3,3,0,main.in[0]',
  ].join('\n'))

  assert.throws(
    () => collectInterfaceSignals(entries, subcircuit),
    /Missing top-level input signal for Example wire 4/,
  )
})

test('rejects ambiguous top-level signals on one physical wire', () => {
  const entries = parseSymbolTable([
    '1,1,0,main.out[0]',
    '2,1,0,main.alias',
    '3,2,0,main.out[1]',
    '4,3,0,main.in[0]',
    '5,4,0,main.in[1]',
  ].join('\n'))

  assert.throws(
    () => collectInterfaceSignals(entries, subcircuit),
    /share wire 1/,
  )
})

test('rejects malformed symbol rows', () => {
  assert.throws(
    () => parseSymbolTable('1,1,main.in[0]', 'fixture.sym'),
    /fixture\.sym:1: Expected four comma-separated fields/,
  )
})

test('validates all compiled symbol tables as one parser stage', () => {
  const symbolTables = new Map([[
    'Example',
    {
      entries: parseSymbolTable([
        '1,1,0,main.out[0]',
        '2,2,0,main.out[1]',
        '3,3,0,main.in[0]',
        '4,4,0,main.in[1]',
      ].join('\n')),
      source: 'Example.sym',
    },
  ]])

  assert.doesNotThrow(() => validateCompiledSymbolInterfaces([subcircuit], symbolTables))
  assert.throws(
    () => validateCompiledSymbolInterfaces([subcircuit], new Map()),
    /Missing compiled symbol table for 'Example'/,
  )
})
