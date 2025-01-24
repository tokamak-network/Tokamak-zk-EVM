import { bigIntToBytes, bytesToHex, setLengthLeft } from "@ethereumjs/util/index.js"
import fs from 'fs'
import { readFileSync } from 'fs'
import path from 'path'
import appRootPath from 'app-root-path'

import { subcircuits as subcircuitInfos, globalWireInfo } from '../resources/index.js'
import { KECCAK_OUT_PLACEMENT_INDEX, LOAD_PLACEMENT_INDEX } from '../constant/placement.js'

// @ts-ignore
import { builder } from '../utils/witness_calculator.js'

import type {
  DataPt,
  PlacementEntry,
  PlacementInstances,
  Placements,
  SubcircuitInfoByName,
  SubcircuitInfoByNameEntry,
} from '../types/index.js'
type SubcircuitWireIndex = { subcircuitId: number; localWireId: number }
type PlacementWireIndex = { placementId: number; globalWireId: number }

export async function finalize(placements: Placements, validate?: boolean): Promise<Permutation> {
  const _validate = validate ?? false
  const refactoriedPlacements = refactoryPlacement(placements)
  let permutation: Permutation
  if (_validate) {
    const placementInstances = await outputPlacementInstance(refactoriedPlacements)
    permutation = new Permutation(refactoriedPlacements, placementInstances)
  } else {
    permutation = new Permutation(refactoriedPlacements)
  }
  return permutation
}

const halveWordSizeOfWires = (newDataPts: DataPt[], prevDataPt: DataPt, index: number): void => {
  const indLow = index * 2
  const indHigh = indLow + 1
  newDataPts[indLow] = { ...prevDataPt }
  newDataPts[indHigh] = { ...prevDataPt }
  if (prevDataPt.wireIndex !== undefined) {
    newDataPts[indLow].wireIndex = prevDataPt.wireIndex * 2
    newDataPts[indHigh].wireIndex = prevDataPt.wireIndex * 2 + 1
  }
  if (prevDataPt.pairedInputWireIndices !== undefined) {
    newDataPts[indHigh].pairedInputWireIndices = prevDataPt.pairedInputWireIndices.flatMap(
      (ind) => [ind * 2, ind * 2 + 1],
    )
    newDataPts[indLow].pairedInputWireIndices = prevDataPt.pairedInputWireIndices.flatMap((ind) => [
      ind * 2,
      ind * 2 + 1,
    ])
  }
  newDataPts[indHigh].value = prevDataPt.value >> 128n
  newDataPts[indLow].value = prevDataPt.value & (2n ** 128n - 1n)
  newDataPts[indHigh].valueHex = bytesToHex(
    setLengthLeft(bigIntToBytes(newDataPts[indHigh].value), 16),
  )
  newDataPts[indLow].valueHex = bytesToHex(
    setLengthLeft(bigIntToBytes(newDataPts[indLow].value), 16),
  )
}

const removeUnusedLoadWires = (placements: Placements): PlacementEntry => {
  const outLoadPlacement = { ...placements.get(LOAD_PLACEMENT_INDEX)! }
  const newInPts = [...outLoadPlacement.inPts]
  const newOutPts = [...outLoadPlacement.outPts]
  for (let ind = 0; ind < outLoadPlacement.outPts.length; ind++) {
    let flag = 0
    for (const key of placements.keys()) {
      if (key !== LOAD_PLACEMENT_INDEX) {
        const placement = placements.get(key)!
        for (const [_ind, _inPt] of placement.inPts.entries()) {
          if (
            _inPt.source! === LOAD_PLACEMENT_INDEX &&
            _inPt.wireIndex === outLoadPlacement.outPts[ind].wireIndex
          ) {
            flag = 1
            break
          }
        }
      }
      if (flag) break
    }
    if (!flag) {
      const arrayIdx = newOutPts.findIndex(
        (outPt) => outPt.wireIndex! === outLoadPlacement.outPts[ind].wireIndex!,
      )
      newInPts.splice(arrayIdx, 1)
      newOutPts.splice(arrayIdx, 1)
    }
  }
  outLoadPlacement.inPts = newInPts
  outLoadPlacement.outPts = newOutPts
  return outLoadPlacement
}

