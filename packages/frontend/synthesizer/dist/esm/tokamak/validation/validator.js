import { bytesToBigInt } from "@ethereumjs/util/index.js";
import { InvalidInputCountError, UndefinedSubcircuitError } from './errors.js';
/**
 * Synthesizer 관련 유효성 검사를 담당하는 클래스
 */
export class SynthesizerValidator {
    /**
     * 입력 개수가 예상된 개수와 일치하는지 검증합니다.
     *
     * @param name 연산자 이름
     * @param actual 실제 입력 개수Fevm
     * @param expected 예상되는 입력 개수
     * @throws {InvalidInputCountError} 입력 개수가 일치하지 않을 경우
     */
    static validateInputCount(name, actual, expected) {
        if (actual !== expected) {
            throw new InvalidInputCountError(name, expected, actual);
        }
    }
    /**
     * 서브서킷 이름이 유효한지 검증합니다.
     *
     * @param name 서브서킷 이름
     * @param validNames 유효한 서브서킷 이름 목록
     * @throws {UndefinedSubcircuitError} 유효하지 않은 서브서킷 이름일 경우
     */
    static validateSubcircuitName(name, validNames) {
        if (!validNames.includes(name)) {
            throw new UndefinedSubcircuitError(name);
        }
    }
    /**
     * 주어진 opcode가 구현되어 있는지 검증합니다.
     * @param opcode 검증할 opcode
     * @throws {Error} 구현되지 않은 opcode인 경우
     */
    static validateImplementedOpcode(opcode) {
        const implementedOpcodes = [
            'ADD',
            'MUL',
            'SUB',
            'DIV',
            'SDIV',
            'MOD',
            'SMOD',
            'ADDMOD',
            'MULMOD',
            'EXP',
            'SIGNEXTEND',
            'LT',
            'GT',
            'SLT',
            'SGT',
            'EQ',
            'ISZERO',
            'AND',
            'OR',
            'XOR',
            'NOT',
            'BYTE',
            'SHL',
            'SHR',
            'SAR',
            'DecToBit',
            'SubEXP',
        ];
        if (!implementedOpcodes.includes(opcode)) {
            throw new Error(`Synthesizer: Opcode '${opcode}' is not implemented`);
        }
    }
    /**
     * 입력값들이 유효한지 검증합니다.
     *
     * @param inputs 검증할 입력값 배열
     * @throws {Error} 입력값이 null이거나 undefined인 경우
     */
    static validateInputs(inputs) {
        for (const input of inputs) {
            if (input === null || input === undefined) {
                throw new Error('Input cannot be null or undefined');
            }
            if (typeof input.value !== 'bigint') {
                throw new Error('Input value must be a bigint');
            }
        }
    }
    /**
     * 숫자 범위를 검증합니다.
     *
     * @param value 검증할 값
     * @param min 최소값
     * @param max 최대값
     * @param paramName 파라미터 이름
     * @throws {Error} 값이 범위를 벗어난 경우
     */
    static validateRange(value, min, max, paramName) {
        if (value < min || value > max) {
            throw new Error(`${paramName} must be between ${min} and ${max}, got ${value}`);
        }
    }
    static validateValue(value) {
        if (value < 0n) {
            throw new Error('Negative values are not allowed');
        }
        if (value > 2n ** 256n - 1n) {
            throw new Error('The value exceeds Ethereum word size');
        }
    }
}
export class SynthesizerInstructionValidator {
    // static validateInput(op: string, expected?: bigint, actual?: bigint) {
    //   if (expected === undefined) {
    //     throw new SynthesizerOperationError(op, 'Must have an input value')
    //   }
    //   if (expected !== actual) {
    //     throw new SynthesizerOperationError(op, 'Input data mismatch')
    //   }
    // }
    // static validateOutput(op: string, stackPt: DataPt, stackValue: bigint) {
    //   if (stackPt.value !== stackValue) {
    //     throw new SynthesizerOperationError(op, 'Output data mismatch')
    //   }
    // }
    constructor(runState) {
        this.runState = runState;
    }
    validateArithInputs(inPts, ins, op) {
        if (inPts.length !== ins.length) {
            throw new Error(`Synthesizer: ${op}: Input data mismatch`);
        }
        for (let i = 0; i < ins.length; i++) {
            if (inPts[i].value !== ins[i]) {
                throw new Error(`Synthesizer: ${op}: Input data mismatch`);
            }
        }
    }
    validateArithOutput(outPt, expectedValue, op) {
        if (outPt.value !== expectedValue) {
            throw new Error(`Synthesizer: ${op}: Output data mismatch`);
        }
    }
    validateKeccakData(offset, length, mutDataPt) {
        const data = this.runState.memory.read(offset, length);
        if (bytesToBigInt(data) !== mutDataPt.value) {
            throw new Error('Synthesizer: KECCAK256: Data loaded to be hashed mismatch');
        }
    }
}
//# sourceMappingURL=validator.js.map