import path from "node:path";
import { CircuitGenerator } from "../../circuitGenerator/circuitGenerator.ts";
import appRootPath from "app-root-path";
import fs from 'fs';
import { subcircuitInfo } from "../qapCompiler/importedConstants.ts";
import { wasmDir } from "./wasmLoader.ts";
import { readFileSync } from "node:fs";
import { SynthesizerInterface } from "src/synthesizer/index.ts";

/**
   * Write placementVariables, instance (publicInstance), and permutation to JSON files.
   * If no path is provided, default to examples/outputs under app root.
   */
export function writeCircuitJson(circuitGenerator: CircuitGenerator, _path?: string): void {
    if (!circuitGenerator.variableGenerator.placementVariables || !circuitGenerator.variableGenerator.publicInstance) {
        throw new Error('VariableGenerator is not initialized. Run initVariableGenerator() first.');
    }
    if (!circuitGenerator.permutationGenerator || !circuitGenerator.permutationGenerator.permutation) {
        throw new Error('PermutationGenerator is not initialized.');
    }

    const placementVariables = circuitGenerator.variableGenerator.placementVariables;
    const a_pub = circuitGenerator.variableGenerator.publicInstance;
    const a_pub_desc = circuitGenerator.variableGenerator.publicInstanceDescription;
    const permutation = circuitGenerator.permutationGenerator.permutation;

    // Prepare JSON strings
    const placementVariablesJson = JSON.stringify(placementVariables, null, 2);
    const instanceJson = JSON.stringify(a_pub, null, 2);
    const instanceDescriptionJson = JSON.stringify(a_pub_desc, null, 2);
    const permutationJson = JSON.stringify(permutation, null, 2);

    // Resolve file paths (reuse the style from comments above)
    const pvPath =
        _path === undefined
        ? path.resolve(appRootPath.path, 'outputs/placementVariables.json')
        : path.resolve(appRootPath.path, _path!, 'placementVariables.json');
    const instPath =
        _path === undefined
        ? path.resolve(appRootPath.path, 'outputs/instance.json')
        : path.resolve(appRootPath.path, _path!, 'instance.json');
    const instDescPath =
    _path === undefined
        ? path.resolve(appRootPath.path, 'outputs/instance_description.json')
        : path.resolve(appRootPath.path, _path!, 'instance_description.json');
    const permPath =
        _path === undefined
        ? path.resolve(appRootPath.path, 'outputs/permutation.json')
        : path.resolve(appRootPath.path, _path!, 'permutation.json');

    const files = [placementVariablesJson, instanceJson, instanceDescriptionJson, permutationJson];
    const filePaths = [pvPath, instPath, instDescPath, permPath];

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
        fs.writeFileSync(instDescPath, files[2], 'utf-8');
        console.log(`Synthesizer: Success in writing '${instDescPath}'.`);
        fs.writeFileSync(permPath, files[3], 'utf-8');
        console.log(`Synthesizer: Permutation rule is generated in '${permPath}'.`);
    } catch (error) {
        throw new Error('Synthesizer: Failure in writing outputs.');
    }
}

export async function writeEvmAnalysisJson(synthesizer: SynthesizerInterface, outputPath?: string): Promise<void> {
    const stepLogs = synthesizer.stepLogs
    const messageCodeAddresses = Array.from(synthesizer.messageCodeAddresses)
    if (stepLogs.length === 0 && messageCodeAddresses.length === 0) {
        return
    }
    const resolvedStepLogPath = outputPath === undefined
        ? path.resolve(appRootPath.path, 'outputs/analysis/step_log.json')
        : (path.isAbsolute(outputPath) ? outputPath : path.resolve(appRootPath.path, outputPath))
    const outputDir = path.dirname(resolvedStepLogPath)
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }
    fs.writeFileSync(resolvedStepLogPath, JSON.stringify(stepLogs, null, 2), 'utf-8')
    console.log(`Success in writing '${resolvedStepLogPath}'.`)
    const messageCodeAddressesPath = path.join(outputDir, 'message_code_addresses.json')
    fs.writeFileSync(messageCodeAddressesPath, JSON.stringify(messageCodeAddresses, null, 2), 'utf-8')
    console.log(`Success in writing '${messageCodeAddressesPath}'.`)
}