function refactoryPlacement(placements: Placements): Placements {
  const subcircuitIdByName = new Map()
  for (const subcircuitInfo of subcircuitInfos) {
    subcircuitIdByName.set(subcircuitInfo.name, subcircuitInfo.id)
  }
  const dietLoadPlacment = removeUnusedLoadWires(placements)
  const outPlacements: Placements = new Map()
  for (const key of placements.keys()) {
    const placement = key === LOAD_PLACEMENT_INDEX ? dietLoadPlacment : placements.get(key)
    const newInPts: DataPt[] = []
    const newOutPts: DataPt[] = []
    const inPts = placement!.inPts
    const outPts = placement!.outPts
    for (const [ind, inPt] of inPts.entries()) {
      halveWordSizeOfWires(newInPts, inPt, ind)
    }
    for (const [ind, outPt] of outPts.entries()) {
      halveWordSizeOfWires(newOutPts, outPt, ind)
    }
    outPlacements.set(key, {
      name: placement!.name,
      subcircuitId: subcircuitIdByName.get(placement!.name)!,
      inPts: newInPts,
      outPts: newOutPts,
    })
  }
  return outPlacements
}

async function outputPlacementInstance(placements: Placements): Promise<PlacementInstances> {
  const result: PlacementInstances = Array.from(placements.entries()).map(([key, entry]) => ({
    placementIndex: key,
    subcircuitId: entry.subcircuitId!,
    instructionName: entry.name,
    inValues: entry.inPts.map((pt) => pt.valueHex),
    outValues: entry.outPts.map((pt) => pt.valueHex),
  }))
  for (let i = LOAD_PLACEMENT_INDEX; i <= KECCAK_OUT_PLACEMENT_INDEX; i++) {
    let ins = result[i].inValues
    let outs = result[i].outValues
    const expectedInsLen = subcircuitInfos[result[i].subcircuitId].In_idx[1]
    const expectedOutsLen = subcircuitInfos[result[i].subcircuitId].Out_idx[1]
    if (expectedInsLen > ins.length) {
      const filledIns = ins.concat(Array(expectedInsLen - ins.length).fill('0x00'))
      result[i].inValues = filledIns
    }
    if (expectedOutsLen > outs.length) {
      const filledOuts = outs.concat(Array(expectedOutsLen - outs.length).fill('0x00'))
      result[i].outValues = filledOuts
    }
  }

  await testInstances(result)

  const jsonContent = `${JSON.stringify(result, null, 2)}`
  const filePath = path.resolve(
    appRootPath.path,
    'examples/outputs/placementInstance.json',
  )
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  try {
    fs.writeFileSync(filePath, jsonContent, 'utf-8')
    console.log(
      `Synthesizer: Input and output wire assingments of the placements are generated in "/outputs/placementInstance.json".`,
    )
  } catch (error) {
    throw new Error(`Synthesizer: Failure in writing "placementInstance.json".`)
  }

  return result
}

// This class instantiates the compiler model in Section "3.1 Compilers" of the Tokamak zk-SNARK paper.
class Permutation {
  private l = globalWireInfo.l
  private l_D = globalWireInfo.l_D
  // flattenMapInverse: {0, 1, ..., m_D-1} -> \union_{j=0}^{s_D - 1} {j} \times {0, 1, ...,m^{(j)}-1} }
  private flattenMapInverse

  private subcircuitInfoByName: SubcircuitInfoByName
  private _placements: Placements
  private _instances: PlacementInstances | undefined

  private permGroup: Map<string, boolean>[]
  // permultationY: {0, 1, ..., s_{max}-1} \times {0, 1, ..., l_D-l-1} -> {0, 1, ..., s_{max}-1}
  public permutationY: number[][]
  // permutationZ: {0, 1, ..., s_{max}-1} \times {0, 1, ..., l_D-l-1} -> {0, 1, ..., l_D-l-1}
  public permutationZ: number[][]
  public permutationFile: { row: number; col: number; Y: number; Z: number }[]

  constructor(placements: Placements, instances?: PlacementInstances) {
    // Istances are needed only for debugging by "this._validatePermutation()"
    this._placements = placements
    this._instances = instances ?? undefined
    this.flattenMapInverse = instances === undefined ? undefined : globalWireInfo.wireList

    this.subcircuitInfoByName = new Map()
    for (const subcircuit of subcircuitInfos) {
      const entryObject: SubcircuitInfoByNameEntry = {
        id: subcircuit.id,
        NWires: subcircuit.Nwires,
        NInWires: subcircuit.In_idx[1],
        NOutWires: subcircuit.Out_idx[1],
        inWireIndex: subcircuit.In_idx[0],
        outWireIndex: subcircuit.Out_idx[0],
        // wireFlattenMap: \union_{j=0}^{s_D - 1} {j} \times {0, 1, ...,m^{(j)}-1} } -> {0, 1, ..., m_D-1}
        flattenMap: subcircuit.flattenMap,
      }
      this.subcircuitInfoByName.set(subcircuit.name, entryObject)
    }

    // Construct permutation
    this.permGroup = []
    this._buildPermGroup()

    // Equation 8
    this.permutationY = Array.from({ length: this._placements.size }, (_, i) =>
      Array.from({ length: this.l_D - this.l }, () => i),
    )
    this.permutationZ = Array.from({ length: this._placements.size }, () =>
      Array.from({ length: this.l_D - this.l }, (_, j) => j),
    )
    this.permutationFile = []
    // File write the permutation
    this._outputPermutation()
  }

