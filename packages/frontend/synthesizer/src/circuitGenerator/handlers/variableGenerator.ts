import { addHexPrefix, bigIntToBytes, bigIntToHex, bytesToHex, setLengthLeft } from "@ethereumjs/util";
import { BUFFER_LIST, SubcircuitInfoByName } from "src/interface/qapCompiler/configuredTypes.ts";
import { DataPtFactory } from "src/synthesizer/dataStructure/dataPt.ts";
import { SynthesizerInterface } from "src/synthesizer/index.ts";
import { DataPt } from "src/synthesizer/types/dataStructure.ts";
import { PlacementEntry, placementEntryDeepCopy, Placements, placementsDeepCopy, PlacementVariables } from "src/synthesizer/types/placements.ts";
import { CircuitGenerator } from "../circuitGenerator.ts";
import { Synthesizer } from "src/synthesizer/synthesizer.ts";
import { globalWireList, setupParams, SUBCIRCUIT_BUFFER_MAPPING, subcircuitInfoByName, wasmDir } from "src/interface/qapCompiler/importedConstants.ts";
import { buffer } from "stream/consumers";
import { builder } from "../witness_calculator.ts";
import { readFileSync } from "fs";
import appRootPath from "app-root-path";
import path from "path";
import { VARIABLE_DESCRIPTION } from "src/synthesizer/types/buffers.ts";

export class VariableGenerator {
  private parent: CircuitGenerator;

  placementsCompatibleWithSubcircuits: Placements | undefined = undefined
  placementVariables: PlacementVariables | undefined = undefined
  a_pub: `0x${string}`[] | undefined = undefined

  constructor(circuitGenerator: CircuitGenerator) {
    this.parent = circuitGenerator
  }

  async initVariableGenerator(): Promise<void> {
    if (
      this.placementsCompatibleWithSubcircuits !== undefined ||
      this.a_pub !== undefined ||
      this.placementVariables !== undefined
    ) {
      throw new Error('Cannot overwrite existing initialization')
    }
    const oldPlacements = this.parent.synthesizer.placements;
    const newPlacements = placementsDeepCopy(oldPlacements);
    this._removeUnusedWiresFromEVMInBuffer(oldPlacements, newPlacements);
    this._convertEVMWiresIntoCircomWires(newPlacements);
    this._validateBufferSizes(newPlacements);

    this.placementsCompatibleWithSubcircuits = newPlacements
    this.placementVariables = await this._generatePlacementVariables(this.placementsCompatibleWithSubcircuits)
    this.a_pub = this._extractPublicInstance(this.placementVariables)
  }

  private _prepareCircuitInstance(placement: PlacementEntry, target: 'In' | 'Out'): `0x${string}`[] {
    const origPts = target === 'In' ? placement.inPts : placement.outPts
    const origValues = origPts.map((pt) => addHexPrefix(pt.valueHex));
    // Preparing input values
    const expectedLen = target === 'In' ? subcircuitInfoByName.get(placement.name)!.NInWires : subcircuitInfoByName.get(placement.name)!.NOutWires
    if (expectedLen < origValues.length) {
      throw new Error(`Placement at index ${placement.name} has excessive number of ${target} wires`)
    }
    if (expectedLen > origValues.length) {
      return origValues.concat(
        Array(expectedLen - origValues.length).fill('0x00'),
      );
    } else {
      return origValues
    }
  }

  private async _generatePlacementVariables(placements: Placements): Promise<PlacementVariables> {
    const placementVariables =  await Promise.all(
      Array.from(placements.entries()).map(async ([placementId, placement]) => {

        // Preparing inpu values
        const inValues = this._prepareCircuitInstance(placement, 'In')

        // Preparing output values
        const outValues = this._prepareCircuitInstance(placement, 'Out')

        let variables: string []
        try {
          variables = await this._generateSubcircuitWitness(
            placement.subcircuitId!,
            inValues,
          );
        } catch (err) {
          console.log(`Placement index: ${placementId}`)
          console.log(`Subcircuit name: ${placement.name}`)
          throw new Error(err as string)
        }

        for (let i = 1; i <= outValues.length; i++) {
          if (BigInt(variables[i]) !== BigInt(outValues[i - 1])) {
            throw new Error(
              `Instance check failed in the ${placementId}-th placement (subcircuit name: ${placement.name})`,
            );
          }
        }
        if (subcircuitInfoByName.get(placement.name)!.flattenMap.length !== variables.length) {
          throw new Error(`Flatten map cannot be applied to the placement variables due to difference lengths`)
        }
        // process.stdout.write('\r' + ' '.repeat(100) + '\r');
        // process.stdout.write(`Synthesizer: Instances of the ${placementId}-th placement passed the ${placement.subcircuitId}-th subcircuit.`)

        return { subcircuitId: placement.subcircuitId, variables };
      }),
    );

    console.log('');
    console.log(
      `Synthesizer: All ${placements.length} placement instances passed the subcircuits`,
    );

    return placementVariables
  }

