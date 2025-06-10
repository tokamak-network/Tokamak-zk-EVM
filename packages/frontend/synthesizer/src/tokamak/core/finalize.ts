import { bigIntToBytes, bytesToHex, setLengthLeft } from "@synthesizer-libs/util"
import fs from 'fs'
import { readFileSync } from 'fs'
import path from 'path'
import appRootPath from 'app-root-path'

import { subcircuits as subcircuitInfos, globalWireList, setupParams, wasmDir } from '../constant/index.js'
import { INITIAL_PLACEMENT_INDEX, PRV_IN_PLACEMENT_INDEX, PRV_OUT_PLACEMENT_INDEX, PUB_IN_PLACEMENT_INDEX, PUB_OUT_PLACEMENT_INDEX } from '../constant/index.js'

// @ts-ignore
import { builder } from '../utils/witness_calculator.js'

import type {
  DataPt,
  PlacementEntry,
  PlacementVariables,
  Placements,
  SubcircuitInfoByName,
  SubcircuitInfoByNameEntry,
} from '../types/index.js'
type PlacementWireIndex = { globalWireId: number, placementId: number }

export async function finalize(
  placements: Placements, 
  _path?: string, 
  writeToFS: boolean = true
): Promise<Permutation> {
  const refactoriedPlacements = refactoryPlacement(placements)
  let permutation = new Permutation(refactoriedPlacements, _path)
  permutation.placementVariables = await permutation.outputPlacementVariables(
    refactoriedPlacements, 
    _path
  )
  permutation.outputPermutation(_path)
  return permutation
}

const halveWordSizeOfWires = (newDataPts: DataPt[], origDataPt: DataPt): number[] => {
  const newIndex = newDataPts.length
  const indLow = newIndex
  const indHigh = indLow + 1

  if (origDataPt.sourceSize > 16) {

    newDataPts[indLow] = { ...origDataPt}
    newDataPts[indLow].wireIndex = indLow
    newDataPts[indHigh] = { ...origDataPt}
    newDataPts[indHigh].wireIndex = indHigh
    
    newDataPts[indHigh].value = origDataPt.value >> 128n
    newDataPts[indLow].value = origDataPt.value & ((2n ** 128n) - 1n)

    newDataPts[indHigh].valueHex = bytesToHex(
      setLengthLeft(bigIntToBytes(newDataPts[indHigh].value), 16)
    )
    newDataPts[indLow].valueHex = bytesToHex(
      setLengthLeft(bigIntToBytes(newDataPts[indLow].value), 16)
    )
    return [indLow, indHigh]
  } else {
    newDataPts[newIndex] = { ...origDataPt }
    newDataPts[newIndex].wireIndex = newIndex
    return [newIndex]
  }
}

