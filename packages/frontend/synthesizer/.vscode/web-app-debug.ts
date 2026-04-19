import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createFileSubcircuitLibraryProvider,
  createSynthesisOutputPayload,
  loadSynthesisInputFromFiles,
  prepareSynthesisInput,
  synthesize,
} from '../web-app/src/index.ts';

type SubcircuitInfoEntry = {
  id: number;
};

const workspaceDir = fileURLToPath(new URL('..', import.meta.url));
const nodeCliRequire = createRequire(new URL('../node-cli/package.json', import.meta.url));

function resolveScenarioDir(): string {
  const scenarioArg = process.argv[2];
  if (scenarioArg === undefined) {
    return path.join(
      workspaceDir,
      'node-cli/examples/privateState/mintNotes/mintNotes2',
    );
  }

  return path.resolve(workspaceDir, scenarioArg);
}

function resolveLibraryDir(): string {
  const libraryArg = process.argv[3];
  if (libraryArg !== undefined) {
    return path.resolve(workspaceDir, libraryArg);
  }

  const setupParamsPath = nodeCliRequire.resolve(
    '@tokamak-zk-evm/subcircuit-library/subcircuits/library/setupParams.json',
  );
  return path.dirname(setupParamsPath);
}

async function readBlob(filePath: string): Promise<Blob> {
  return new Blob([await readFile(filePath)]);
}

async function main(): Promise<void> {
  const scenarioDir = resolveScenarioDir();
  const libraryDir = resolveLibraryDir();
  const subcircuitInfo = JSON.parse(
    await readFile(path.join(libraryDir, 'subcircuitInfo.json'), 'utf8'),
  ) as SubcircuitInfoEntry[];

  const payload = await loadSynthesisInputFromFiles({
    previousState: await readBlob(path.join(scenarioDir, 'previous_state_snapshot.json')),
    transaction: await readBlob(path.join(scenarioDir, 'transaction.json')),
    blockInfo: await readBlob(path.join(scenarioDir, 'block_info.json')),
    contractCodes: await readBlob(path.join(scenarioDir, 'contract_codes.json')),
  });

  const wasmEntries = await Promise.all(
    subcircuitInfo.map(async ({ id }) => [
      id,
      await readBlob(path.join(libraryDir, 'wasm', `subcircuit${id}.wasm`)),
    ] as const),
  );

  const provider = createFileSubcircuitLibraryProvider({
    setupParams: await readBlob(path.join(libraryDir, 'setupParams.json')),
    globalWireList: await readBlob(path.join(libraryDir, 'globalWireList.json')),
    frontendCfg: await readBlob(path.join(libraryDir, 'frontendCfg.json')),
    subcircuitInfo: await readBlob(path.join(libraryDir, 'subcircuitInfo.json')),
    wasmFiles: Object.fromEntries(wasmEntries),
  });

  const input = await prepareSynthesisInput(payload, provider);
  const output = await synthesize(input);
  const outputPayload = createSynthesisOutputPayload(output);

  console.log(
    JSON.stringify(
      {
        files: Object.keys(outputPayload),
        stepLogCount: output.evmAnalysis.stepLogs.length,
        messageCodeAddressCount: output.evmAnalysis.messageCodeAddresses.length,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
