const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;]*m/g

function getLineValue(lines, prefix, source) {
  const targetLine = lines.find((line) => line.startsWith(prefix))
  if (targetLine === undefined) {
    throw new Error(`${source}: Missing '${prefix}' in compiler output.`)
  }

  const matches = targetLine.match(/\d+/g)
  if (matches === null || matches.length === 0) {
    throw new Error(`${source}: Missing numeric value for '${prefix}'.`)
  }

  return Number(matches[matches.length - 1])
}

function parseSubcircuitBlock(lines, source) {
  const idMatch = lines[0]?.match(/^id\[(\d+)\]\s*=\s*(\S+)$/)
  if (idMatch === null || idMatch === undefined) {
    throw new Error(`${source}: Invalid subcircuit header '${lines[0] ?? ''}'.`)
  }

  const [, idText, name] = idMatch
  const numOutput = getLineValue(lines, 'public outputs:', source)
  const numInput = getLineValue(lines, 'public inputs:', source)
    + getLineValue(lines, 'private inputs:', source)
  const numConsts = getLineValue(lines, 'non-linear constraints:', source)
    + getLineValue(lines, 'linear constraints:', source)

  return {
    id: Number(idText),
    name,
    Nwires: getLineValue(lines, 'wires:', source),
    Nconsts: numConsts,
    Out_idx: [1, numOutput],
    In_idx: [numOutput + 1, numInput],
  }
}

function parseCompilerReport(sourceText, source = 'compiler output') {
  if (typeof sourceText !== 'string') {
    throw new Error(`${source}: Compiler output must be text.`)
  }

  const lines = sourceText
    .replace(ANSI_ESCAPE_PATTERN, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const blocks = []
  let currentBlock = []

  for (const line of lines) {
    if (line.startsWith('id[')) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock)
      }
      currentBlock = [line]
    } else if (currentBlock.length > 0) {
      currentBlock.push(line)
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock)
  }

  if (blocks.length === 0) {
    throw new Error(`${source}: No subcircuit blocks were found.`)
  }

  const subcircuits = blocks.map((block) => parseSubcircuitBlock(block, source))
  const ids = new Set()
  const names = new Set()
  for (const { id, name } of subcircuits) {
    if (ids.has(id)) {
      throw new Error(`${source}: Duplicate subcircuit id ${id}.`)
    }
    if (names.has(name)) {
      throw new Error(`${source}: Duplicate subcircuit name '${name}'.`)
    }
    ids.add(id)
    names.add(name)
  }

  return subcircuits
}

module.exports = {
  parseCompilerReport,
}
