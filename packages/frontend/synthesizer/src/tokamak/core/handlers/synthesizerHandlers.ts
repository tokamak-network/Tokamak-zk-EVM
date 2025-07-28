import { BIGINT_0, bytesToBigInt } from '@synthesizer-libs/util';
import { EOFBYTES, isEOF } from '../../../eof/util.js';
import {
  createAddressFromStackBigInt,
  getDataSlice,
} from '../../../opcodes/util.js';
import { placeExp } from '../../operations/exp.js';
import { simulateMemoryPt } from '../../pointers/index.js';

import type { RunState } from '../../../interpreter.js';
import type { ArithmeticOperator, DataPt } from '../../types/index.js';

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
      const codePt = await prepareEXTCodePt(runState, target);
      if (codePt.value === BIGINT_0) {
        dataPt = runState.synthesizer.loadAuxin(BIGINT_0);
      } else {
        dataPt = runState.synthesizer.loadAndStoreKeccak(
          [codePt],
          runState.stack.peek(1)[0],
          32n,
        );
      }
      break;
    }
    case 'ADDRESS':
    case 'ORIGIN':
    case 'CALLER':
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