  private _extractPublicInstance(placementVariables: PlacementVariables): `0x${string}`[] {
      let l = setupParams.l
      let a_pub: `0x${string}`[] = Array(l).fill('0x00');
      for (var globalIdx = 0; globalIdx < l; globalIdx++) {
        const [subcircuitId, localVariableIdx] = globalWireList[globalIdx]
        if (subcircuitId !== -1 && localVariableIdx !== -1) {
          const placementIndex = placementVariables.findIndex( entry => entry.subcircuitId === subcircuitId)
          const localVal = placementVariables[placementIndex].variables[localVariableIdx]
          if (localVal === undefined) {
            throw new Error('Something wrong in the Global Wire List or local placement variables. Need to be debugged.')
          }
          a_pub[globalIdx] = addHexPrefix(localVal)
        }
      }
      return a_pub
    }

  private _halveWordSizeOfWires(
    origDataPt: DataPt,
  ): DataPt[] {
    const newDataPts: DataPt[] = []
    const copied = DataPtFactory.deepCopy(origDataPt);
    if (origDataPt.sourceBitSize > 128) {

      const lowerVal = copied.value & ((1n << 128n) - 1n)
      const upperVal = copied.value >> 128n
      if ((upperVal * (1n <<128n) + lowerVal) !== copied.value) {
        throw new Error('Mismatch between original and halved values')
      }
      // Lower bytes
      newDataPts.push({
        ...copied,
        value: lowerVal,
        valueHex: bigIntToHex(lowerVal)
      })

      // Upper bytes
      newDataPts.push({
        ...copied,
        value: upperVal,
        valueHex: bigIntToHex(upperVal)
      })
      return newDataPts;
    } else {
      return [copied]
    }
  }

  /**
   * Removes EVM_IN wires that are not referenced by any other placement's input points.
   * Returns a new PlacementEntry with filtered inPts and outPts arrays.
   */
  private _removeUnusedWiresFromEVMInBuffer(oldPlacements:Placements, newPlacements: Placements): void {
    const EVMInPlacementIndex = BUFFER_LIST.findIndex(str => str === 'EVM_IN')
    const oldEVMInPlacement = oldPlacements[EVMInPlacementIndex]!;
    const newEVMInPlacement = placementEntryDeepCopy(oldEVMInPlacement);

    // Collect wire indices of outPts that are referenced by any other placement's inPts
    const referencedWireIndices = new Set<number>();
    for (const [key, placement] of oldPlacements.entries()) {
      if (key === EVMInPlacementIndex) continue;
      for (const inPt of placement.inPts) {
        if (inPt.source === EVMInPlacementIndex) {
          referencedWireIndices.add(inPt.wireIndex);
        }
      }
    }

    // Forcely add CIRCOM_CONST_ONE wire to the referenced wire list
    if (VARIABLE_DESCRIPTION.CIRCOM_CONST_ONE.source !== EVMInPlacementIndex) {
      throw new Error(`CIRCOM_CONST_ONE wire must belong to EVM_IN buffer`)
    }
    referencedWireIndices.add(VARIABLE_DESCRIPTION.CIRCOM_CONST_ONE.wireIndex)

    // Filter outPts and inPts to keep only those referenced
    newEVMInPlacement.outPts = newEVMInPlacement.outPts.filter(outPt =>
      referencedWireIndices.has(outPt.wireIndex!)
    );
    newEVMInPlacement.inPts = newEVMInPlacement.inPts.filter(inPt =>
      referencedWireIndices.has(inPt.wireIndex!)
    );
    newPlacements[EVMInPlacementIndex] = newEVMInPlacement;
  }

