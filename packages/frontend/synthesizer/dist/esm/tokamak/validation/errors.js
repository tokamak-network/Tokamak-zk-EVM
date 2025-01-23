/**
 * Synthesizer 관련 에러들을 정의하는 클래스들
 */
export class SynthesizerError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SynthesizerError';
    }
}
export class InvalidInputCountError extends SynthesizerError {
    constructor(operationName, expectedCount, actualCount) {
        super(`${operationName} takes ${expectedCount} inputs, but received ${actualCount} inputs.`);
        this.operationName = operationName;
        this.expectedCount = expectedCount;
        this.actualCount = actualCount;
        this.name = 'InvalidInputCountError';
    }
}
export class UndefinedSubcircuitError extends SynthesizerError {
    constructor(subcircuitName) {
        super(`Subcircuit name ${subcircuitName} is not defined.`);
        this.subcircuitName = subcircuitName;
        this.name = 'UndefinedSubcircuitError';
    }
}
export class EmptyDataError extends SynthesizerError {
    constructor(operation) {
        super(`Synthesizer: ${operation}: Nothing to load`);
        this.operation = operation;
        this.name = 'EmptyDataError';
    }
}
export class LoadPlacementError extends SynthesizerError {
    constructor(message) {
        super(`Load Placement Error: ${message}`);
    }
}
export class OperationError extends SynthesizerError {
    constructor(operation, message) {
        super(`Operation ${operation} failed: ${message}`);
    }
}
export class SynthesizerOperationError extends SynthesizerError {
    constructor(operation, reason) {
        super(`Synthesizer: ${operation}: ${reason}`);
        this.name = 'SynthesizerOperationError';
    }
}
//# sourceMappingURL=errors.js.map