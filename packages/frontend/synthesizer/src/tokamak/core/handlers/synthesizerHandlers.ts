import { BIGINT_0, bigIntToHex, bytesToBigInt } from '@synthesizer-libs/util';
import { EOFBYTES, isEOF } from '../../../eof/util.js';
import {
  createAddressFromStackBigInt,
  getDataSlice,
} from '../../../opcodes/util.js';
import { placeExp } from '../../operations/exp.js';
import { simulateMemoryPt } from '../../pointers/index.js';

import type { RunState } from '../../../interpreter.js';
import type { ArithmeticOperator, DataPt } from '../../types/index.js';
import { PUB_IN_PLACEMENT_INDEX, TRANSACTION_IN_PLACEMENT_INDEX } from 'src/tokamak/constant/constants.js';

export const synthesizerVerifySign = (
  op: ArithmeticOperator,
  runState: RunState,
): void => {
  const TARGETTXDATAINDICES = [1, 2, 3, 4] as const
  const messages: DataPt[] | undefined = runState.synthesizer.state.placements.get(TRANSACTION_IN_PLACEMENT_INDEX)?.outPts.slice(TARGETTXDATAINDICES[0], TARGETTXDATAINDICES[TARGETTXDATAINDICES.length - 1] + 1)
  if (messages === undefined) {
    throw new Error('Transactions are not initialized')
  }
  const PUBKEYINDEX = [5, 6] as const
  const publicKey: DataPt[] | undefined = runState.synthesizer.state.placements.get(PUB_IN_PLACEMENT_INDEX)?.outPts.slice(PUBKEYINDEX[0], PUBKEYINDEX[PUBKEYINDEX.length - 1] + 1)
  if (publicKey === undefined) {
    throw new Error('Public key is not initialized')
  }
  const RANDOMIZERINDEX = [7, 8] as const
  const randomizer: DataPt[] | undefined = runState.synthesizer.state.placements.get(PUB_IN_PLACEMENT_INDEX)?.outPts.slice(RANDOMIZERINDEX[0], RANDOMIZERINDEX[RANDOMIZERINDEX.length - 1] + 1)
  if (randomizer === undefined) {
    throw new Error('Randomizer is not initialized')
  }
  const SIGNATUREINDEX = 9 as const
  const signature: DataPt | undefined = runState.synthesizer.state.placements.get(PUB_IN_PLACEMENT_INDEX)?.outPts[SIGNATUREINDEX]
  if (signature === undefined) {
    throw new Error('Signature is not initialized')
  }
  const poseidonInter: DataPt[] = []
  poseidonInter.push(...runState.synthesizer.placeArith('Poseidon4', messages))
  poseidonInter.push(...runState.synthesizer.placeArith('Poseidon4', messages))
  poseidonInter.push(...runState.synthesizer.placeArith('Poseidon4', messages))
  poseidonInter.push(...runState.synthesizer.placeArith('Poseidon4', messages))
  const poseidonOut: DataPt = runState.synthesizer.placeArith('Poseidon4', poseidonInter)[0]
  const bitsOut: DataPt[] = runState.synthesizer.placeArith('PrepareEdDsaScalars', [signature, poseidonOut])
  if (bitsOut.length !== 504) {
    throw new Error('PrepareEdDsaScalar was expected to output 504 bits')
  }
  const signBits: DataPt[] = bitsOut.slice(0, 252)
  const nonceBits: DataPt[] = bitsOut.slice(252, -1)
  
}

export const synthesizerArith = (
  op: ArithmeticOperator,
  ins: bigint[],
  out: bigint,
  runState: RunState,
): void => {
  const inPts = runState.stackPt.popN(ins.length);

  for (let i = 0; i < ins.length; i++) {
    if (inPts[i].value !== ins[i]) {
      throw new Error(`Synthesizer: ${op}: Input data mismatch`);
    }
  }
  let outPts: DataPt[];
  switch (op) {
    case 'DecToBit':
    case 'PrepareEdDsaScalars':
      throw new Error(
        `Synthesizer: ${op}: Cannot be called by "synthesizerArith"`,
      );
    case 'EXP':
      outPts = [placeExp(runState.synthesizer, inPts)];
      break;
    default:
      outPts = runState.synthesizer.placeArith(op, inPts);
      break;
  }
  if (outPts.length !== 1 || outPts[0].value !== out) {
    throw new Error(`Synthesizer: ${op}: Output data mismatch`);
  }
  runState.stackPt.push(outPts[0]);
};

