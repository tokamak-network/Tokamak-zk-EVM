import fs from 'fs';
import path from 'path';
import appRootPath from 'app-root-path';
import { SynthesizerInterface } from 'src/synthesizer/index.ts';
import { VariableGenerator } from './handlers/variableGenerator.ts';
import { SubcircuitInfoByNameEntry, SubcircuitNames } from 'src/interface/qapCompiler/configuredTypes.ts';
import { subcircuitInfoByName } from 'src/interface/qapCompiler/importedConstants.ts';
import { Placements, PlacementVariables } from 'src/synthesizer/types/placements.ts';
import { PermutationGenerator } from './handlers/permutationGenerator.ts';

export async function createCircuitGenerator(synthesizer: SynthesizerInterface): Promise<CircuitGenerator> {
  const circuitGenerator = new CircuitGenerator(synthesizer)
  await circuitGenerator.variableGenerator.initVariableGenerator()
  circuitGenerator.circuitPlacements = circuitGenerator.variableGenerator.placementsCompatibleWithSubcircuits
  circuitGenerator.permutationGenerator = new PermutationGenerator(circuitGenerator)
  return circuitGenerator
}

export class CircuitGenerator {
  public pathToWrite?: string;
  // public subcircuitIndicesByName: Map<SubcircuitNames, SubcircuitIndicesByNameEntry> = new Map()
  public variableGenerator: VariableGenerator
  public permutationGenerator: PermutationGenerator | undefined = undefined
  public synthesizer: SynthesizerInterface
  public EVMPlacements: Placements
  public circuitPlacements: Placements | undefined = undefined

  constructor(synthesizer: SynthesizerInterface) {
    this.synthesizer = synthesizer
    this.EVMPlacements = this.synthesizer.placements
    this.variableGenerator = new VariableGenerator(this)
  }

  /**
   * Write placementVariables, instance (a_pub), and permutation to JSON files.
   * If no path is provided, default to examples/outputs under app root.
   */
  public writeOutputs(_path?: string): void {
    if (!this.variableGenerator.placementVariables || !this.variableGenerator.a_pub) {
      throw new Error('VariableGenerator is not initialized. Run initVariableGenerator() first.');
    }
    if (!this.permutationGenerator || !this.permutationGenerator.permutation) {
      throw new Error('PermutationGenerator is not initialized.');
    }

    const placementVariables = this.variableGenerator.placementVariables;
    const a_pub = this.variableGenerator.a_pub;
    const permutation = this.permutationGenerator.permutation;

    // Prepare JSON strings
    const placementVariablesJson = JSON.stringify(placementVariables, null, 2);
    const instanceJson = JSON.stringify({ a_pub }, null, 2);
    const permutationJson = JSON.stringify(permutation, null, 2);

    // Resolve file paths (reuse the style from comments above)
    const pvPath = _path === undefined
      ? path.resolve(appRootPath.path, 'outputs/placementVariables.json')
      : path.resolve(appRootPath.path, _path!, 'placementVariables.json');
    const instPath = _path === undefined
      ? path.resolve(appRootPath.path, 'outputs/instance.json')
      : path.resolve(appRootPath.path, _path!, 'instance.json');
    const permPath = _path === undefined
      ? path.resolve(appRootPath.path, 'outputs/permutation.json')
      : path.resolve(appRootPath.path, _path!, 'permutation.json');

    const files = [placementVariablesJson, instanceJson, permutationJson];
    const filePaths = [pvPath, instPath, permPath];

    // Ensure directories exist and write files synchronously (as per existing style)
    for (const filePath of filePaths) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    try {
      fs.writeFileSync(pvPath, files[0], 'utf-8');
      console.log(`Synthesizer: Success in writing '${pvPath}'.`);
      fs.writeFileSync(instPath, files[1], 'utf-8');
      console.log(`Synthesizer: Success in writing '${instPath}'.`);
      fs.writeFileSync(permPath, files[2], 'utf-8');
      console.log(`Synthesizer: Permutation rule is generated in '${permPath}'.`);
    } catch (error) {
      throw new Error('Synthesizer: Failure in writing outputs.');
    }
  }

  // public async writeCircuit(
  //   pathToWrite: string,
  //   // writeToFS: boolean = true,
  // ): Promise<Permutation> {
  //   this.pathToWrite = pathToWrite;
  //   const placementRefactor = new VariableGenerator(this);
  //   const refactoriedPlacements = placementRefactor.refactor();
  //   const permutation = new Permutation(refactoriedPlacements, _path);
  //   permutation.placementVariables = await permutation.outputPlacementVariables(
  //     refactoriedPlacements,
  //     _path,
  //   );
  //   permutation.outputPermutation(_path);
  //   return permutation;
  // }

  // const Instance = {
  //         a_pub,
  //       };
    
  //       const placementVariablesJson = `${JSON.stringify(placementVariables, null, 2)}`;
  //       const instanceJson = `${JSON.stringify(Instance, null, 2)}`;
  //       const filePath1 =
  //         _path === undefined
  //           ? path.resolve(
  //               appRootPath.path,
  //               'examples/outputs/placementVariables.json',
  //             )
  //           : path.resolve(_path!, 'placementVariables.json');
  //       const filePath2 =
  //         _path === undefined
  //           ? path.resolve(appRootPath.path, 'examples/outputs/instance.json')
  //           : path.resolve(_path!, 'instance.json');
  //       const files = [placementVariablesJson, instanceJson];
  //       const filePaths = [filePath1, filePath2];
  //       for (const [idx, path_i] of filePaths.entries()) {
  //         const dir = path.dirname(path_i);
  //         if (!fs.existsSync(dir)) {
  //           fs.mkdirSync(dir, { recursive: true });
  //         }
  //         try {
  //           fs.writeFileSync(path_i, files[idx], 'utf-8');
  //           console.log(`Synthesizer: Success in writing '${path_i}'.`);
  //         } catch (error) {
  //           throw new Error(`Synthesizer: Failure in writing '${path_i}'.`);
  //         }
  //       }
  //       return placementVariables;

  // outputPermutation(_path?: string) {
  //     this._validatePermutation();
  //     const jsonContent = `${JSON.stringify(this.permutation, null, 2)}`;
  //     const filePath =
  //       _path === undefined
  //         ? path.resolve(appRootPath.path, 'examples/outputs/permutation.json')
  //         : path.resolve(_path!, 'permutation.json');
  //     const dir = path.dirname(filePath);
  //     if (!fs.existsSync(dir)) {
  //       fs.mkdirSync(dir, { recursive: true });
  //     }
  //     try {
  //       fs.writeFileSync(filePath, jsonContent, 'utf-8');
  //       console.log(
  //         `Synthesizer: Permutation rule is generated in '${filePath}'.`,
  //       );
  //     } catch (error) {
  //       throw new Error(`Synthesizer: Failure in writing "permutation.json".`);
  //     }
  //   }
}