import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIST_PUBLIC, PublicType, S_MAX } from './configure.js'

type FlattenMap = number[]

export type SubcircuitInfo = {
  id: number
  name: string
  Nwires: number
  Nconsts: number
  Out_idx: [number, number] // [startIndex, count]
  In_idx: [number, number] // [startIndex, count]
  flattenMap?: FlattenMap
}

type WireListEntry = [subcircuitId: number, localWireIndex: number]

const NUM_LINES_PER_CIRCUIT = 13
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function ensureFlattenMap(subcircuitInfos: SubcircuitInfo[], subcircuitId: number): FlattenMap {
  if (!subcircuitInfos[subcircuitId].flattenMap) {
    subcircuitInfos[subcircuitId] = {
      ...subcircuitInfos[subcircuitId],
      flattenMap: [],
    }
  }
  return subcircuitInfos[subcircuitId].flattenMap as FlattenMap
}

function addWire(
  globalWireList: WireListEntry[],
  subcircuitInfos: SubcircuitInfo[],
  globalWireIndex: number,
  subcircuitId: number,
  subcircuitWireId: number,
) {
  if (subcircuitId >= 0) {
    const flattenMap = ensureFlattenMap(subcircuitInfos, subcircuitId)
    if (flattenMap[subcircuitWireId] !== undefined || globalWireList[globalWireIndex] !== undefined) {
      throw new Error('parseWireList: duplicate mapping detected')
    }
    flattenMap[subcircuitWireId] = globalWireIndex
  }
  globalWireList[globalWireIndex] = [subcircuitId, subcircuitWireId]
}

function addWiresBlock(params: {
  globalWireList: WireListEntry[]
  subcircuitInfos: SubcircuitInfo[]
  subcircuit: SubcircuitInfo
  startIndex: number
  count: number
  indexRef: { value: number }
}) {
  const { globalWireList, subcircuitInfos, subcircuit, startIndex, count, indexRef } = params
  for (let i = 0; i < count; i++) {
    addWire(globalWireList, subcircuitInfos, indexRef.value++, subcircuit.id, startIndex + i)
  }
}