const removeUnusedLoadWires = (placements: Placements): PlacementEntry => {
  const outLoadPlacement = { ...placements.get(PRV_IN_PLACEMENT_INDEX)! }
  const newInPts = [...outLoadPlacement.inPts]
  const newOutPts = [...outLoadPlacement.outPts]
  for (let ind = 0; ind < outLoadPlacement.outPts.length; ind++) {
    let flag = 0
    for (const key of placements.keys()) {
      if (key !== PRV_IN_PLACEMENT_INDEX) {
        const placement = placements.get(key)!
        for (const [_ind, _inPt] of placement.inPts.entries()) {
          if (
            _inPt.source! === PRV_IN_PLACEMENT_INDEX &&
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
  const subcircuitInfoByName = new Map()
  for (const subcircuitInfo of subcircuitInfos) {
    subcircuitInfoByName.set(subcircuitInfo.name, {id: subcircuitInfo.id, Out_idx: subcircuitInfo.Out_idx, In_idx: subcircuitInfo.In_idx})
  }
  const dietLoadPlacment = removeUnusedLoadWires(placements)
  let outPlacements: Placements = new Map()
  const outWireIndexChangeTracker: Map<number, Map<number, number[]>> = new Map()

  for (const key of placements.keys()) {
    const _wireIndexTracker: Map<number, number[]> = new Map()
    const placement = key === PRV_IN_PLACEMENT_INDEX ? dietLoadPlacment : placements.get(key)

    const newOutPts: DataPt[] = []
    const outPts = placement!.outPts

    for (const outPt of outPts) {
      const newInd  = halveWordSizeOfWires(newOutPts, outPt)
      _wireIndexTracker.set(outPt.wireIndex, newInd)
    }
    outWireIndexChangeTracker.set(key, _wireIndexTracker); 
    
    outPlacements.set(key, {
      name: placement!.name,
      usage: placement!.usage,
      subcircuitId: subcircuitInfoByName.get(placement!.name)!.id,
      inPts: placement!.inPts,
      outPts: [...newOutPts],
    })
  }

  for (const key of placements.keys()) {
    const placement = key === PRV_IN_PLACEMENT_INDEX ? dietLoadPlacment : placements.get(key)

    const newInPts: DataPt[] = []
    const inPts = placement!.inPts

    for (const inPt of inPts) {
      const newInd = halveWordSizeOfWires(newInPts, inPt)
      const oldRefSource = inPt.source
      const oldRefWireInd = inPt.wireIndex
      if ( oldRefSource !== key ) {
        // console.log(`curr source, target source = (${key}, ${oldRefSource})`)
        const newRefWireIndices = outWireIndexChangeTracker.get(oldRefSource)!.get(oldRefWireInd)!
        for (const [i, newRefWireInd] of newRefWireIndices.entries()){
          newInPts[newInd[i]!].wireIndex = newRefWireInd
        }
      }
    }
    
    outPlacements.get(key)!.inPts = [...newInPts] 
  }

  let flags: boolean[] = Array(5).fill(true);
  
  if (outPlacements.get(PRV_IN_PLACEMENT_INDEX)!.inPts.length > subcircuitInfoByName.get('bufferPrvIn')!.In_idx[1]) {
    flags[0] = false;
    console.log(`Error: Synthesizer: Insufficient private input buffer length. Ask the qap-compiler for a longer buffer (required length: ${outPlacements.get(PRV_IN_PLACEMENT_INDEX)!.inPts.length}).`)
  }
  if (outPlacements.get(PRV_OUT_PLACEMENT_INDEX)!.outPts.length > subcircuitInfoByName.get('bufferPrvOut')!.Out_idx[1]) {
    flags[1] = false;
    console.log(`Error: Synthesizer: Insufficient private output buffer length. Ask the qap-compiler for a longer buffer (required length: ${outPlacements.get(PRV_OUT_PLACEMENT_INDEX)!.outPts.length}).`)
  }
  if (outPlacements.get(PUB_IN_PLACEMENT_INDEX)!.inPts.length > subcircuitInfoByName.get('bufferPubIn')!.In_idx[1]) {
    flags[2] = false;
    console.log(`Error: Synthesizer: Insufficient public input buffer length. Ask the qap-compiler for a longer buffer (required length: ${outPlacements.get(PUB_IN_PLACEMENT_INDEX)!.inPts.length}).`)
  }
  if (outPlacements.get(PUB_OUT_PLACEMENT_INDEX)!.outPts.length > subcircuitInfoByName.get('bufferPubOut')!.Out_idx[1]) {
    flags[3] = false;
    console.log(`Error: Synthesizer: Insufficient public output buffer length. Ask the qap-compiler for a longer buffer (required length: ${outPlacements.get(PUB_OUT_PLACEMENT_INDEX)!.outPts.length}).`)
  }
  if (outPlacements.size > setupParams.s_max) {
    flags[4] = false;
    console.log(`Error: Synthesizer: The number of placements exceeds the parameter s_max. Ask the qap-compiler for more placements (required slots: ${outPlacements.size})`)
  }
  if (flags.includes(false)) {
    throw new Error("Resolve above errors.")
  }
  return outPlacements
}

async function generateSubcircuitWitness(
  subcircuitId: number,
  inValues: string[],
): Promise<string[]> {
  let witnessHex: string[] = []
  if (inValues.length > 0) {
    const id = subcircuitId

    let buffer
    const targetWasmPath = path.resolve(appRootPath.path, wasmDir, `subcircuit${id}.wasm`)
    try {
      buffer = readFileSync(targetWasmPath)
    } catch (err) {
      throw new Error(`Error while reading subcircuit${id}.wasm`)
    }
    const ins = { in: inValues }
    const witnessCalculator = await builder(buffer)
    const witness = await witnessCalculator.calculateWitness(ins, 0)
    for (const [index, value] of witness.entries()) {
      let hex = value.toString(16)
      if (hex.length % 2 === 1) {
        hex = '0' + hex
      }
      hex = '0x' + hex
      witnessHex[index] = hex
    }
  }
  return witnessHex
}

function searchInsert(parent: PlacementWireIndex, child: PlacementWireIndex, permGroup: Map<string, boolean>[]): void {
  const parentString = JSON.stringify({ ...parent })
  const childString = JSON.stringify({ ...child })
  for (const group of permGroup) {
    if (group.has(parentString)) {
      group.set(childString, true)
      return
    }
  }
  throw new Error('Synthesizer: A wire has a parent, which however does not belong to any group.')
  // If the parent does not belong to any group, they form a new group with the codes below.
  // However, THIS MUST NOT HAPPEN.
  // const groupEntry: Map<string, boolean> = new Map()
  // groupEntry.set(parentString, true)
  // groupEntry.set(childString, true)
  // permGroup.push(groupEntry)
}

// An auxiliary class
class IdxSet {
  NConstWires = 1
  NOutWires: number
  NInWires: number
  NWires: number
  idxOut: number
  idxIn: number
  idxPrv: number
  flattenMap: number[]
  constructor(subcircuitInfo: SubcircuitInfoByNameEntry) {
    this.NOutWires = subcircuitInfo.NOutWires
    this.NInWires = subcircuitInfo.NInWires
    this.NWires = subcircuitInfo.NWires
    this.idxOut = this.NConstWires
    this.idxIn = this.idxOut + this.NOutWires
    this.idxPrv = this.idxIn + this.NInWires
    this.flattenMap = subcircuitInfo.flattenMap!
  }
}

// This class instantiates the compiler model in Section "3.1 Compilers" of the Tokamak zk-SNARK paper.
export class Permutation {
  // flattenMapInverse: {0, 1, ..., m_D-1} -> \union_{j=0}^{s_D - 1} {j} \times {0, 1, ...,m^{(j)}-1} }
  private flattenMapInverse
  public placementVariables: PlacementVariables
  private subcircuitInfoByName: SubcircuitInfoByName
  public placements: Placements

  // Each entry in permGroup represents a permutation subgroup.
  // Each subgroup will be expressed in a Map to efficiently check whether it involves a wire or not.
  // The key of each Map will be a stringified PlacementWireIndex.
  private permGroup: Map<string, boolean>[]
  // permultationY: {0, 1, ..., s_{max}-1} \times {0, 1, ..., l_D-l-1} -> {0, 1, ..., s_{max}-1}
  public permutationY: number[][]
  // permutationZ: {0, 1, ..., s_{max}-1} \times {0, 1, ..., l_D-l-1} -> {0, 1, ..., l_D-l-1}
  public permutationX: number[][]
  public permutationFile: { row: number; col: number; X: number; Y: number }[]

  constructor(
    placements: Placements, 
    _path?: string,
  ) {
    this.placements = placements
    this.placementVariables = []
    this.flattenMapInverse = globalWireList
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
    this.permGroup = this._buildPermGroup()

    // Initialization for the permutation polynomials in equation 8 of the paper
    const numPlacements = setupParams.l_D - setupParams.l;
    const numWires = this.placements.size;
    
    this.permutationY = Array.from({ length: numPlacements }, (_, h) =>
      Array.from({ length: numWires }, (_, i) => i),
    );
    // Example:
    // [
    //   [0, 1, 2, 3],
    //   [0, 1, 2, 3],
    //   [0, 1, 2, 3]
    // ]
    
    this.permutationX = Array.from({ length: numPlacements }, (_, h) =>
      Array.from({ length: numWires }, (_, i) => h),
    );
    // Example:
    // [
    //   [0, 0, 0, 0],
    //   [1, 1, 1, 1],
    //   [2, 2, 2, 2]
    // ]
    // "permutationY[i][h]=j and permutationX[i][h]=k" means that the i-th wire of the h-th placement is a copy of the k-th wire of the j-th placement.
    
    // Now finally correct permutationY and permutationX according to permGroup
    this.permutationFile = this._correctPermutation()
  }

  async outputPlacementVariables(
    placements: Placements, 
    _path?: string,
  ): Promise<PlacementVariables> {
    const placementVariables: PlacementVariables = await Promise.all(
        Array.from(placements.entries()).map(async ([placementId, placement]) => {
          let inValues = placement.inPts.map((pt) => pt.valueHex)
          //Formatting
          // if (placement.subcircuitId < INITIAL_PLACEMENT_INDEX) {
          const expectedInsLen = subcircuitInfos[placement.subcircuitId].In_idx[1]
          if (expectedInsLen > inValues.length) {
            const filledIns = inValues.concat(Array(expectedInsLen - inValues.length).fill('0x00'))
            inValues = filledIns
          }
          // }
          
          //Generating placement local variables
          let outValues = placement.outPts.map((pt) => pt.valueHex)
          const expectedOutsLen = subcircuitInfos[placement.subcircuitId].Out_idx[1]
          if (expectedOutsLen > outValues.length) {
            const filledOuts = outValues.concat(Array(expectedOutsLen - outValues.length).fill('0x00'))
            outValues = filledOuts
          }
          let variables = await generateSubcircuitWitness(placement.subcircuitId!, inValues)
          for (let i = 1; i <= outValues.length; i++) {
            if (BigInt(variables[i]) !== BigInt(outValues[i - 1])) {
              throw new Error(
                `Instance check failed in the ${placementId}-th placement (subcircuit name: ${placement.name})`,
              )
            }
          }
          // process.stdout.write('\r' + ' '.repeat(100) + '\r');
          // process.stdout.write(`Synthesizer: Instances of the ${placementId}-th placement passed the ${placement.subcircuitId}-th subcircuit.`)

          return {subcircuitId: placement.subcircuitId, variables}
        }
      )
    )
    console.log('')
    console.log(`Synthesizer: All ${placements.size} placement instances passed the subcircuits`)

    // Extracting instance from the placement variables
    let idxSetPubIn = new IdxSet(this.subcircuitInfoByName.get(this.placements.get(PUB_IN_PLACEMENT_INDEX)!.name)!)
    let idxSetPubOut = new IdxSet(this.subcircuitInfoByName.get(this.placements.get(PUB_OUT_PLACEMENT_INDEX)!.name)!)
    let idxSetPrvIn = new IdxSet(this.subcircuitInfoByName.get(this.placements.get(PRV_IN_PLACEMENT_INDEX)!.name)!)
    let idxSetPrvOut = new IdxSet(this.subcircuitInfoByName.get(this.placements.get(PRV_OUT_PLACEMENT_INDEX)!.name)!)
    let a: string[] = Array(setupParams.l).fill("0x00");
    if (idxSetPubIn.NInWires + idxSetPrvIn.NInWires + idxSetPubOut.NOutWires + idxSetPrvOut.NOutWires > setupParams.l) {
      throw new Error('Incorrectness in the number of input and output variables.')
    }
    for (let i = 0; i < idxSetPubOut.NOutWires; i++){
      let localIdx = idxSetPubOut.idxOut + i;
      let val = placementVariables[PUB_OUT_PLACEMENT_INDEX].variables[localIdx] ?? "0x00"
      a[idxSetPubOut.flattenMap[localIdx]] = val
    }
    for (let i = 0; i < idxSetPubIn.NInWires; i++){
      let localIdx = idxSetPubIn.idxIn + i;
      let val = placementVariables[PUB_IN_PLACEMENT_INDEX].variables[localIdx] ?? "0x00"
      a[idxSetPubIn.flattenMap[localIdx]] = val
    }
    for (let i = 0; i < idxSetPrvOut.NOutWires; i++){
      let localIdx = idxSetPrvOut.idxOut + i;
      let val = placementVariables[PRV_OUT_PLACEMENT_INDEX].variables[localIdx] ?? "0x00"
      a[idxSetPrvOut.flattenMap[localIdx]] = val
    }
    for (let i = 0; i < idxSetPrvIn.NInWires; i++){
      let localIdx = idxSetPrvIn.idxIn + i;
      let val = placementVariables[PRV_IN_PLACEMENT_INDEX].variables[localIdx] ?? "0x00"
      a[idxSetPrvIn.flattenMap[localIdx]] = val
    }

    // Packaging public instance
    const publicInputBuffer = {
      ...this.placements.get(PUB_IN_PLACEMENT_INDEX)!,
      inPts: this.placements.get(PUB_IN_PLACEMENT_INDEX)!.inPts.map(({ value, ...rest }) => rest),
      outPts: this.placements.get(PUB_IN_PLACEMENT_INDEX)!.outPts.map(({ value, ...rest }) => rest),
    }
    const publicOutputBuffer = {
      ...this.placements.get(PUB_OUT_PLACEMENT_INDEX)!,
      inPts: this.placements.get(PUB_OUT_PLACEMENT_INDEX)!.inPts.map(({ value, ...rest }) => rest),
      outPts: this.placements.get(PUB_OUT_PLACEMENT_INDEX)!.outPts.map(({ value, ...rest }) => rest),
    }
    const privateInputBuffer = {
      ...this.placements.get(PRV_IN_PLACEMENT_INDEX)!,
      inPts: this.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts.map(({ value, ...rest }) => rest),
      outPts: this.placements.get(PRV_IN_PLACEMENT_INDEX)!.outPts.map(({ value, ...rest }) => rest),
    }
    const privateOutputBuffer = {
      ...this.placements.get(PRV_OUT_PLACEMENT_INDEX)!,
      inPts: this.placements.get(PRV_OUT_PLACEMENT_INDEX)!.inPts.map(({ value, ...rest }) => rest),
      outPts: this.placements.get(PRV_OUT_PLACEMENT_INDEX)!.outPts.map(({ value, ...rest }) => rest),
    }
    const Instance = {
      publicOutputBuffer,
      publicInputBuffer,
      privateOutputBuffer,
      privateInputBuffer,
      a
    }

    const placementVariablesJson = `${JSON.stringify(placementVariables, null, 2)}`
<<<<<<< HEAD
    const publicInstanceJson = `${JSON.stringify(publicInstance, null, 2)}`
    const privateExternalInterfaceJson = `${JSON.stringify(privateExternalInterface, null, 2)}`
    console.log(_path)
=======
    const instanceJson = `${JSON.stringify(Instance, null, 2)}`
>>>>>>> 3179367525e2facfbbb4695bae0ceedb191feb8a
    const filePath1 = _path === undefined ? path.resolve(
      appRootPath.path,
      'examples/outputs/placementVariables.json',
    ) : path.resolve(_path!, 'placementVariables.json')
    const filePath2 = _path === undefined ? path.resolve(
      appRootPath.path,
      'examples/outputs/instance.json',
    ) : path.resolve(_path!, 'instance.json')
    const files = [placementVariablesJson, instanceJson]
    const filePaths = [filePath1, filePath2]
    for (const [idx, path_i] of filePaths.entries()){
      const dir = path.dirname(path_i)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      try {
        fs.writeFileSync(path_i, files[idx], 'utf-8')
        console.log(
          `Synthesizer: Success in writing '${path_i}'.`,
        )
      } catch (error) {
        throw new Error(`Synthesizer: Failure in writing '${path_i}'.`)
      }
    }
    return (placementVariables)
  }

  private _retrieveDataPtFromPlacementWireId = (inputIdx: PlacementWireIndex): DataPt => {
    const localWireId = this.flattenMapInverse[inputIdx.globalWireId][1]
    const placement = this.placements.get(inputIdx.placementId)!
    const identifier = this.subcircuitInfoByName.get(placement.name)!.NOutWires
    if (localWireId <= identifier) {
      // output wire
      return placement.outPts[localWireId - 1]
    } else {
      // input wire
      return placement.inPts[localWireId - (identifier + 1)]
    }
  }
  private _correctPermutation(): { row: number; col: number; Y: number; X: number }[] {
    let permutationFile = []
    for (const _group of this.permGroup) {
      const group = [..._group.keys()]
      const groupLength = group.length
      if (groupLength > 1) {
        const reprVal = this._retrieveDataPtFromPlacementWireId(JSON.parse(group[0])).value
        for (let i = 0; i < groupLength; i++) {
          const element: PlacementWireIndex = JSON.parse(group[i])
          const nextElement: PlacementWireIndex = JSON.parse(group[(i + 1) % groupLength])
          const nextVal = this._retrieveDataPtFromPlacementWireId(nextElement).value
          if (reprVal !== nextVal) {
            throw new Error('permGroup is broken.')
          }
          permutationFile.push({
            // wire id
            row: element.globalWireId - setupParams.l,
            // placement id
            col: element.placementId,
            // wire id
            X: nextElement.globalWireId - setupParams.l,
            // placement id
            Y: nextElement.placementId,
            
          })
          const rowIdx = permutationFile[permutationFile.length - 1].row
          const colIdx = permutationFile[permutationFile.length - 1].col
          if (colIdx >= this.placements.size || rowIdx >= setupParams.l_D - setupParams.l) {
            throw new Error('permGroup needs to be debugged')
          }
          this.permutationX[rowIdx][colIdx] =
            permutationFile[permutationFile.length - 1].X
          this.permutationY[rowIdx][colIdx] =
            permutationFile[permutationFile.length - 1].Y
        }
      }
    }
    return permutationFile
  }

  outputPermutation(_path?: string) {
    this._validatePermutation()
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

  private _buildPermGroup = (): Map<string, boolean>[] => {
    // Initialize group representatives.
    // Each output wire of every placement is picked as a representative and forms a new group, if it is not a public wire.
    let permGroup: Map<string, boolean>[] = []
    for (const placeId of this.placements.keys()) {
      const thisPlacement = this.placements.get(placeId)!
      const thisSubcircuitInfo = this.subcircuitInfoByName.get(thisPlacement.name)!
      for (let i = 0; i < thisSubcircuitInfo.NOutWires; i++) {
        const localWireId = thisSubcircuitInfo.outWireIndex + i
        const globalWireId = thisSubcircuitInfo.flattenMap![localWireId]
        if (!(globalWireId >= setupParams.l && globalWireId < setupParams.l_D)) {
          break
        }
        const placementWireId: PlacementWireIndex = {
          placementId: placeId,
          globalWireId: globalWireId,
        }
        const groupEntry: Map<string, boolean> = new Map()
        groupEntry.set(JSON.stringify({ ...placementWireId }), true)
        permGroup.push(groupEntry)
      }
    }
    // Place each input wire of every placement in the appropriate group, if it is not a public wire.
    // Identify which group the parent of each input wire belongs to.
    for (const thisPlacementId of this.placements.keys()) {
      const thisPlacement = this.placements.get(thisPlacementId)!
      const thisSubcircuitInfo = this.subcircuitInfoByName.get(thisPlacement.name)!
      for (let i = 0; i < thisSubcircuitInfo.NInWires; i++) {
        const thisLocalWireId = thisSubcircuitInfo.inWireIndex + i
        const thisGlobalWireId = thisSubcircuitInfo.flattenMap![thisLocalWireId]
        if (!(thisGlobalWireId >= setupParams.l && thisGlobalWireId < setupParams.l_D)) {
          break
        }
        const thisPlacementWireId: PlacementWireIndex = {
          placementId: thisPlacementId,
          globalWireId: thisGlobalWireId,
        }
        const thisInPt = thisPlacement.inPts[i]
        let hasParent = false
        if (thisInPt !== undefined && thisInPt.source !== thisPlacementId) {
          hasParent = true
          const pointedPlacementId = thisInPt.source!
          const pointedPlacement = this.placements.get(pointedPlacementId)!
          const pointedSubcircuitInfo = this.subcircuitInfoByName.get(pointedPlacement.name)!
          // Looking for the parent of this wire
          const pointedOutputId = pointedPlacement
            .outPts.findIndex((candidateOutPt) => candidateOutPt.wireIndex! === thisInPt.wireIndex!)
          if (pointedOutputId === -1){
            throw new Error(`Permutation: A wire is referring to nothing.`)
          }
          const pointedOutPt = pointedPlacement.outPts[pointedOutputId]
          if (thisInPt.value !== pointedOutPt.value) {
            throw new Error('Permutation: Synthesizer needs to be debugged.')
          }
          const pointedLocalWireId = pointedSubcircuitInfo.outWireIndex + pointedOutputId
          const pointedGlobalWireId = pointedSubcircuitInfo.flattenMap![pointedLocalWireId]
          const pointedPlacementWireId: PlacementWireIndex = {
            placementId: pointedPlacementId,
            globalWireId: pointedGlobalWireId,
          }
          if (!(pointedGlobalWireId >= setupParams.l && pointedGlobalWireId < setupParams.l_D)) {
            throw new Error(`Permutation: A wire is referring to a public wire or an internal wire.`)
          }
          // Searching which group the parent belongs to and adding the child into there
          searchInsert(pointedPlacementWireId, thisPlacementWireId, permGroup)
        }
        if (!hasParent) {
          // The input wire has no parent, meaning that it can be form a group as a representative, only when it is in one of the following cases:
          // 1) it is unused or
          // 2) it is an input wire of PRV_IN_PLACEMENT.
          let isQualified = false
          if (thisInPt === undefined || thisInPt.source === PRV_IN_PLACEMENT_INDEX ) {
            isQualified = true
          }
          if (!isQualified) {
            throw new Error('An input interface wire forms a group as a representative, although it is not qualified.')
          }
          const groupEntry: Map<string, boolean> = new Map()
          groupEntry.set(JSON.stringify({ ...thisPlacementWireId }), true)
          permGroup.push(groupEntry)
        }
      }
      // console.log(`Length inc: ${thisSubcircuitInfo.NInWires}`)
      // let checksum = 0
      // for (const group of permGroup){
      //     checksum += group.size
      // }
      // console.log(`checksum: ${checksum}`)
      // console.log(`a`)
    }
    return permGroup
  }

  private _validatePermutation = (): void => {
    if (this.placementVariables.length === 0) {
      throw new Error('Permutation: PlacementVariables are yet built. Run "Placement.outputPlacementVariables" first.')
    }
    let permutationDetected = false
    const zeros = Array(setupParams.l_D).fill('0x00')
    let b: string[][] = [] // ab.size = l_D \times s_max
    for (const [placementId, placementVariablesEntry] of this.placementVariables.entries()) {
      const variables = placementVariablesEntry.variables
      const subcircuitInfo = this.subcircuitInfoByName.get(this.placements.get(placementId)!.name)!
      const idxSet = new IdxSet(subcircuitInfo)
      if ( subcircuitInfo.flattenMap![idxSet.idxOut] >= setupParams.l_D ) {
        throw new Error('Incorrect flatten map')
      }
      let ab = [...zeros]
      //Iterating for all output and input (local) variables
      for (let localIdx = idxSet.idxOut; localIdx < idxSet.idxPrv; localIdx++){
        const globalIdx = subcircuitInfo.flattenMap![localIdx]
        ab[globalIdx] = variables[localIdx]
      }
      b[placementId] = ab.slice(setupParams.l, setupParams.l_D)
    }
    for (let i = 0; i < b.length; i++) {
      for (let j = 0; j < setupParams.l_D - setupParams.l; j++) {
        const i2 = this.permutationY[j][i]
        const j2 = this.permutationX[j][i]
        if (i != i2 || j != j2) {
          permutationDetected = true
          if (b[i][j] != b[i2][j2]) {
            throw new Error(`Permutation: Permutation does not hold.`)
          }
        }
      }
    }
    if (permutationDetected === false) {
      throw new Error(`Synthesizer: Warning: No permutation detected!`)
    } else {
      console.log(`Synthesizer: Permutation check clear`)
    }
  }
}


// Todo: Compresss permutation
