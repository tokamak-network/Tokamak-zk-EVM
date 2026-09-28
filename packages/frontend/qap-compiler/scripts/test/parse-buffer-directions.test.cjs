const assert = require('node:assert/strict')
const test = require('node:test')

const { LIBRARY_LAYOUT } = require('../configure.js')
const {
  buildNormalizedWireLayout,
  buildSetupParams,
} = require('../build-wire-layout.js')

const { bufferDeclarations: BUFFER_DECLARATIONS } = LIBRARY_LAYOUT

function createBufferCatalog(capacity = 2) {
  return BUFFER_DECLARATIONS.map((declaration, id) => ({
    id,
    name: declaration.name,
    Nwires: capacity * 2 + 2,
    Nconsts: capacity * 2 + 1,
    Out_idx: [1, capacity],
    In_idx: [capacity + 1, capacity],
  }))
}

test('normalizes wiring and internal ranges without mutating compiled metadata', () => {
  const catalog = createBufferCatalog()
  catalog.push({
    id: catalog.length,
    name: 'ordinary',
    Nwires: 18,
    Nconsts: 17,
    Out_idx: [1, 1],
    In_idx: [2, 1],
    logicalInterface: { inputs: [], outputs: [] },
  })
  const original = structuredClone(catalog)
  const layout = buildNormalizedWireLayout(catalog, LIBRARY_LAYOUT)

  assert.deepEqual(catalog, original)
  assert.equal(layout.m_b, 8)
  assert.equal(layout.m, 32)
  for (const subcircuit of layout.subcircuits) {
    assert.equal(subcircuit.Nwires, 32)
    assert.equal(subcircuit.Wiring_idx[0], 0)
    assert.equal(subcircuit.Internal_idx[0], 8)
    assert.equal(subcircuit.NrealWires,
      subcircuit.Wiring_idx[1] + subcircuit.Internal_idx[1])
  }
})

test('selects only the declared public-facing port range', () => {
  const layout = buildNormalizedWireLayout(createBufferCatalog(), LIBRARY_LAYOUT)

  for (const declaration of BUFFER_DECLARATIONS) {
    const subcircuit = layout.subcircuits.find(({ name }) => name === declaration.name)
    assert.equal(subcircuit.bufferDirection, declaration.direction)
    if (declaration.publicPhase === undefined) {
      assert.deepEqual(subcircuit.Public_idx, [0, 0])
      assert.equal(subcircuit.publicPhase, undefined)
    } else {
      assert.deepEqual(
        subcircuit.Public_idx,
        declaration.direction === 'in' ? subcircuit.In_idx : subcircuit.Out_idx,
      )
      assert.equal(subcircuit.publicPhase, declaration.publicPhase)
    }
    assert.equal(subcircuit.Wiring_idx[0], 0)
    assert.ok(subcircuit.Public_idx[0] !== 0 || subcircuit.Public_idx[1] === 0)
  }
})

test('keeps ordinary and private-only wiring nonpublic with real constant wire zero', () => {
  const catalog = createBufferCatalog()
  catalog.push({
    id: catalog.length,
    name: 'ordinary',
    Nwires: 9,
    Nconsts: 1,
    Out_idx: [1, 2],
    In_idx: [3, 2],
    logicalInterface: { inputs: [], outputs: [] },
  })
  const layout = buildNormalizedWireLayout(catalog, LIBRARY_LAYOUT)

  for (const name of ['bufferPrvIn', 'ordinary']) {
    const subcircuit = layout.subcircuits.find((entry) => entry.name === name)
    assert.deepEqual(subcircuit.Public_idx, [0, 0])
    assert.deepEqual(subcircuit.Wiring_idx, [0, 5])
    assert.equal(subcircuit.Wiring_idx[0], 0)
    assert.ok(subcircuit.Wiring_idx[1] <= layout.m_b)
  }
})

test('publishes public coordinate ordering without aggregate wire boundaries', () => {
  const layout = buildNormalizedWireLayout(createBufferCatalog(), LIBRARY_LAYOUT)
  const setup = buildSetupParams(layout, layout.subcircuits, 512)

  assert.deepEqual(setup, {
    n: 8,
    m: 16,
    m_b: 8,
    t: 8,
    s: 512,
    publicWirePhases: [
      { name: 'user-output', region: 'free', subcircuitIds: [0, 1, 2] },
      { name: 'user-input', region: 'free', subcircuitIds: [3] },
      { name: 'block-input', region: 'free', subcircuitIds: [4] },
      { name: 'function-input', region: 'fixed', subcircuitIds: [5] },
    ],
  })
  for (const removed of ['l', 'l_D', 'm_D', 's_D', 's_max']) {
    assert.equal(Object.hasOwn(setup, removed), false)
  }
})

test('reserves the final capacity id for the virtual empty subcircuit', () => {
  for (const [actual, t] of [[44, 64], [63, 64], [64, 128]]) {
    const catalog = createBufferCatalog()
    while (catalog.length < actual) {
      catalog.push({
        id: catalog.length,
        name: `ordinary${catalog.length}`,
        Nwires: 5,
        Nconsts: 1,
        Out_idx: [1, 1],
        In_idx: [2, 1],
        logicalInterface: { inputs: [], outputs: [] },
      })
    }
    const layout = buildNormalizedWireLayout(catalog, LIBRARY_LAYOUT)
    const setup = buildSetupParams(layout, layout.subcircuits, 256)
    assert.equal(setup.t, t)
    assert.equal(layout.subcircuits.length, actual)
    assert.equal(layout.subcircuits.some(({ id }) => id === setup.t - 1), false)
  }
})

test('rejects non-conventional compiled wire order', () => {
  const catalog = createBufferCatalog()
  catalog[0].In_idx[0] += 1
  assert.throws(
    () => buildNormalizedWireLayout(catalog, LIBRARY_LAYOUT),
    /does not use constant\/output\/input wire order/,
  )
})

test('rejects a buffer direction that conflicts with its public segment', () => {
  const invalidLayout = {
    ...LIBRARY_LAYOUT,
    bufferDeclarations: LIBRARY_LAYOUT.bufferDeclarations.map((declaration) =>
      declaration.name === 'bufferLogOut'
        ? { ...declaration, direction: 'in' }
        : declaration),
  }
  assert.throws(
    () => buildNormalizedWireLayout(createBufferCatalog(), invalidLayout),
    /Invalid public segment/,
  )
})

test('rejects a declared buffer that carries a non-buffer logical interface', () => {
  const catalog = createBufferCatalog()
  catalog[0].logicalInterface = { inputs: [], outputs: [] }
  assert.throws(
    () => buildNormalizedWireLayout(catalog, LIBRARY_LAYOUT),
    /non-buffer logical interface/,
  )
})