function parseWireList(subcircuitInfos: SubcircuitInfo[]) {
  let numTotalWires = 0
  let numPubUserOutWires = 0
  let numPubUserInWires = 0
  let numPubBlockWires = 0
  let numPubFunctinoWires = 0
  let numInterfaceWires = 0
  const subcircuitInfoByName = new Map<string, SubcircuitInfo>()

  for (const subcircuit of subcircuitInfos) {
    numTotalWires += subcircuit.Nwires
    const publicType = LIST_PUBLIC.get(subcircuit.name)

    const addInterface = (count: number) => {
      numInterfaceWires += count + 1 // +1 for constant wire
    }

    switch (publicType) {
      case 'outUser':
        numPubUserOutWires += subcircuit.Out_idx[1]
        addInterface(subcircuit.In_idx[1])
        break
      case 'inUser':
        numPubUserInWires += subcircuit.In_idx[1]
        addInterface(subcircuit.Out_idx[1])
        break
      case 'inBlock':
        numPubBlockWires += subcircuit.In_idx[1]
        addInterface(subcircuit.Out_idx[1])
        break
      case 'inFunction':
        numPubFunctinoWires += subcircuit.In_idx[1]
        addInterface(subcircuit.Out_idx[1])
        break
      default:
        numInterfaceWires += subcircuit.Out_idx[1] + subcircuit.In_idx[1] + 1
    }

    subcircuitInfoByName.set(subcircuit.name, {
      id: subcircuit.id,
      name: subcircuit.name,
      Nwires: subcircuit.Nwires,
      Nconsts: subcircuit.Nconsts,
      Out_idx: subcircuit.Out_idx,
      In_idx: subcircuit.In_idx,
    })
  }

  const l_user_out = numPubUserOutWires
  const l_user = l_user_out + numPubUserInWires
  const l_block = l_user + numPubBlockWires
  const l_actual = l_block + numPubFunctinoWires

  let twosPower = 1
  while (twosPower < l_actual) twosPower <<= 1
  const numDiff_l = twosPower - l_actual
  const l = l_actual + numDiff_l

  twosPower = 1
  while (twosPower < numInterfaceWires) twosPower <<= 1
  const numDiff_m_I = twosPower - numInterfaceWires
  const l_D = l + numInterfaceWires + numDiff_m_I
  const m_D = numTotalWires + numDiff_l + numDiff_m_I

  const globalWireList: WireListEntry[] = []
  const indRef = { value: 0 }

  // User public wires
  for (const [subcircuitName, targetSubcircuit] of subcircuitInfoByName.entries()) {
    const publicType = LIST_PUBLIC.get(subcircuitName)
    if (publicType === 'outUser') {
      addWiresBlock({
        globalWireList,
        subcircuitInfos,
        subcircuit: targetSubcircuit,
        startIndex: targetSubcircuit.Out_idx[0],
        count: targetSubcircuit.Out_idx[1],
        indexRef: indRef,
      })
    } else if (publicType === 'inUser') {
      addWiresBlock({
        globalWireList,
        subcircuitInfos,
        subcircuit: targetSubcircuit,
        startIndex: targetSubcircuit.In_idx[0],
        count: targetSubcircuit.In_idx[1],
        indexRef: indRef,
      })
    }
  }
  if (indRef.value !== l_user) throw new Error(`parseWireList: user wires mismatch (ind=${indRef.value}, l_user=${l_user})`)

  // Environment public wires
  for (const [subcircuitName, targetSubcircuit] of subcircuitInfoByName.entries()) {
    const publicType = LIST_PUBLIC.get(subcircuitName)
    if (publicType === 'inBlock' || publicType === 'inFunction') {
      addWiresBlock({
        globalWireList,
        subcircuitInfos,
        subcircuit: targetSubcircuit,
        startIndex: targetSubcircuit.In_idx[0],
        count: targetSubcircuit.In_idx[1],
        indexRef: indRef,
      })
    }
  }

  // Padding user/env wires to power-of-two
  for (let i = 0; i < numDiff_l; i++) addWire(globalWireList, subcircuitInfos, indRef.value++, -1, -1)
  if (indRef.value !== l) throw new Error(`parseWireList: public wires mismatch (ind=${indRef.value}, l=${l})`)

  // Interface wires (constant + in/out)
  for (const [, targetSubcircuit] of subcircuitInfoByName.entries()) {
    addWire(globalWireList, subcircuitInfos, indRef.value++, targetSubcircuit.id, 0) // const wire
    const publicType: PublicType | undefined = LIST_PUBLIC.get(targetSubcircuit.name)

    if (publicType === 'outUser') {
      addWiresBlock({
        globalWireList,
        subcircuitInfos,
        subcircuit: targetSubcircuit,
        startIndex: targetSubcircuit.In_idx[0],
        count: targetSubcircuit.In_idx[1],
        indexRef: indRef,
      })
    } else if (publicType === 'inUser' || publicType === 'inBlock' || publicType === 'inFunction') {
      addWiresBlock({
        globalWireList,
        subcircuitInfos,
        subcircuit: targetSubcircuit,
        startIndex: targetSubcircuit.Out_idx[0],
        count: targetSubcircuit.Out_idx[1],
        indexRef: indRef,
      })
    } else {
      addWiresBlock({
        globalWireList,
        subcircuitInfos,
        subcircuit: targetSubcircuit,
        startIndex: targetSubcircuit.Out_idx[0],
        count: targetSubcircuit.Out_idx[1],
        indexRef: indRef,
      })
      addWiresBlock({
        globalWireList,
        subcircuitInfos,
        subcircuit: targetSubcircuit,
        startIndex: targetSubcircuit.In_idx[0],
        count: targetSubcircuit.In_idx[1],
        indexRef: indRef,
      })
    }
  }
  for (let i = 0; i < numDiff_m_I; i++) addWire(globalWireList, subcircuitInfos, indRef.value++, -1, -1)
  if (indRef.value !== l_D) throw new Error('parseWireList: interface wires mismatch')

  // Internal wires
  for (const targetSubcircuit of subcircuitInfos) {
    const numInternal = targetSubcircuit.Nwires - (targetSubcircuit.Out_idx[1] + targetSubcircuit.In_idx[1]) - 1
    addWiresBlock({
      globalWireList,
      subcircuitInfos,
      subcircuit: targetSubcircuit,
      startIndex: targetSubcircuit.In_idx[0] + targetSubcircuit.In_idx[1],
      count: numInternal,
      indexRef: indRef,
    })
  }
  if (indRef.value !== m_D) throw new Error('parseWireList: internal wires mismatch')

  return { l_user_out, l_user, l_block, l, l_D, m_D, wireList: globalWireList }
}

