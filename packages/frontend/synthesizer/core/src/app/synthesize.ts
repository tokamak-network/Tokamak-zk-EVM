import {
  createTokamakL2Common,
  createTokamakL2StateManagerFromStateSnapshot,
  createTokamakL2TxFromSnapshot,
  type TokamakL2StateManagerSnapshotOpts,
} from 'tokamak-l2js';
import { addHexPrefix, createAddressFromString } from '@ethereumjs/util';
import { createCircuitGenerator } from '../circuitGenerator/circuitGenerator.ts';
import { createSynthesizer } from '../synthesizer/constructors.ts';
import type { SynthesisInput, SynthesisOutput } from './types.ts';

export async function synthesizeFromSnapshotInput(
  input: SynthesisInput,
): Promise<SynthesisOutput> {
  const common = createTokamakL2Common();
  const signedTransaction = createTokamakL2TxFromSnapshot(input.transaction, { common });
  const stateManagerOpts: TokamakL2StateManagerSnapshotOpts = {
    contractCodes: input.contractCodes.map((entry) => ({
      address: createAddressFromString(entry.address),
      code: addHexPrefix(entry.code),
    })),
  };
  const stateManager = await createTokamakL2StateManagerFromStateSnapshot(
    input.previousState,
    stateManagerOpts,
  );

  const synthesizer = await createSynthesizer(
    {
      stateManager,
      blockInfo: input.blockInfo,
      signedTransaction,
    },
    input.subcircuitLibrary,
  );

  await synthesizer.synthesizeTX();
  const finalStateSnapshot = await stateManager.captureStateSnapshot();
  const circuitGeneration = await createCircuitGenerator(synthesizer);

  return {
    ...circuitGeneration,
    finalStateSnapshot,
    evmAnalysis: {
      stepLogs: synthesizer.stepLogs,
      messageCodeAddresses: synthesizer.messageCodeAddresses.slice(),
    },
  };
}