  private _outputPermutation() {
    for (const _group of this.permGroup) {
      const group = [..._group.keys()]
      const groupLength = group.length
      if (groupLength > 1) {
        for (let i = 0; i < groupLength; i++) {
          const element: PlacementWireIndex = JSON.parse(group[i])
          const nextElement: PlacementWireIndex = JSON.parse(group[(i + 1) % groupLength])
          this.permutationFile.push({
            row: element.placementId,
            col: element.globalWireId - this.l,
            Y: nextElement.placementId,
            Z: nextElement.globalWireId - this.l,
          })
          const rowIdx = this.permutationFile[this.permutationFile.length - 1].row
          const colIdx = this.permutationFile[this.permutationFile.length - 1].col
          if (this.permutationY[rowIdx] === undefined) {
            console.log(`debug`)
          }
          this.permutationY[rowIdx][colIdx] =
            this.permutationFile[this.permutationFile.length - 1].Y
          this.permutationZ[rowIdx][colIdx] =
            this.permutationFile[this.permutationFile.length - 1].Z
        }
      }
    }

    if (this._instances !== undefined) {
      this._validatePermutation()
    }

    const jsonContent = `${JSON.stringify(this.permutationFile, null, 2)}`
    const filePath = path.resolve(
      appRootPath.path,
      'examples/outputs/permutation.json',
    )
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    try {
      fs.writeFileSync(filePath, jsonContent, 'utf-8')
      console.log(`Synthesizer: Permutation rule is generated in "/outputs/permutation.json".`)
    } catch (error) {
      throw new Error(`Synthesizer: Failure in writing "permutation.json".`)
    }
  }

  private _searchInsert = (parent: PlacementWireIndex, child: PlacementWireIndex): void => {
    const parentString = JSON.stringify({ ...parent })
    const childString = JSON.stringify({ ...child })
    for (const group of this.permGroup) {
      if (group.has(parentString)) {
        group.set(childString, true)
        return
      }
    }
    const groupEntry: Map<string, boolean> = new Map()
    groupEntry.set(parentString, true)
    groupEntry.set(childString, true)
    this.permGroup.push(groupEntry)
  }

  private _buildPermGroup = (): void => {
    for (const placeId of this._placements.keys()) {
      const thisPlacement = this._placements.get(placeId)!
      const thisSubcircuitInfo = this.subcircuitInfoByName.get(thisPlacement.name)!
      for (let i = 0; i < thisSubcircuitInfo.NOutWires; i++) {
        const localWireId = thisSubcircuitInfo.outWireIndex + i
        const globalWireId = thisSubcircuitInfo.flattenMap![localWireId]
        if (!(globalWireId >= this.l && globalWireId < this.l_D)) {
          break
        }
        const placementWireId: PlacementWireIndex = {
          placementId: placeId,
          globalWireId: globalWireId,
        }
        const groupEntry: Map<string, boolean> = new Map()
        groupEntry.set(JSON.stringify({ ...placementWireId }), true)
        this.permGroup.push(groupEntry)
      }
    }
    for (const placeId of this._placements.keys()) {
      const thisPlacement = this._placements.get(placeId)!
      const thisSubcircuitInfo = this.subcircuitInfoByName.get(thisPlacement.name)!
      for (let i = 0; i < thisSubcircuitInfo.NInWires; i++) {
        const localWireId = thisSubcircuitInfo.inWireIndex + i
        const globalWireId = thisSubcircuitInfo.flattenMap![localWireId]
        if (!(globalWireId >= this.l && globalWireId < this.l_D)) {
          break
        }
        const placementWireId: PlacementWireIndex = {
          placementId: placeId,
          globalWireId: globalWireId,
        }
        const dataPt = thisPlacement.inPts[i]
        let hasParent = false
        if (dataPt !== undefined) {
          if (typeof dataPt.source === 'number') {
            if (dataPt.source !== placeId) {
              hasParent = true
              const pointedSubcircuitInfo = this.subcircuitInfoByName.get(
                this._placements.get(dataPt.source!)!.name,
              )!
              const pointedWireId = this._placements
                .get(dataPt.source!)!
                .outPts.findIndex((outPt) => outPt.wireIndex! === dataPt.wireIndex!)
              const pointedLocalWireId = pointedSubcircuitInfo.outWireIndex + pointedWireId
              const pointedGlobalWireId = pointedSubcircuitInfo.flattenMap![pointedLocalWireId]
              const pointedPlacementWireId: PlacementWireIndex = {
                placementId: dataPt.source,
                globalWireId: pointedGlobalWireId,
              }
              if (!(pointedGlobalWireId >= this.l && pointedGlobalWireId < this.l_D)) {
                throw new Error(`Permutation: A wire is referring to a public wire.`)
              }
              this._searchInsert(pointedPlacementWireId, placementWireId)
            }
          }
        }
        if (!hasParent) {
          const groupEntry: Map<string, boolean> = new Map()
          groupEntry.set(JSON.stringify({ ...placementWireId }), true)
          this.permGroup.push(groupEntry)
        }
      }
      // console.log(`Length inc: ${thisSubcircuitInfo.NInWires}`)
      // let checksum = 0
      // for (const group of this.permGroup){
      //     checksum += group.size
      // }
      // console.log(`checksum: ${checksum}`)
      // console.log(`a`)
    }
  }

