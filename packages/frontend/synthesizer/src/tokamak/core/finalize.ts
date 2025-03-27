import { bigIntToBytes, bytesToHex, setLengthLeft } from "@synthesizer-libs/util"
import fs from 'fs'
import { readFileSync } from 'fs'
import path from 'path'
import appRootPath from 'app-root-path'

import { subcircuits as subcircuitInfos, globalWireList, setupParams, wasmDir } from '../resources/index.js'
import { INITIAL_PLACEMENT_INDEX, LOAD_PLACEMENT_INDEX } from '../constant/index.js'

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

export async function finalize(
  placements: Placements, 
  _path?: string, 
  validate?: boolean,
  writeToFS: boolean = true
): Promise<{
  permutation: Permutation,
  placementInstance: PlacementInstances
}> {
  const _validate = validate ?? false
  const refactoriedPlacements = refactoryPlacement(placements)
  let permutation: Permutation
  let placementInstance: PlacementInstances 

  if (_validate) {
    placementInstance = await outputPlacementInstance(refactoriedPlacements, _path, writeToFS)
    permutation = new Permutation(refactoriedPlacements, placementInstance, _path, writeToFS)
    return {
      permutation,
      placementInstance
    }
  } 

  permutation = new Permutation(refactoriedPlacements)
  return {
    permutation,
    placementInstance: []
  }
}

const halveWordSizeOfWires = (newDataPts: DataPt[], prevDataPt: DataPt, index: number): void => {
  const indLow = BigInt(index * 2)
  const indHigh = indLow + 1n

  try {
    newDataPts[Number(indLow)] = { ...prevDataPt }
    newDataPts[Number(indHigh)] = { ...prevDataPt }

    if (prevDataPt.wireIndex !== undefined) {
      const wireIndex = BigInt(prevDataPt.wireIndex)
      newDataPts[Number(indLow)].wireIndex = Number(wireIndex * 2n)
      newDataPts[Number(indHigh)].wireIndex = Number(wireIndex * 2n + 1n)
    }

    if (prevDataPt.pairedInputWireIndices !== undefined) {
      const convertIndices = (ind: number) => {
        const bigInd = BigInt(ind)
        return [Number(bigInd * 2n), Number(bigInd * 2n + 1n)]
      }

      newDataPts[Number(indHigh)].pairedInputWireIndices = prevDataPt.pairedInputWireIndices.flatMap(convertIndices)
      newDataPts[Number(indLow)].pairedInputWireIndices = prevDataPt.pairedInputWireIndices.flatMap(convertIndices)
    }

    // value가 문자열로 들어올 경우를 대비
    const value = typeof prevDataPt.value === 'string' ? BigInt(prevDataPt.value) : prevDataPt.value
    
    newDataPts[Number(indHigh)].value = value >> 128n
    newDataPts[Number(indLow)].value = value & ((2n ** 128n) - 1n)

    newDataPts[Number(indHigh)].valueHex = bytesToHex(
      setLengthLeft(bigIntToBytes(newDataPts[Number(indHigh)].value), 16)
    )
    newDataPts[Number(indLow)].valueHex = bytesToHex(
      setLengthLeft(bigIntToBytes(newDataPts[Number(indLow)].value), 16)
    )

  } catch (error) {
    console.error('Error in halveWordSizeOfWires:', {
      error,
      prevDataPt,
      index,
      valueType: typeof prevDataPt.value
    });
    throw error;
  }
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

async function outputPlacementInstance(
  placements: Placements, 
  _path?: string,
  writeToFS: boolean = true
): Promise<PlacementInstances> {
  const result: PlacementInstances = Array.from(placements.entries()).map(([key, entry]) => ({
    placementIndex: key,
    subcircuitId: entry.subcircuitId!,
    instructionName: entry.name,
    inValues: entry.inPts.map((pt) => pt.valueHex),
    outValues: entry.outPts.map((pt) => pt.valueHex),
  }))
  for (let i = 0; i < INITIAL_PLACEMENT_INDEX; i++) {
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

  if (writeToFS) {
    const jsonContent = `${JSON.stringify(result, null, 2)}`
    const filePath = _path === undefined ? path.resolve(
      appRootPath.path,
      'examples/outputs/placementInstance.json',
    ) : path.resolve(_path!, 'placementInstance.json')
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    try {
      fs.writeFileSync(filePath, jsonContent, 'utf-8')
      console.log(
        `Synthesizer: Input and output wire assingments of the placements are generated in '${filePath}'.`,
      )
    } catch (error) {
      throw new Error(`Synthesizer: Failure in writing "placementInstance.json".`)
    }
  }

  return result
}

// This class instantiates the compiler model in Section "3.1 Compilers" of the Tokamak zk-SNARK paper.
class Permutation {
  private l = setupParams.l
  private l_D = setupParams.l_D
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

  constructor(
    placements: Placements, 
    instances?: PlacementInstances, 
    _path?: string,
    writeToFS: boolean = true
  ) {
    // Istances are needed only for debugging by "this._validatePermutation()"
    this._placements = placements
    this._instances = instances ?? undefined
    this.flattenMapInverse = instances === undefined ? undefined : globalWireList

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
    if (writeToFS) {
      this._outputPermutation(_path)
    }
  }

  private _outputPermutation(_path?: string) {
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
    const filePath = _path === undefined ? path.resolve(
      appRootPath.path,
      'examples/outputs/permutation.json',
    ) : path.resolve(_path!, 'permutation.json')
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    try {
      fs.writeFileSync(filePath, jsonContent, 'utf-8')
      console.log(`Synthesizer: Permutation rule is generated in '${filePath}'.`)
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
              if (pointedWireId === -1){
                throw new Error(`Permutation: A wire is referring to nothing.`)
              }
              const pointedLocalWireId = pointedSubcircuitInfo.outWireIndex + pointedWireId
              const pointedGlobalWireId = pointedSubcircuitInfo.flattenMap![pointedLocalWireId]
              const pointedPlacementWireId: PlacementWireIndex = {
                placementId: dataPt.source,
                globalWireId: pointedGlobalWireId,
              }
              if (!(pointedGlobalWireId >= this.l && pointedGlobalWireId < this.l_D)) {
                throw new Error(`Permutation: A wire is referring to a public wire or an internal wire.`)
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
  const reuseBuffer = new Map()
  for (const [placementInd, instance] of instances.entries()) {
    const id = instance.subcircuitId

    let buffer
    if (reuseBuffer.has(id)) {
      buffer = reuseBuffer.get(id)
    } else {
      const targetWasmPath = path.resolve(appRootPath.path, wasmDir, `subcircuit${id}.wasm`)


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

// Todo: Compresss permutation
