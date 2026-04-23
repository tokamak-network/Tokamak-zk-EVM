import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import type {
  SynthesisOutput,
  SynthesisPayloadInput,
} from '../core/src/app.ts';

const workspaceDir = fileURLToPath(new URL('..', import.meta.url));

type WebAppModule = {
  createSynthesisOutputPayload(output: SynthesisOutput): Record<string, unknown>;
  loadSynthesisInputFromFiles(files: {
    previousState: Blob;
    transaction: Blob;
    blockInfo: Blob;
    contractCodes: Blob;
  }): Promise<SynthesisPayloadInput>;
  synthesize(input: SynthesisPayloadInput): Promise<SynthesisOutput>;
};

function resolveScenarioDir(): string {
  const scenarioArg = process.argv[2];
  if (scenarioArg === undefined) {
    return path.join(
      workspaceDir,
      'examples/privateState/mintNotes/mintNotes2',
    );
  }

  return path.resolve(workspaceDir, scenarioArg);
}

async function readBlob(filePath: string): Promise<Blob> {
  const { readFile } = await import('node:fs/promises');
  return new Blob([await readFile(filePath)]);
}

async function loadWebAppModule() {
  const buildResult = spawnSync(
    'npm',
    ['run', 'build', '--workspace', '@tokamak-zk-evm/synthesizer-web'],
    {
      cwd: workspaceDir,
      stdio: 'inherit',
    },
  );
  if (buildResult.status !== 0) {
    throw new Error('Failed to build @tokamak-zk-evm/synthesizer-web before debug run');
  }

  const runtimeModulePath = '../web-app/dist/esm/index.js';
  return import(runtimeModulePath) as Promise<WebAppModule>;
}

async function main(): Promise<void> {
  const scenarioDir = resolveScenarioDir();
  const {
    createSynthesisOutputPayload,
    loadSynthesisInputFromFiles,
    synthesize,
  } = await loadWebAppModule();

  const payload = await loadSynthesisInputFromFiles({
    previousState: await readBlob(path.join(scenarioDir, 'previous_state_snapshot.json')),
    transaction: await readBlob(path.join(scenarioDir, 'transaction.json')),
    blockInfo: await readBlob(path.join(scenarioDir, 'block_info.json')),
    contractCodes: await readBlob(path.join(scenarioDir, 'contract_codes.json')),
  });

  const output = await synthesize(payload);
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
