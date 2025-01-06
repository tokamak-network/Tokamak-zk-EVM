/**
 * Synthesizer 관련 에러들을 정의하는 클래스들
 */

export class SynthesizerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SynthesizerError'
  }
}

export class InvalidInputCountError extends SynthesizerError {
  constructor(
    public readonly operationName: string,
    public readonly expectedCount: number,
    public readonly actualCount: number,
  ) {
    super(`${operationName} takes ${expectedCount} inputs, but received ${actualCount} inputs.`)
    this.name = 'InvalidInputCountError'
  }
}

export class UndefinedSubcircuitError extends SynthesizerError {
  constructor(public readonly subcircuitName: string) {
    super(`Subcircuit name ${subcircuitName} is not defined.`)
    this.name = 'UndefinedSubcircuitError'
  }
}

export class EmptyDataError extends SynthesizerError {
  constructor(public readonly operation: string) {
    super(`Synthesizer: ${operation}: Nothing to load`)
    this.name = 'EmptyDataError'
  }
}

export class LoadPlacementError extends SynthesizerError {
  constructor(message: string) {
    super(`Load Placement Error: ${message}`)
  }
}

export class OperationError extends SynthesizerError {
  constructor(operation: string, message: string) {
    super(`Operation ${operation} failed: ${message}`)
  }
}

export class SynthesizerOperationError extends SynthesizerError {
  constructor(operation: string, reason: string) {
    super(`Synthesizer: ${operation}: ${reason}`)
    this.name = 'SynthesizerOperationError'
  }
}
