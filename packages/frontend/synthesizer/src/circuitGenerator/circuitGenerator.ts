import { SynthesizerInterface } from '../synthesizer/index.ts';
import { VariableGenerator } from './handlers/variableGenerator.ts';
import { Placements } from '../synthesizer/types/placements.ts';
import { PermutationGenerator } from './handlers/permutationGenerator.ts';

export async function createCircuitGenerator(synthesizer: SynthesizerInterface, subcircuitWasmBuffers: any[]): Promise<CircuitGenerator> {
  const circuitGenerator = new CircuitGenerator(synthesizer, subcircuitWasmBuffers);
  await circuitGenerator.variableGenerator.initVariableGenerator();
  circuitGenerator.circuitPlacements = circuitGenerator.variableGenerator.placementsCompatibleWithSubcircuits;
  circuitGenerator.permutationGenerator = new PermutationGenerator(circuitGenerator);
  return circuitGenerator;
}

export class CircuitGenerator {
  public pathToWrite?: string;
  // public subcircuitIndicesByName: Map<SubcircuitNames, SubcircuitIndicesByNameEntry> = new Map()
  public variableGenerator: VariableGenerator;
  public permutationGenerator: PermutationGenerator | undefined = undefined;
  public synthesizer: SynthesizerInterface;
  public EVMPlacements: Placements;
  public circuitPlacements: Placements | undefined = undefined;
  public subcircuitWasmBuffers: any[];

  constructor(synthesizer: SynthesizerInterface, subcircuitWasmBuffers: any[]) {
    this.synthesizer = synthesizer;
    this.EVMPlacements = this.synthesizer.placements;
    this.variableGenerator = new VariableGenerator(this);
    this.subcircuitWasmBuffers = subcircuitWasmBuffers;
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
