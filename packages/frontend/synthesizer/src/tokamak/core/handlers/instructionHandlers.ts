import { EOFBYTES, isEOF } from '../../../eof/util.ts';
import {
  createAddressFromStackBigInt,
  getDataSlice,
} from '../../../opcodes/util.ts';
import { placeExp, placeJubjubExp } from '../../operations/exp.ts';
import { simulateMemoryPt } from '../../pointers/index.ts';

import type { RunState } from '../../../interpreter.ts';
import type { ArithmeticOperator, DataPt, ReservedVariable } from '../../types/index.ts';
import { bigIntToAddressBytes, bytesToBigInt, bytesToHex, createAddressFromBigInt } from '@ethereumjs/util';

const synthesizerGetOrigin = (
  runState: RunState,
): DataPt => {
  const synthesizer = runState.synthesizer
  const txNonce = synthesizer.state.txNonce
  if (txNonce < 0) {
    throw new Error('Negative txNonce')
  }

  const messageContent: ReservedVariable[][] = [
    ['TRANSACTION_NONCE', 'CONTRACT_ADDRESS', 'FUNCTION_SELECTOR', 'TRANSACTION_INPUT0'],
    ['TRANSACTION_INPUT1', 'TRANSACTION_INPUT2', 'TRANSACTION_INPUT3', 'TRANSACTION_INPUT4'],
    ['TRANSACTION_INPUT5', 'TRANSACTION_INPUT6', 'TRANSACTION_INPUT7', 'TRANSACTION_INPUT8'],
  ];

  const read = (n: ReservedVariable) =>
    synthesizer.readReservedVariableFromInputBuffer(n, txNonce)

  const messagePts: DataPt[][] = messageContent.map(row => row.map(read))

  if (messagePts.length !== 3 || messagePts.flat().length > 12) throw new Error('Excessive transaction messages')
  
  const publicKeyPt: DataPt[] = [
    synthesizer.readReservedVariableFromInputBuffer('EDDSA_PUBLIC_KEY_X'),
    synthesizer.readReservedVariableFromInputBuffer('EDDSA_PUBLIC_KEY_Y')
  ]
  const randomizerPt: DataPt[] = [
    synthesizer.readReservedVariableFromInputBuffer('EDDSA_RANDOMIZER_X', txNonce),
    synthesizer.readReservedVariableFromInputBuffer('EDDSA_RANDOMIZER_Y', txNonce)
  ]
  const signaturePt: DataPt = synthesizer.readReservedVariableFromInputBuffer('EDDSA_SIGNATURE', txNonce)
  const firstPoseidonInput: DataPt[] = [...randomizerPt, ...publicKeyPt]
  const poseidonInter: DataPt[] = []
  poseidonInter.push(...synthesizer.placeArith('Poseidon4', firstPoseidonInput))
  poseidonInter.push(...synthesizer.placeArith('Poseidon4', messagePts[0]))
  poseidonInter.push(...synthesizer.placeArith('Poseidon4', messagePts[1]))
  poseidonInter.push(...synthesizer.placeArith('Poseidon4', messagePts[2]))
  const poseidonOut: DataPt = synthesizer.placeArith('Poseidon4', poseidonInter)[0]
  const bitsOut: DataPt[] = synthesizer.placeArith('PrepareEdDsaScalars', [signaturePt, poseidonOut])
  if (bitsOut.length !== 504) {
    throw new Error('PrepareEdDsaScalar was expected to output 504 bits');
  }
  const signBits: DataPt[] = bitsOut.slice(0, 252)
  const challengeBits: DataPt[] = bitsOut.slice(252, -1)

  const jubjubBasePt: DataPt[] = [
    synthesizer.readReservedVariableFromInputBuffer('JUBJUB_BASE_X'),
    synthesizer.readReservedVariableFromInputBuffer('JUBJUB_BASE_Y')
  ]
  const jubjubPoIPt: DataPt[] = [
    synthesizer.readReservedVariableFromInputBuffer('JUBJUB_POI_X'),
    synthesizer.readReservedVariableFromInputBuffer('JUBJUB_POI_Y')
  ]

  const sG: DataPt[] = placeJubjubExp(
    synthesizer,
    [...jubjubBasePt, ...signBits],
    jubjubPoIPt,
  )

  const eA: DataPt[] = placeJubjubExp(
    synthesizer,
    [...publicKeyPt, ...challengeBits],
    jubjubPoIPt,
  )

  synthesizer.placeArith('EdDsaVerify', [...sG, ...randomizerPt, ...eA])
  
  const zeroPt: DataPt = synthesizer.loadArbitraryStatic(0n, 1)
  const hashPt: DataPt = synthesizer.placeArith('Poseidon4', [...publicKeyPt, zeroPt, zeroPt])[0]
  const addrMaskPt: DataPt = synthesizer.readReservedVariableFromInputBuffer('ADDRESS_MASK')
  synthesizer.state.cachedOrigin = synthesizer.placeArith('AND', [hashPt, addrMaskPt])[0]
  return runState.synthesizer.state.cachedOrigin!
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
  const data = bytesToBigInt(getDataSlice(code, codeOffset, dataLength))
  const desc = `External code from ${address.toString()}, offset ${Number(codeOffset)}, length ${Number(dataLength)}`
  const dataPt = runState.synthesizer.loadArbitraryStatic(data, Number(dataLength), desc)
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
    return cachedDataPt ?? runState.synthesizer.loadArbitraryStatic(
      value,
      undefined,
      staticInDesc + targetDesc,
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
