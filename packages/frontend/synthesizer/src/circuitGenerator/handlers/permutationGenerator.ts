import { globalWireList, setupParams, subcircuitInfoByName } from '../../interface/qapCompiler/importedConstants.ts';

import { GlobalWireList } from '../../interface/qapCompiler/types.ts';
import { Placements, PlacementVariables } from '../../synthesizer/types/placements.ts';
import { BUFFER_DESCRIPTION, BUFFER_LIST, SubcircuitInfoByName, SubcircuitInfoByNameEntry } from '../../interface/qapCompiler/configuredTypes.ts';
import { DataPt } from '../../synthesizer/types/dataStructure.ts';
import { CircuitGenerator } from '../circuitGenerator.ts';
import { VARIABLE_DESCRIPTION } from '../../synthesizer/types/buffers.ts';
import { addHexPrefix, hexToBigInt } from '@ethereumjs/util';


type PlacementWireIndex = { globalWireId: number; placementId: number };

// This class instantiates the compiler model in Section "3.1 Compilers" of the Tokamak zk-SNARK paper.
export class PermutationGenerator {
  private parent: CircuitGenerator
  // flattenMapInverse: {0, 1, ..., m_D-1} -> \union_{j=0}^{s_D - 1} {j} \times {0, 1, ...,m^{(j)}-1} }
  private flattenMapInverse: GlobalWireList;
  private placementVariables: PlacementVariables;
  private circuitPlacements: Placements;

  // Each entry in permGroup represents a permutation subgroup.
  // Each subgroup will be expressed in a Map to efficiently check whether it involves a wire or not.
  // The key of each Map will be a stringified PlacementWireIndex.
  private permGroup: Map<string, boolean>[];
  // permultationY: {0, 1, ..., s_{max}-1} \times {0, 1, ..., l_D-l-1} -> {0, 1, ..., s_{max}-1}
  private permutationY: number[][];
  // permutationZ: {0, 1, ..., s_{max}-1} \times {0, 1, ..., l_D-l-1} -> {0, 1, ..., l_D-l-1}
  private permutationX: number[][];
  public permutation: { row: number; col: number; X: number; Y: number }[];

  constructor(parent: CircuitGenerator) {
    this.parent = parent
    const circuitPlacements = this.parent.circuitPlacements
    const placementVariables = this.parent.variableGenerator.placementVariables

    if (circuitPlacements === undefined || placementVariables === undefined) {
      throw new Error('Variable Genenrator is not run yet')
    }
    this.circuitPlacements = circuitPlacements
    this.placementVariables = placementVariables
    this.flattenMapInverse = globalWireList as GlobalWireList;
    // Construct permutation
    this.permGroup = this._buildPermGroup();

    // Initialization for the permutation polynomials in equation 8 of the paper
    const numWires = setupParams.l_D - setupParams.l;
    const numPlacements = this.circuitPlacements.length;

    this.permutationY = Array.from({ length: numWires }, () =>
      Array.from({ length: numPlacements }, (_, i) => i),
    );
    // Example:
    // [
    //   [0, 1, 2, 3],
    //   [0, 1, 2, 3],
    //   [0, 1, 2, 3]
    // ]

    this.permutationX = Array.from({ length: numWires }, (_, h) =>
      Array.from({ length: numPlacements }, () => h),
    );
    // Example:
    // [
    //   [0, 0, 0, 0],
    //   [1, 1, 1, 1],
    //   [2, 2, 2, 2]
    // ]
    // "permutationY[i][h]=j and permutationX[i][h]=k" means that the i-th wire of the h-th placement is a copy of the k-th wire of the j-th placement.

    // Now finally correct permutationY and permutationX according to permGroup
    this.permutation= this._correctPermutation();
  }

