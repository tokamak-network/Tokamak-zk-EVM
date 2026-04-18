import path from "node:path";
import fsPromises from "node:fs/promises";
import {
  CircuitGenerator,
  type CircuitArtifacts,
  type SynthesizerInterface,
} from "../../core.ts";
import appRootPath from "app-root-path";
import fs from 'fs';
import { StateSnapshot } from "tokamak-l2js";

/**
   * Write placementVariables, instance (publicInstance), and permutation to JSON files.
   * If no path is provided, default to examples/outputs under app root.
   */
export function writeCircuitJson(
    circuitArtifacts: CircuitArtifacts | CircuitGenerator,
    _path?: string,
): void {
    const artifacts =
        circuitArtifacts instanceof CircuitGenerator
            ? circuitArtifacts.getArtifacts()
            : circuitArtifacts;

    const placementVariables = artifacts.placementVariables;
    const a_pub = artifacts.publicInstance;
    const a_pub_desc = artifacts.publicInstanceDescription;
    const permutation = artifacts.permutation;

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
    const outputDir = path.resolve(appRootPath.path, 'outputs', 'analysis')
    const stepLogFilename = outputPath === undefined ? 'step_log.json' : path.basename(outputPath)
    const resolvedStepLogPath = path.join(outputDir, stepLogFilename)
    await fsPromises.mkdir(outputDir, { recursive: true })
    await fsPromises.writeFile(resolvedStepLogPath, JSON.stringify(stepLogs, null, 2), 'utf-8')
    console.log(`Success in writing '${resolvedStepLogPath}'.`)
    const messageCodeAddressesPath = path.join(outputDir, 'message_code_addresses.json')
    await fsPromises.writeFile(messageCodeAddressesPath, JSON.stringify(messageCodeAddresses, null, 2), 'utf-8')
    console.log(`Success in writing '${messageCodeAddressesPath}'.`)
}

export function writeStateSnapshotJson(snapshot: StateSnapshot, outputDir?: string): void {
    const stateSnapshotPath =
        outputDir === undefined
            ? path.resolve(appRootPath.path, 'outputs/state_snapshot.json')
            : path.resolve(appRootPath.path, outputDir, 'state_snapshot.json');

    const stateSnapshotDir = path.dirname(stateSnapshotPath);
    if (!fs.existsSync(stateSnapshotDir)) {
        fs.mkdirSync(stateSnapshotDir, { recursive: true });
    }

    fs.writeFileSync(
        stateSnapshotPath,
        JSON.stringify(snapshot, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
        'utf-8',
    );
    console.log(`Synthesizer: Success in writing '${stateSnapshotPath}'.`);
}
