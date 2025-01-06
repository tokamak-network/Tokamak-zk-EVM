// import { RunState, DataPt, ArithmeticOperator } from '../types/index.js'
// import {
//   bytesToBigInt,
// } from '@ethereumjs/util'
// import { SynthesizerInstructionValidator } from '../validation/validator.js';

// interface ArithOperationHandler {
//   handle(inPts: DataPt[], ins: bigint[], out: bigint): DataPt[];
// }

// class DecToBitHandler implements ArithOperationHandler {
//   handle(): DataPt[] {
//     throw new Error('Cannot be called by "synthesizerArith"');
//   }
// }

// class ExpHandler implements ArithOperationHandler {
//   constructor(private runState: RunState) {}

//   handle(inPts: DataPt[]): DataPt[] {
//     return [this.runState.synthesizer.placeEXP(inPts)];
//   }
// }

// class KeccakHandler implements ArithOperationHandler {
//   constructor(private runState: RunState) {}

//   handle(inPts: DataPt[], ins: bigint[], out: bigint): DataPt[] {
//     const offsetNum = Number(ins[0]);
//     const lengthNum = Number(ins[1]);
//     const dataAliasInfos = this.runState.memoryPt.getDataAlias(offsetNum, lengthNum);
//     const mutDataPt = this.runState.synthesizer.placeMemoryToStack(dataAliasInfos);

//     const data = this.runState.memory.read(offsetNum, lengthNum);
//     if (bytesToBigInt(data) !== mutDataPt.value) {
//       throw new Error('Synthesizer: KECCAK256: Data loaded to be hashed mismatch');
//     }

//     return [this.runState.synthesizer.loadKeccak(mutDataPt, out)];
//   }
// }

// class DefaultArithHandler implements ArithOperationHandler {
//   constructor(private runState: RunState) {}

//   handle(inPts: DataPt[], op: ArithmeticOperator): DataPt[] {
//     return this.runState.synthesizer.placeArith(op, inPts);
//   }
// }

// // Operation handlers map
// const operationHandlers = new Map<ArithmeticOperator, ArithOperationHandler>();

// export class ComputationalSynthesizer {
//     private validator: SynthesizerInstructionValidator;
//       private defaultHandler: ArithOperationHandler;  // Add this line

//   constructor(private runState: RunState) {
//       this.validator = new SynthesizerInstructionValidator(runState);
//       this.initializeHandlers();
//            this.defaultHandler = new DefaultArithHandler(this.runState);
//     }

//     private initializeHandlers() {
//     operationHandlers.set('DecToBit', new DecToBitHandler());
//     operationHandlers.set('EXP', new ExpHandler(this.runState));
//     operationHandlers.set('KECCAK256', new KeccakHandler(this.runState));

//     }

//   public synthesizeArith(op: ArithmeticOperator, ins: bigint[], out: bigint): void {
//     const inPts = this.getInputPoints(op);
//     this.validator.validateArithInputs(inPts, ins, op);

//     const outPts = this.processArithOperation(op, inPts, ins, out);
//     this.validator.validateArithOutput(outPts[0], out, op);

//     this.runState.stackPt.push(outPts[0]);
//   }

//   private getInputPoints(op: ArithmeticOperator): DataPt[] {
//     return this.runState.stackPt.popN(
//       this.runState.synthesizer.subcircuitInfoByName.get(op)!.NInWires
//     );
//   }

//       private processArithOperation(
//     op: ArithmeticOperator,
//     inPts: DataPt[],
//     ins: bigint[],
//     out: bigint
//   ): DataPt[] {
//     const handler = operationHandlers.get(op) ?? this.defaultHandler;
//     return handler.handle(inPts, ins, out);
//   }
// }
