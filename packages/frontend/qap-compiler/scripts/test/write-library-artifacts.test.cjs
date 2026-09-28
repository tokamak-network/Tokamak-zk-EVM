const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { writeLibraryArtifacts } = require('../write-library-artifacts.js')

test('writes only the catalog and setup metadata artifacts', (context) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qap-artifact-writer-test-'))
  context.after(() => fs.rmSync(outputDir, { recursive: true, force: true }))

  writeLibraryArtifacts(outputDir, {
    subcircuits: [{ id: 0, name: 'Example' }],
    setupParams: { l: 2, n: 4 },
  })

  assert.equal(
    fs.readFileSync(path.join(outputDir, 'subcircuitInfo.json'), 'utf8'),
    '[{"id":0,"name":"Example"}]',
  )
  assert.equal(fs.existsSync(path.join(outputDir, 'globalWireList.json')), false)
  assert.equal(
    fs.readFileSync(path.join(outputDir, 'setupParams.json'), 'utf8'),
    '{\n  "l": 2,\n  "n": 4\n}',
  )
})
