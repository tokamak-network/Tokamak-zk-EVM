import { addHexPrefix, hexToBigInt } from '@ethereumjs/util';
import type { ResolvedSubcircuitLibrary } from '../../subcircuit/libraryTypes.ts';
import {
  BUFFER_LIST,
  type ReservedBuffer,
  type SubcircuitNames,
} from '../../subcircuit/configuredTypes.ts';
import type { DataPt } from '../../synthesizer/types/dataStructure.ts';
import { VARIABLE_DESCRIPTION } from '../../synthesizer/types/buffers.ts';
import type { Placements, PlacementVariables } from '../../synthesizer/types/placements.ts';
import type { Permutation } from '../types/types.ts';

type PlacementWireIndex = Readonly<{ localWireId: number; placementId: number }>;

class DisjointSet {
  private readonly parent: number[];
  private readonly rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.rank = Array<number>(size).fill(0);
  }

  find(value: number): number {
    const parent = this.parent[value]!;
    if (parent !== value) this.parent[value] = this.find(parent);
    return this.parent[value]!;
  }

  union(left: number, right: number): void {
    let leftRoot = this.find(left);
    let rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    if (this.rank[leftRoot]! < this.rank[rightRoot]!) {
      [leftRoot, rightRoot] = [rightRoot, leftRoot];
    }
    this.parent[rightRoot] = leftRoot;
    if (this.rank[leftRoot] === this.rank[rightRoot]) this.rank[leftRoot]!++;
  }
}

// Builds the sparse permutation over the normalized J_rho x placement grid.
export class PermutationGenerator {
  public readonly permutation: Permutation;

  constructor(
    private readonly circuitPlacements: Placements,
    private readonly placementVariables: PlacementVariables,
    private readonly subcircuitLibrary: ResolvedSubcircuitLibrary,
  ) {
    this._assertPlacementVariableAlignment();
    this.permutation = this._buildPermutation();
  }

  private _buildPermutation(): Permutation {
    const { m_b: wiringWidth } = this.subcircuitLibrary.data.setupParams;
    const placementCount = this.circuitPlacements.length;
    const groups = new DisjointSet(placementCount * wiringWidth);

    for (const [placementId, placement] of this.circuitPlacements.entries()) {
      const info = this._subcircuitInfo(placement.name);
      for (let inputOffset = 0; inputOffset < info.NInWires; inputOffset++) {
        const localWireId = info.inWireIndex + inputOffset;
        const input = placement.inPts[inputOffset];
        if (input !== undefined && input.source !== placementId) {
          const parentPlacementId = input.source;
          const parent = this.circuitPlacements[parentPlacementId];
          if (parent === undefined) throw new Error('Permutation: An input refers to an unknown placement.');
          const parentOutputOffset = parent.outPts.findIndex(output => output.wireIndex === input.wireIndex);
          if (parentOutputOffset === -1) throw new Error('Permutation: An input wire refers to no parent output.');
          const parentOutput = parent.outPts[parentOutputOffset]!;
          if (input.value !== parentOutput.value) throw new Error('Permutation: Connected wire values differ.');
          const parentInfo = this._subcircuitInfo(parent.name);
          const parentLocalWireId = parentInfo.outWireIndex + parentOutputOffset;
          if (this._isPublic(info, localWireId) || this._isPublic(parentInfo, parentLocalWireId)) {
            throw new Error('Permutation: A connected bus wire cannot use a public coordinate.');
          }
          groups.union(
            this._cellIndex({ placementId, localWireId }),
            this._cellIndex({ placementId: parentPlacementId, localWireId: parentLocalWireId }),
          );
        } else if (!this._isPermittedUnparentedInput(placementId, placement.name, input, inputOffset)) {
          throw new Error('Permutation: An ordinary input wire has no parent output.');
        }
      }
    }

    const constantRepresentative = this._constantOneRepresentative();
    for (const [placementId, placement] of this.circuitPlacements.entries()) {
      if (hexToBigInt(addHexPrefix(this.placementVariables[placementId]!.variables[0]!)) !== 1n) {
        throw new Error(`Permutation: Placement ${placementId} has a non-unit constant wire.`);
      }
      const info = this._subcircuitInfo(placement.name);
      const [wiringStart, wiringCount] = info.wiringRange;
      for (let localWireId = wiringStart + wiringCount; localWireId < wiringWidth; localWireId++) {
        if (hexToBigInt(addHexPrefix(this.placementVariables[placementId]!.variables[localWireId]!)) !== 0n) {
          throw new Error(`Permutation: Placement ${placementId} has non-zero wiring padding.`);
        }
      }
      groups.union(this._cellIndex(constantRepresentative), this._cellIndex({ placementId, localWireId: 0 }));
    }

    const membersByRoot = new Map<number, number[]>();
    for (let cell = 0; cell < placementCount * wiringWidth; cell++) {
      const root = groups.find(cell);
      const members = membersByRoot.get(root) ?? [];
      members.push(cell);
      membersByRoot.set(root, members);
    }

    const constantCell = this._cellIndex(constantRepresentative);
    const permutation: Permutation = [];
    for (const members of membersByRoot.values()) {
      if (members.length === 1) continue;
      members.sort((left, right) => left - right);
      const expectedValue = this._wireValue(this._coordinate(members[0]!));
      for (const member of members) {
        const coordinate = this._coordinate(member);
        if (this._wireValue(coordinate) !== expectedValue) {
          throw new Error('Permutation: A copy-constraint cycle contains different witness values.');
        }
        if (this._isPublicCoordinate(coordinate) && member !== constantCell) {
          throw new Error('Permutation: An ordinary public coordinate must remain an identity point.');
        }
      }
      for (let index = 0; index < members.length; index++) {
        const current = this._coordinate(members[index]!);
        const next = this._coordinate(members[(index + 1) % members.length]!);
        permutation.push({ row: current.localWireId, col: current.placementId, X: next.localWireId, Y: next.placementId });
      }
    }
    if (permutation.length === 0) throw new Error('Permutation: No non-identity cycle was generated.');
    console.log('Synthesizer: Permutation check clear');
    return permutation;
  }