  private _validatePermutation = (): void => {
    let permutationDetected = false
    for (const [placementId, instance] of this._instances!.entries()) {
      const rawInstance = [1, ...instance.outValues, ...instance.inValues]
      const thisSubcircuitInfo = this.subcircuitInfoByName.get(instance.instructionName)!
      const thisSubcircuitId = thisSubcircuitInfo.id
      for (let idx = 1; idx < rawInstance.length; idx++) {
        const thisLocalWireId = idx
        const inversedKey: SubcircuitWireIndex = {
          subcircuitId: thisSubcircuitId,
          localWireId: idx,
        }
        const thisGlobalWireId = thisSubcircuitInfo.flattenMap![thisLocalWireId]
        if (thisGlobalWireId < this.l) {
          break
        }
        const nextPlacementId = this.permutationY[placementId][thisGlobalWireId - this.l]
        const nextGlobalWireId = this.permutationZ[placementId][thisGlobalWireId - this.l] + this.l
        const nextLocalWireId = this.flattenMapInverse![nextGlobalWireId][1]
        const nextRawInstance = [
          1,
          ...this._instances![nextPlacementId].outValues,
          ...this._instances![nextPlacementId].inValues,
        ]
        if (thisLocalWireId !== nextLocalWireId) {
          permutationDetected = true
          if (rawInstance[thisLocalWireId] !== nextRawInstance[nextLocalWireId]) {
            throw new Error(`Permutation: Permutation does not hold.`)
          }
        }
      }
    }
    if (permutationDetected === false) {
      console.log(`Synthesizer: Warning: No permutation detected!`)
    } else {
      console.log(`Synthesizer: Permutation check clear`)
    }
  }
}

const testInstances = async (instances: PlacementInstances): Promise<void> => {
  //console.log("Usage: tsx generate_witness.ts <file.wasm> <input.json> <output.wtns>")
  const dir = 'src/tokamak/resources/subcircuitLibrary'
  const reuseBuffer = new Map()
  for (const [placementInd, instance] of instances.entries()) {
    const id = instance.subcircuitId

    let buffer
    if (reuseBuffer.has(id)) {
      buffer = reuseBuffer.get(id)
    } else {
      const targetWasmPath = path.resolve(appRootPath.path, dir, `subcircuit${id}.wasm`)


      try {
        buffer = readFileSync(targetWasmPath)
      } catch (err) {
        throw new Error(`Error while reading subcircuit${id}.wasm`)
      }
      reuseBuffer.set(id, buffer)
    }
    const ins = { in: instance.inValues }

    const witnessCalculator = await builder(buffer)
    const witness = await witnessCalculator.calculateWitness(ins, 0)
    for (let i = 1; i <= instance.outValues.length; i++) {
      if (witness[i] !== BigInt(instance.outValues[i - 1])) {
        throw new Error(
          `Instance check failed in the placement ${instance.instructionName} (index = ${placementInd})`,
        )
      }
    }
  }
  console.log(`Synthesizer: Instances passed subcircuits.`)
}

// Todo: permutationY와 permutationZ의 내용 압축해서 내보내기.
// Todo: WireFlattenMap과 Inverse를 buildQAP에서 수행하고 내용 압축해서 내보내고, 여기선 그걸 불러오기