// Main script
async function main() {
  const tempPath = path.resolve(__dirname, 'temp.txt')
  const data = await fs.promises.readFile(tempPath, 'utf8')
  const lines = data.split('\n').filter(Boolean)

  const subcircuits: SubcircuitInfo[] = []
  const numConstsVec: number[] = []

  for (let i = 0; i < lines.length; i += NUM_LINES_PER_CIRCUIT) {
    const idMatch = lines[i].match(/\d+/)
    if (!idMatch) continue

    const id = Number(idMatch[0])
    const parts = lines[i].split(' = ')
    if (parts.length < 2) continue

    const rawName = parts[1]
    const name = rawName.includes('_')
      ? `${rawName.substring(0, rawName.indexOf('_'))}-${rawName.substring(rawName.indexOf('_') + 1)}`
      : rawName

    const numWires = Number(lines[i + 7].match(/\d+/)?.[0] ?? 0)
    const numOutput = Number(lines[i + 6].match(/\d+/)?.[0] ?? 0)
    const numInput = Number(lines[i + 4].match(/\d+/)?.[0] ?? 0) + Number(lines[i + 5].match(/\d+/)?.[0] ?? 0)
    const numConsts = Number(lines[i + 2].match(/\d+/)?.[0] ?? 0) + Number(lines[i + 3].match(/\d+/)?.[0] ?? 0)
    numConstsVec.push(numConsts)

    subcircuits.push({
      id,
      name,
      Nwires: numWires,
      Nconsts: numConsts,
      Out_idx: [1, numOutput],
      In_idx: [numOutput + 1, numInput],
    })
  }

  const globalWireInfo = parseWireList(subcircuits)
  const _n = Math.max(...numConstsVec)
  let n = 1
  while (n < _n) n <<= 1

  const setupParams = {
    l: globalWireInfo.l,
    l_user_out: globalWireInfo.l_user_out,
    l_user: globalWireInfo.l_user,
    l_block: globalWireInfo.l_block,
    l_D: globalWireInfo.l_D,
    m_D: globalWireInfo.m_D,
    n,
    s_D: subcircuits.length,
    s_max: S_MAX,
  }
  const globalWireList = globalWireInfo.wireList

  const tsSubcircuitInfo = `// Out_idx[0] denotes the index of the first output wire.\n` +
    `// Out_idx[1] denotes the number of output wires.\n` +
    `// In_idx[0] denotes the index of the first input wire.\n` +
    `// In_idx[1] denotes the number of input wires.\n` +
    `// flattenMap[localWireIndex] maps each subcircuit wire (local) to library wires (global).\n` +
    `export const subcircuits =\n ${JSON.stringify(subcircuits, null, 2)}`

  await fs.promises.writeFile(path.resolve(__dirname, '../../subcircuits/library/subcircuitInfo.ts'), tsSubcircuitInfo)
  await fs.promises.writeFile(path.resolve(__dirname, '../../subcircuits/library/subcircuitInfo.json'), JSON.stringify(subcircuits, null, 2))

  const tsGlobalWireList = `// Maps each library wire (global) to the owning subcircuit and local wire index.\n` +
    `export const globalWireList =\n ${JSON.stringify(globalWireList)}`
  await fs.promises.writeFile(path.resolve(__dirname, '../../subcircuits/library/globalWireList.ts'), tsGlobalWireList)
  await fs.promises.writeFile(path.resolve(__dirname, '../../subcircuits/library/globalWireList.json'), JSON.stringify(globalWireList))

  await fs.promises.writeFile(path.resolve(__dirname, '../../subcircuits/library/setupParams.json'), JSON.stringify(setupParams, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
