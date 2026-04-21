import {
  createTokamakL2Common,
  createTokamakL2StateManagerFromStateSnapshot,
  createTokamakL2TxFromSnapshot,
  fromEdwardsToAddress,
  type TokamakL2StateManagerSnapshotOpts,
} from 'tokamak-l2js';
import {
  addHexPrefix,
  createAccount,
  createAddressFromString,
  hexToBytes,
} from '@ethereumjs/util';
import { createCircuitGenerator } from '../circuitGenerator/circuitGenerator.ts';
import { createSynthesizer } from '../synthesizer/constructors.ts';
import type { SynthesisInput, SynthesisOutput } from './types.ts';

async function seedSenderNonceFromTransactionSnapshot(
  stateManager: Awaited<ReturnType<typeof createTokamakL2StateManagerFromStateSnapshot>>,
  transactionSnapshot: SynthesisInput['transaction'],
) {
  const senderPubKey = hexToBytes(addHexPrefix(transactionSnapshot.senderPubKey));
  const senderAddress = createAddressFromString(fromEdwardsToAddress(senderPubKey).toString());
  const senderAccount = createAccount({
    nonce: BigInt(transactionSnapshot.nonce),
    balance: 0n,
  });
  await stateManager.putAccount(senderAddress, senderAccount);
}

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
  await seedSenderNonceFromTransactionSnapshot(stateManager, input.transaction);

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
  const circuitGenerator = await createCircuitGenerator(synthesizer, input.wasmBuffers);
  const circuitArtifacts = circuitGenerator.getArtifacts();

  return {
    ...circuitArtifacts,
    finalStateSnapshot,
    evmAnalysis: {
      stepLogs: synthesizer.stepLogs,
      messageCodeAddresses: Array.from(synthesizer.messageCodeAddresses),
    },
  };
}
