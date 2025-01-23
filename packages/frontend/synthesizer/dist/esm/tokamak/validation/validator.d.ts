import type { RunState } from '../../interpreter.js';
import type { DataPt } from '../types/index.js';
/**
 * Synthesizer 관련 유효성 검사를 담당하는 클래스
 */
export declare class SynthesizerValidator {
    /**
     * 입력 개수가 예상된 개수와 일치하는지 검증합니다.
     *
     * @param name 연산자 이름
     * @param actual 실제 입력 개수Fevm
     * @param expected 예상되는 입력 개수
     * @throws {InvalidInputCountError} 입력 개수가 일치하지 않을 경우
     */
    static validateInputCount(name: string, actual: number, expected: number): void;
    /**
     * 서브서킷 이름이 유효한지 검증합니다.
     *
     * @param name 서브서킷 이름
     * @param validNames 유효한 서브서킷 이름 목록
     * @throws {UndefinedSubcircuitError} 유효하지 않은 서브서킷 이름일 경우
     */
    static validateSubcircuitName(name: string, validNames: string[]): void;
    /**
     * 주어진 opcode가 구현되어 있는지 검증합니다.
     * @param opcode 검증할 opcode
     * @throws {Error} 구현되지 않은 opcode인 경우
     */
    static validateImplementedOpcode(opcode: string): void;
    /**
     * 입력값들이 유효한지 검증합니다.
     *
     * @param inputs 검증할 입력값 배열
     * @throws {Error} 입력값이 null이거나 undefined인 경우
     */
    static validateInputs(inputs: DataPt[]): void;
    /**
     * 숫자 범위를 검증합니다.
     *
     * @param value 검증할 값
     * @param min 최소값
     * @param max 최대값
     * @param paramName 파라미터 이름
     * @throws {Error} 값이 범위를 벗어난 경우
     */
    static validateRange(value: number | bigint, min: number | bigint, max: number | bigint, paramName: string): void;
    static validateValue(value: bigint): void;
}
export declare class SynthesizerInstructionValidator {
    private runState;
    constructor(runState: RunState);
    validateArithInputs(inPts: DataPt[], ins: bigint[], op: string): void;
    validateArithOutput(outPt: DataPt, expectedValue: bigint, op: string): void;
    validateKeccakData(offset: number, length: number, mutDataPt: DataPt): void;
}
//# sourceMappingURL=validator.d.ts.map