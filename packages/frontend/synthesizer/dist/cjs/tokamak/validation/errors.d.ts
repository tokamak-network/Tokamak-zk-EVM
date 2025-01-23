/**
 * Synthesizer 관련 에러들을 정의하는 클래스들
 */
export declare class SynthesizerError extends Error {
    constructor(message: string);
}
export declare class InvalidInputCountError extends SynthesizerError {
    readonly operationName: string;
    readonly expectedCount: number;
    readonly actualCount: number;
    constructor(operationName: string, expectedCount: number, actualCount: number);
}
export declare class UndefinedSubcircuitError extends SynthesizerError {
    readonly subcircuitName: string;
    constructor(subcircuitName: string);
}
export declare class EmptyDataError extends SynthesizerError {
    readonly operation: string;
    constructor(operation: string);
}
export declare class LoadPlacementError extends SynthesizerError {
    constructor(message: string);
}
export declare class OperationError extends SynthesizerError {
    constructor(operation: string, message: string);
}
export declare class SynthesizerOperationError extends SynthesizerError {
    constructor(operation: string, reason: string);
}
//# sourceMappingURL=errors.d.ts.map