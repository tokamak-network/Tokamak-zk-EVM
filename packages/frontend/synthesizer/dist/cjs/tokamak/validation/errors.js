"use strict";
/**
 * Synthesizer 관련 에러들을 정의하는 클래스들
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SynthesizerOperationError = exports.OperationError = exports.LoadPlacementError = exports.EmptyDataError = exports.UndefinedSubcircuitError = exports.InvalidInputCountError = exports.SynthesizerError = void 0;
class SynthesizerError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SynthesizerError';
    }
}
exports.SynthesizerError = SynthesizerError;
class InvalidInputCountError extends SynthesizerError {
    constructor(operationName, expectedCount, actualCount) {
        super(`${operationName} takes ${expectedCount} inputs, but received ${actualCount} inputs.`);
        this.operationName = operationName;
        this.expectedCount = expectedCount;
        this.actualCount = actualCount;
        this.name = 'InvalidInputCountError';
    }
}
exports.InvalidInputCountError = InvalidInputCountError;
class UndefinedSubcircuitError extends SynthesizerError {
    constructor(subcircuitName) {
        super(`Subcircuit name ${subcircuitName} is not defined.`);
        this.subcircuitName = subcircuitName;
        this.name = 'UndefinedSubcircuitError';
    }
}
exports.UndefinedSubcircuitError = UndefinedSubcircuitError;
class EmptyDataError extends SynthesizerError {
    constructor(operation) {
        super(`Synthesizer: ${operation}: Nothing to load`);
        this.operation = operation;
        this.name = 'EmptyDataError';
    }
}
exports.EmptyDataError = EmptyDataError;
class LoadPlacementError extends SynthesizerError {
    constructor(message) {
        super(`Load Placement Error: ${message}`);
    }
}
exports.LoadPlacementError = LoadPlacementError;
class OperationError extends SynthesizerError {
    constructor(operation, message) {
        super(`Operation ${operation} failed: ${message}`);
    }
}
exports.OperationError = OperationError;
class SynthesizerOperationError extends SynthesizerError {
    constructor(operation, reason) {
        super(`Synthesizer: ${operation}: ${reason}`);
        this.name = 'SynthesizerOperationError';
    }
}
exports.SynthesizerOperationError = SynthesizerOperationError;
//# sourceMappingURL=errors.js.map