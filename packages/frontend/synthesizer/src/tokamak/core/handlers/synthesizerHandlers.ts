import { BIGINT_0, bigIntToHex, bytesToBigInt } from '@synthesizer-libs/util';
import { EOFBYTES, isEOF } from '../../../eof/util.js';
import {
  createAddressFromStackBigInt,
  getDataSlice,
} from '../../../opcodes/util.js';
import { placeExp, placeJubjubExp } from '../../operations/exp.js';
import { simulateMemoryPt } from '../../pointers/index.js';

import type { RunState } from '../../../interpreter.js';
import type { ArithmeticOperator, DataPt } from '../../types/index.js';
import { bigIntToAddressBytes, bytesToHex, createAddressFromBigInt } from '@ethereumjs/util';

export const synthesizerGetOrigin = (
  runState: RunState,
): DataPt => {
  const TARGETTXDATAINDICES = [1, 2, 3, 4] as const
  const messages: DataPt[] | undefined = runState.synthesizer.state.placements.get(TRANSACTION_IN_PLACEMENT_INDEX)?.outPts.slice(TARGETTXDATAINDICES[0], TARGETTXDATAINDICES[TARGETTXDATAINDICES.length - 1] + 1)
  if (messages === undefined) {
    throw new Error('Transactions are not initialized')
  }
  const PUBKEYINDEX = [5, 6] as const
  const _publicKey: DataPt[] | undefined = runState.synthesizer.state.placements.get(PUB_IN_PLACEMENT_INDEX)?.outPts.slice(PUBKEYINDEX[0], PUBKEYINDEX[PUBKEYINDEX.length - 1] + 1)
  let publicKey: [DataPt, DataPt]
  if (_publicKey === undefined) {
    throw new Error('Public key is not initialized')
  } else {
    publicKey = [_publicKey[0], _publicKey[1]]
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
  const bitsOut: DataPt[] = runState.synthesizer.placeArith('PrepareEdDsaScalars', [signature, poseidonOut]);
  if (bitsOut.length !== 504) {
    throw new Error('PrepareEdDsaScalar was expected to output 504 bits');
  }
  const signBits: DataPt[] = bitsOut.slice(0, 252)
  const challengeBits: DataPt[] = bitsOut.slice(252, -1)

  const JUBJUBBASEINDEX = [10, 11] as const
  const jubjubBase: DataPt[] | undefined = runState.synthesizer.state.placements.get(STATIC_IN_PLACEMENT_INDEX)?.outPts.slice(JUBJUBBASEINDEX[0], JUBJUBBASEINDEX[JUBJUBBASEINDEX.length - 1] + 1)
  if (jubjubBase === undefined) {
    throw new Error('Jubjub base point is not initialized')
  }
  const JUBJUBPOIINDEX = [12, 13] as const
  const jubjubPoI: DataPt[] | undefined = runState.synthesizer.state.placements.get(STATIC_IN_PLACEMENT_INDEX)?.outPts.slice(JUBJUBPOIINDEX[0], JUBJUBPOIINDEX[JUBJUBPOIINDEX.length - 1] + 1)
  if (jubjubPoI === undefined) {
    throw new Error('Jubjub point at infinity is not initialized')
  }

  const sG: DataPt[] = placeJubjubExp(
    runState.synthesizer,
    [...jubjubBase, ...signBits],
    jubjubPoI,
  )

  const eA: DataPt[] = placeJubjubExp(
    runState.synthesizer,
    [...publicKey, ...challengeBits],
    jubjubPoI,
  )

  runState.synthesizer.placeArith('EdDsaVerify', [...sG, ...randomizer, ...eA])
  
  const ZEROINDEX = 0
  const zero: DataPt | undefined = runState.synthesizer.state.placements.get(PUB_IN_PLACEMENT_INDEX)?.outPts[ZEROINDEX]
  if (zero === undefined) {
    throw new Error('zero is not initilaized in the public input buffer')
  }
  const hashPt: DataPt = runState.synthesizer.placeArith('Poseidon4', [...publicKey, zero, zero])[0]
  const ADDRESSMASKINDEX = 1
  const addrMask: DataPt | undefined = runState.synthesizer.state.placements.get(PUB_IN_PLACEMENT_INDEX)?.outPts[ADDRESSMASKINDEX]
  if (addrMask === undefined) {
    throw new Error('address mask is not initialized in the public input buffer')
  }
  runState.synthesizer.state.cachedCaller = runState.synthesizer.placeArith('AND', [hashPt, addrMask])[0]
  return runState.synthesizer.state.cachedCaller
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
  const getOriginDataPt = (runState: RunState): DataPt => {
    let dataPt: DataPt
    if (runState.synthesizer.state.cachedOrigin === undefined) {
      dataPt = synthesizerGetOrigin(runState)
    } else {
      dataPt = runState.synthesizer.state.cachedOrigin
    }
    if (dataPt.value !== runState.interpreter.getTxOrigin()) {
      throw new Error('Mismatch of the origin between EVM and Synthesizer')
    }
    return dataPt
  }
  const getStaticInDataPt = (runState: RunState, op: string, target?: bigint): DataPt => {
    const value = runState.stack.peek(1)[0]
    const cachedDataPt = runState.synthesizer.state.cachedStaticIn.get(value)
    const staticInDesc = `Static input for ${op} instruction at PC ${runState.programCounter} of code address ${runState.env.codeAddress.toString()} called by ${runState.env.address.toString()}`
    let targetDesc = target === undefined ? `` : `(target: ${createAddressFromBigInt(target).toString()})`
    return cachedDataPt ?? runState.synthesizer.loadStaticIn(
      staticInDesc + targetDesc,
      value,
    )
  }
  switch (op) {
    case 'ADDRESS': {
      const origin = runState.interpreter.getTxOrigin()
      const thisAddress = bytesToBigInt(runState.interpreter.getAddress().toBytes())
      if (origin === thisAddress) {
        dataPt = getOriginDataPt(runState)
      } else {
        dataPt = getStaticInDataPt(runState, op)
      }
      break
    }
    case 'BALANCE': {
      dataPt = getStaticInDataPt(runState, op)
      break
    }
    case 'ORIGIN': {
      dataPt = getOriginDataPt(runState)
      break
    } 
    case 'CALLER': {
      const origin = runState.interpreter.getTxOrigin()
      const caller = runState.interpreter.getCaller()
      if (origin === caller) {
        dataPt = getOriginDataPt(runState)
        
      } else {
        dataPt = getStaticInDataPt(runState, op)
      }
      break
    }
    case 'CALLVALUE': {
      dataPt = getStaticInDataPt(runState, op)
      break
    }
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
    case 'CALLDATASIZE': {
      dataPt = getStaticInDataPt(runState, op)
      break
    }
    case 'CODESIZE': {
      dataPt = getStaticInDataPt(runState, op)
      break
    }
    case 'GASPRICE': {
      dataPt = getStaticInDataPt(runState, op)
      break
    }
    case 'EXTCODESIZE': {
      if (target === undefined) {
        throw new Error(`Synthesizer: ${op}: Must have an input address`)
      }
      if (target !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`)
      }
      dataPt = getStaticInDataPt(runState, op, target)
      break
    }
    case 'RETURNDATASIZE': {
      dataPt = getStaticInDataPt(runState, op)
      break
    }
    case 'EXTCODEHASH': {
      if (target === undefined) {
        throw new Error(`Synthesizer: ${op}: Must have an input address`)
      }
      if (target !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`)
      }
      dataPt = getStaticInDataPt(runState, op, target)
      break
    }
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