  private _convertEVMWiresIntoCircomWires(
    placements: Placements,
  ): void {

    // Process output wires first
    const outWireIndexChangeTracker: Map<
      number,
      Map<number, number[]>
    > = new Map();
    for (const [key, placement] of placements.entries()) {
      const _newOutPts: DataPt[] = []
      const _wireIndexChangeTracker: Map<number, number[]> = new Map();
      for (const outPt of placement.outPts) {
        const splitOutPts = this._halveWordSizeOfWires(outPt);
        _wireIndexChangeTracker.set(outPt.wireIndex, []);
        for (const newOutPt of splitOutPts) {
          const newIndex = _newOutPts.length; // capture before push
          _newOutPts.push({ ...newOutPt, wireIndex: newIndex });
          _wireIndexChangeTracker.get(outPt.wireIndex)!.push(newIndex);
        }
      }
      outWireIndexChangeTracker.set(key, _wireIndexChangeTracker);

      placement.outPts = _newOutPts
    }

    // Process input wires
    for (const [thisPlacementId, placement] of placements.entries()) {
      const _newInPts: DataPt[] = [];

      for (const inPt of placement.inPts) {
        const sourcePlacementId = inPt.source;
        const sourceOutWireOldInd = inPt.wireIndex;
        if (sourcePlacementId === thisPlacementId) {
          // If the source comes from external
          const splitInPts = this._halveWordSizeOfWires(inPt);
          for (const newInPt of splitInPts) {
            const newIndex = _newInPts.length; // capture before push
            _newInPts.push({ ...newInPt, wireIndex: newIndex });
          }
        } else {
          // If the source comes from other placement
          const sourceTracker = outWireIndexChangeTracker.get(sourcePlacementId);
          if (!sourceTracker) {
            throw new Error(`Missing out-wire tracker for placement ${sourcePlacementId}`);
          }
          const mappedNewIndices = sourceTracker.get(sourceOutWireOldInd);
          if (!mappedNewIndices || mappedNewIndices.length == 0) {
            throw new Error(`No mapping for source wire ${sourceOutWireOldInd} (placement ${sourcePlacementId})`);
          }
          const newInPts = mappedNewIndices.map(index => placements[sourcePlacementId].outPts.find(pt => pt.wireIndex === index))
          if ( mappedNewIndices.length !== newInPts.length) {
            throw new Error('No one-to-one correspondence between new input and output wires');
          }
          for (const pt of newInPts) {
            _newInPts.push(pt!)
          }
        }
      }

      placement.inPts = _newInPts;
    }
  }

  private _validateBufferSizes(
    outPlacements: Placements,
  ): void {
    const flags: boolean[] = []
    for (const [placementIndex, bufferName] of BUFFER_LIST.entries()) {
      const bufferPlacement = outPlacements[placementIndex]
      if (bufferPlacement === undefined) {
        throw new Error(`Buffer ${bufferName} is not placed`)
      }
      const subcircuitInfo = SUBCIRCUIT_BUFFER_MAPPING[bufferName]
      if (subcircuitInfo === undefined) {
        throw new Error(`Subcircuit information for ${bufferName} is not loaded`)
      }
      if (bufferPlacement.inPts.length > subcircuitInfo.NInWires) {
        flags.push(false);
        console.log(
          `Error: Synthesizer: Insufficient ${subcircuitInfo.name} length. Ask the qap-compiler for a longer buffer (required length: ${bufferPlacement.inPts.length}).`,
        );
      }
    }
    if (flags.includes(false)) {
      throw new Error('Resolve above errors.');
    }
  }

  private async _generateSubcircuitWitness(
    subcircuitId: number,
    inValues: string[],
  ): Promise<string[]> {
    let witnessHex: string[] = [];
    if (inValues.length > 0) {
      const id = subcircuitId;

      let buffer;
      const targetWasmPath = path.resolve(
        appRootPath.path,
        wasmDir,
        `subcircuit${id}.wasm`,
      );
      try {
        buffer = readFileSync(targetWasmPath);
      } catch (err) {
        throw new Error(`Error while reading subcircuit${id}.wasm`);
      }
      const ins = { in: inValues };
      const witnessCalculator = await builder(buffer);
      const witness = await witnessCalculator.calculateWitness(ins, 0);
      for (const [index, value] of witness.entries()) {
        let hex = value.toString(16);
        if (hex.length % 2 === 1) {
          hex = '0' + hex;
        }
        hex = '0x' + hex;
        witnessHex[index] = hex;
      }
    }
    return witnessHex;
  }
}