  private _retrieveDataPtFromPlacementWireId(
    inputIdx: PlacementWireIndex,
  ): DataPt {
    const [/*subcircuitId*/, localWireId] = this.flattenMapInverse[inputIdx.globalWireId] ?? [] as any;
    if (localWireId === undefined) {
      throw new Error(
        `Permutation: Invalid global wire ID: ${inputIdx.globalWireId}`,
      );
    }

    const placement = this.circuitPlacements[inputIdx.placementId];
    if (!placement) {
      throw new Error(
        `Permutation: Placement not found: ${inputIdx.placementId}`,
      );
    }

    const subcircuitInfo = subcircuitInfoByName.get(placement.name);
    if (!subcircuitInfo) {
      throw new Error(
        `Permutation: Subcircuit info not found for: ${placement.name}`,
      );
    }

    const identifier = subcircuitInfo.NOutWires;
    if (localWireId <= identifier) {
      // output wire
      const outPt = placement.outPts[localWireId - 1];
      if (!outPt) {
        throw new Error(
          `Permutation: Output point not found at index ${localWireId - 1}`,
        );
      }
      return outPt;
    } else {
      // input wire
      const inPt = placement.inPts[localWireId - (identifier + 1)];
      if (!inPt) {
        throw new Error(
          `Permutation: Input point not found at index ${localWireId - (identifier + 1)}`,
        );
      }
      return inPt;
    }
  }
  private _correctPermutation(): {
    row: number;
    col: number;
    X: number;
    Y: number;
  }[] {
    let permutationFile = [];
    for (const _group of this.permGroup) {
      const group = [..._group.keys()];
      const groupLength = group.length;
      if (groupLength > 1) {
        for (let i = 0; i < groupLength; i++) {
          const element: PlacementWireIndex = JSON.parse(group[i]);
          const nextElement: PlacementWireIndex = JSON.parse(
            group[(i + 1) % groupLength],
          );
          permutationFile.push({
            // wire id
            row: element.globalWireId - setupParams.l,
            // placement id
            col: element.placementId,
            // wire id
            X: nextElement.globalWireId - setupParams.l,
            // placement id
            Y: nextElement.placementId,
          });
          const rowIdx = permutationFile[permutationFile.length - 1].row;
          const colIdx = permutationFile[permutationFile.length - 1].col;
          if (
            colIdx >= this.circuitPlacements.length ||
            rowIdx >= setupParams.l_D - setupParams.l
          ) {
            throw new Error('permGroup needs to be debugged');
          }
          this.permutationX[rowIdx][colIdx] =
            permutationFile[permutationFile.length - 1].X;
          this.permutationY[rowIdx][colIdx] =
            permutationFile[permutationFile.length - 1].Y;
        }
      }
    }
    this._validatePermutation()
    return permutationFile;
  }