  private _constantOneRepresentative(): PlacementWireIndex {
    const placementId = VARIABLE_DESCRIPTION.CIRCOM_CONST_ONE.source;
    const wireOffset = VARIABLE_DESCRIPTION.CIRCOM_CONST_ONE.wireIndex;
    const placement = this.circuitPlacements[placementId];
    if (placement === undefined || placement.inPts[wireOffset]?.value !== 1n) {
      throw new Error('Permutation: Invalid CIRCOM_CONST_ONE public input.');
    }
    const info = this._subcircuitInfo(placement.name);
    const localWireId = info.inWireIndex + wireOffset;
    if (!this._isPublic(info, localWireId)) {
      throw new Error('Permutation: CIRCOM_CONST_ONE must be a public input coordinate.');
    }
    return { placementId, localWireId };
  }

  private _isPermittedUnparentedInput(
    placementId: number,
    subcircuitName: SubcircuitNames,
    input: DataPt | undefined,
    inputOffset: number,
  ): boolean {
    const info = this._subcircuitInfo(subcircuitName);
    if (this._isPublic(info, info.inWireIndex + inputOffset)) return true;
    const buffer = this._getBufferForSubcircuit(subcircuitName);
    if (buffer === undefined) return false;
    if (input === undefined) return true;
    if (input.source !== placementId) return false;
    return this.subcircuitLibrary.subcircuitBufferMapping[buffer]?.bufferDirection === 'in';
  }

  private _getBufferForSubcircuit(subcircuitName: SubcircuitNames): ReservedBuffer | undefined {
    const matches = BUFFER_LIST.filter(
      buffer => this.subcircuitLibrary.subcircuitBufferMapping[buffer]?.name === subcircuitName,
    );
    if (matches.length > 1) throw new Error(`Permutation: ${subcircuitName} belongs to multiple buffers.`);
    return matches[0];
  }

  private _subcircuitInfo(name: SubcircuitNames) {
    const info = this.subcircuitLibrary.subcircuitInfoByName.get(name);
    if (info === undefined) throw new Error(`Permutation: Unknown subcircuit ${name}.`);
    return info;
  }

  private _isPublic(info: ReturnType<PermutationGenerator['_subcircuitInfo']>, localWireId: number): boolean {
    const [start, count] = info.publicRange;
    return localWireId >= start && localWireId < start + count;
  }

  private _isPublicCoordinate(coordinate: PlacementWireIndex): boolean {
    return this._isPublic(
      this._subcircuitInfo(this.circuitPlacements[coordinate.placementId]!.name),
      coordinate.localWireId,
    );
  }

  private _cellIndex(coordinate: PlacementWireIndex): number {
    const { m_b: wiringWidth } = this.subcircuitLibrary.data.setupParams;
    if (
      !Number.isSafeInteger(coordinate.placementId) ||
      !Number.isSafeInteger(coordinate.localWireId) ||
      coordinate.placementId < 0 ||
      coordinate.placementId >= this.circuitPlacements.length ||
      coordinate.localWireId < 0 ||
      coordinate.localWireId >= wiringWidth
    ) {
      throw new Error('Permutation: Coordinate is outside the normalized wiring grid.');
    }
    return coordinate.placementId * wiringWidth + coordinate.localWireId;
  }

  private _coordinate(cellIndex: number): PlacementWireIndex {
    const { m_b: wiringWidth } = this.subcircuitLibrary.data.setupParams;
    return { placementId: Math.floor(cellIndex / wiringWidth), localWireId: cellIndex % wiringWidth };
  }

  private _wireValue(coordinate: PlacementWireIndex): bigint {
    const value = this.placementVariables[coordinate.placementId]!.variables[coordinate.localWireId];
    if (value === undefined) throw new Error('Permutation: Missing normalized witness value.');
    return hexToBigInt(addHexPrefix(value));
  }

  private _assertPlacementVariableAlignment(): void {
    if (this.circuitPlacements.length !== this.placementVariables.length) {
      throw new Error(
        `Permutation: ${this.circuitPlacements.length} placements do not match ${this.placementVariables.length} variable entries`,
      );
    }
    for (const [placementId, placement] of this.circuitPlacements.entries()) {
      const variables = this.placementVariables[placementId]!;
      if (placement.subcircuitId !== variables.subcircuitId) {
        throw new Error(`Permutation: Placement ${placementId} does not match its variable entry.`);
      }
      if (variables.variables.length !== this.subcircuitLibrary.data.setupParams.m) {
        throw new Error(`Permutation: Placement ${placementId} does not use the normalized witness width.`);
      }
    }
  }
}
