import { SynthesizerInterface } from '../synthesizer/types/index.ts';
import { VariableGenerator } from './handlers/variableGenerator.ts';
import { Placements } from '../synthesizer/types/placements.ts';
import { PermutationGenerator } from './handlers/permutationGenerator.ts';
import { CircuitArtifacts } from './types/types.ts';
import type { ResolvedSubcircuitLibrary } from '../interface/qapCompiler/libraryTypes.ts';
export declare function createCircuitGenerator(synthesizer: SynthesizerInterface, subcircuitWasmBuffers: any[]): Promise<CircuitGenerator>;
export declare class CircuitGenerator {
    pathToWrite?: string;
    variableGenerator: VariableGenerator;
    permutationGenerator: PermutationGenerator | undefined;
    synthesizer: SynthesizerInterface;
    readonly subcircuitLibrary: ResolvedSubcircuitLibrary;
    EVMPlacements: Placements;
    circuitPlacements: Placements | undefined;
    subcircuitWasmBuffers: any[];
    constructor(synthesizer: SynthesizerInterface, subcircuitWasmBuffers: any[]);
    getArtifacts(): CircuitArtifacts;
}
//# sourceMappingURL=circuitGenerator.d.ts.map