  private _buildPermGroup(): Map<string, boolean>[] {
    const permGroup: Map<string, boolean>[] = [];

    // Initialize group representatives.
    // Each output wire of every placement is picked as a representative and forms a new group, if it is not a public wire.
    for (let placeId = 0; placeId < this.circuitPlacements.length; placeId++) {
      const thisPlacement = this.circuitPlacements[placeId]!;
      const thisSubcircuitInfo = subcircuitInfoByName.get(thisPlacement.name)!;
      for (let i = 0; i < thisSubcircuitInfo.NOutWires; i++) {
        const localWireId = thisSubcircuitInfo.outWireIndex + i;
        const globalWireId = thisSubcircuitInfo.flattenMap![localWireId];
        if (!(globalWireId >= setupParams.l && globalWireId < setupParams.l_D)) {
          break;
        }
        const entryKey = this._keyOf({ placementId: placeId, globalWireId });
        const groupEntry: Map<string, boolean> = new Map();
        groupEntry.set(entryKey, true);
        permGroup.push(groupEntry);
      }
    }

    // Place each input wire of every placement in the appropriate group, if it is not a public wire.
    // Identify which group the parent of each input wire belongs to.
    for (let thisPlacementId = 0; thisPlacementId < this.circuitPlacements.length; thisPlacementId++) {
      const thisPlacement = this.circuitPlacements[thisPlacementId]!;
      const thisSubcircuitInfo = subcircuitInfoByName.get(thisPlacement.name)!;
      for (let i = 0; i < thisSubcircuitInfo.NInWires; i++) {
        const thisLocalWireId = thisSubcircuitInfo.inWireIndex + i;
        const thisGlobalWireId = thisSubcircuitInfo.flattenMap![thisLocalWireId];
        if (!(thisGlobalWireId >= setupParams.l && thisGlobalWireId < setupParams.l_D)) {
          break;
        }
        const thisInPt = thisPlacement.inPts[i];
        const thisKey = this._keyOf({ placementId: thisPlacementId, globalWireId: thisGlobalWireId });

        let hasParent = false;
        if (thisInPt !== undefined && thisInPt.source !== thisPlacementId) {
          hasParent = true;
          const pointedPlacementId = thisInPt.source!;
          const pointedPlacement = this.circuitPlacements[pointedPlacementId]!;
          const pointedSubcircuitInfo = subcircuitInfoByName.get(pointedPlacement.name)!;
          // Looking for the parent of this wire
          const pointedOutputId = pointedPlacement.outPts.findIndex(
            (candidateOutPt) => candidateOutPt.wireIndex! === thisInPt.wireIndex!,
          );
          if (pointedOutputId === -1) {
            throw new Error(`Permutation: A wire is referring to nothing.`);
          }
          const pointedOutPt = pointedPlacement.outPts[pointedOutputId];
          if (thisInPt.value !== pointedOutPt.value) {
            throw new Error('Permutation: Synthesizer needs to be debugged.');
          }
          const pointedLocalWireId = pointedSubcircuitInfo.outWireIndex + pointedOutputId;
          const pointedGlobalWireId = pointedSubcircuitInfo.flattenMap![pointedLocalWireId];
          if (!(pointedGlobalWireId >= setupParams.l && pointedGlobalWireId < setupParams.l_D)) {
            throw new Error(`Permutation: A wire is referring to a public wire or an internal wire.`);
          }
          const parentKey = this._keyOf({ placementId: pointedPlacementId, globalWireId: pointedGlobalWireId });

          // Searching which group the parent belongs to and adding the child into there
          let inserted = false;
          for (const group of permGroup) {
            if (group.has(parentKey)) {
              group.set(thisKey, true);
              inserted = true;
              break;
            }
          }
          if (!inserted) {
            throw new Error('Synthesizer: A wire has a parent, which however does not belong to any group.');
          }
        }
        if (!hasParent) {
          // The input wire has no parent, meaning that it can form a group as a representative, only when it is in one of the following cases:
          // 1) it is unused or
          // 2) it is an input wire of PRV_IN_PLACEMENT.
          let isQualified = false;
          if (
            thisInPt === undefined ||
            thisInPt.source === BUFFER_LIST.findIndex(buffer => buffer === 'PRIVATE_IN')
          ) {
            isQualified = true;
          }
          if (!isQualified) {
            throw new Error(
              'An input interface wire forms a group as a representative, although it is not qualified.',
            );
          }
          const groupEntry: Map<string, boolean> = new Map();
          groupEntry.set(thisKey, true);
          permGroup.push(groupEntry);
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

    // Forcely adding special permutation for the constant wires of all library subcircuits
    // The representative is CIRCOM_CONST_ONE, which should be in the current permGroup already.
    const repWirePlacementId = VARIABLE_DESCRIPTION.CIRCOM_CONST_ONE.source
    const repWirePlacementWireIndex = VARIABLE_DESCRIPTION.CIRCOM_CONST_ONE.wireIndex
    if (this.circuitPlacements[repWirePlacementId].outPts[repWirePlacementWireIndex].value !== 1n) {
      throw new Error(`Invalid pointer to CIRCOM_CONST_ONE wire`)
    }
    const repWireSubcircuitInfo = subcircuitInfoByName.get(this.circuitPlacements[repWirePlacementId].name)!
    const repWireLocalId = repWireSubcircuitInfo.outWireIndex + repWirePlacementWireIndex
    const repPermGroupKey = this._keyOf({ placementId: VARIABLE_DESCRIPTION.CIRCOM_CONST_ONE.source, globalWireId: repWireSubcircuitInfo.flattenMap[repWireLocalId]})
    const repContainingGroupIndices: number[] = []
    permGroup.forEach( (m, i) => { if (m.has(repPermGroupKey)) repContainingGroupIndices.push(i)})
    if (repContainingGroupIndices.length !== 1) {
      throw new Error(`Something wrong with searching CIRCOM_CONST_ONE wire from the permutation group`)
    }
    const circomConstPermGroup = permGroup[repContainingGroupIndices[0]]
    for (const [placementId, placement] of this.circuitPlacements.entries()) {
      const subcircuitInfo = subcircuitInfoByName.get(placement.name)!
      const key = this._keyOf({ placementId, globalWireId: subcircuitInfo.flattenMap[0]})
      circomConstPermGroup.set(key, true)
    }
    return permGroup;
  }

  private _validatePermutation(): void {
    let permutationDetected = false;
    const circomConsts = Array(setupParams.l_D).fill('0x01');
    let b: string[][] = []; // ab.size = l_D \times s_max
    for (const [
      placementId,
      placementVariablesEntry,
    ] of this.placementVariables.entries()) {
      const variables = placementVariablesEntry.variables;
      const subcircuitInfo = subcircuitInfoByName.get(
        this.circuitPlacements[placementId]!.name,
      )!;
      const idxSet = new IdxSet(subcircuitInfo);
      if (subcircuitInfo.flattenMap![idxSet.idxOut] >= setupParams.l_D) {
        throw new Error('Incorrect flatten map');
      }
      let ab = [...circomConsts];
      //Iterating for all output and input (local) variables
      for (let localIdx = idxSet.idxOut; localIdx < idxSet.idxPrv; localIdx++) {
        const globalIdx = subcircuitInfo.flattenMap![localIdx];
        ab[globalIdx] = variables[localIdx];
      }
      b[placementId] = ab.slice(setupParams.l, setupParams.l_D);
    }
    for (let i = 0; i < b.length; i++) {
      for (let j = 0; j < setupParams.l_D - setupParams.l; j++) {
        const i2 = this.permutationY[j][i];
        const j2 = this.permutationX[j][i];
        if (i != i2 || j != j2) {
          permutationDetected = true;
          if (hexToBigInt(addHexPrefix(b[i][j])) != hexToBigInt(addHexPrefix(b[i2][j2]))) {
            throw new Error(`Permutation: Permutation does not hold.`);
          }
        }
      }
    }
    if (permutationDetected === false) {
      throw new Error(`Synthesizer: Warning: No permutation detected!`);
    } else {
      console.log(`Synthesizer: Permutation check clear`);
    }
  }

  private _keyOf(obj: PlacementWireIndex): string {
    return JSON.stringify(obj);
  }
}

// An auxiliary class
class IdxSet {
  NConstWires = 1;
  NOutWires: number;
  NInWires: number;
  NWires: number;
  idxOut: number;
  idxIn: number;
  idxPrv: number;
  flattenMap: number[];
  constructor(subcircuitInfo: SubcircuitInfoByNameEntry) {
    this.NOutWires = subcircuitInfo.NOutWires;
    this.NInWires = subcircuitInfo.NInWires;
    this.NWires = subcircuitInfo.NWires;
    this.idxOut = this.NConstWires;
    this.idxIn = this.idxOut + this.NOutWires;
    this.idxPrv = this.idxIn + this.NInWires;

    if (!Array.isArray(subcircuitInfo.flattenMap) || subcircuitInfo.flattenMap.length == 0) {
      throw new Error(
        `IdxSet: SubcircuitInfo is missing required flattenMap for ${subcircuitInfo.id}`,
      );
    }
    this.flattenMap = subcircuitInfo.flattenMap;
  }
}

function searchInsert(
  parent: PlacementWireIndex,
  child: PlacementWireIndex,
  permGroup: Map<string, boolean>[],
): void {
  const parentString = JSON.stringify({ ...parent });
  const childString = JSON.stringify({ ...child });
  for (const group of permGroup) {
    if (group.has(parentString)) {
      group.set(childString, true);
      return;
    }
  }
  throw new Error(
    'Synthesizer: A wire has a parent, which however does not belong to any group.',
  );
}