export const synthesizerBlkInf = (
  op: string,
  runState: RunState,
  target?: bigint,
): void => {
  let dataPt: DataPt;
  switch (op) {
    case 'BLOCKHASH':
    case 'BLOBHASH':
      if (target === undefined) {
        throw new Error(`Synthesizer: ${op}: Must have an input block number`);
      }
      if (target !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`);
      }
      dataPt = runState.synthesizer.loadBlkInf(
        target,
        op,
        runState.stack.peek(1)[0],
      );
      break;
    case 'COINBASE':
    case 'TIMESTAMP':
    case 'NUMBER':
    case 'DIFFICULTY':
    case 'GASLIMIT':
    case 'CHAINID':
    case 'SELFBALANCE':
    case 'BASEFEE':
    case 'BLOBBASEFEE':
      dataPt = runState.synthesizer.loadBlkInf(
        runState.env.block.header.number,
        op,
        runState.stack.peek(1)[0],
      );
      break;
    default:
      throw new Error(
        `Synthesizer: Dealing with invalid block information instruction`,
      );
  }
  runState.stackPt.push(dataPt);
  if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
    throw new Error(`Synthesizer: ${op}: Output data mismatch`);
  }
};

export async function prepareEXTCodePt(
  runState: RunState,
  target: bigint,
  _offset?: bigint,
  _size?: bigint,
): Promise<DataPt> {
  const address = createAddressFromStackBigInt(target);
  let code = await runState.stateManager.getCode(address);
  let codeType = 'EXTCode';
  if (isEOF(code)) {
    code = EOFBYTES;
    codeType = 'EXTCode(EOF)';
  }
  const codeOffset = _offset ?? 0n;
  const dataLength = _size ?? BigInt(code.byteLength);
  const data = getDataSlice(code, codeOffset, dataLength);
  const dataBigint = bytesToBigInt(data);
  const codeOffsetNum = Number(codeOffset);
  const dataPt = runState.synthesizer.loadEnvInf(
    address.toString(),
    codeType,
    dataBigint,
    codeOffsetNum,
    Number(dataLength),
  );
  return dataPt;
}

export async function synthesizerEnvInf(
  op: string,
  runState: RunState,
  target?: bigint,
  offset?: bigint,
): Promise<void> {
  let dataPt: DataPt;
  switch (op) {
    case 'CALLDATALOAD': {
      if (offset === undefined) {
        throw new Error(`Synthesizer: ${op}: Must have an input offset`);
      }
      if (offset !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`);
      }
      const i = Number(offset);
      const calldataMemoryPts = runState.interpreter._env.callMemoryPts;
      if (calldataMemoryPts.length > 0) {
        const calldataMemoryPt = simulateMemoryPt(calldataMemoryPts);
        const dataAliasInfos = calldataMemoryPt.getDataAlias(i, 32);
        if (dataAliasInfos.length > 0) {
          dataPt = runState.synthesizer.placeMemoryToStack(dataAliasInfos);
        } else {
          dataPt = runState.synthesizer.loadEnvInf(
            runState.env.address.toString(),
            'Calldata(Empty)',
            runState.stack.peek(1)[0],
            i,
          );
        }
      } else {
        dataPt = runState.synthesizer.loadEnvInf(
          runState.env.address.toString(),
          'Calldata(User)',
          runState.stack.peek(1)[0],
          i,
        );
      }
      break;
    }
    case 'BALANCE':
    case 'EXTCODESIZE': {
      if (target === undefined) {
        throw new Error(`Synthesizer: ${op}: Must have an input address`);
      }
      if (target !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`);
      }
      dataPt = runState.synthesizer.loadEnvInf(
        target.toString(16),
        op,
        runState.stack.peek(1)[0],
      );
      break;
    }
    case 'EXTCODEHASH': {
      if (target === undefined) {
        throw new Error(`Synthesizer: ${op}: Must have an input address`);
      }
      if (target !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`);
      }
      dataPt = runState.synthesizer.loadEnvInf(
        bigIntToHex(target),
        op,
        runState.stack.peek(1)[0],
      );
      break;
    }
    case 'ADDRESS':
    case 'ORIGIN':
    case 'CALLER': {
      placeArith
      break
    }
    case 'CALLVALUE':
    case 'CALLDATASIZE':
    case 'CODESIZE':
    case 'GASPRICE':
    case 'RETURNDATASIZE':
      dataPt = runState.synthesizer.loadEnvInf(
        runState.env.address.toString(),
        op,
        runState.stack.peek(1)[0],
      );
      break;
    default:
      throw new Error(
        `Synthesizer: Dealing with invalid environment information instruction`,
      );
  }
  runState.stackPt.push(dataPt);
  if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
    throw new Error(`Synthesizer: ${op}: Output data mismatch`);
  }
}
